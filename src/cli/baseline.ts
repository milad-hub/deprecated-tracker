import * as fs from "fs";
import { BASELINE_VERSION } from "../constants";
import { DeprecatedItem } from "../interfaces";
import { PathUtils } from "../utils";

export interface Baseline {
  version: number;
  generatedAt: string;
  total: number;
  files: Record<string, number>;
}

export interface RisenFile {
  file: string;
  before: number;
  after: number;
}

export interface BaselineComparison {
  hasBaseline: boolean;
  total: number;
  baselineTotal: number;
  delta: number;
  risenFiles: RisenFile[];
}

export function countByFile(
  items: DeprecatedItem[],
  root: string,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const file = PathUtils.relativeTo(root, item.filePath);
    counts[file] = (counts[file] || 0) + 1;
  }
  return counts;
}

export function buildBaseline(
  items: DeprecatedItem[],
  root: string,
  generatedAt: Date = new Date(),
): Baseline {
  return {
    version: BASELINE_VERSION,
    generatedAt: generatedAt.toISOString(),
    total: items.length,
    files: countByFile(items, root),
  };
}

/**
 * Reads a baseline file. Returns undefined when there is no file yet — a first
 * run is not an error — and throws when one exists but cannot be trusted,
 * because silently treating a corrupt baseline as zero would fail every build.
 */
export function readBaseline(filePath: string): Baseline | undefined {
  if (!fs.existsSync(filePath)) {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Baseline ${filePath} is not valid JSON: ${error}`);
  }

  const candidate = parsed as Partial<Baseline>;
  if (
    !candidate ||
    typeof candidate.total !== "number" ||
    typeof candidate.files !== "object" ||
    candidate.files === null
  ) {
    throw new Error(`Baseline ${filePath} is missing "total" or "files"`);
  }
  if (candidate.version !== BASELINE_VERSION) {
    throw new Error(
      `Baseline ${filePath} is version ${candidate.version}, expected ${BASELINE_VERSION}. Re-run with --update-baseline.`,
    );
  }

  return {
    version: candidate.version,
    generatedAt: candidate.generatedAt || "",
    total: candidate.total,
    files: candidate.files as Record<string, number>,
  };
}

export function writeBaseline(filePath: string, baseline: Baseline): void {
  fs.writeFileSync(filePath, `${JSON.stringify(baseline, null, 2)}\n`, "utf8");
}

/**
 * Ratchets only the files that were scanned. A whole-project comparison is
 * meaningless over a subset — every file the run did not look at would read as
 * having dropped to zero — so this asks a narrower question: did any of these
 * files gain deprecated items since the baseline was written?
 */
export function compareScannedFiles(
  items: DeprecatedItem[],
  scannedFiles: readonly string[],
  root: string,
  baseline?: Baseline,
): BaselineComparison {
  const counts = countByFile(items, root);
  const risenFiles: RisenFile[] = [];
  let baselineTotal = 0;

  for (const scanned of scannedFiles) {
    const file = PathUtils.relativeTo(root, scanned);
    const before = baseline?.files[file] || 0;
    const after = counts[file] || 0;
    baselineTotal += before;
    if (after > before) {
      risenFiles.push({ file, before, after });
    }
  }
  risenFiles.sort(
    (left, right) => right.after - right.before - (left.after - left.before),
  );

  return {
    hasBaseline: baseline !== undefined,
    total: items.length,
    baselineTotal,
    delta: items.length - baselineTotal,
    risenFiles,
  };
}

export function compareToBaseline(
  items: DeprecatedItem[],
  root: string,
  baseline?: Baseline,
): BaselineComparison {
  const counts = countByFile(items, root);
  const risenFiles: RisenFile[] = [];

  for (const [file, after] of Object.entries(counts)) {
    const before = baseline?.files[file] || 0;
    if (after > before) {
      risenFiles.push({ file, before, after });
    }
  }
  risenFiles.sort(
    (left, right) => right.after - right.before - (left.after - left.before),
  );

  const baselineTotal = baseline ? baseline.total : 0;
  return {
    hasBaseline: baseline !== undefined,
    total: items.length,
    baselineTotal,
    delta: items.length - baselineTotal,
    risenFiles,
  };
}
