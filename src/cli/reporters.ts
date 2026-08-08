import { DeprecatedItem } from "../interfaces";
import { PathUtils, URGENCY_RANK } from "../utils";
import { BaselineComparison } from "./baseline";
import { OutputFormat } from "./args";

const SARIF_SCHEMA =
  "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json";

export interface ReportInput {
  items: DeprecatedItem[];
  comparison: BaselineComparison;
  root: string;
  passed: boolean;
  toolVersion: string;
  verdict: string;
}

export function renderReport(format: OutputFormat, input: ReportInput): string {
  if (format === "json") {
    return renderJson(input);
  }
  if (format === "sarif") {
    return renderSarif(input);
  }
  return renderText(input);
}

function renderText(input: ReportInput): string {
  const { items, comparison, root } = input;
  const lines: string[] = [];

  lines.push(
    `Deprecated Tracker — ${items.length} item(s) across ${countFiles(items)} file(s)`,
  );

  if (comparison.hasBaseline) {
    lines.push(
      `Baseline ${comparison.baselineTotal} → ${comparison.total} (${signed(comparison.delta)})`,
    );
  } else {
    lines.push("No baseline found — run with --update-baseline to record one.");
  }

  if (comparison.risenFiles.length > 0) {
    lines.push("");
    lines.push("Risen above baseline:");
    for (const file of comparison.risenFiles) {
      lines.push(`  ${file.file}  ${file.before} → ${file.after}`);
    }
  }

  if (items.length > 0) {
    lines.push("");
    for (const [file, fileItems] of groupByFile(items, root)) {
      lines.push(file);
      for (const item of fileItems) {
        const urgency = item.deprecationSchedule?.urgency;
        const tag = urgency ? ` [${urgency}]` : "";
        lines.push(
          `  ${item.line}:${item.character}  ${item.name} (${item.kind})${tag}`,
        );
      }
    }
  }

  lines.push("");
  lines.push(input.verdict);
  return lines.join("\n");
}

function renderJson(input: ReportInput): string {
  const { items, comparison, root } = input;
  return JSON.stringify(
    {
      tool: "deprecated-tracker",
      version: input.toolVersion,
      passed: input.passed,
      total: comparison.total,
      baselineTotal: comparison.baselineTotal,
      hasBaseline: comparison.hasBaseline,
      delta: comparison.delta,
      risenFiles: comparison.risenFiles,
      items: items.map((item) => ({
        name: item.name,
        kind: item.kind,
        file: PathUtils.relativeTo(root, item.filePath),
        line: item.line,
        character: item.character,
        severity: item.severity,
        urgency: item.deprecationSchedule?.urgency,
        reason: item.deprecationReason,
        schedule: item.deprecationSchedule,
      })),
    },
    null,
    2,
  );
}

function renderSarif(input: ReportInput): string {
  const { items, root } = input;
  return JSON.stringify(
    {
      $schema: SARIF_SCHEMA,
      version: "2.1.0",
      runs: [
        {
          tool: {
            driver: {
              name: "Deprecated Tracker",
              version: input.toolVersion,
              informationUri:
                "https://github.com/milad-hub/deprecation-tracker",
              rules: [
                {
                  id: "deprecated-declaration",
                  name: "DeprecatedDeclaration",
                  shortDescription: { text: "Declaration marked deprecated" },
                },
                {
                  id: "deprecated-usage",
                  name: "DeprecatedUsage",
                  shortDescription: { text: "Use of a deprecated symbol" },
                },
              ],
            },
          },
          results: items.map((item) => ({
            ruleId:
              item.kind === "usage"
                ? "deprecated-usage"
                : "deprecated-declaration",
            level: sarifLevel(item),
            message: { text: describe(item) },
            locations: [
              {
                physicalLocation: {
                  artifactLocation: {
                    uri: PathUtils.relativeTo(root, item.filePath),
                  },
                  region: {
                    startLine: item.line,
                    startColumn: item.character,
                  },
                },
              },
            ],
          })),
        },
      ],
    },
    null,
    2,
  );
}

export function describe(item: DeprecatedItem): string {
  const what =
    item.kind === "usage"
      ? `Uses deprecated ${item.name}`
      : `${item.name} is deprecated`;
  const reason = item.deprecationReason
    ? ` — ${item.deprecationReason.replace(/\s+/g, " ").trim()}`
    : "";
  return `${what}${reason}`;
}

function sarifLevel(item: DeprecatedItem): string {
  const urgency = item.deprecationSchedule?.urgency;
  if (urgency && URGENCY_RANK[urgency] >= URGENCY_RANK.removed) {
    return "error";
  }
  return item.severity === "error" ? "error" : "warning";
}

function signed(value: number): string {
  return value > 0 ? `+${value}` : `${value}`;
}

function countFiles(items: DeprecatedItem[]): number {
  return new Set(items.map((item) => item.filePath)).size;
}

function groupByFile(
  items: DeprecatedItem[],
  root: string,
): Map<string, DeprecatedItem[]> {
  const grouped = new Map<string, DeprecatedItem[]>();
  for (const item of items) {
    const file = PathUtils.relativeTo(root, item.filePath);
    const bucket = grouped.get(file);
    if (bucket) {
      bucket.push(item);
    } else {
      grouped.set(file, [item]);
    }
  }
  return grouped;
}
