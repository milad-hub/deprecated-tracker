import type { TreeBlob } from "./github";

/**
 * What a browser can be asked to scan, and what it must refuse.
 *
 * The numbers come from measurement, not taste. Running the real scanner over
 * the most-starred TypeScript repositories on a desktop with an 8 GB Node heap:
 * `anomalyco/opencode` (3,300 source files) took 51s and finished;
 * `n8n-io/n8n` (18,867) and `openclaw/openclaw` (27,684) both died of heap
 * exhaustion. A browser tab has 2–4 GB, so the ceiling has to sit well below the
 * point where 8 GB failed — and a refusal that arrives after a thousand
 * downloads is worse than one that arrives immediately.
 *
 * The cap is checked against the tree, which carries every blob's size, so
 * nothing is downloaded before the answer is known.
 */
export interface ScanLimits {
  maxFiles: number;
  maxTotalBytes: number;
  /**
   * Per-file ceiling. A single generated 4 MB bundle costs more parse time than
   * the thousand hand-written files around it and never carries a `@deprecated`
   * tag worth finding. Skipped files are counted and reported, never silently
   * dropped.
   */
  maxFileBytes: number;
}

export const DEFAULT_LIMITS: ScanLimits = {
  maxFiles: 1500,
  maxTotalBytes: 12 * 1024 * 1024,
  maxFileBytes: 512 * 1024,
};

const SOURCE_PATTERN = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/i;
const CONFIG_PATTERN = /(^|\/)(tsconfig|jsconfig)([.-][\w.-]+)?\.json$/i;

/**
 * Paths that are never worth downloading. `node_modules` and vendored trees are
 * not the project, and a minified or bundled file is parse cost with no findings
 * in it. This is separate from the cap: excluded files are not "too big to
 * scan", they are not part of the codebase.
 */
const EXCLUDED_PATTERN =
  /(^|\/)(node_modules|bower_components|vendor|third_party|\.git|dist|build|out|coverage|__snapshots__)\//i;
const GENERATED_PATTERN = /\.(min|bundle|chunk)\.[cm]?jsx?$/i;

export interface SelectionCounts {
  /** Every blob in the tree, whatever it is. */
  blobs: number;
  /** Source and config files that survived the exclusions. */
  candidates: number;
  candidateBytes: number;
  /** Selected for download: source files plus the configs that describe them. */
  selected: number;
  selectedBytes: number;
  /** Of those, the ones that are actually source. A config is not scannable. */
  sourceFiles: number;
  /** Dropped for being individually larger than `maxFileBytes`. */
  oversizeFiles: number;
  configFiles: number;
}

export interface Selection {
  paths: string[];
  configPaths: string[];
  counts: SelectionCounts;
  /** Set when the repository is too large. `paths` is empty when it is. */
  refusal?: Refusal;
}

export interface Refusal {
  reason:
    | "too-many-files"
    | "too-many-bytes"
    | "no-source"
    | "no-config"
    | "invalid-limits";
  message: string;
}

/**
 * The caller's limits, made safe to compare against.
 *
 * A limit is the page's entire protection against a repository that would kill
 * the tab, and `worker.ts` takes one straight off a `postMessage`. Two ways it
 * used to fail open, both silent: a missing field left `undefined` on the right
 * of `>`, and `NaN` makes *every* comparison false — so `{}` or a typo removed
 * the cap altogether and the scan simply proceeded.
 *
 * So: a caller may lower a ceiling and never raise it, an unusable number is
 * ignored in favour of the default, and a number that is real but nonsensical
 * (zero or negative) is refused by name rather than silently excluding every
 * file and reporting some downstream symptom.
 */
export function resolveLimits(limits?: Partial<ScanLimits>): {
  limits: ScanLimits;
  invalid: string[];
} {
  const invalid: string[] = [];

  const field = (key: keyof ScanLimits): number => {
    const value = limits?.[key];
    if (
      value === undefined ||
      typeof value !== "number" ||
      !Number.isFinite(value)
    ) {
      return DEFAULT_LIMITS[key];
    }
    if (value <= 0) {
      invalid.push(`${key}=${value}`);
      return DEFAULT_LIMITS[key];
    }
    return Math.min(Math.floor(value), DEFAULT_LIMITS[key]);
  };

  return {
    limits: {
      maxFiles: field("maxFiles"),
      maxTotalBytes: field("maxTotalBytes"),
      maxFileBytes: field("maxFileBytes"),
    },
    invalid,
  };
}

export function selectFiles(
  blobs: TreeBlob[],
  requested?: Partial<ScanLimits>,
): Selection {
  const resolved = resolveLimits(requested);
  const limits = resolved.limits;

  if (resolved.invalid.length > 0) {
    return {
      paths: [],
      configPaths: [],
      counts: emptyCounts(blobs.length),
      refusal: {
        reason: "invalid-limits",
        message: `A scan limit must be a positive number: ${resolved.invalid.join(", ")}.`,
      },
    };
  }

  const counts: SelectionCounts = {
    blobs: blobs.length,
    candidates: 0,
    candidateBytes: 0,
    selected: 0,
    selectedBytes: 0,
    sourceFiles: 0,
    oversizeFiles: 0,
    configFiles: 0,
  };

  const paths: string[] = [];
  const configPaths: string[] = [];

  for (const blob of blobs) {
    if (EXCLUDED_PATTERN.test(`/${blob.path}`)) {
      continue;
    }

    const isConfig = CONFIG_PATTERN.test(blob.path);
    // `.d.ts` counts as source. Excluding it cost 117 findings in
    // `sindresorhus/type-fest`, where every deprecated type is declared in a
    // `.d.ts` and used from a `.ts` -- the declarations went missing and took
    // their call sites with them. A declaration file is a library's API surface,
    // which is exactly where a `@deprecated` tag belongs. Generated ones live in
    // `dist/` and are excluded by directory instead.
    const isSource =
      SOURCE_PATTERN.test(blob.path) && !GENERATED_PATTERN.test(blob.path);

    if (!isConfig && !isSource) {
      continue;
    }

    counts.candidates += 1;
    counts.candidateBytes += blob.size;

    if (blob.size > limits.maxFileBytes) {
      counts.oversizeFiles += 1;
      continue;
    }

    if (isConfig) {
      counts.configFiles += 1;
      configPaths.push(blob.path);
    } else {
      counts.sourceFiles += 1;
    }

    paths.push(blob.path);
    counts.selected += 1;
    counts.selectedBytes += blob.size;
  }

  const refusal = refuse(counts, limits);
  if (refusal) {
    return { paths: [], configPaths: [], counts, refusal };
  }

  return { paths, configPaths, counts };
}

function emptyCounts(blobs: number): SelectionCounts {
  return {
    blobs,
    candidates: 0,
    candidateBytes: 0,
    selected: 0,
    selectedBytes: 0,
    sourceFiles: 0,
    oversizeFiles: 0,
    configFiles: 0,
  };
}

function refuse(
  counts: SelectionCounts,
  limits: ScanLimits,
): Refusal | undefined {
  if (counts.configFiles === 0) {
    return {
      reason: "no-config",
      message:
        "No tsconfig.json or jsconfig.json in this repository. The scanner builds a TypeScript program from one and has nothing to scan without it.",
    };
  }

  // A config on its own is not a scannable project: the program it describes has
  // no files in it. Reporting "0 items" for that would read as a clean bill of
  // health for a repository nothing was read from.
  if (counts.sourceFiles === 0) {
    return {
      reason: "no-source",
      message: "No TypeScript or JavaScript source files in this repository.",
    };
  }

  if (counts.selected > limits.maxFiles) {
    return {
      reason: "too-many-files",
      message: `${counts.selected.toLocaleString("en-US")} source files — past the ${limits.maxFiles.toLocaleString("en-US")} a browser can hold. Repositories this size are what the CLI is for.`,
    };
  }

  if (counts.selectedBytes > limits.maxTotalBytes) {
    return {
      reason: "too-many-bytes",
      message: `${megabytes(counts.selectedBytes)} MB of source — past the ${megabytes(limits.maxTotalBytes)} MB a browser can hold. Repositories this size are what the CLI is for.`,
    };
  }

  return undefined;
}

function megabytes(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}
