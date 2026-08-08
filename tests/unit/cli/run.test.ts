import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { run } from "../../../src/cli";
import { CLI_EXIT, DEFAULT_BASELINE_FILE } from "../../../src/constants";
import { DeprecatedItem } from "../../../src/interfaces";
import { Scanner } from "../../../src/scanner/scanner";

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
