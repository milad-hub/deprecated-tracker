import { DeprecatedItem } from "../interfaces";
import { PathUtils, URGENCY_RANK, escapeMarkdownCell } from "../utils";
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
  baselineIgnored?: boolean;
}

export interface ClassificationCounts {
  /** Declarations with a reason and at least one call site left. */
  documented: number;
  /** Called, but the `@deprecated` tag says nothing about what to use. */
  bare: number;
  /** Nothing reaches them any more, so they are deletable today. */
  unused: number;
}

/**
 * The three-way split the results panel is organised around, computed from the
 * flat item list the same way the panel computes it: group every item under the
 * declaration it belongs to, then ask what that declaration needs.
 *
 * Counts declarations, not items, so it does not sum to `items.length`.
 */
export function classify(items: DeprecatedItem[]): ClassificationCounts {
  const groups = new Map<string, { reason: boolean; usages: number }>();

  for (const item of items) {
    const declaration = item.deprecatedDeclaration ?? item;
    const key = `${declaration.name}|${declaration.filePath}`;
    const group = groups.get(key) ?? { reason: false, usages: 0 };
    group.reason = group.reason || Boolean(item.deprecationReason);
    group.usages += item.kind === "usage" ? 1 : 0;
    groups.set(key, group);
  }

  const counts: ClassificationCounts = { documented: 0, bare: 0, unused: 0 };
  for (const group of groups.values()) {
    const bucket =
      group.usages === 0 ? "unused" : group.reason ? "documented" : "bare";
    counts[bucket] += 1;
  }
  return counts;
}

export function renderReport(format: OutputFormat, input: ReportInput): string {
  if (format === "json") {
    return renderJson(input);
  }
  if (format === "sarif") {
    return renderSarif(input);
  }
  if (format === "markdown") {
    return renderMarkdown(input);
  }
  return renderText(input);
}

function renderText(input: ReportInput): string {
  const { items, comparison, root } = input;
  const lines: string[] = [];

  const split = classify(items);
  lines.push(
    `Deprecated Tracker — ${items.length} item(s) across ${countFiles(items)} file(s)`,
  );
  lines.push(
    `${split.documented + split.bare + split.unused} symbol(s): ${split.documented} documented, ${split.bare} without a reason, ${split.unused} unused`,
  );

  if (!input.baselineIgnored) {
    if (comparison.hasBaseline) {
      lines.push(
        `Baseline ${comparison.baselineTotal} → ${comparison.total} (${signed(comparison.delta)})`,
      );
    } else {
      lines.push(
        "No baseline found — run with --update-baseline to record one.",
      );
    }

    if (comparison.risenFiles.length > 0) {
      lines.push("");
      lines.push("Risen above baseline:");
      for (const file of comparison.risenFiles) {
        lines.push(`  ${file.file}  ${file.before} → ${file.after}`);
      }
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

/**
 * The same information as the text report, shaped for a PR comment. Carries no
 * timestamp on purpose: a generated-at line makes every report differ from the
 * last one, which is noise in a diff and unassertable in a test.
 */
function renderMarkdown(input: ReportInput): string {
  const { items, comparison, root } = input;
  const lines: string[] = [
    "## Deprecated Tracker",
    "",
    `**${items.length}** item(s) across **${countFiles(items)}** file(s)`,
  ];

  if (!input.baselineIgnored) {
    lines.push("");
    lines.push(
      comparison.hasBaseline
        ? `Baseline ${comparison.baselineTotal} → ${comparison.total} (${signed(comparison.delta)})`
        : "No baseline found — run with `--update-baseline` to record one.",
    );

    if (comparison.risenFiles.length > 0) {
      lines.push("");
      lines.push("### Risen above baseline");
      lines.push("");
      lines.push("| File | Before | After |");
      lines.push("| --- | ---: | ---: |");
      for (const file of comparison.risenFiles) {
        lines.push(
          `| ${escapeMarkdownCell(file.file)} | ${file.before} | ${file.after} |`,
        );
      }
    }
  }

  if (items.length > 0) {
    for (const [file, fileItems] of groupByFile(items, root)) {
      lines.push("");
      lines.push(`### ${escapeMarkdownCell(file)}`);
      lines.push("");
      lines.push("| Line | Symbol | Kind | Urgency | Detail |");
      lines.push("| ---: | --- | --- | --- | --- |");
      for (const item of fileItems) {
        const cells = [
          `${item.line}:${item.character}`,
          `\`${escapeMarkdownCell(item.name)}\``,
          item.kind,
          item.deprecationSchedule?.urgency ?? "—",
          escapeMarkdownCell(describe(item)),
        ];
        lines.push(`| ${cells.join(" | ")} |`);
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
      summary: classify(items),
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
        declaration: declarationLink(root, item),
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
              informationUri: "https://github.com/milad-hub/deprecated-tracker",
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

/**
 * Where the deprecated symbol a usage refers to is declared. Set only on
 * usages, and the field that makes the classification computable downstream:
 * without it, tying a call site to its declaration means matching on name.
 */
export function declarationLink(
  root: string,
  item: DeprecatedItem,
): { name: string; file: string; line: number } | undefined {
  const declaration = item.deprecatedDeclaration;
  return declaration
    ? {
        name: declaration.name,
        file: PathUtils.relativeTo(root, declaration.filePath),
        line: declaration.line,
      }
    : undefined;
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
