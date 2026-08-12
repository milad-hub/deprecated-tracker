import { ChangedLineRange } from "../interfaces";
import { pathKey } from "./pathKey";

/**
 * Reads the changed line ranges in the *new* file out of unified diff text.
 * Hunk headers look like `@@ -a,b +c,d @@`, where a missing `,d` means one
 * line and `+c,0` is a pure deletion with nothing to scan.
 *
 * Lives here rather than beside the Git extension wrapper because the CLI
 * needs it too, and the CLI must not pull `vscode` into a Node process.
 */
export function parseChangedLineRanges(diff: string): ChangedLineRange[] {
  const ranges: ChangedLineRange[] = [];
  const header = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm;

  let match = header.exec(diff);
  while (match !== null) {
    const start = Number(match[1]);
    const count = match[2] === undefined ? 1 : Number(match[2]);
    if (count > 0) {
      ranges.push({ start, end: start + count - 1 });
    }
    match = header.exec(diff);
  }

  return ranges;
}

/**
 * Keeps only the items landing inside a changed hunk. Files with no recorded
 * ranges are kept whole — that is the untracked or newly added file case,
 * where every line is new.
 */
export function isWithinChangedLines(
  filePath: string,
  line: number,
  ranges: Map<string, ChangedLineRange[]>,
): boolean {
  const fileRanges = ranges.get(pathKey(filePath));
  if (!fileRanges) {
    return true;
  }
  return fileRanges.some((range) => line >= range.start && line <= range.end);
}
