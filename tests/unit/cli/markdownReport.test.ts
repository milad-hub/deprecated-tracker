import * as path from "path";
import { renderReport } from "../../../src/cli/reporters";
import { DeprecatedItem } from "../../../src/interfaces";

const root = path.resolve("/repo");

const item = (over: Partial<DeprecatedItem> = {}): DeprecatedItem => ({
  name: "oldApi",
  fileName: "a.ts",
  filePath: path.join(root, "src/a.ts"),
  line: 12,
  character: 3,
  kind: "usage",
  ...over,
});

const render = (
  items: DeprecatedItem[],
  over: Partial<Parameters<typeof renderReport>[1]> = {},
): string =>
  renderReport("markdown", {
    items,
    comparison: {
      hasBaseline: false,
      total: items.length,
      baselineTotal: 0,
      delta: items.length,
      risenFiles: [],
      ...over.comparison,
    },
    root,
    passed: true,
    toolVersion: "9.9.9",
    verdict: "PASS",
    ...over,
  });

describe("markdown report", () => {
  it("leads with a heading and the totals", () => {
    const report = render([item()]);

    expect(report).toContain("## Deprecated Tracker");
    expect(report).toContain("**1** item(s) across **1** file(s)");
  });

  it("ends with the verdict it was handed", () => {
    expect(render([], { verdict: "FAIL — nope" })).toContain("FAIL — nope");
  });

  it("says when there is no baseline", () => {
    expect(render([])).toContain("No baseline found");
  });

  it("shows the baseline movement when there is one", () => {
    const report = render([item()], {
      comparison: {
        hasBaseline: true,
        total: 1,
        baselineTotal: 4,
        delta: -3,
        risenFiles: [],
      },
    });

    expect(report).toContain("Baseline 4 → 1 (-3)");
  });

  it("signs a rise with a plus", () => {
    const report = render([item()], {
      comparison: {
        hasBaseline: true,
        total: 5,
        baselineTotal: 4,
        delta: 1,
        risenFiles: [],
      },
    });

    expect(report).toContain("(+1)");
  });

  it("omits the baseline entirely when it was ignored", () => {
    const report = render([item()], { baselineIgnored: true });

    expect(report).not.toContain("Baseline");
    expect(report).not.toContain("No baseline found");
  });

  it("tabulates the files that rose", () => {
    const report = render([item()], {
      comparison: {
        hasBaseline: true,
        total: 3,
        baselineTotal: 1,
        delta: 2,
        risenFiles: [{ file: "src/a.ts", before: 1, after: 3 }],
      },
    });

    expect(report).toContain("### Risen above baseline");
    expect(report).toContain("| src/a.ts | 1 | 3 |");
  });

  it("groups items under a workspace-relative heading", () => {
    const report = render([item()]);

    expect(report).toContain("### src/a.ts");
    expect(report).toContain("| Line | Symbol | Kind | Urgency | Detail |");
    expect(report).toContain("| 12:3 | `oldApi` | usage |");
  });

  it("separates items declared in different files", () => {
    const report = render([
      item(),
      item({ filePath: path.join(root, "src/b.ts") }),
    ]);

    expect(report).toContain("### src/a.ts");
    expect(report).toContain("### src/b.ts");
  });

  it("shows an em dash when an item has no urgency", () => {
    expect(render([item()])).toContain("| usage | — |");
  });

  it("shows the urgency when there is one", () => {
    const report = render([
      item({ deprecationSchedule: { urgency: "removed" } }),
    ]);

    expect(report).toContain("| removed |");
  });

  it("carries the deprecation reason into the detail column", () => {
    const report = render([item({ deprecationReason: "Use newApi" })]);

    expect(report).toContain("Uses deprecated oldApi — Use newApi");
  });

  // An unescaped pipe would end the column early and shift every cell after it.
  it("escapes a pipe in the reason", () => {
    const report = render([item({ deprecationReason: "a | b" })]);

    expect(report).toContain("a \\| b");
  });

  // A row must stay on one line. `describe` already flattens the reason, so a
  // multi-line JSDoc comment arrives as a single sentence rather than as a
  // break — either way the table survives it.
  it("keeps a multi-line reason on one row", () => {
    const report = render([item({ deprecationReason: "one\ntwo" })]);

    expect(report).toContain("one two");
    expect(report.split("\n").filter((line) => line.startsWith("| 12:3"))).toHaveLength(1);
  });

  it("renders an empty scan without a table", () => {
    const report = render([]);

    expect(report).toContain("**0** item(s) across **0** file(s)");
    expect(report).not.toContain("| Line |");
  });

  // A generated-at line would make every report differ from the last, which is
  // noise in a PR diff and unassertable here.
  it("carries no timestamp", () => {
    expect(render([item()])).not.toMatch(/\d{4}-\d{2}-\d{2}|\d{1,2}:\d{2}/);
  });
});
