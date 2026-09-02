import * as path from "path";
import { buildAnnotations } from "../../../src/cli/annotations";
import { BaselineComparison } from "../../../src/cli/baseline";
import { MAX_CI_ANNOTATIONS } from "../../../src/constants";
import { DeprecatedItem } from "../../../src/interfaces";

const ROOT = path.resolve("/repo");

const item = (relativePath: string, line = 12): DeprecatedItem => ({
  name: "oldApi",
  fileName: path.basename(relativePath),
  filePath: path.join(ROOT, relativePath),
  line,
  character: 3,
  kind: "usage",
});

const comparison = (
  overrides: Partial<BaselineComparison> = {},
): BaselineComparison => ({
  hasBaseline: true,
  total: 0,
  baselineTotal: 0,
  delta: 0,
  risenFiles: [],
  ...overrides,
});

describe("buildAnnotations", () => {
  it("emits nothing when annotation is off", () => {
    expect(
      buildAnnotations("none", [item("src/a.ts")], comparison(), ROOT),
    ).toEqual([]);
  });

  it("annotates only the files that rose above the baseline", () => {
    const lines = buildAnnotations(
      "github",
      [item("src/risen.ts"), item("src/steady.ts")],
      comparison({ risenFiles: [{ file: "src/risen.ts", before: 0, after: 1 }] }),
      ROOT,
    );

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("src/risen.ts");
  });

  it("annotates everything when there is no baseline to compare against", () => {
    const lines = buildAnnotations(
      "github",
      [item("src/a.ts"), item("src/b.ts")],
      comparison({ hasBaseline: false }),
      ROOT,
    );
    expect(lines).toHaveLength(2);
  });

  it("writes a GitHub workflow command with file, line and column", () => {
    const [line] = buildAnnotations(
      "github",
      [item("src/a.ts", 40)],
      comparison({ hasBaseline: false }),
      ROOT,
    );
    expect(line).toBe(
      "::warning file=src/a.ts,line=40,col=3::Uses deprecated oldApi",
    );
  });

  it("writes an Azure logging command with the same coordinates", () => {
    const [line] = buildAnnotations(
      "azure",
      [item("src/a.ts", 40)],
      comparison({ hasBaseline: false }),
      ROOT,
    );
    expect(line).toBe(
      "##vso[task.logissue type=warning;sourcepath=src/a.ts;linenumber=40;columnnumber=3]Uses deprecated oldApi",
    );
  });

  it("escapes characters GitHub reads as workflow-command syntax", () => {
    const withReason = {
      ...item("src/a.ts"),
      deprecationReason: "100% gone\nuse other",
    };
    const [line] = buildAnnotations(
      "github",
      [withReason],
      comparison({ hasBaseline: false }),
      ROOT,
    );

    expect(line).toContain("100%25 gone use other");
    expect(line.split("\n")).toHaveLength(1);
  });

  it.each(["github", "azure"] as const)(
    "caps the %s output and tallies what it left out",
    (style) => {
      const items = Array.from({ length: MAX_CI_ANNOTATIONS + 7 }, (_, index) =>
        item(`src/a.ts`, index + 1),
      );
      const lines = buildAnnotations(
        style,
        items,
        comparison({ hasBaseline: false }),
        ROOT,
      );

      expect(lines).toHaveLength(MAX_CI_ANNOTATIONS + 1);
      expect(lines[lines.length - 1]).toContain(
        "7 more deprecated item(s) not annotated",
      );
    },
  );

  it("keeps a comma in the path out of GitHub's property list", () => {
    const [line] = buildAnnotations(
      "github",
      [item("src/x,line=1,col=1.ts", 40)],
      comparison({ hasBaseline: false }),
      ROOT,
    );

    expect(line).toBe(
      "::warning file=src/x%2Cline=1%2Ccol=1.ts,line=40,col=3::Uses deprecated oldApi",
    );
    expect(line.slice("::warning ".length, line.indexOf("::", 2)).split(","))
      .toHaveLength(3);
  });

  it("keeps a semicolon or bracket in the path out of Azure's property list", () => {
    const [line] = buildAnnotations(
      "azure",
      [item("src/we;ird].ts", 40)],
      comparison({ hasBaseline: false }),
      ROOT,
    );

    expect(line).toBe(
      "##vso[task.logissue type=warning;sourcepath=src/we%3Bird%5D.ts;linenumber=40;columnnumber=3]Uses deprecated oldApi",
    );
  });

  it("stops a symbol name from opening a second Azure logging command", () => {
    const injected = {
      ...item("src/a.ts"),
      name: "x\n##vso[task.complete result=Succeeded]",
    };
    const [line] = buildAnnotations(
      "azure",
      [injected],
      comparison({ hasBaseline: false }),
      ROOT,
    );

    expect(line).toContain("x%0A##vso[task.complete result=Succeeded]");
    expect(line.split("\n")).toHaveLength(1);
    expect(
      line.split("\n").filter((each) => each.startsWith("##vso[")),
    ).toHaveLength(1);
  });

  it("escapes a percent in an Azure message the way Azure reads it", () => {
    const withReason = {
      ...item("src/a.ts"),
      deprecationReason: "100% gone",
    };
    const [line] = buildAnnotations(
      "azure",
      [withReason],
      comparison({ hasBaseline: false }),
      ROOT,
    );

    expect(line).toContain("100%AZP25 gone");
  });

  it("adds no tally when everything fitted", () => {
    const lines = buildAnnotations(
      "github",
      [item("src/a.ts")],
      comparison({ hasBaseline: false }),
      ROOT,
    );
    expect(lines.join("\n")).not.toContain("not annotated");
  });
});
