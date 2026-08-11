import { execFileSync } from "child_process";
import * as path from "path";
import { SCANNABLE_EXTENSIONS } from "../constants";
import { ChangedLineRange } from "../interfaces";
import { parseChangedLineRanges } from "../utils";

export type GitRunner = (args: string[], cwd: string) => string;

/**
 * Runs git directly rather than through an editor API — a hook has no editor,
 * and `git` is on PATH by definition inside one.
 */
const runGit: GitRunner = (args, cwd) =>
  execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    maxBuffer: 32 * 1024 * 1024,
  });

/**
 * The staged files, for hook managers that run a bare command and pass no
 * paths — simple-git-hooks, a plain `.husky/pre-commit`, a raw
 * `.git/hooks/pre-commit`, or lefthook without `{staged_files}`.
 *
 * `--diff-filter=ACMR` drops deletions, which cannot be scanned, and reports a
 * rename at its new path. `-z` is what makes the output safe to split: without
 * it git quotes any path containing a space or a non-ASCII character.
 */
export function listStagedFiles(
  cwd: string,
  git: GitRunner = runGit,
): string[] {
  let output: string;
  try {
    output = git(
      ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"],
      cwd,
    );
  } catch {
    return [];
  }

  return (output || "")
    .split("\0")
    .filter((entry) => entry.length > 0)
    .map((entry) => path.resolve(cwd, entry));
}

/**
 * Drops what the scanner cannot parse. A hook manager configured with a broad
 * glob — `"*"` is a common lint-staged setting — otherwise hands over
 * stylesheets and JSON.
 */
export function onlyScannable(filePaths: readonly string[]): string[] {
  return filePaths.filter((filePath) =>
    SCANNABLE_EXTENSIONS.includes(path.extname(filePath).toLowerCase()),
  );
}

/**
 * Changed line ranges for each staged file, keyed by lowercased absolute path.
 *
 * `--unified=0` keeps the hunks tight to the edited lines: with context lines
 * included, an untouched deprecated call sitting three lines from an edit
 * would read as changed and fail the commit.
 *
 * A file with no diff output — newly added, or one git cannot describe — is
 * left out of the map, which `isWithinChangedLines` treats as entirely
 * changed. That is the honest reading of a new file.
 */
export function collectStagedLineRanges(
  filePaths: readonly string[],
  cwd: string,
  git: GitRunner = runGit,
): Map<string, ChangedLineRange[]> {
  const ranges = new Map<string, ChangedLineRange[]>();

  for (const filePath of filePaths) {
    let diff: string;
    try {
      diff = git(
        ["diff", "--cached", "--unified=0", "--no-color", "--", filePath],
        cwd,
      );
    } catch {
      continue;
    }

    const parsed = parseChangedLineRanges(diff || "");
    if (parsed.length > 0) {
      ranges.set(filePath.toLowerCase(), parsed);
    }
  }

  return ranges;
}
