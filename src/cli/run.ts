import * as fs from "fs";
import { ConfigReader } from "../config/configReader";
import { CLI_EXIT } from "../constants";
import { Scanner } from "../scanner/scanner";
import { CliOptions, USAGE, parseArgs } from "./args";
import { buildAnnotations } from "./annotations";
import { isWithinChangedLines } from "../utils";
import {
  buildBaseline,
  compareScannedFiles,
  compareToBaseline,
  readBaseline,
  writeBaseline,
} from "./baseline";
import { renderReport } from "./reporters";
import {
  collectStagedLineRanges,
  listStagedFiles,
  onlyScannable,
} from "./stagedDiff";

export interface CliIo {
  out: (text: string) => void;
  err: (text: string) => void;
}

export interface RunContext {
  cwd?: string;
  io?: CliIo;
  version?: string;
}

const NO_IGNORES = {
  isFileIgnored: (): boolean => false,
  isMethodIgnored: (): boolean => false,
};

export async function run(
  argv: string[],
  context: RunContext = {},
): Promise<number> {
  const cwd = context.cwd || process.cwd();
  const version = context.version || "0.0.0";
  const io: CliIo = context.io || {
    out: (text) => process.stdout.write(`${text}\n`),
    err: (text) => process.stderr.write(`${text}\n`),
  };

  const parsed = parseArgs(argv, cwd);
  if (!parsed.ok) {
    io.err(parsed.error);
    io.err("");
    io.err(USAGE);
    return CLI_EXIT.USAGE;
  }

  const options = parsed.options;
  if (options.help) {
    io.out(USAGE);
    return CLI_EXIT.OK;
  }
  if (options.version) {
    io.out(version);
    return CLI_EXIT.OK;
  }

  if (!isDirectory(options.root)) {
    io.err(`Not a directory: ${options.root}`);
    return CLI_EXIT.USAGE;
  }

  const config = await new ConfigReader().loadConfiguration(options.root);
  const hookMode = options.hook;
  const targets = hookMode
    ? onlyScannable(
        options.staged
          ? listStagedFiles(options.root).concat(options.files)
          : options.files,
      )
    : [];

  const emit = (report: string): number | undefined => {
    if (!options.outputPath) {
      io.out(report);
      return undefined;
    }
    try {
      fs.writeFileSync(options.outputPath, `${report}\n`, "utf8");
    } catch (error) {
      io.err(`Could not write ${options.outputPath}: ${message(error)}`);
      return CLI_EXIT.USAGE;
    }
    if (!options.quiet) {
      io.out(`Report written to ${options.outputPath}`);
    }
    return undefined;
  };

  // Nothing scannable was staged. Passing is the only sane answer: the commit
  // touched nothing this tool has an opinion about. Machine formats still get
  // a document, so a caller parsing stdout is never handed a bare sentence.
  if (hookMode && targets.length === 0) {
    if (options.format === "text") {
      if (!options.quiet) {
        io.out("No staged files to scan.");
      }
      return CLI_EXIT.OK;
    }
    const failure = emit(
      renderReport(options.format, {
        items: [],
        comparison: compareScannedFiles([], [], options.root),
        root: options.root,
        passed: true,
        toolVersion: version,
        verdict: "PASS — no staged files to scan",
        baselineIgnored: true,
      }),
    );
    return failure ?? CLI_EXIT.OK;
  }

  let items;
  try {
    const scanner = new Scanner(NO_IGNORES, undefined, config);
    items = hookMode
      ? await scanner.scanWorkspaceFiles([options.root], targets)
      : await scanner.scanProject(options.root);
  } catch (error) {
    io.err(`Scan failed: ${message(error)}`);
    return CLI_EXIT.SCAN_FAILED;
  }

  // Default in hook mode: report only what this commit actually wrote. It
  // needs no baseline, and touching a legacy file stays free.
  if (hookMode && !options.wholeFiles) {
    const ranges = collectStagedLineRanges(targets, options.root);
    items = items.filter((item) =>
      isWithinChangedLines(item.filePath, item.line, ranges),
    );
  }

  if (options.updateBaseline) {
    const baseline = buildBaseline(items, options.root);
    try {
      writeBaseline(options.baselinePath, baseline);
    } catch (error) {
      io.err(`Could not write ${options.baselinePath}: ${message(error)}`);
      return CLI_EXIT.USAGE;
    }
    if (!options.quiet) {
      io.out(
        `Baseline written to ${options.baselinePath} — ${baseline.total} item(s)`,
      );
    }
    return CLI_EXIT.OK;
  }

  let baseline;
  if (!options.failOnAny) {
    try {
      baseline = readBaseline(options.baselinePath);
    } catch (error) {
      io.err(message(error));
      return CLI_EXIT.USAGE;
    }
  }

  const comparison = hookMode
    ? compareScannedFiles(items, targets, options.root, baseline)
    : compareToBaseline(items, options.root, baseline);
  const passed = hookMode
    ? hookPassed(options, items.length, comparison)
    : hasPassed(options, comparison.total, comparison);

  const report = renderReport(options.format, {
    items,
    comparison,
    root: options.root,
    passed,
    toolVersion: version,
    verdict: hookMode
      ? hookVerdictLine(
          options,
          targets.length,
          items.length,
          comparison,
          passed,
        )
      : verdictLine(options, comparison, passed),
    // Changed-lines mode never consults a baseline, so reporting one would be
    // noise at best and a lie at worst.
    baselineIgnored: options.failOnAny || (hookMode && !options.wholeFiles),
  });

  const writeFailure = emit(report);
  if (writeFailure !== undefined) {
    return writeFailure;
  }

  for (const annotation of buildAnnotations(
    options.annotate,
    items,
    comparison,
    options.root,
  )) {
    io.out(annotation);
  }

  // Never in hook mode: the delta only covers the staged files, so "stale by
  // N" would be measured against a fraction of the project — and it would
  // recommend --update-baseline, which --files refuses.
  if (
    !options.quiet &&
    !hookMode &&
    passed &&
    comparison.hasBaseline &&
    comparison.delta < 0
  ) {
    io.out(
      `Baseline is stale by ${-comparison.delta} item(s) — re-run with --update-baseline to lock the gain in.`,
    );
  }

  return passed ? CLI_EXIT.OK : CLI_EXIT.REGRESSION;
}

/**
 * Hook mode has two rules, and neither is the whole-project ratchet.
 *
 * By default the run has already been narrowed to the lines this commit
 * staged, so anything left is something the commit itself wrote — fail.
 *
 * With --whole-files the scan covers the entire staged file, most of whose
 * deprecated code predates the commit, so the question becomes per-file: did
 * any of these files gain items since the baseline? With no baseline there is
 * nothing to have gained against, and blocking a commit over pre-existing debt
 * is exactly what this tool refuses to do.
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

function hookVerdictLine(
  options: CliOptions,
  scannedCount: number,
  remaining: number,
  comparison: { risenFiles: unknown[]; hasBaseline: boolean },
  passed: boolean,
): string {
  const scanned = `${scannedCount} staged file(s)`;
  if (passed) {
    return options.wholeFiles
      ? `PASS — ${scanned}, none above their baseline`
      : `PASS — ${scanned}, nothing deprecated on the lines you changed`;
  }
  if (options.wholeFiles) {
    return `FAIL — ${comparison.risenFiles.length} staged file(s) rose above their baseline`;
  }
  return `FAIL — ${remaining} deprecated usage(s) on lines this commit changed`;
}

function verdictLine(
  options: CliOptions,
  comparison: { baselineTotal: number; hasBaseline: boolean; delta: number },
  passed: boolean,
): string {
  if (passed) {
    return "PASS";
  }
  if (options.failOnAny) {
    return "FAIL — --fail-on-any and deprecated items were found";
  }
  const allowance = options.maxNew > 0 ? ` + ${options.maxNew} allowed` : "";
  return `FAIL — ${comparison.delta} item(s) above the baseline of ${comparison.baselineTotal}${allowance}`;
}

function isDirectory(target: string): boolean {
  try {
    return fs.statSync(target).isDirectory();
  } catch {
    return false;
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
