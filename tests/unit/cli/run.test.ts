import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { run } from "../../../src/cli";
import { CLI_EXIT, DEFAULT_BASELINE_FILE } from "../../../src/constants";
import { DeprecatedItem } from "../../../src/interfaces";
import { Scanner } from "../../../src/scanner/scanner";
import * as stagedDiff from "../../../src/cli/stagedDiff";

jest.mock("../../../src/scanner/scanner", () => ({
  Scanner: jest.fn().mockImplementation(() => ({
    scanProject: jest.fn().mockResolvedValue([]),
  })),
}));

const scannerMock = Scanner as unknown as jest.Mock;

let root: string;
let out: string[];
let err: string[];

const io = {
  out: (text: string) => out.push(text),
  err: (text: string) => err.push(text),
};

const item = (relativePath: string, name = "oldApi"): DeprecatedItem => ({
  name,
  fileName: path.basename(relativePath),
  filePath: path.join(root, relativePath),
  line: 12,
  character: 3,
  kind: "function",
});

const scanReturns = (items: DeprecatedItem[]): jest.Mock => {
  const scanProject = jest.fn().mockResolvedValue(items);
  scannerMock.mockImplementation(() => ({ scanProject }));
  return scanProject;
};

const scanFilesReturns = (items: DeprecatedItem[]): jest.Mock => {
  const scanWorkspaceFiles = jest.fn().mockResolvedValue(items);
  scannerMock.mockImplementation(() => ({
    scanProject: jest.fn().mockResolvedValue([]),
    scanWorkspaceFiles,
  }));
  return scanWorkspaceFiles;
};

const scanThrows = (error: unknown): void => {
  scannerMock.mockImplementation(() => ({
    scanProject: jest.fn().mockRejectedValue(error),
  }));
};

const invoke = (...argv: string[]): Promise<number> =>
  run(argv, { cwd: root, io, version: "9.9.9" });

const stdout = (): string => out.join("\n");
const stderr = (): string => err.join("\n");

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "dt-cli-"));
  out = [];
  err = [];
  scanReturns([]);
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  jest.clearAllMocks();
});

describe("usage", () => {
  it("prints help and stops", async () => {
    expect(await invoke("--help")).toBe(CLI_EXIT.OK);
    expect(stdout()).toContain("deprecated-tracker [path] [options]");
    expect(scannerMock).not.toHaveBeenCalled();
  });

  it("prints the version it was handed", async () => {
    expect(await invoke("--version")).toBe(CLI_EXIT.OK);
    expect(stdout()).toBe("9.9.9");
  });

  it("reports a bad flag with the usage text", async () => {
    expect(await invoke("--bogus")).toBe(CLI_EXIT.USAGE);
    expect(stderr()).toContain("Unknown option: --bogus");
    expect(stderr()).toContain("Exit codes");
  });

  it("refuses a path that is not a directory", async () => {
    const file = path.join(root, "file.ts");
    fs.writeFileSync(file, "", "utf8");
    expect(await invoke(file)).toBe(CLI_EXIT.USAGE);
    expect(stderr()).toContain("Not a directory");
  });

  it("refuses a path that does not exist", async () => {
    expect(await invoke(path.join(root, "nope"))).toBe(CLI_EXIT.USAGE);
    expect(stderr()).toContain("Not a directory");
  });
});

describe("scanning", () => {
  it("passes the resolved root to the scanner", async () => {
    const scanProject = scanReturns([]);
    await invoke(".");
    expect(scanProject).toHaveBeenCalledWith(root);
  });

  it("hands the scanner a config and an ignore checker that ignores nothing", async () => {
    await invoke();
    const [ignoreChecker, tags, config] = scannerMock.mock.calls[0];
    expect(ignoreChecker.isFileIgnored("anything")).toBe(false);
    expect(ignoreChecker.isMethodIgnored("anything", "name")).toBe(false);
    expect(tags).toBeUndefined();
    expect(config.severity).toBe("warning");
  });

  it("reads .deprecatedtrackerrc from the scanned project", async () => {
    fs.writeFileSync(
      path.join(root, ".deprecatedtrackerrc"),
      JSON.stringify({ severity: "error" }),
      "utf8",
    );
    await invoke();
    expect(scannerMock.mock.calls[0][2].severity).toBe("error");
  });

  it("reports a scan failure with its own exit code", async () => {
    scanThrows(new Error("no tsconfig"));
    expect(await invoke()).toBe(CLI_EXIT.SCAN_FAILED);
    expect(stderr()).toContain("Scan failed: no tsconfig");
  });

  it("reports a non-Error scan failure", async () => {
    scanThrows("exploded");
    expect(await invoke()).toBe(CLI_EXIT.SCAN_FAILED);
    expect(stderr()).toContain("Scan failed: exploded");
  });
});

describe("baseline", () => {
  const baselineFile = (): string => path.join(root, DEFAULT_BASELINE_FILE);

  it("writes a baseline and exits without gating", async () => {
    scanReturns([item("src/a.ts"), item("src/b.ts")]);
    expect(await invoke("--update-baseline")).toBe(CLI_EXIT.OK);

    const written = JSON.parse(fs.readFileSync(baselineFile(), "utf8"));
    expect(written.total).toBe(2);
    expect(written.files).toEqual({ "src/a.ts": 1, "src/b.ts": 1 });
    expect(stdout()).toContain("Baseline written to");
  });

  it("stays silent about the write when quiet", async () => {
    expect(await invoke("--update-baseline", "--quiet")).toBe(CLI_EXIT.OK);
    expect(stdout()).toBe("");
  });

  it("reports a baseline it cannot write", async () => {
    const target = path.join(root, "missing-dir", "baseline.json");
    expect(await invoke("--update-baseline", "--baseline", target)).toBe(
      CLI_EXIT.USAGE,
    );
    expect(stderr()).toContain("Could not write");
  });

  it("passes a first run with no baseline rather than failing on old debt", async () => {
    scanReturns([item("src/a.ts")]);
    expect(await invoke()).toBe(CLI_EXIT.OK);
    expect(stdout()).toContain("No baseline found");
  });

  it("refuses to run against an unreadable baseline", async () => {
    fs.writeFileSync(baselineFile(), "{ not json", "utf8");
    expect(await invoke()).toBe(CLI_EXIT.USAGE);
    expect(stderr()).toContain("is not valid JSON");
  });
});

describe("the ratchet", () => {
  const withBaseline = async (
    baselineItems: DeprecatedItem[],
  ): Promise<void> => {
    scanReturns(baselineItems);
    await invoke("--update-baseline", "--quiet");
    out = [];
    err = [];
  };

  it("passes when the count holds", async () => {
    await withBaseline([item("src/a.ts")]);
    scanReturns([item("src/a.ts")]);
    expect(await invoke()).toBe(CLI_EXIT.OK);
    expect(stdout()).toContain("PASS");
  });

  it("fails when the count rises, naming the gap", async () => {
    await withBaseline([item("src/a.ts")]);
    scanReturns([item("src/a.ts"), item("src/a.ts", "second")]);

    expect(await invoke()).toBe(CLI_EXIT.REGRESSION);
    expect(stdout()).toContain("FAIL — 1 item(s) above the baseline of 1");
    expect(stdout()).toContain("src/a.ts  1 → 2");
  });

  it("allows a deliberate increase within --max-new", async () => {
    await withBaseline([item("src/a.ts")]);
    scanReturns([item("src/a.ts"), item("src/a.ts", "second")]);
    expect(await invoke("--max-new", "1")).toBe(CLI_EXIT.OK);
  });

  it("still fails past --max-new and says what was allowed", async () => {
    await withBaseline([]);
    scanReturns([item("src/a.ts"), item("src/a.ts", "second")]);
    expect(await invoke("--max-new", "1")).toBe(CLI_EXIT.REGRESSION);
    expect(stdout()).toContain("above the baseline of 0 + 1 allowed");
  });

  it("passes when the count falls and asks for the gain to be locked in", async () => {
    await withBaseline([item("src/a.ts"), item("src/a.ts", "second")]);
    scanReturns([item("src/a.ts")]);

    expect(await invoke()).toBe(CLI_EXIT.OK);
    expect(stdout()).toContain("Baseline is stale by 1 item(s)");
  });

  it("keeps the stale-baseline nudge out of quiet output", async () => {
    await withBaseline([item("src/a.ts")]);
    scanReturns([]);
    expect(await invoke("--quiet")).toBe(CLI_EXIT.OK);
    expect(stdout()).not.toContain("stale");
  });

  it("does not nudge when the count is merely level", async () => {
    await withBaseline([item("src/a.ts")]);
    scanReturns([item("src/a.ts")]);
    await invoke();
    expect(stdout()).not.toContain("stale");
  });
});

describe("--fail-on-any", () => {
  it("fails on any item, baseline or not", async () => {
    scanReturns([item("src/a.ts")]);
    expect(await invoke("--fail-on-any")).toBe(CLI_EXIT.REGRESSION);
    expect(stdout()).toContain("--fail-on-any and deprecated items were found");
  });

  it("passes on a clean project", async () => {
    expect(await invoke("--fail-on-any")).toBe(CLI_EXIT.OK);
    expect(stdout()).toContain("PASS");
  });
});

describe("output", () => {
  it("prints the report to stdout by default", async () => {
    scanReturns([item("src/a.ts")]);
    await invoke();
    expect(stdout()).toContain("Deprecated Tracker — 1 item(s)");
  });

  it("writes the report to a file and says where", async () => {
    const target = path.join(root, "report.json");
    scanReturns([item("src/a.ts")]);

    await invoke("--format", "json", "--output", target);

    expect(JSON.parse(fs.readFileSync(target, "utf8")).total).toBe(1);
    expect(stdout()).toContain("Report written to");
    expect(stdout()).not.toContain("Deprecated Tracker —");
  });

  it("stays silent about the file when quiet", async () => {
    const target = path.join(root, "report.txt");
    await invoke("--output", target, "--quiet");
    expect(stdout()).toBe("");
    expect(fs.existsSync(target)).toBe(true);
  });

  it("reports a report it cannot write", async () => {
    const target = path.join(root, "missing-dir", "report.txt");
    expect(await invoke("--output", target)).toBe(CLI_EXIT.USAGE);
    expect(stderr()).toContain("Could not write");
  });

  it("emits annotations alongside the report", async () => {
    scanReturns([item("src/a.ts")]);
    await invoke("--annotate", "github");
    expect(stdout()).toContain("::warning file=src/a.ts,line=12,col=3::");
  });
});

describe("defaults outside the injected context", () => {
  it("falls back to the process working directory and a placeholder version", async () => {
    const write = jest
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    const cwd = jest.spyOn(process, "cwd").mockReturnValue(root);

    expect(await run(["--version"])).toBe(CLI_EXIT.OK);

    expect(write).toHaveBeenCalledWith("0.0.0\n");
    expect(cwd).toHaveBeenCalled();
    write.mockRestore();
    cwd.mockRestore();
  });

  it("writes parse errors to stderr", async () => {
    const write = jest
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);

    expect(await run(["--bogus"], { cwd: root })).toBe(CLI_EXIT.USAGE);

    expect(write).toHaveBeenCalledWith("Unknown option: --bogus\n");
    write.mockRestore();
  });
});

describe("hook mode", () => {
  const staged = (relative: string): string => path.join(root, relative);

  // The diff parsing has its own suite; here only the ranges it yields matter.
  const changedLines = (
    ranges: Record<string, Array<{ start: number; end: number }>> = {},
  ): void => {
    const map = new Map(
      Object.entries(ranges).map(([file, value]) => [
        staged(file).toLowerCase(),
        value,
      ]),
    );
    jest
      .spyOn(stagedDiff, "collectStagedLineRanges")
      .mockReturnValue(map);
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("scans only the given files, not the whole project", async () => {
    const scanFiles = scanFilesReturns([]);
    changedLines();

    await invoke("--files", "src/a.ts");

    expect(scanFiles).toHaveBeenCalledWith([root], [staged("src/a.ts")]);
  });

  describe("changed lines (the default)", () => {
    it("passes when nothing deprecated sits on a changed line", async () => {
      scanFilesReturns([item("src/a.ts")]);
      // The scanned item is on line 12; this commit changed line 40.
      changedLines({ "src/a.ts": [{ start: 40, end: 40 }] });

      expect(await invoke("--files", "src/a.ts")).toBe(CLI_EXIT.OK);
      expect(stdout()).toContain(
        "nothing deprecated on the lines you changed",
      );
    });

    it("fails when the commit itself wrote the deprecated usage", async () => {
      scanFilesReturns([item("src/a.ts")]);
      changedLines({ "src/a.ts": [{ start: 12, end: 13 }] });

      expect(await invoke("--files", "src/a.ts")).toBe(CLI_EXIT.REGRESSION);
      expect(stdout()).toContain(
        "1 deprecated usage(s) on lines this commit changed",
      );
    });

    it("treats a file git reports no hunks for as entirely new", async () => {
      scanFilesReturns([item("src/a.ts")]);
      changedLines();

      expect(await invoke("--files", "src/a.ts")).toBe(CLI_EXIT.REGRESSION);
    });

    // Nothing was consulted, so nothing should be claimed.
    it("says nothing about a baseline", async () => {
      scanFilesReturns([]);
      changedLines();

      await invoke("--files", "src/a.ts");

      expect(stdout()).not.toContain("baseline");
      expect(stdout()).not.toContain("Baseline");
    });
  });

  describe("--whole-files", () => {
    const writeBaselineFile = (files: Record<string, number>): void => {
      fs.writeFileSync(
        path.join(root, DEFAULT_BASELINE_FILE),
        JSON.stringify({
          version: 1,
          generatedAt: "now",
          total: Object.values(files).reduce((sum, n) => sum + n, 0),
          files,
        }),
      );
    };

    it("passes when a staged file holds what the baseline recorded", async () => {
      scanFilesReturns([item("src/a.ts"), item("src/a.ts")]);
      writeBaselineFile({ "src/a.ts": 2 });

      expect(await invoke("--files", "--whole-files", "src/a.ts")).toBe(
        CLI_EXIT.OK,
      );
      expect(stdout()).toContain("none above their baseline");
    });

    it("fails when a staged file gained items", async () => {
      scanFilesReturns([item("src/a.ts"), item("src/a.ts")]);
      writeBaselineFile({ "src/a.ts": 1 });

      expect(await invoke("--files", "--whole-files", "src/a.ts")).toBe(
        CLI_EXIT.REGRESSION,
      );
      expect(stdout()).toContain("1 staged file(s) rose above their baseline");
    });

    // Blocking a commit over debt that was already there is the behaviour
    // this tool exists to avoid.
    it("passes with no baseline at all", async () => {
      scanFilesReturns([item("src/a.ts")]);

      expect(await invoke("--files", "--whole-files", "src/a.ts")).toBe(
        CLI_EXIT.OK,
      );
    });

    it("ignores files outside the staged set when ratcheting", async () => {
      scanFilesReturns([item("src/a.ts")]);
      writeBaselineFile({ "src/a.ts": 1, "src/untouched.ts": 40 });

      expect(await invoke("--files", "--whole-files", "src/a.ts")).toBe(
        CLI_EXIT.OK,
      );
    });

    it("still honours --fail-on-any", async () => {
      scanFilesReturns([item("src/a.ts")]);
      writeBaselineFile({ "src/a.ts": 5 });

      expect(
        await invoke("--files", "--whole-files", "--fail-on-any", "src/a.ts"),
      ).toBe(CLI_EXIT.REGRESSION);
    });
  });
});

describe("hook mode housekeeping", () => {
  // --update-baseline is refused with --files, so recommending it would send
  // the user to a command that exits 2.
  it("never suggests refreshing the baseline", async () => {
    scanFilesReturns([]);
    jest
      .spyOn(stagedDiff, "collectStagedLineRanges")
      .mockReturnValue(new Map());
    fs.writeFileSync(
      path.join(root, DEFAULT_BASELINE_FILE),
      JSON.stringify({
        version: 1,
        generatedAt: "now",
        total: 3,
        files: { "src/a.ts": 3 },
      }),
    );

    expect(await invoke("--files", "--whole-files", "src/a.ts")).toBe(
      CLI_EXIT.OK,
    );
    expect(stdout()).not.toContain("stale");

    jest.restoreAllMocks();
  });
});

describe("hook mode file discovery", () => {
  const noRanges = (): void => {
    jest
      .spyOn(stagedDiff, "collectStagedLineRanges")
      .mockReturnValue(new Map());
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // simple-git-hooks, a bare .husky/pre-commit, or a raw .git/hooks script
  // run a command and pass nothing.
  it("asks git for the staged files when none were passed", async () => {
    const scanFiles = scanFilesReturns([]);
    jest
      .spyOn(stagedDiff, "listStagedFiles")
      .mockReturnValue([path.join(root, "src/a.ts")]);
    noRanges();

    await invoke("--staged");

    expect(scanFiles).toHaveBeenCalledWith(
      [root],
      [path.join(root, "src/a.ts")],
    );
  });

  it("scans the union when both --staged and paths are given", async () => {
    const scanFiles = scanFilesReturns([]);
    jest
      .spyOn(stagedDiff, "listStagedFiles")
      .mockReturnValue([path.join(root, "src/a.ts")]);
    noRanges();

    await invoke("--staged", "--files", "src/b.ts");

    expect(scanFiles.mock.calls[0][1]).toEqual([
      path.join(root, "src/a.ts"),
      path.join(root, "src/b.ts"),
    ]);
  });

  // A lint-staged glob of "*" hands over stylesheets and markdown.
  it("drops files the scanner cannot parse", async () => {
    const scanFiles = scanFilesReturns([]);
    noRanges();

    await invoke("--files", "src/a.ts", "notes.md", "theme.scss");

    expect(scanFiles.mock.calls[0][1]).toEqual([path.join(root, "src/a.ts")]);
  });

  // The dangerous case: falling through to a whole-project scan inside a hook.
  it("passes without scanning when nothing scannable is staged", async () => {
    const scanFiles = scanFilesReturns([]);
    const scanProject = jest.fn();
    scannerMock.mockImplementation(() => ({ scanProject, scanWorkspaceFiles: scanFiles }));

    expect(await invoke("--files", "notes.md")).toBe(CLI_EXIT.OK);
    expect(stdout()).toBe("No staged files to scan.");
    expect(scanFiles).not.toHaveBeenCalled();
    expect(scanProject).not.toHaveBeenCalled();
  });

  it("passes without scanning when the index is empty", async () => {
    const scanFiles = scanFilesReturns([]);
    jest.spyOn(stagedDiff, "listStagedFiles").mockReturnValue([]);

    expect(await invoke("--staged")).toBe(CLI_EXIT.OK);
    expect(scanFiles).not.toHaveBeenCalled();
  });

  it("says nothing about an empty index when quiet", async () => {
    scanFilesReturns([]);
    jest.spyOn(stagedDiff, "listStagedFiles").mockReturnValue([]);

    expect(await invoke("--staged", "--quiet")).toBe(CLI_EXIT.OK);
    expect(stdout()).toBe("");
  });

  it("counts the files it actually scanned in the verdict", async () => {
    scanFilesReturns([]);
    noRanges();

    await invoke("--files", "src/a.ts", "src/b.ts", "notes.md");

    expect(stdout()).toContain("2 staged file(s)");
  });

  // A caller that asked for JSON parses stdout. Handing it the plain sentence
  // would be a parse error, not a result.
  it("emits an empty document rather than prose when asked for json", async () => {
    const scanFiles = scanFilesReturns([]);
    jest.spyOn(stagedDiff, "listStagedFiles").mockReturnValue([]);

    expect(await invoke("--staged", "--format", "json")).toBe(CLI_EXIT.OK);
    expect(scanFiles).not.toHaveBeenCalled();
    expect(JSON.parse(stdout())).toMatchObject({
      passed: true,
      total: 0,
      items: [],
    });
  });

  it("emits an empty run rather than prose when asked for sarif", async () => {
    scanFilesReturns([]);
    jest.spyOn(stagedDiff, "listStagedFiles").mockReturnValue([]);

    expect(await invoke("--staged", "--format", "sarif")).toBe(CLI_EXIT.OK);
    expect(JSON.parse(stdout()).runs[0].results).toEqual([]);
  });

  // Writing nothing would leave a stale report from an earlier run in place
  // for whatever reads the file next.
  it("writes the empty document to --output", async () => {
    scanFilesReturns([]);
    jest.spyOn(stagedDiff, "listStagedFiles").mockReturnValue([]);
    const target = path.join(root, "report.json");

    expect(
      await invoke("--staged", "--format", "json", "--output", target),
    ).toBe(CLI_EXIT.OK);
    expect(JSON.parse(fs.readFileSync(target, "utf8")).total).toBe(0);
    expect(stdout()).toContain("Report written to");
  });

  it("reports an empty document it cannot write", async () => {
    scanFilesReturns([]);
    jest.spyOn(stagedDiff, "listStagedFiles").mockReturnValue([]);

    expect(await invoke("--staged", "--format", "json", "--output", root)).toBe(
      CLI_EXIT.USAGE,
    );
    expect(stderr()).toContain("Could not write");
  });
});
