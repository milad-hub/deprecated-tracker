import {
  AI_PROMPT_CHAR_BUDGET,
  AI_PROMPT_REASON_MAX_CHARS,
} from "../constants";
import { DeprecatedItem, DeprecationSchedule } from "../interfaces";
import { URGENCY_RANK } from "../utils";

export interface AiPromptOptions {
  workspaceRoots?: string[];
  charBudget?: number;
}

interface SymbolEntry {
  name: string;
  kind: string;
  filePath: string;
  line: number;
  reason?: string;
  schedule?: DeprecationSchedule;
  usages: Map<string, number[]>;
}

const PREAMBLE = [
  "Remove the deprecated usages listed below from this repo.",
  "",
  "Rules",
  "- One symbol at a time; build and test between symbols.",
  "- Preserve behaviour exactly. Do not widen a public API to suit a call site.",
  "- If the replacement is not stated or not obvious, skip it and say so.",
  "- Report every symbol you skipped and why.",
  "",
  "Format: `name (kind) @ declaration-file:line` then `since -> removal` when",
  "known, the deprecation note, then usage files with their line numbers. Paths",
  "are relative to the workspace root.",
  "",
].join("\n");

const SECTION_TITLES: Record<number, string> = {
  3: "## Removed already",
  2: "## Scheduled for removal",
  1: "## Announced",
  0: "## No schedule stated",
};

export function buildAiFixPrompt(
  results: DeprecatedItem[],
  options: AiPromptOptions = {},
): string {
  const roots = options.workspaceRoots || [];
  const budget =
    options.charBudget === undefined
      ? AI_PROMPT_CHAR_BUDGET
      : options.charBudget;

  const entries = sortEntries(groupBySymbol(results));
  const totalUsages = entries.reduce(
    (sum, entry) => sum + countUsages(entry),
    0,
  );

  const lines: string[] = [];
  let used = 0;
  let rendered = 0;
  let currentRank: number | undefined;

  for (const entry of entries) {
    const rank = rankOf(entry);
    const header = rank === currentRank ? "" : `\n${SECTION_TITLES[rank]}\n`;
    const block = renderEntry(entry, roots);
    const cost = header.length + block.length;

    if (rendered > 0 && used + cost > budget) {
      break;
    }

    if (header) {
      lines.push(header);
      currentRank = rank;
    }
    lines.push(block);
    used += cost;
    rendered++;
  }

  const scope = `${entries.length} symbols, ${totalUsages} usages.\n`;
  const remainder =
    rendered < entries.length
      ? `\nShowing ${rendered} of ${entries.length} symbols, highest urgency first. Re-run the export after this batch.\n`
      : "";

  return PREAMBLE + scope + lines.join("") + remainder;
}

function groupBySymbol(results: DeprecatedItem[]): SymbolEntry[] {
  const groups = new Map<string, SymbolEntry>();

  for (const item of results) {
    const anchor =
      item.kind === "usage" && item.deprecatedDeclaration
        ? item.deprecatedDeclaration
        : item;
    const key = `${anchor.name}|${anchor.filePath}`;

    let entry = groups.get(key);
    if (!entry) {
      entry = {
        name: anchor.name,
        kind: "symbol",
        filePath: anchor.filePath,
        line: anchor.line,
        usages: new Map(),
      };
      groups.set(key, entry);
    }

    if (item.kind === "usage") {
      const lines = entry.usages.get(item.filePath) || [];
      lines.push(item.line);
      entry.usages.set(item.filePath, lines);
    } else {
      entry.kind = item.kind;
      entry.line = item.line;
    }

    if (!entry.reason && item.deprecationReason) {
      entry.reason = item.deprecationReason;
    }
    if (!entry.schedule && item.deprecationSchedule) {
      entry.schedule = item.deprecationSchedule;
    }
  }

  return Array.from(groups.values());
}

function sortEntries(entries: SymbolEntry[]): SymbolEntry[] {
  return entries.sort((left, right) => {
    const byRank = rankOf(right) - rankOf(left);
    if (byRank !== 0) {
      return byRank;
    }
    const byUsage = countUsages(right) - countUsages(left);
    if (byUsage !== 0) {
      return byUsage;
    }
    return left.name.localeCompare(right.name);
  });
}

function rankOf(entry: SymbolEntry): number {
  return entry.schedule ? URGENCY_RANK[entry.schedule.urgency] : 0;
}

function countUsages(entry: SymbolEntry): number {
  let total = 0;
  entry.usages.forEach((lines) => {
    total += lines.length;
  });
  return total;
}

function renderEntry(entry: SymbolEntry, roots: string[]): string {
  const location = `${toRelative(entry.filePath, roots)}:${entry.line}`;
  let block = `${entry.name} (${entry.kind}) @ ${location}${formatSchedule(entry.schedule)}\n`;

  const reason = compactReason(entry.reason);
  if (reason) {
    block += `  ${reason}\n`;
  }

  const usages = formatUsages(entry, roots);
  if (usages) {
    block += `  ${usages}\n`;
  }

  return block;
}

function formatSchedule(schedule?: DeprecationSchedule): string {
  if (!schedule) {
    return "";
  }
  const since = schedule.sinceVersion || schedule.sinceDate;
  const removal = schedule.removalVersion || schedule.removalDate;

  if (since && removal) {
    return ` | since ${since} -> removed ${removal}`;
  }
  if (since) {
    return ` | since ${since}`;
  }
  if (removal) {
    return ` | removed ${removal}`;
  }
  return "";
}

function compactReason(reason?: string): string {
  if (!reason) {
    return "";
  }
  const collapsed = reason.replace(/\s+/g, " ").trim();
  return collapsed.length > AI_PROMPT_REASON_MAX_CHARS
    ? `${collapsed.slice(0, AI_PROMPT_REASON_MAX_CHARS).trimEnd()}...`
    : collapsed;
}

function formatUsages(entry: SymbolEntry, roots: string[]): string {
  const parts: string[] = [];
  entry.usages.forEach((lines, filePath) => {
    const unique = Array.from(new Set(lines)).sort((a, b) => a - b);
    parts.push(`${toRelative(filePath, roots)}:${unique.join(",")}`);
  });
  return parts.join("  ");
}

function toRelative(filePath: string, roots: string[]): string {
  const normalized = filePath.replace(/\\/g, "/");
  let shortest = normalized;

  for (const root of roots) {
    const prefix = root.replace(/\\/g, "/").replace(/\/+$/, "");
    if (
      normalized.toLowerCase().startsWith(`${prefix.toLowerCase()}/`) &&
      normalized.length - prefix.length - 1 < shortest.length
    ) {
      shortest = normalized.slice(prefix.length + 1);
    }
  }

  return shortest;
}
