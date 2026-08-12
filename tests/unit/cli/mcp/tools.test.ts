import * as path from "path";
import { CliOptions } from "../../../../src/cli/args";
import { createTools } from "../../../../src/cli/mcp/tools";
import { ScanOutcome } from "../../../../src/cli/scanCore";
import { DeprecatedItem } from "../../../../src/interfaces";

const cwd = path.resolve("/repo");

const item = (relative: string): DeprecatedItem => ({
  name: "oldApi",
  fileName: path.basename(relative),
  filePath: path.resolve(cwd, relative),
  line: 12,
  character: 3,
  kind: "function",
  deprecationReason: "Use newApi",
  deprecationSchedule: { urgency: "scheduled" },
});

const outcome = (over: Partial<ScanOutcome> = {}): ScanOutcome => ({
  config: {},
  targets: [],
  items: [],
  comparison: {
    hasBaseline: false,
    total: 0,
    baselineTotal: 0,
    delta: 0,
    risenFiles: [],
  },
  passed: true,
  baselineIgnored: false,
  empty: false,
  ...over,
});

const capture = (
  result: ScanOutcome = outcome(),
): { scan: jest.Mock; options: () => CliOptions } => {
  const scan = jest.fn().mockResolvedValue(result);
  return {
    scan,
    options: () => scan.mock.calls[0][0] as CliOptions,
  };
};

const toolNamed = (name: string, scan: jest.Mock) => {
  const found = createTools(cwd, scan, () => {}).find(
    (candidate) => candidate.name === name,
  );
  if (!found) {
    throw new Error(`no tool named ${name}`);
  }
  return found;
};

describe("the tool list", () => {
  it("exposes exactly the three scan verbs", () => {
    expect(createTools(cwd).map((tool) => tool.name)).toEqual([
      "scan_project",
      "scan_changes",
      "scan_files",
    ]);
  });

  it("declares files as required on scan_files only", () => {
    const tools = createTools(cwd);
    const required = (name: string): unknown =>
      (
        tools.find((tool) => tool.name === name)?.inputSchema as {
          required?: unknown;
        }
      ).required;

    expect(required("scan_files")).toEqual(["files"]);
    expect(required("scan_project")).toBeUndefined();
  });
});

describe("scan_project", () => {
  it("scans the working directory by default", async () => {
    const { scan, options } = capture();

    await toolNamed("scan_project", scan).run({});

    expect(options().root).toBe(cwd);
    expect(options().hook).toBe(false);
  });

  it("resolves a relative root against the working directory", async () => {
    const { scan, options } = capture();

    await toolNamed("scan_project", scan).run({ root: "packages/app" });

    expect(options().root).toBe(path.resolve(cwd, "packages/app"));
  });

  it("ignores a blank root rather than scanning nothing", async () => {
    const { scan, options } = capture();

    await toolNamed("scan_project", scan).run({ root: "   " });

    expect(options().root).toBe(cwd);
  });

  it("reports items relative to the scanned root", async () => {
    const { scan } = capture(
      outcome({ items: [item("src/a.ts")], passed: false }),
    );

    const result = (await toolNamed("scan_project", scan).run({})) as {
      passed: boolean;
      total: number;
      items: { file: string; reason: string; urgency: string }[];
    };

    expect(result.passed).toBe(false);
    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({
      file: "src/a.ts",
      reason: "Use newApi",
      urgency: "scheduled",
    });
  });

  it("reports the baseline when one was consulted", async () => {
    const { scan } = capture(
      outcome({
        comparison: {
          hasBaseline: true,
          total: 1,
          baselineTotal: 4,
          delta: -3,
          risenFiles: [],
        },
      }),
    );

    const result = (await toolNamed("scan_project", scan).run({})) as {
      hasBaseline: boolean;
      baselineTotal: number;
    };

    expect(result).toMatchObject({ hasBaseline: true, baselineTotal: 4 });
  });

  // Changed-lines mode never reads a baseline, so claiming one would be a lie.
  it("says there is no baseline when the scan ignored it", async () => {
    const { scan } = capture(
      outcome({
        baselineIgnored: true,
        comparison: {
          hasBaseline: true,
          total: 0,
          baselineTotal: 0,
          delta: 0,
          risenFiles: [],
        },
      }),
    );

    const result = (await toolNamed("scan_project", scan).run({})) as {
      hasBaseline: boolean;
    };

    expect(result.hasBaseline).toBe(false);
  });
});

describe("scan_changes", () => {
  it("runs the working-tree scan in hook mode", async () => {
    const { scan, options } = capture();

    await toolNamed("scan_changes", scan).run({});

    expect(options()).toMatchObject({
      hook: true,
      changed: true,
      workingTreeRanges: true,
      wholeFiles: false,
    });
  });

  it("honours whole_files", async () => {
    const { scan, options } = capture();

    await toolNamed("scan_changes", scan).run({ whole_files: true });

    expect(options().wholeFiles).toBe(true);
  });

  it("counts the files actually scanned", async () => {
    const { scan } = capture(outcome({ targets: ["a.ts", "b.ts"] }));

    const result = (await toolNamed("scan_changes", scan).run({})) as {
      scannedFiles: number;
    };

    expect(result.scannedFiles).toBe(2);
  });
});

describe("scan_files", () => {
  it("resolves each path against the root", async () => {
    const { scan, options } = capture();

    await toolNamed("scan_files", scan).run({ files: ["src/a.ts"] });

    expect(options().files).toEqual([path.resolve(cwd, "src/a.ts")]);
    expect(options().hook).toBe(true);
  });

  // The caller has just edited these files. Reading the index instead would
  // hide every edit made since a file was staged — the lines it is asking
  // about — and answer "clean" about code it wrote a moment ago.
  it("reads changed lines from the working tree, not the index", async () => {
    const { scan, options } = capture();

    await toolNamed("scan_files", scan).run({ files: ["src/a.ts"] });

    expect(options().workingTreeRanges).toBe(true);
    // Only the named files: the working tree is the line source, not a second
    // way of discovering targets.
    expect(options().changed).toBe(false);
    expect(options().files).toHaveLength(1);
  });

  it("resolves paths against an explicit root", async () => {
    const { scan, options } = capture();

    await toolNamed("scan_files", scan).run({
      files: ["a.ts"],
      root: "packages/app",
    });

    expect(options().files).toEqual([
      path.resolve(cwd, "packages/app", "a.ts"),
    ]);
  });

  it("drops entries that are not strings", async () => {
    const { scan, options } = capture();

    await toolNamed("scan_files", scan).run({ files: ["a.ts", 42, null] });

    expect(options().files).toEqual([path.resolve(cwd, "a.ts")]);
  });

  // Silently scanning the whole project because the list was junk is exactly
  // the hook-mode bug this codebase already fixed once.
  it("refuses a files argument that is not an array", async () => {
    const { scan } = capture();

    await expect(
      toolNamed("scan_files", scan).run({ files: "a.ts" }),
    ).rejects.toThrow("files must be an array of paths");
    expect(scan).not.toHaveBeenCalled();
  });

  it("refuses an empty list", async () => {
    const { scan } = capture();

    await expect(
      toolNamed("scan_files", scan).run({ files: [] }),
    ).rejects.toThrow("files must contain at least one path");
    expect(scan).not.toHaveBeenCalled();
  });
});

describe("the options handed to the scanner", () => {
  it("never writes a baseline and stays quiet", async () => {
    const { scan, options } = capture();

    await toolNamed("scan_project", scan).run({});

    expect(options()).toMatchObject({
      updateBaseline: false,
      quiet: true,
      failOnAny: false,
      maxNew: 0,
    });
  });

  it("looks for the baseline beside the scanned root", async () => {
    const { scan, options } = capture();

    await toolNamed("scan_project", scan).run({ root: "packages/app" });

    expect(options().baselinePath).toBe(
      path.join(
        path.resolve(cwd, "packages/app"),
        ".deprecated-tracker-baseline.json",
      ),
    );
  });

  it("sends config warnings somewhere other than stdout", async () => {
    const warn = jest.fn();
    const scan = jest.fn().mockImplementation(async (_options, report) => {
      report("something is off");
      return outcome();
    });

    const tool = createTools(cwd, scan, warn).find(
      (candidate) => candidate.name === "scan_project",
    );
    await tool?.run({});

    expect(warn).toHaveBeenCalledWith("something is off");
  });
});
