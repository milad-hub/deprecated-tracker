import * as path from "path";
import { BaselineComparison } from "../../../src/cli/baseline";
import {
  Provenance,
  describe as describeItem,
  describeProvenance,
  renderReport,
} from "../../../src/cli/reporters";
import { DeprecatedItem } from "../../../src/interfaces";

const ROOT = path.resolve("/repo");

const item = (overrides: Partial<DeprecatedItem> = {}): DeprecatedItem => ({
  name: "oldApi",
  fileName: "user.ts",
  filePath: path.join(ROOT, "src", "api", "user.ts"),
  line: 12,
  character: 3,
  kind: "function",
  severity: "warning",
  ...overrides,
});

const usageOf = (
  declaration: DeprecatedItem,
  overrides: Partial<DeprecatedItem> = {},
): DeprecatedItem =>
  item({
    kind: "usage",
    fileName: "caller.ts",
    filePath: path.join(ROOT, "src", "caller.ts"),
    line: 40,
    deprecatedDeclaration: {
      name: declaration.name,
      filePath: declaration.filePath,
      fileName: declaration.fileName,
      line: declaration.line,
    },
    ...overrides,
  });

const comparison = (
  overrides: Partial<BaselineComparison> = {},
): BaselineComparison => ({
  hasBaseline: true,
  total: 1,
  baselineTotal: 1,
  delta: 0,
  risenFiles: [],
  ...overrides,
});

const render = (
  format: "text" | "json" | "sarif",
  items: DeprecatedItem[],
  overrides: Partial<BaselineComparison> = {},
  passed = true,
): string =>
  renderReport(format, {
    items,
    comparison: comparison({ total: items.length, ...overrides }),
    root: ROOT,
    passed,
    toolVersion: "9.9.9",
    verdict: passed ? "PASS" : "FAIL — because",
  });

describe("text report", () => {
  it("leads with the totals and the baseline movement", () => {
    const report = render("text", [item()], { baselineTotal: 0, delta: 1 });
    expect(report).toContain("1 item(s) across 1 file(s)");
    expect(report).toContain("Baseline 0 → 1 (+1)");
  });

  it("signs a fall without a plus", () => {
    const report = render("text", [item()], { baselineTotal: 4, delta: -3 });
    expect(report).toContain("Baseline 4 → 1 (-3)");
  });

  it("says when there is no baseline instead of implying zero", () => {
    const report = render("text", [item()], { hasBaseline: false });
    expect(report).toContain("No baseline found");
    expect(report).not.toContain("Baseline 0 →");
  });

  it("lists the files that rose", () => {
    const report = render("text", [item()], {
      risenFiles: [{ file: "src/api/user.ts", before: 1, after: 4 }],
    });
    expect(report).toContain("Risen above baseline:");
    expect(report).toContain("src/api/user.ts  1 → 4");
  });

  it("groups items under a workspace-relative path and tags urgency", () => {
    const report = render("text", [
      item(),
      item({
        name: "other",
        line: 40,
        deprecationSchedule: { urgency: "removed" },
      }),
    ]);
    expect(report).toContain("src/api/user.ts\n");
    expect(report).toContain("  12:3  oldApi (function)");
    expect(report).toContain("  40:3  other (function) [removed]");
    expect(report.match(/src\/api\/user\.ts/g)).toHaveLength(1);
  });

  it("separates items declared in different files", () => {
    const report = render("text", [
      item(),
      item({ filePath: path.join(ROOT, "src", "b.ts") }),
    ]);
    expect(report).toContain("src/b.ts");
    expect(report).toContain("1 item(s) across 2 file(s)".replace("1 ", "2 "));
  });

  it("ends with the verdict it was handed", () => {
    expect(render("text", [], {}, false).trim().endsWith("FAIL — because")).toBe(
      true,
    );
    expect(render("text", []).trim().endsWith("PASS")).toBe(true);
  });
});

describe("json report", () => {
  it("carries the verdict, the counts and every item", () => {
    const parsed = JSON.parse(
      render(
        "json",
        [
          item({
            deprecationReason: "Use newApi",
            deprecationSchedule: { urgency: "scheduled", removalVersion: "2.0" },
          }),
        ],
        { baselineTotal: 0, delta: 1 },
        false,
      ),
    );

    expect(parsed.tool).toBe("deprecated-tracker");
    expect(parsed.version).toBe("9.9.9");
    expect(parsed.passed).toBe(false);
    expect(parsed.total).toBe(1);
    expect(parsed.baselineTotal).toBe(0);
    expect(parsed.delta).toBe(1);
    expect(parsed.items[0]).toEqual({
      name: "oldApi",
      kind: "function",
      file: "src/api/user.ts",
      line: 12,
      character: 3,
      severity: "warning",
      urgency: "scheduled",
      reason: "Use newApi",
      schedule: { urgency: "scheduled", removalVersion: "2.0" },
    });
  });

  it("omits an absent schedule rather than inventing one", () => {
    const parsed = JSON.parse(render("json", [item()]));
    expect(parsed.items[0].urgency).toBeUndefined();
    expect(parsed.items[0].schedule).toBeUndefined();
  });
});

describe("sarif report", () => {
  const sarif = (items: DeprecatedItem[]) => JSON.parse(render("sarif", items));

  it("is a 2.1.0 run naming the tool and its rules", () => {
    const parsed = sarif([item()]);
    expect(parsed.version).toBe("2.1.0");
    expect(parsed.$schema).toContain("sarif-schema-2.1.0");
    const driver = parsed.runs[0].tool.driver;
    expect(driver.name).toBe("Deprecated Tracker");
    expect(driver.version).toBe("9.9.9");
    expect(driver.rules.map((rule: { id: string }) => rule.id)).toEqual([
      "deprecated-declaration",
      "deprecated-usage",
    ]);
  });

  it("locates each result relative to the scanned root", () => {
    const location =
      sarif([item()]).runs[0].results[0].locations[0].physicalLocation;
    expect(location.artifactLocation.uri).toBe("src/api/user.ts");
    expect(location.region).toEqual({ startLine: 12, startColumn: 3 });
  });

  it("picks the rule from the item kind", () => {
    const results = sarif([item(), item({ kind: "usage" })]).runs[0].results;
    expect(results[0].ruleId).toBe("deprecated-declaration");
    expect(results[1].ruleId).toBe("deprecated-usage");
  });

  it("raises an already-removed symbol to error", () => {
    const results = sarif([
      item({ deprecationSchedule: { urgency: "removed" } }),
      item({ deprecationSchedule: { urgency: "scheduled" } }),
      item({ severity: "error" }),
      item({ severity: "info" }),
    ]).runs[0].results;

    expect(results.map((result: { level: string }) => result.level)).toEqual([
      "error",
      "warning",
      "error",
      "warning",
    ]);
  });
});

describe("describe", () => {
  it("reads differently for a declaration and a usage", () => {
    expect(describeItem(item())).toBe("oldApi is deprecated");
    expect(describeItem(item({ kind: "usage" }))).toBe(
      "Uses deprecated oldApi",
    );
  });

  it("appends the reason as a single line", () => {
    expect(
      describeItem(item({ deprecationReason: "  Use\n\n  newApi  " })),
    ).toBe("oldApi is deprecated — Use newApi");
  });
});

describe("classification", () => {
  const bare = item({ name: "oldApi" });

  const summaryOf = (items: DeprecatedItem[]) =>
    JSON.parse(render("json", items)).summary;

  it("counts a called declaration carrying a reason as documented", () => {
    const documented = item({
      name: "oldApi",
      deprecationReason: "Use newApi",
    });
    expect(summaryOf([documented, usageOf(documented)])).toEqual({
      documented: 1,
      bare: 0,
      unused: 0,
    });
  });

  it("counts a called declaration with nothing to say as bare", () => {
    expect(summaryOf([bare, usageOf(bare)])).toEqual({
      documented: 0,
      bare: 1,
      unused: 0,
    });
  });

  it("reads the reason off the call site when the declaration is outside the scanned set", () => {
    expect(
      summaryOf([usageOf(bare, { deprecationReason: "Use newApi" })]),
    ).toEqual({ documented: 1, bare: 0, unused: 0 });
  });

  it("counts a declaration nothing reaches as unused", () => {
    expect(summaryOf([bare])).toEqual({
      documented: 0,
      bare: 0,
      unused: 1,
    });
  });

  it("counts declarations rather than items, each call site under its own", () => {
    const other = item({
      name: "otherApi",
      fileName: "other.ts",
      filePath: path.join(ROOT, "src", "other.ts"),
    });

    expect(
      summaryOf([
        bare,
        usageOf(bare),
        usageOf(bare, { line: 41 }),
        other,
        usageOf(other, { deprecationReason: "Use newOther" }),
      ]),
    ).toEqual({ documented: 1, bare: 1, unused: 0 });
  });

  it("states the split under the headline of the text report", () => {
    expect(render("text", [bare, usageOf(bare)])).toContain(
      "1 symbol(s): 0 documented, 1 without a reason, 0 unused",
    );
  });

  it("names the declaration a usage came from, relative to the root", () => {
    const parsed = JSON.parse(render("json", [usageOf(bare)]));
    expect(parsed.items[0].declaration).toEqual({
      name: "oldApi",
      file: "src/api/user.ts",
      line: 12,
    });
  });

  it("leaves a declaration's own entry without a link to itself", () => {
    const parsed = JSON.parse(render("json", [bare]));
    expect(parsed.items[0].declaration).toBeUndefined();
  });
});

describe("provenance", () => {
  const provenance = (over: Partial<Provenance> = {}): Provenance => ({
    configSource: ".deprecatedtrackerrc",
    excludePatterns: 1,
    suppressedPackages: 6,
    suppressed: new Map(),
    ...over,
  });

  it("states the rules the run was given", () => {
    expect(describeProvenance(provenance())).toEqual([
      "Config: .deprecatedtrackerrc — 1 exclude pattern(s), 6 suppressed package(s)",
    ]);
  });

  it("says nothing about hiding when nothing was hidden", () => {
    expect(describeProvenance(provenance())).toHaveLength(1);
  });

  it("names what the suppressed list removed, worst first", () => {
    const lines = describeProvenance(
      provenance({ suppressed: new Map([["rxjs", 2], ["lodash", 9]]) }),
    );

    expect(lines[1]).toBe(
      "11 item(s) hidden by suppressPackages: lodash (9), rxjs (2)",
    );
  });

  it("orders packages by name when they hid the same amount", () => {
    const lines = describeProvenance(
      provenance({ suppressed: new Map([["zod", 1], ["axios", 1]]) }),
    );

    expect(lines[1]).toContain("axios (1), zod (1)");
  });

  it("puts a zero next to what was excluded, in the text report", () => {
    const report = renderReport("text", {
      items: [],
      comparison: comparison({ total: 0 }),
      root: ROOT,
      passed: true,
      toolVersion: "9.9.9",
      verdict: "PASS",
      provenance: provenance({ excludePatterns: 1 }),
    });

    expect(report).toContain(
      "Config: .deprecatedtrackerrc — 1 exclude pattern(s), 6 suppressed package(s)",
    );
  });

  it("carries the same facts into the markdown a PR comment shows", () => {
    const report = renderReport("markdown", {
      items: [],
      comparison: comparison({ total: 0 }),
      root: ROOT,
      passed: true,
      toolVersion: "9.9.9",
      verdict: "PASS",
      provenance: provenance({ suppressed: new Map([["lodash", 3]]) }),
    });

    expect(report).toContain("3 item(s) hidden by suppressPackages: lodash (3)");
  });

  it("carries them into the JSON a machine reads", () => {
    const report = JSON.parse(
      renderReport("json", {
        items: [],
        comparison: comparison({ total: 0 }),
        root: ROOT,
        passed: true,
        toolVersion: "9.9.9",
        verdict: "PASS",
        provenance: provenance({ suppressed: new Map([["lodash", 3]]) }),
      }),
    );

    expect(report.config).toEqual({
      source: ".deprecatedtrackerrc",
      excludePatterns: 1,
      suppressedPackages: 6,
      hidden: { lodash: 3 },
    });
  });

  it("carries them into the SARIF a code-scanning upload reads", () => {
    const report = JSON.parse(
      renderReport("sarif", {
        items: [],
        comparison: comparison({ total: 0 }),
        root: ROOT,
        passed: true,
        toolVersion: "9.9.9",
        verdict: "PASS",
        provenance: provenance({ suppressed: new Map([["lodash", 3]]) }),
      }),
    );

    expect(report.runs[0].properties).toEqual({
      configSource: ".deprecatedtrackerrc",
      excludePatterns: 1,
      suppressedPackages: 6,
      hidden: { lodash: 3 },
    });
  });

  it("leaves the SARIF properties bag out when there was no scan to describe", () => {
    const report = JSON.parse(
      renderReport("sarif", {
        items: [],
        comparison: comparison({ total: 0 }),
        root: ROOT,
        passed: true,
        toolVersion: "9.9.9",
        verdict: "PASS",
      }),
    );

    expect(report.runs[0].properties).toBeUndefined();
  });

  it("leaves the JSON config field out when there was no scan to describe", () => {
    const report = JSON.parse(
      renderReport("json", {
        items: [],
        comparison: comparison({ total: 0 }),
        root: ROOT,
        passed: true,
        toolVersion: "9.9.9",
        verdict: "PASS",
      }),
    );

    expect(report.config).toBeUndefined();
  });
});
