import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { run } from "../../../src/cli";
import { CLI_EXIT } from "../../../src/constants";
import { DeprecatedItem } from "../../../src/interfaces";
import { Scanner } from "../../../src/scanner/scanner";
import * as scanCore from "../../../src/cli/scanCore";
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

const item = (relative: string): DeprecatedItem => ({
  name: "oldApi",
  fileName: path.basename(relative),
  filePath: path.join(root, relative),
  line: 12,
  character: 3,
  kind: "function",
});

const scanFilesReturns = (items: DeprecatedItem[]): jest.Mock => {
  const scanWorkspaceFiles = jest.fn().mockResolvedValue(items);
  scannerMock.mockImplementation(() => ({
    scanProject: jest.fn().mockResolvedValue([]),
    scanWorkspaceFiles,
  }));
  return scanWorkspaceFiles;
};

// A bare argv prints help, so a whole-project run names the directory.
const invoke = (...argv: string[]): Promise<number> =>
  run(argv.length > 0 ? argv : ["."], { cwd: root, io, version: "9.9.9" });

const stdout = (): string => out.join("\n");

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "dt-changed-"));
  out = [];
  err = [];
  scanFilesReturns([]);
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

describe("--changed", () => {
  it("asks git for the whole working tree, not just the index", async () => {
    const listWorkingTree = jest
      .spyOn(stagedDiff, "listWorkingTreeFiles")
      .mockReturnValue([path.join(root, "src/a.ts")]);
    const listStaged = jest.spyOn(stagedDiff, "listStagedFiles");
    jest
      .spyOn(stagedDiff, "collectWorkingTreeLineRanges")
      .mockReturnValue(new Map());
    const scanFiles = scanFilesReturns([]);

    await invoke("--changed");

    expect(listWorkingTree).toHaveBeenCalledWith(root);
    expect(listStaged).not.toHaveBeenCalled();
    expect(scanFiles).toHaveBeenCalledWith([root], [path.join(root, "src/a.ts")]);
  });

  it("filters to changed lines using both sides of the index", async () => {
    jest
      .spyOn(stagedDiff, "listWorkingTreeFiles")
      .mockReturnValue([path.join(root, "src/a.ts")]);
    const collect = jest
      .spyOn(stagedDiff, "collectWorkingTreeLineRanges")
      .mockReturnValue(new Map());
    const staged = jest.spyOn(stagedDiff, "collectStagedLineRanges");
    scanFilesReturns([item("src/a.ts")]);

    await invoke("--changed");

    expect(collect).toHaveBeenCalled();
    expect(staged).not.toHaveBeenCalled();
  });

  it("scans whole files when asked, skipping the line filter", async () => {
    jest
      .spyOn(stagedDiff, "listWorkingTreeFiles")
      .mockReturnValue([path.join(root, "src/a.ts")]);
    const collect = jest.spyOn(stagedDiff, "collectWorkingTreeLineRanges");
    scanFilesReturns([]);

    await invoke("--changed", "--whole-files");

    expect(collect).not.toHaveBeenCalled();
  });

  it("adds explicit paths to what git reports", async () => {
    jest
      .spyOn(stagedDiff, "listWorkingTreeFiles")
      .mockReturnValue([path.join(root, "src/a.ts")]);
    jest
      .spyOn(stagedDiff, "collectWorkingTreeLineRanges")
      .mockReturnValue(new Map());
    const scanFiles = scanFilesReturns([]);

    await invoke("--changed", "--files", "src/b.ts");

    expect(scanFiles.mock.calls[0][1]).toEqual([
      path.join(root, "src/a.ts"),
      path.join(root, "src/b.ts"),
    ]);
  });

  // "staged" would be a lie: --changed also covers what is not staged.
  it("calls them changed files in the verdict", async () => {
    jest
      .spyOn(stagedDiff, "listWorkingTreeFiles")
      .mockReturnValue([path.join(root, "src/a.ts")]);
    jest
      .spyOn(stagedDiff, "collectWorkingTreeLineRanges")
      .mockReturnValue(new Map());
    scanFilesReturns([]);

    await invoke("--changed");

    expect(stdout()).toContain("1 changed file(s)");
  });

  it("says so when nothing has changed", async () => {
    jest.spyOn(stagedDiff, "listWorkingTreeFiles").mockReturnValue([]);
    const scanFiles = scanFilesReturns([]);

    expect(await invoke("--changed")).toBe(CLI_EXIT.OK);
    expect(stdout()).toBe("No changed files to scan.");
    expect(scanFiles).not.toHaveBeenCalled();
  });

  it("fails when the working tree introduced a deprecated item", async () => {
    jest
      .spyOn(stagedDiff, "listWorkingTreeFiles")
      .mockReturnValue([path.join(root, "src/a.ts")]);
    jest
      .spyOn(stagedDiff, "collectWorkingTreeLineRanges")
      .mockReturnValue(new Map());
    scanFilesReturns([item("src/a.ts")]);

    expect(await invoke("--changed")).toBe(CLI_EXIT.REGRESSION);
  });

  it("refuses to write a baseline from a subset", async () => {
    expect(await invoke("--changed", "--update-baseline")).toBe(
      CLI_EXIT.USAGE,
    );
  });
});

describe("--format markdown end to end", () => {
  it("writes a markdown document to stdout", async () => {
    scannerMock.mockImplementation(() => ({
      scanProject: jest.fn().mockResolvedValue([item("src/a.ts")]),
    }));

    await invoke("--format", "markdown");

    expect(stdout()).toContain("## Deprecated Tracker");
    expect(stdout()).toContain("| Line | Symbol | Kind | Urgency | Detail |");
  });

  it("emits a document rather than prose for an empty hook run", async () => {
    jest.spyOn(stagedDiff, "listWorkingTreeFiles").mockReturnValue([]);

    await invoke("--changed", "--format", "markdown");

    expect(stdout()).toContain("## Deprecated Tracker");
    expect(stdout()).toContain("PASS — no changed files to scan");
  });
});

describe("config-driven scanner dependencies", () => {
  it("hands the scanner tags and ignores from the config file", async () => {
    fs.writeFileSync(
      path.join(root, ".deprecatedtrackerrc"),
      JSON.stringify({
        customTags: [{ tag: "@legacy", description: "Old" }],
        ignoreMethods: ["^internal_"],
      }),
      "utf8",
    );
    scannerMock.mockImplementation(() => ({
      scanProject: jest.fn().mockResolvedValue([]),
    }));

    await invoke();

    const [ignores, tags] = scannerMock.mock.calls[0];
    expect(tags.getEnabledTags()).toEqual([
      { tag: "@legacy", description: "Old" },
    ]);
    expect(ignores.isMethodIgnored("src/a.ts", "internal_x")).toBe(true);
  });

  it("passes no tag source when the config declares none", async () => {
    scannerMock.mockImplementation(() => ({
      scanProject: jest.fn().mockResolvedValue([]),
    }));

    await invoke();

    expect(scannerMock.mock.calls[0][1]).toBeUndefined();
  });

  // Inside a hook this is the only feedback a broken config gives.
  it("routes config warnings to stderr, not stdout", async () => {
    fs.writeFileSync(
      path.join(root, ".deprecatedtrackerrc"),
      JSON.stringify({ customTags: [{ tag: "@param" }] }),
      "utf8",
    );
    scannerMock.mockImplementation(() => ({
      scanProject: jest.fn().mockResolvedValue([]),
    }));

    await invoke();

    expect(err.join("\n")).toContain("conflicts with reserved JSDoc tag");
    expect(stdout()).not.toContain("conflicts");
  });
});

describe("unexpected failures", () => {
  // Scan failures arrive as ScanError with an exit code. Anything else is a
  // bug in this tool, and swallowing it into exit 2 would hide the stack the
  // bin wrapper is there to print.
  it("rethrows an error that is not a ScanError", async () => {
    jest
      .spyOn(scanCore, "performScan")
      .mockRejectedValue(new Error("something unforeseen"));

    await expect(invoke()).rejects.toThrow("something unforeseen");
  });
});

describe("mcp dispatch", () => {
  // A bare `mcp` positional would otherwise be read as a directory to scan.
  it("routes to the mcp subcommand instead of scanning a folder", async () => {
    expect(await invoke("mcp", "--help")).toBe(CLI_EXIT.OK);
    expect(stdout()).toContain("Runs the scanner as an MCP server over stdio");
  });

  it("reports an unknown mcp subcommand", async () => {
    expect(await invoke("mcp", "serve")).toBe(CLI_EXIT.USAGE);
  });

  it("mentions mcp in the main usage", async () => {
    await invoke("--help");

    expect(stdout()).toContain("mcp install");
  });
});
