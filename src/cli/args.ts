import * as path from "path";
import { DEFAULT_BASELINE_FILE } from "../constants";

export type OutputFormat = "text" | "json" | "sarif";
export type AnnotationStyle = "github" | "azure" | "none";

export interface CliOptions {
  root: string;
  baselinePath: string;
  updateBaseline: boolean;
  maxNew: number;
  format: OutputFormat;
  outputPath?: string;
  annotate: AnnotationStyle;
  failOnAny: boolean;
  quiet: boolean;
  help: boolean;
  version: boolean;
}

export type ParsedArgs =
  | { ok: true; options: CliOptions }
  | { ok: false; error: string };

export const USAGE = `deprecated-tracker [path] [options]

Scans a project for deprecated declarations and usages, then compares the
count against a committed baseline. Passes while the count holds or falls.

Options
  --baseline <file>     Baseline file (default: ${DEFAULT_BASELINE_FILE})
  --update-baseline     Write the current counts to the baseline and exit 0
  --max-new <n>         Allowed increase over the baseline (default: 0)
  --fail-on-any         Ignore the baseline; fail if anything is found
  --format <fmt>        text | json | sarif (default: text)
  --output <file>       Write the report to a file instead of stdout
  --annotate <style>    github | azure | none (default: none)
  --quiet               Only emit the report and errors
  --help, -h            Show this help
  --version, -v         Show the version

Exit codes
  0  at or below the baseline
  1  above the baseline
  2  bad usage or unreadable baseline
  3  the scan itself failed`;

const FORMATS: OutputFormat[] = ["text", "json", "sarif"];
const ANNOTATIONS: AnnotationStyle[] = ["github", "azure", "none"];

export function parseArgs(argv: string[], cwd: string): ParsedArgs {
  const options: CliOptions = {
    root: cwd,
    baselinePath: "",
    updateBaseline: false,
    maxNew: 0,
    format: "text",
    annotate: "none",
    failOnAny: false,
    quiet: false,
    help: false,
    version: false,
  };

  let baselineArg: string | undefined;
  let positional: string | undefined;

  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    const separator = argument.indexOf("=");
    const isLongFlag = argument.startsWith("--") && separator > -1;
    const flag = isLongFlag ? argument.slice(0, separator) : argument;
    const inlineValue = isLongFlag ? argument.slice(separator + 1) : undefined;

    const readValue = (): string | undefined => {
      if (inlineValue !== undefined) {
        return inlineValue;
      }
      index++;
      return argv[index];
    };

    switch (flag) {
      case "--help":
      case "-h":
        options.help = true;
        break;
      case "--version":
      case "-v":
        options.version = true;
        break;
      case "--quiet":
        options.quiet = true;
        break;
      case "--update-baseline":
        options.updateBaseline = true;
        break;
      case "--fail-on-any":
        options.failOnAny = true;
        break;
      case "--baseline": {
        const value = readValue();
        if (!value) {
          return { ok: false, error: "--baseline needs a file path" };
        }
        baselineArg = value;
        break;
      }
      case "--output": {
        const value = readValue();
        if (!value) {
          return { ok: false, error: "--output needs a file path" };
        }
        options.outputPath = path.resolve(cwd, value);
        break;
      }
      case "--max-new": {
        const value = readValue();
        const parsed = Number(value);
        if (!value || !Number.isInteger(parsed) || parsed < 0) {
          return { ok: false, error: "--max-new needs a whole number >= 0" };
        }
        options.maxNew = parsed;
        break;
      }
      case "--format": {
        const value = readValue();
        if (!value || !FORMATS.includes(value as OutputFormat)) {
          return { ok: false, error: `--format must be ${FORMATS.join(", ")}` };
        }
        options.format = value as OutputFormat;
        break;
      }
      case "--annotate": {
        const value = readValue();
        if (!value || !ANNOTATIONS.includes(value as AnnotationStyle)) {
          return {
            ok: false,
            error: `--annotate must be ${ANNOTATIONS.join(", ")}`,
          };
        }
        options.annotate = value as AnnotationStyle;
        break;
      }
      default: {
        if (argument.startsWith("-")) {
          return { ok: false, error: `Unknown option: ${argument}` };
        }
        if (positional !== undefined) {
          return { ok: false, error: "Only one path may be given" };
        }
        positional = argument;
      }
    }
  }

  options.root = path.resolve(cwd, positional ?? ".");
  options.baselinePath = baselineArg
    ? path.resolve(cwd, baselineArg)
    : path.join(options.root, DEFAULT_BASELINE_FILE);

  return { ok: true, options };
}
