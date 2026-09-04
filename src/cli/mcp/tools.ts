import * as path from "path";
import { DeprecatedItem } from "../../interfaces";
import { PathUtils } from "../../utils";
import { CliOptions } from "../args";
import { DEFAULT_BASELINE_FILE } from "../../constants";
import { ScanOutcome, performScan } from "../scanCore";
import { classify, declarationLink } from "../reporters";
import { McpTool } from "./protocol";

export type ScanRunner = (
  options: CliOptions,
  warn: (message: string) => void,
) => Promise<ScanOutcome>;

/**
 * The scan verbs, as MCP tools. Each one maps onto a CLI mode rather than
 * reimplementing it, so an agent and a hook reach the same verdict from the
 * same code.
 */
export function createTools(
  cwd: string,
  scan: ScanRunner = performScan,
  warn: (message: string) => void = (text) => {
    process.stderr.write(`${text}\n`);
  },
): McpTool[] {
  const run = async (
    args: Record<string, unknown>,
    overrides: Partial<CliOptions>,
  ): Promise<unknown> => {
    const root = resolveRoot(cwd, args.root);
    const options = baseOptions(root, overrides);
    return summarise(await scan(options, warn), root);
  };

  return [
    {
      name: "scan_project",
      description:
        "Scan a whole TypeScript/JavaScript project for deprecated declarations and every usage of them, including deprecated APIs called from dependencies. Returns each item with its file, line and the @deprecated text.",
      inputSchema: {
        type: "object",
        properties: {
          root: {
            type: "string",
            description:
              "Project root to scan. Defaults to the working directory.",
          },
        },
      },
      run: (args) => run(args, {}),
    },
    {
      name: "scan_changes",
      description:
        "Scan only what is uncommitted — staged, unstaged and untracked files — and report deprecated code on the lines that changed. Use this to check work in progress before committing.",
      inputSchema: {
        type: "object",
        properties: {
          root: {
            type: "string",
            description: "Repository root. Defaults to the working directory.",
          },
          whole_files: {
            type: "boolean",
            description:
              "Report every deprecated item in each changed file, not just the lines that changed.",
          },
        },
      },
      run: (args) =>
        run(args, {
          hook: true,
          changed: true,
          workingTreeRanges: true,
          wholeFiles: args.whole_files === true,
        }),
    },
    {
      name: "scan_files",
      description:
        "Scan an explicit list of files. Use this straight after editing them: files that are not staged are treated as changed in full, so nothing has to be committed first.",
      inputSchema: {
        type: "object",
        properties: {
          files: {
            type: "array",
            items: { type: "string" },
            description: "Paths to scan, absolute or relative to root.",
          },
          root: {
            type: "string",
            description: "Project root. Defaults to the working directory.",
          },
        },
        required: ["files"],
      },
      // Working-tree ranges, not the index: the caller has just edited these
      // files. Staging one earlier must not hide the edits made since, which
      // are exactly the lines it is asking about.
      run: async (args) => {
        const root = resolveRoot(cwd, args.root);
        return run(args, {
          hook: true,
          workingTreeRanges: true,
          files: readPaths(args.files, root),
        });
      },
    },
  ];
}

function summarise(
  outcome: ScanOutcome,
  root: string,
): Record<string, unknown> {
  return {
    root,
    passed: outcome.passed,
    total: outcome.items.length,
    scannedFiles: outcome.targets.length,
    baselineTotal: outcome.comparison.baselineTotal,
    hasBaseline: outcome.baselineIgnored
      ? false
      : outcome.comparison.hasBaseline,
    summary: classify(outcome.items),
    items: outcome.items.map((item) => describeItem(item, root)),
  };
}

function describeItem(
  item: DeprecatedItem,
  root: string,
): Record<string, unknown> {
  return {
    name: item.name,
    kind: item.kind,
    file: PathUtils.relativeTo(root, item.filePath),
    line: item.line,
    character: item.character,
    urgency: item.deprecationSchedule?.urgency,
    reason: item.deprecationReason,
    declaration: declarationLink(root, item),
  };
}

function resolveRoot(cwd: string, value: unknown): string {
  return typeof value === "string" && value.trim()
    ? path.resolve(cwd, value)
    : cwd;
}

function readPaths(value: unknown, root: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error("files must be an array of paths");
  }
  const paths = value.filter(
    (entry): entry is string => typeof entry === "string",
  );
  if (paths.length === 0) {
    throw new Error("files must contain at least one path");
  }
  return paths.map((entry) => path.resolve(root, entry));
}

function baseOptions(root: string, overrides: Partial<CliOptions>): CliOptions {
  return {
    root,
    baselinePath: path.join(root, DEFAULT_BASELINE_FILE),
    updateBaseline: false,
    maxNew: 0,
    format: "json",
    annotate: "none",
    failOnAny: false,
    quiet: true,
    help: false,
    version: false,
    files: [],
    projectConfig: true,
    staged: false,
    changed: false,
    hook: false,
    wholeFiles: false,
    workingTreeRanges: false,
    ...overrides,
  };
}
