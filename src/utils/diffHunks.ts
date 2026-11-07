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

export interface DiffHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
}

export function parseHunks(diff: string): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  const header = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/gm;
  let match = header.exec(diff);
  while (match !== null) {
    hunks.push({
      oldStart: Number(match[1]),
      oldCount: match[2] === undefined ? 1 : Number(match[2]),
      newStart: Number(match[3]),
      newCount: match[4] === undefined ? 1 : Number(match[4]),
    });
    match = header.exec(diff);
  }
  return hunks;
}

export function addedRanges(hunks: readonly DiffHunk[]): ChangedLineRange[] {
  return hunks
    .filter((hunk) => hunk.newCount > 0)
    .map((hunk) => ({
      start: hunk.newStart,
      end: hunk.newStart + hunk.newCount - 1,
    }));
}

/**
 * Moves line ranges numbered against the index onto the working tree, given
 * the index-to-working-tree hunks. A line that was edited again after staging
 * maps to whatever now occupies its place.
 */
export function shiftRanges(
  ranges: readonly ChangedLineRange[],
  laterHunks: readonly DiffHunk[],
): ChangedLineRange[] {
  const ordered = [...laterHunks].sort(
    (left, right) => left.oldStart - right.oldStart,
  );
  const shifted: ChangedLineRange[] = [];
  for (const range of ranges) {
    for (let line = range.start; line <= range.end; line++) {
      shifted.push(...mapLine(line, ordered));
    }
  }
  return shifted;
}

function mapLine(line: number, hunks: readonly DiffHunk[]): ChangedLineRange[] {
  let delta = 0;
  for (const hunk of hunks) {
    if (hunk.oldCount === 0) {
      if (line > hunk.oldStart) {
        delta += hunk.newCount;
        continue;
      }
      break;
    }
    const lastOld = hunk.oldStart + hunk.oldCount - 1;
    if (line < hunk.oldStart) {
      break;
    }
    if (line <= lastOld) {
      return hunk.newCount > 0
        ? [{ start: hunk.newStart, end: hunk.newStart + hunk.newCount - 1 }]
        : [];
    }
    delta += hunk.newCount - hunk.oldCount;
  }
  return [{ start: line + delta, end: line + delta }];
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
