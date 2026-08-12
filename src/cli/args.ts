import * as path from "path";
import { DEFAULT_BASELINE_FILE } from "../constants";

export type OutputFormat = "text" | "json" | "sarif" | "markdown";
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
  /** Explicit file list, as a hook manager that passes paths supplies it. */
  files: string[];
  /** Ask git for the staged list, for managers that pass no paths. */
  staged: boolean;
  /** Everything uncommitted: staged, unstaged and untracked. */
  changed: boolean;
  /**
   * Set by either --files or --staged. Distinct from `files.length` so that a
   * hook run whose file list came back empty stays a no-op instead of
   * silently becoming a whole-project scan.
   */
  hook: boolean;
  /** Hook mode only. Scan whole staged files instead of just changed lines. */
  wholeFiles: boolean;
  /**
   * Take the changed lines from the working tree rather than the index.
   *
   * Separate from `changed`, which also decides *which files* to look at: an
   * agent asking about files it just edited needs the working-tree lines for
   * exactly the files it named, not for everything else that happens to be
   * dirty. A pre-commit hook is the opposite case and stays on the index —
   * blocking a commit over an edit that is not being committed is a bug.
   */
  workingTreeRanges: boolean;
}

export type ParsedArgs =
  | { ok: true; options: CliOptions }
  | { ok: false; error: string };

export const USAGE = `deprecated-tracker [path] [options]
deprecated-tracker --files <file...> [options]
deprecated-tracker mcp [install|uninstall] [--agent <name>] [--scope <where>]

Scans a project for deprecated declarations and usages, then compares the
count against a committed baseline. Passes while the count holds or falls.

Scanning needs a path, so the current directory is "deprecated-tracker .";
the bare name prints this help.

In hook mode it scans only the staged files and reports on the lines this
commit changed. Use --files when the hook manager passes paths (lint-staged,
lefthook, pre-commit) and --staged when it does not (simple-git-hooks, a bare
husky hook, a plain .git/hooks script):

  { "src/**/*.{ts,tsx,js,jsx}": "deprecated-tracker --files" }
  deprecated-tracker --staged

Options
  --files <file...>     Scan only these files; everything after is a path
  --staged              Ask git for the staged files itself
  --changed             Everything uncommitted — staged, unstaged and
                        untracked. For pre-push hooks and coding agents;
                        --staged is the right one for pre-commit
  --whole-files         In hook mode, scan the whole file and ratchet each
                        one against its baseline count, instead of reporting
                        only the lines this commit changed
  --root <dir>          Project root (default: the working directory)
  --baseline <file>     Baseline file (default: ${DEFAULT_BASELINE_FILE})
  --update-baseline     Write the current counts to the baseline and exit 0
  --max-new <n>         Allowed increase over the baseline (default: 0)
  --fail-on-any         Ignore the baseline; fail if anything is found
  --format <fmt>        text | json | sarif | markdown (default: text)
  --output <file>       Write the report to a file instead of stdout
  --annotate <style>    github | azure | none (default: none)
  --quiet               Only emit the report and errors
  --help, -h            Show this help
  --version, -v         Show the version

Coding agents
  mcp                   Serve the scanner over stdio as an MCP server
  mcp install           Register it with Claude Code / Codex
                        (see: deprecated-tracker mcp --help)

Exit codes
  0  at or below the baseline
  1  above the baseline
  2  bad usage or unreadable baseline
  3  the scan itself failed`;

const FORMATS: OutputFormat[] = ["text", "json", "sarif", "markdown"];
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
    files: [],
    staged: false,
    changed: false,
    hook: false,
    wholeFiles: false,
    workingTreeRanges: false,
  };

  let baselineArg: string | undefined;
  let positional: string | undefined;
  let collectingFiles = false;

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
      // Everything after --files is a path, so lint-staged can append the
      // staged list straight onto the command.
      case "--files":
        collectingFiles = true;
        options.hook = true;
        break;
      case "--staged":
        options.staged = true;
        options.hook = true;
        break;
      case "--changed":
        options.changed = true;
        options.hook = true;
        options.workingTreeRanges = true;
        break;
      case "--whole-files":
        options.wholeFiles = true;
        break;
      case "--root": {
        const value = readValue();
        if (!value) {
          return { ok: false, error: "--root needs a directory path" };
        }
        positional = value;
        break;
      }
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
        if (collectingFiles) {
          options.files.push(path.resolve(cwd, argument));
          break;
        }
        if (positional !== undefined) {
          return { ok: false, error: "Only one path may be given" };
        }
        positional = argument;
      }
    }
  }

  // Writing a baseline from a handful of staged files would record zero for
  // every file the run never looked at, quietly wiping the project's history.
  if (options.hook && options.updateBaseline) {
    return {
      ok: false,
      error:
        "--update-baseline scans the whole project; drop --files / --staged",
    };
  }
  if (options.wholeFiles && !options.hook) {
    return {
      ok: false,
      error: "--whole-files only applies with --files or --staged",
    };
  }

  options.root = path.resolve(cwd, positional ?? ".");
  options.baselinePath = baselineArg
    ? path.resolve(cwd, baselineArg)
    : path.join(options.root, DEFAULT_BASELINE_FILE);

  return { ok: true, options };
}
