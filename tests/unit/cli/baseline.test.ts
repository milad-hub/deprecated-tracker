import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  buildBaseline,
  compareScannedFiles,
  compareToBaseline,
  countByFile,
  readBaseline,
  writeBaseline,
} from "../../../src/cli/baseline";
import { BASELINE_VERSION } from "../../../src/constants";
import { DeprecatedItem } from "../../../src/interfaces";

let root: string;

const item = (relativePath: string, name = "oldApi"): DeprecatedItem => ({
  name,
  fileName: path.basename(relativePath),
  filePath: path.join(root, relativePath),
  line: 1,
  character: 1,
  kind: "function",
});

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "dt-baseline-"));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("countByFile", () => {
  it("counts items per workspace-relative path", () => {
    const counts = countByFile(
      [item("src/a.ts"), item("src/a.ts", "other"), item("src/b.ts")],
      root,
    );
    expect(counts).toEqual({ "src/a.ts": 2, "src/b.ts": 1 });
  });

  it("uses forward slashes so a Windows baseline matches on CI", () => {
    const counts = countByFile([item(path.join("src", "deep", "a.ts"))], root);
    expect(Object.keys(counts)).toEqual(["src/deep/a.ts"]);
  });
});

describe("buildBaseline", () => {
  it("records the total, the per-file counts and when it was taken", () => {
    const when = new Date("2026-01-02T03:04:05.000Z");
    const baseline = buildBaseline([item("src/a.ts"), item("src/b.ts")], root, when);

    expect(baseline).toEqual({
      version: BASELINE_VERSION,
      generatedAt: "2026-01-02T03:04:05.000Z",
      total: 2,
      files: { "src/a.ts": 1, "src/b.ts": 1 },
    });
  });

  it("stamps the current time when none is given", () => {
    const baseline = buildBaseline([], root);
    expect(Number.isNaN(Date.parse(baseline.generatedAt))).toBe(false);
  });
});

describe("readBaseline", () => {
  const write = (contents: string): string => {
    const target = path.join(root, "baseline.json");
    fs.writeFileSync(target, contents, "utf8");
    return target;
  };

  it("returns undefined when there is no file — a first run is not an error", () => {
    expect(readBaseline(path.join(root, "missing.json"))).toBeUndefined();
  });

  it("round-trips a baseline it wrote", () => {
    const target = path.join(root, "baseline.json");
    const baseline = buildBaseline([item("src/a.ts")], root);
    writeBaseline(target, baseline);
    expect(readBaseline(target)).toEqual(baseline);
    expect(fs.readFileSync(target, "utf8").endsWith("\n")).toBe(true);
  });

  it("defaults a missing generatedAt rather than failing", () => {
    const target = write(
      JSON.stringify({ version: BASELINE_VERSION, total: 1, files: {} }),
    );
    expect(readBaseline(target)?.generatedAt).toBe("");
  });

  it("throws on malformed JSON instead of reading it as zero", () => {
    const target = write("{ not json");
    expect(() => readBaseline(target)).toThrow("is not valid JSON");
  });

  it.each([
    ['{"version":1,"files":{}}', 'missing "total" or "files"'],
    ['{"version":1,"total":3}', 'missing "total" or "files"'],
    ['{"version":1,"total":3,"files":null}', 'missing "total" or "files"'],
    ["null", 'missing "total" or "files"'],
  ])("rejects %s", (contents, expected) => {
    expect(() => readBaseline(write(contents))).toThrow(expected);
  });

  it("refuses a baseline written by a different schema version", () => {
    const target = write('{"version":99,"total":1,"files":{}}');
    expect(() => readBaseline(target)).toThrow("is version 99, expected 1");
  });
});

describe("compareToBaseline", () => {
  it("treats a missing baseline as nothing to compare against", () => {
    const comparison = compareToBaseline([item("src/a.ts")], root, undefined);
    expect(comparison.hasBaseline).toBe(false);
    expect(comparison.baselineTotal).toBe(0);
    expect(comparison.delta).toBe(1);
    expect(comparison.risenFiles).toEqual([{ file: "src/a.ts", before: 0, after: 1 }]);
  });

  it("reports no rise when every file holds steady", () => {
    const items = [item("src/a.ts"), item("src/b.ts")];
    const comparison = compareToBaseline(
      items,
      root,
      buildBaseline(items, root),
    );
    expect(comparison.delta).toBe(0);
    expect(comparison.risenFiles).toEqual([]);
  });

  it("reports a negative delta when the count falls", () => {
    const baseline = buildBaseline(
      [item("src/a.ts"), item("src/a.ts", "second")],
      root,
    );
    const comparison = compareToBaseline([item("src/a.ts")], root, baseline);
    expect(comparison.delta).toBe(-1);
    expect(comparison.risenFiles).toEqual([]);
  });

  it("names only the files that rose, worst first", () => {
    const baseline = buildBaseline([item("src/a.ts"), item("src/b.ts")], root);
    const comparison = compareToBaseline(
      [
        item("src/a.ts"),
        item("src/b.ts"),
        item("src/b.ts", "two"),
        item("src/c.ts"),
        item("src/c.ts", "two"),
        item("src/c.ts", "three"),
      ],
      root,
      baseline,
    );

    expect(comparison.risenFiles).toEqual([
      { file: "src/c.ts", before: 0, after: 3 },
      { file: "src/b.ts", before: 1, after: 2 },
    ]);
  });

  it("does not report a file that only fell", () => {
    const baseline = buildBaseline(
      [item("src/a.ts"), item("src/a.ts", "second"), item("src/b.ts")],
      root,
    );
    const comparison = compareToBaseline([item("src/a.ts")], root, baseline);
    expect(comparison.risenFiles).toEqual([]);
    expect(comparison.total).toBe(1);
    expect(comparison.baselineTotal).toBe(3);
  });
});

describe("compareScannedFiles", () => {
  const staged = (relative: string): string => path.join(root, relative);

  it("asks only about the files that were scanned", () => {
    const baseline = buildBaseline(
      [item("src/a.ts"), item("src/untouched.ts")],
      root,
    );

    const comparison = compareScannedFiles(
      [item("src/a.ts")],
      [staged("src/a.ts")],
      root,
      baseline,
    );

    // src/untouched.ts was never looked at, so it must not read as a drop.
    expect(comparison.risenFiles).toEqual([]);
    expect(comparison.baselineTotal).toBe(1);
  });

  it("reports a scanned file that gained items", () => {
    const baseline = buildBaseline([item("src/a.ts")], root);

    const comparison = compareScannedFiles(
      [item("src/a.ts"), item("src/a.ts", "second")],
      [staged("src/a.ts")],
      root,
      baseline,
    );

    expect(comparison.risenFiles).toEqual([
      { file: "src/a.ts", before: 1, after: 2 },
    ]);
  });

  it("puts the biggest rise first", () => {
    const baseline = buildBaseline([], root);

    const comparison = compareScannedFiles(
      [
        item("src/small.ts"),
        item("src/big.ts"),
        item("src/big.ts", "second"),
        item("src/big.ts", "third"),
      ],
      [staged("src/small.ts"), staged("src/big.ts")],
      root,
      baseline,
    );

    expect(comparison.risenFiles.map((entry) => entry.file)).toEqual([
      "src/big.ts",
      "src/small.ts",
    ]);
  });

  it("treats every scanned file as new when there is no baseline", () => {
    const comparison = compareScannedFiles(
      [item("src/a.ts")],
      [staged("src/a.ts")],
      root,
      undefined,
    );

    expect(comparison.hasBaseline).toBe(false);
    expect(comparison.baselineTotal).toBe(0);
    expect(comparison.risenFiles).toHaveLength(1);
  });

  it("reports a scanned file that came back clean", () => {
    const baseline = buildBaseline([item("src/a.ts")], root);

    const comparison = compareScannedFiles(
      [],
      [staged("src/a.ts")],
      root,
      baseline,
    );

    expect(comparison.risenFiles).toEqual([]);
    expect(comparison.delta).toBe(-1);
  });
});
