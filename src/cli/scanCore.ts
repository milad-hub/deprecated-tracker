import { ConfigReader } from "../config/configReader";
import { CLI_EXIT } from "../constants";
import { DeprecatedItem, DeprecatedTrackerConfig } from "../interfaces";
import { Scanner } from "../scanner/scanner";
import { isWithinChangedLines } from "../utils";
import { CliOptions } from "./args";
import {
  BaselineComparison,
  compareScannedFiles,
  compareToBaseline,
  readBaseline,
} from "./baseline";
import { ignoresFromConfig, tagsFromConfig } from "./configScannerDeps";
import {
  collectStagedLineRanges,
  collectWorkingTreeLineRanges,
  listStagedFiles,
  listWorkingTreeFiles,
  onlyScannable,
} from "./stagedDiff";

export interface ScanOutcome {
  config: DeprecatedTrackerConfig;
  /** The files a hook-mode run looked at. Empty for a whole-project scan. */
  targets: string[];
  items: DeprecatedItem[];
  comparison: BaselineComparison;
  passed: boolean;
  baselineIgnored: boolean;
  /** Hook mode found nothing scannable, so no scan was run at all. */
  empty: boolean;
}

/** Carries the exit code the CLI would have returned, so `run` stays thin. */
export class ScanError extends Error {
  constructor(
    message: string,
    readonly exit: number,
  ) {
    super(message);
    this.name = "ScanError";
  }
}

/**
 * Everything between "options are valid" and "render something": resolve the
 * config, work out what to look at, scan it, and judge the result.
 *
 * It exists apart from `run` because an MCP tool needs the findings, not a
 * report and an exit code — and neither caller should own a second copy of how
 * a scan is decided.
 */
export async function performScan(
  options: CliOptions,
  warn: (message: string) => void,
): Promise<ScanOutcome> {
  const config = await new ConfigReader(warn).loadConfiguration(options.root);
  const hookMode = options.hook;
  const targets = hookMode
    ? onlyScannable(discoverTargets(options).concat(options.files))
    : [];

  // Nothing scannable. Passing is the only sane answer — the change touched
  // nothing this tool has an opinion about — and the baseline stays unread, so
  // an unreadable one cannot fail a commit that was never going to be judged.
  if (hookMode && targets.length === 0) {
    return {
      config,
      targets,
      items: [],
      comparison: compareScannedFiles([], [], options.root),
      passed: true,
      baselineIgnored: true,
      empty: true,
    };
  }

  let items: DeprecatedItem[];
  try {
    const scanner = new Scanner(
      ignoresFromConfig(config),
      tagsFromConfig(config),
      config,
    );
    items = hookMode
      ? await scanner.scanWorkspaceFiles([options.root], targets)
      : await scanner.scanProject(options.root);
  } catch (error) {
    throw new ScanError(`Scan failed: ${message(error)}`, CLI_EXIT.SCAN_FAILED);
  }

  // Default in hook mode: report only what this change actually wrote. It needs
  // no baseline, and touching a legacy file stays free.
  if (hookMode && !options.wholeFiles) {
    const ranges = options.workingTreeRanges
      ? collectWorkingTreeLineRanges(targets, options.root)
      : collectStagedLineRanges(targets, options.root);
    items = items.filter((item) =>
      isWithinChangedLines(item.filePath, item.line, ranges),
    );
  }

  // --update-baseline is about to overwrite the file, so refusing to run over
  // an unreadable one would strand the only command that fixes it.
  let baseline;
  if (!options.failOnAny && !options.updateBaseline) {
    try {
      baseline = readBaseline(options.baselinePath);
    } catch (error) {
      throw new ScanError(message(error), CLI_EXIT.USAGE);
    }
  }

  const comparison = hookMode
    ? compareScannedFiles(items, targets, options.root, baseline)
    : compareToBaseline(items, options.root, baseline);

  return {
    config,
    targets,
    items,
    comparison,
    passed: hookMode
      ? hookPassed(options, items.length, comparison)
      : hasPassed(options, comparison.total, comparison),
    // Changed-lines mode never consults a baseline, so reporting one would be
    // noise at best and a lie at worst.
    baselineIgnored: options.failOnAny || (hookMode && !options.wholeFiles),
    empty: false,
  };
}

/**
 * What the run was pointed at, before the extension filter. Paths given on the
 * command line are added by the caller, so a manager that passes some and a
 * flag that discovers more still get the union.
 */
function discoverTargets(options: CliOptions): string[] {
  if (options.changed) {
    return listWorkingTreeFiles(options.root);
  }
  if (options.staged) {
    return listStagedFiles(options.root);
  }
  return [];
}

/**
 * Hook mode has two rules, and neither is the whole-project ratchet.
 *
 * By default the run has already been narrowed to the lines this change wrote,
 * so anything left is something the change itself introduced — fail.
 *
 * With --whole-files the scan covers the entire file, most of whose deprecated
 * code predates the change, so the question becomes per-file: did any of these
 * files gain items since the baseline? With no baseline there is nothing to have
 * gained against, and blocking over pre-existing debt is exactly what this tool
 * refuses to do.
 */
function hookPassed(
  options: CliOptions,
  remaining: number,
  comparison: { hasBaseline: boolean; risenFiles: unknown[] },
): boolean {
  if (options.failOnAny) {
    return remaining === 0;
  }
  if (!options.wholeFiles) {
    return remaining === 0;
  }
  if (!comparison.hasBaseline) {
    return true;
  }
  return comparison.risenFiles.length === 0;
}

function hasPassed(
  options: CliOptions,
  total: number,
  comparison: { baselineTotal: number; hasBaseline: boolean },
): boolean {
  if (options.failOnAny) {
    return total === 0;
  }
  // Nothing to ratchet against yet. Failing a first run over pre-existing debt
  // is exactly the "any deprecated code is an error" behaviour this tool does
  // not want to be; the report says a baseline is missing and how to make one.
  if (!comparison.hasBaseline) {
    return true;
  }
  return total <= comparison.baselineTotal + options.maxNew;
}

export function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
