import * as fs from "fs";
import { ConfigReader } from "../config/configReader";
import { CLI_EXIT } from "../constants";
import { Scanner } from "../scanner/scanner";
import { CliOptions, USAGE, parseArgs } from "./args";
import { buildAnnotations } from "./annotations";
import {
  buildBaseline,
  compareToBaseline,
  readBaseline,
  writeBaseline,
} from "./baseline";
import { renderReport } from "./reporters";

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

  let items;
  try {
    items = await new Scanner(NO_IGNORES, undefined, config).scanProject(
      options.root,
    );
  } catch (error) {
    io.err(`Scan failed: ${message(error)}`);
    return CLI_EXIT.SCAN_FAILED;
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
  try {
    baseline = readBaseline(options.baselinePath);
  } catch (error) {
    io.err(message(error));
    return CLI_EXIT.USAGE;
  }

  const comparison = compareToBaseline(items, options.root, baseline);
  const passed = hasPassed(options, comparison.total, comparison);

  const report = renderReport(options.format, {
    items,
    comparison,
    root: options.root,
    passed,
    toolVersion: version,
    verdict: verdictLine(options, comparison, passed),
  });

  if (options.outputPath) {
    try {
      fs.writeFileSync(options.outputPath, `${report}\n`, "utf8");
    } catch (error) {
      io.err(`Could not write ${options.outputPath}: ${message(error)}`);
      return CLI_EXIT.USAGE;
    }
    if (!options.quiet) {
      io.out(`Report written to ${options.outputPath}`);
    }
  } else {
    io.out(report);
  }

  for (const annotation of buildAnnotations(
    options.annotate,
    items,
    comparison,
    options.root,
  )) {
    io.out(annotation);
  }

  if (
    !options.quiet &&
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
