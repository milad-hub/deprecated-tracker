import { classify, declarationLink } from "../../src/cli/reporters";
import { Scanner } from "../../src/scanner/scanner";
import type { ClassificationCounts } from "../../src/cli/reporters";
import type { DeprecatedItem } from "../../src/interfaces";
import {
  RepoIdentity,
  downloadFiles,
  fetchTree,
  isAbort,
  parseRepoInput,
  resolveRepo,
} from "./github";
import {
  DEFAULT_LIMITS,
  Refusal,
  ScanLimits,
  SelectionCounts,
  selectFiles,
} from "./limits";
import { createVirtualPlatform } from "./virtualPlatform";

export interface WebScanRequest {
  /** Anything a person might paste: a URL, `owner/repo`, or `owner/repo@ref`. */
  input: string;
  token?: string;
  limits?: ScanLimits;
  signal?: AbortSignal;
  onProgress?: (progress: ScanProgress) => void;
}

export type ScanPhase =
  | "resolving"
  | "listing"
  | "downloading"
  | "scanning"
  | "done";

export interface ScanProgress {
  phase: ScanPhase;
  loaded?: number;
  total?: number;
  detail?: string;
}

/**
 * The result, shaped like `--format json` so a page and a pipeline read the same
 * fields. `total` and `summary` mean exactly what the CLI means by them, and
 * `summary` counts declarations rather than items, so it does not sum to
 * `total`.
 *
 * Baseline fields are absent rather than faked: a browser has no committed
 * baseline to ratchet against, and inventing `passed: true` would be a verdict
 * nobody asked for.
 */
export interface WebScanResult {
  tool: "deprecated-tracker";
  repository: {
    owner: string;
    name: string;
    ref: string;
    commit: string;
    url: string;
  };
  total: number;
  summary: ClassificationCounts;
  items: WebScanItem[];
  scanned: ScanCoverage;
  /** Everything this scan could not see. Never only in the UI copy. */
  caveats: string[];
  refusal?: Refusal;
}

export interface WebScanItem {
  name: string;
  kind: string;
  file: string;
  line: number;
  character: number;
  severity?: string;
  urgency?: string;
  reason?: string;
  schedule?: DeprecatedItem["deprecationSchedule"];
  declaration?: { name: string; file: string; line: number };
}

export interface ScanCoverage extends SelectionCounts {
  downloaded: number;
  failed: string[];
  treeTruncated: boolean;
  seconds: number;
}

const CAVEAT_NO_DEPENDENCIES =
  "Dependencies are not installed, so a deprecated API called from a package in node_modules is invisible here. The CLI sees those.";
const CAVEAT_NO_LIB =
  "The TypeScript standard library is not loaded, so a deprecated built-in (a DOM or ES API) is not reported either.";

/**
 * Scan a public GitHub repository from a browser: no server, no clone, no
 * install. Progress is reported per phase so a caller can render it; the whole
 * thing is abortable through `signal`.
 */
export async function scanRepository(
  request: WebScanRequest,
): Promise<WebScanResult> {
  const started = now();
  const limits = request.limits ?? DEFAULT_LIMITS;
  const report = (progress: ScanProgress): void =>
    request.onProgress?.(progress);

  const target = parseRepoInput(request.input);

  report({ phase: "resolving", detail: `${target.owner}/${target.name}` });
  const repo = await resolveRepo(target, {
    token: request.token,
    signal: request.signal,
  });

  report({ phase: "listing", detail: repo.commit.slice(0, 7) });
  const tree = await fetchTree(repo, {
    token: request.token,
    signal: request.signal,
  });

  const selection = selectFiles(tree.blobs, limits);

  if (selection.refusal) {
    return {
      ...empty(repo, selection.counts, tree.truncated, started),
      refusal: selection.refusal,
    };
  }

  report({ phase: "downloading", loaded: 0, total: selection.paths.length });
  const { files, failed } = await downloadFiles(repo, selection.paths, {
    token: request.token,
    signal: request.signal,
    onProgress: (progress) =>
      report({
        phase: "downloading",
        loaded: progress.loaded,
        total: progress.total,
        detail: progress.path,
      }),
  });

  report({ phase: "scanning", total: files.size });
  const items = await runScanner(files, request.signal);

  report({ phase: "done" });

  return {
    tool: "deprecated-tracker",
    repository: {
      owner: repo.owner,
      name: repo.name,
      ref: repo.ref,
      commit: repo.commit,
      url: repo.htmlUrl,
    },
    total: items.length,
    summary: classify(items),
    items: items.map((item) => toWebItem(item)),
    scanned: {
      ...selection.counts,
      downloaded: files.size,
      failed,
      treeTruncated: tree.truncated,
      seconds: elapsed(started),
    },
    caveats: caveats(selection.counts, failed, tree.truncated),
  };
}

async function runScanner(
  files: Map<string, string>,
  signal?: AbortSignal,
): Promise<DeprecatedItem[]> {
  const scanner = new Scanner(
    { isFileIgnored: () => false, isMethodIgnored: () => false },
    undefined,
    undefined,
    createVirtualPlatform({ files }),
  );

  try {
    return await scanner.scanProject("/", undefined, signal);
  } catch (error) {
    if (isAbort(error)) {
      throw error;
    }
    // A repository whose tsconfig the compiler rejects, or one whose program
    // cannot be built, is a real answer: nothing found and a reason why. It is
    // not an excuse to show a stack trace to someone who pasted a URL.
    throw new Error(
      `The TypeScript program could not be built: ${(error as Error).message}`,
    );
  }
}

/** The CLI's field names, so the two outputs cannot drift apart in meaning. */
function toWebItem(item: DeprecatedItem): WebScanItem {
  return {
    name: item.name,
    kind: item.kind,
    file: item.filePath.replace(/^\//, ""),
    line: item.line,
    character: item.character,
    severity: item.severity,
    urgency: item.deprecationSchedule?.urgency,
    reason: item.deprecationReason,
    schedule: item.deprecationSchedule,
    declaration: declarationLink("/", item),
  };
}

function caveats(
  counts: SelectionCounts,
  failed: string[],
  treeTruncated: boolean,
): string[] {
  const notes = [CAVEAT_NO_DEPENDENCIES, CAVEAT_NO_LIB];

  if (counts.oversizeFiles > 0) {
    notes.push(
      `${counts.oversizeFiles} file${counts.oversizeFiles === 1 ? "" : "s"} skipped for being individually too large to parse in a browser.`,
    );
  }
  if (failed.length > 0) {
    notes.push(
      `${failed.length} file${failed.length === 1 ? "" : "s"} could not be downloaded and were not scanned.`,
    );
  }
  if (treeTruncated) {
    notes.push(
      "GitHub truncated the file listing for this repository, so the file set below is incomplete.",
    );
  }

  return notes;
}

function empty(
  repo: RepoIdentity,
  counts: SelectionCounts,
  treeTruncated: boolean,
  started: number,
): WebScanResult {
  return {
    tool: "deprecated-tracker",
    repository: {
      owner: repo.owner,
      name: repo.name,
      ref: repo.ref,
      commit: repo.commit,
      url: repo.htmlUrl,
    },
    total: 0,
    summary: { documented: 0, bare: 0, unused: 0 },
    items: [],
    scanned: {
      ...counts,
      downloaded: 0,
      failed: [],
      treeTruncated,
      seconds: elapsed(started),
    },
    caveats: [],
  };
}

function now(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

function elapsed(started: number): number {
  return Math.round((now() - started) / 100) / 10;
}
