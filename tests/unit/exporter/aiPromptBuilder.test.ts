import {
  AI_PROMPT_CHAR_BUDGET,
  AI_PROMPT_REASON_MAX_CHARS,
} from "../../../src/constants";
import { ResultExporter, buildAiFixPrompt } from "../../../src/exporter";
import { DeprecatedItem } from "../../../src/interfaces";
import { PathUtils, URGENCY_RANK, parseDeprecationSchedule } from "../../../src/utils";

const ROOT = "/workspace";

const declaration = (
  overrides: Partial<DeprecatedItem> = {},
): DeprecatedItem => ({
  name: "getUser",
  fileName: "user.ts",
  filePath: `${ROOT}/src/api/user.ts`,
  line: 12,
  character: 3,
  kind: "function",
  ...overrides,
});

const usage = (overrides: Partial<DeprecatedItem> = {}): DeprecatedItem => ({
  name: "getUser",
  fileName: "profile.ts",
  filePath: `${ROOT}/src/pages/profile.ts`,
  line: 22,
  character: 5,
  kind: "usage",
  deprecatedDeclaration: {
    name: "getUser",
    filePath: `${ROOT}/src/api/user.ts`,
    fileName: "user.ts",
    line: 12,
  },
  ...overrides,
});

const build = (
  results: DeprecatedItem[],
  options: { workspaceRoots?: string[]; charBudget?: number } = {
    workspaceRoots: [ROOT],
  },
): string => buildAiFixPrompt(results, options);

const workList = (prompt: string): string =>
  prompt.slice(prompt.indexOf("symbols,"));

describe("buildAiFixPrompt", () => {
  describe("preamble and scope", () => {
    it("states the rules once, whatever the list size", () => {
      const prompt = build([declaration(), usage()]);
      expect(prompt).toContain(
        "Remove the deprecated usages listed below from this repo.",
      );
      expect(prompt.match(/One symbol at a time/g)).toHaveLength(1);
    });

    it("counts symbols and usages, not rows", () => {
      const prompt = build([
        declaration(),
        usage(),
        usage({ line: 48 }),
        declaration({ name: "other", filePath: `${ROOT}/src/other.ts` }),
      ]);
      expect(prompt).toContain("2 symbols, 2 usages.");
    });

    it("reports an empty list honestly", () => {
      expect(build([])).toContain("0 symbols, 0 usages.");
    });
  });

  describe("token compaction", () => {
    it("emits a file path once for every usage inside it", () => {
      const prompt = build([
        declaration(),
        usage({ line: 22 }),
        usage({ line: 91 }),
        usage({ line: 48 }),
      ]);

      expect(prompt).toContain("src/pages/profile.ts:22,48,91");
      expect(prompt.match(/src\/pages\/profile\.ts/g)).toHaveLength(1);
    });

    it("collapses repeated lines from the same file", () => {
      const prompt = build([declaration(), usage(), usage()]);
      expect(prompt).toContain("src/pages/profile.ts:22\n");
    });

    it("keeps paths relative to the workspace root", () => {
      const prompt = build([declaration()]);
      expect(prompt).toContain("src/api/user.ts:12");
      expect(prompt).not.toContain(ROOT);
    });

    it("emits nothing for absent fields", () => {
      const prompt = build([declaration()]);
      expect(prompt).toContain("getUser (function) @ src/api/user.ts:12\n");
      expect(prompt).not.toContain("-\n");
      expect(prompt).not.toContain("| since");
    });

    it("collapses a long reason to one capped line", () => {
      const reason = `First sentence.\n\n${"padding ".repeat(500)}`;
      const prompt = build([declaration({ deprecationReason: reason })]);
      const line = prompt
        .split("\n")
        .find((entry) => entry.includes("First sentence."))!;

      expect(line.trim().length).toBeLessThanOrEqual(
        AI_PROMPT_REASON_MAX_CHARS + 3,
      );
      expect(line.trim().length).toBeGreaterThan(AI_PROMPT_REASON_MAX_CHARS - 5);
      expect(line.trim().endsWith("...")).toBe(true);
      expect(line).not.toContain("\r");
    });

    it("leaves a short reason untouched", () => {
      const prompt = build([
        declaration({ deprecationReason: "  Use fetchUser  instead. " }),
      ]);
      expect(prompt).toContain("  Use fetchUser instead.\n");
    });

    it("carries a reason found only on a usage row", () => {
      const prompt = build([
        declaration(),
        usage({ deprecationReason: "Use fetchUser." }),
      ]);
      expect(prompt).toContain("Use fetchUser.");
    });
  });

  describe("schedule markers", () => {
    it("prints both ends when both are known", () => {
      const prompt = build([
        declaration({
          deprecationSchedule: {
            urgency: "removed",
            sinceVersion: "1.4",
            removalVersion: "2.0",
          },
        }),
      ]);
      expect(prompt).toContain("| since 1.4 -> removed 2.0");
    });

    it("prints a since-only marker", () => {
      const prompt = build([
        declaration({
          deprecationSchedule: { urgency: "announced", sinceDate: "2024-01-01" },
        }),
      ]);
      expect(prompt).toContain("| since 2024-01-01");
      expect(prompt).not.toContain("removed");
    });

    it("prints a removal-only marker", () => {
      const prompt = build([
        declaration({
          deprecationSchedule: {
            urgency: "scheduled",
            removalDate: "2030-01-01",
          },
        }),
      ]);
      expect(prompt).toContain("| removed 2030-01-01");
    });

    it("prints no marker for a schedule with no dates or versions", () => {
      const prompt = build([
        declaration({ deprecationSchedule: { urgency: "scheduled" } }),
      ]);
      expect(prompt).toContain("getUser (function) @ src/api/user.ts:12\n");
      expect(prompt).toContain("## Scheduled for removal");
    });

    it("takes a schedule found only on a usage row", () => {
      const prompt = build([
        declaration(),
        usage({
          deprecationSchedule: { urgency: "removed", removalVersion: "2.0" },
        }),
      ]);
      expect(prompt).toContain("## Removed already");
    });
  });

  describe("sections and ordering", () => {
    const scheduled = (
      urgency: "removed" | "scheduled" | "announced",
      name: string,
    ): DeprecatedItem =>
      declaration({
        name,
        filePath: `${ROOT}/src/${name}.ts`,
        deprecationSchedule: { urgency },
      });

    it("sections by urgency, most urgent first, and only once each", () => {
      const prompt = build([
        scheduled("announced", "a"),
        scheduled("removed", "r"),
        scheduled("scheduled", "s"),
        declaration({ name: "u", filePath: `${ROOT}/src/u.ts` }),
        scheduled("removed", "r2"),
      ]);

      expect(prompt.match(/## Removed already/g)).toHaveLength(1);
      expect(prompt.indexOf("## Removed already")).toBeLessThan(
        prompt.indexOf("## Scheduled for removal"),
      );
      expect(prompt.indexOf("## Scheduled for removal")).toBeLessThan(
        prompt.indexOf("## Announced"),
      );
      expect(prompt.indexOf("## Announced")).toBeLessThan(
        prompt.indexOf("## No schedule stated"),
      );
    });

    it("ranks by the same table the results panel sorts by", () => {
      expect(URGENCY_RANK.removed).toBeGreaterThan(URGENCY_RANK.scheduled);
    });

    it("puts the most-used symbol first inside a section", () => {
      const prompt = build([
        declaration({ name: "quiet", filePath: `${ROOT}/src/quiet.ts` }),
        declaration({ name: "loud", filePath: `${ROOT}/src/loud.ts` }),
        usage({
          name: "loud",
          deprecatedDeclaration: {
            name: "loud",
            filePath: `${ROOT}/src/loud.ts`,
            fileName: "loud.ts",
            line: 12,
          },
        }),
      ]);
      expect(prompt.indexOf("loud (")).toBeLessThan(prompt.indexOf("quiet ("));
    });

    it("falls back to name order for an exact tie", () => {
      const prompt = build([
        declaration({ name: "zeta", filePath: `${ROOT}/src/zeta.ts` }),
        declaration({ name: "alpha", filePath: `${ROOT}/src/alpha.ts` }),
      ]);
      expect(prompt.indexOf("alpha (")).toBeLessThan(prompt.indexOf("zeta ("));
    });
  });

  describe("grouping", () => {
    it("keeps a usage whose declaration is not in the results", () => {
      const prompt = build([usage()]);
      expect(prompt).toContain("getUser (symbol) @ src/api/user.ts:12");
      expect(prompt).toContain("src/pages/profile.ts:22");
    });

    it("treats a usage with no declaration as its own symbol", () => {
      const prompt = build([
        usage({ deprecatedDeclaration: undefined, name: "orphan" }),
      ]);
      expect(prompt).toContain("orphan (symbol) @ src/pages/profile.ts:22");
    });

    it("separates same-named symbols declared in different files", () => {
      const prompt = build([
        declaration(),
        declaration({ filePath: `${ROOT}/src/legacy/user.ts` }),
      ]);
      expect(prompt).toContain("2 symbols");
      expect(prompt).toContain("src/legacy/user.ts:12");
    });
  });

  describe("budget", () => {
    const many = (count: number): DeprecatedItem[] =>
      Array.from({ length: count }, (_, index) =>
        declaration({
          name: `symbol${index}`,
          filePath: `${ROOT}/src/module${index % 30}/file${index}.ts`,
          deprecationReason: "Replaced by the new client.",
        }),
      );

    it("renders a realistic scan inside the default budget", () => {
      const prompt = buildAiFixPrompt(many(200), { workspaceRoots: [ROOT] });
      expect(workList(prompt).length).toBeLessThanOrEqual(
        AI_PROMPT_CHAR_BUDGET + 200,
      );
    });

    it("says how much it dropped when it truncates", () => {
      const prompt = buildAiFixPrompt(many(200), {
        workspaceRoots: [ROOT],
        charBudget: 400,
      });
      const rendered = prompt.match(/^symbol\d+ \(/gm)!.length;

      expect(prompt).toContain(
        `Showing ${rendered} of 200 symbols, highest urgency first.`,
      );
      expect(rendered).toBeLessThan(200);
    });

    it("says nothing about truncation when the whole list fits", () => {
      expect(build([declaration()])).not.toContain("Showing");
    });

    it("always emits at least one whole symbol", () => {
      const prompt = buildAiFixPrompt(many(5), {
        workspaceRoots: [ROOT],
        charBudget: 0,
      });
      expect(prompt.match(/^symbol\d+ \(/gm)).toHaveLength(1);
      expect(prompt).toContain("Showing 1 of 5 symbols");
    });
  });

  describe("workspace roots", () => {
    it("leaves a path outside every root alone", () => {
      const prompt = build([declaration({ filePath: "/elsewhere/x.ts" })]);
      expect(prompt).toContain("/elsewhere/x.ts:12");
    });

    it("keeps full paths when no root is given", () => {
      const prompt = buildAiFixPrompt([declaration()]);
      expect(prompt).toContain(`${ROOT}/src/api/user.ts:12`);
    });

    it("picks the deepest matching root whichever order they arrive in", () => {
      const nested = declaration({ filePath: `${ROOT}/packages/app/x.ts` });
      const shallowFirst = buildAiFixPrompt([nested], {
        workspaceRoots: [ROOT, `${ROOT}/packages/app`],
      });
      const deepFirst = buildAiFixPrompt([nested], {
        workspaceRoots: [`${ROOT}/packages/app`, ROOT],
      });

      expect(shallowFirst).toContain("x.ts:12");
      expect(shallowFirst).not.toContain("packages/app/x.ts");
      expect(deepFirst).toContain("x.ts:12");
      expect(deepFirst).not.toContain("packages/app/x.ts");
    });

    it("matches Windows paths and roots with a trailing separator", () => {
      const prompt = buildAiFixPrompt(
        [declaration({ filePath: "D:\\repo\\src\\api\\user.ts" })],
        { workspaceRoots: ["D:\\repo\\"] },
      );
      expect(prompt).toContain("src/api/user.ts:12");
    });
  });

  describe("through the exporter", () => {
    it("is reachable as the ai-prompt format", () => {
      const text = new ResultExporter().export([declaration()], "ai-prompt", {
        workspaceRoots: [ROOT],
      });
      expect(text).toContain("getUser (function) @ src/api/user.ts:12");
    });

    it("still rejects an unknown format", () => {
      expect(() => new ResultExporter().export([], "xml")).toThrow(
        "Unsupported format: xml",
      );
    });
  });
});

describe("utils barrel", () => {
  it("re-exports the helpers the exporter and scanner share", () => {
    expect(typeof PathUtils.normalizePath).toBe("function");
    expect(parseDeprecationSchedule("@deprecated since 1.0")).toEqual({
      urgency: "announced",
      sinceVersion: "1.0",
    });
  });
});
