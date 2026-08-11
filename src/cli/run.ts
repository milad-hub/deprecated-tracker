import * as fs from "fs";
import { CLI_EXIT } from "../constants";
import { CliOptions, USAGE, parseArgs } from "./args";
import { buildAnnotations } from "./annotations";
import { buildBaseline, writeBaseline } from "./baseline";
import { renderReport } from "./reporters";
import { ScanError, message, performScan } from "./scanCore";
import { runMcp } from "./mcp";

export interface CliIo {
  out: (text: string) => void;
  err: (text: string) => void;
}

export interface RunContext {
  cwd?: string;
  io?: CliIo;
  version?: string;
}

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

  // Before parseArgs, which would read a bare `mcp` as a directory to scan.
  if (argv[0] === "mcp") {
    return runMcp(argv.slice(1), { cwd, version, io });
  }

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

  const hookMode = options.hook;

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

  let outcome;
  try {
    outcome = await performScan(options, io.err);
  } catch (error) {
    if (error instanceof ScanError) {
      io.err(error.message);
      return error.exit;
    }
    throw error;
  }

  const { items, targets, comparison } = outcome;

  // Nothing scannable was staged. Passing is the only sane answer: the change
  // touched nothing this tool has an opinion about. Machine formats still get
  // a document, so a caller parsing stdout is never handed a bare sentence.
  if (outcome.empty) {
    const nothing = `No ${subject(options)} files to scan`;
    if (options.format === "text") {
      if (!options.quiet) {
        io.out(`${nothing}.`);
      }
      return CLI_EXIT.OK;
    }
    const failure = emit(
      renderReport(options.format, {
        items: [],
        comparison,
        root: options.root,
        passed: true,
        toolVersion: version,
        verdict: `PASS — ${nothing.toLowerCase()}`,
        baselineIgnored: true,
      }),
    );
    return failure ?? CLI_EXIT.OK;
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

  const passed = outcome.passed;

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

/** "staged" is a lie under --changed, which also covers what is not staged. */
function subject(options: CliOptions): string {
  return options.changed ? "changed" : "staged";
}

function hookVerdictLine(
  options: CliOptions,
  scannedCount: number,
  remaining: number,
  comparison: { risenFiles: unknown[]; hasBaseline: boolean },
  passed: boolean,
): string {
  const noun = subject(options);
  const scanned = `${scannedCount} ${noun} file(s)`;
  if (passed) {
    return options.wholeFiles
      ? `PASS — ${scanned}, none above their baseline`
      : `PASS — ${scanned}, nothing deprecated on the lines you changed`;
  }
  if (options.wholeFiles) {
    return `FAIL — ${comparison.risenFiles.length} ${noun} file(s) rose above their baseline`;
  }
  return `FAIL — ${remaining} deprecated item(s) on the lines you changed`;
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
