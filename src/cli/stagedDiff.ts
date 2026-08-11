import { execFileSync } from "child_process";
import * as path from "path";
import { SCANNABLE_EXTENSIONS } from "../constants";
import { ChangedLineRange } from "../interfaces";
import { parseChangedLineRanges, pathKey } from "../utils";

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
  return splitPaths(
    tryGit(
      git,
      ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"],
      cwd,
    ),
    cwd,
  );
}

/**
 * Everything git knows has changed and is not committed: the index, the working
 * tree, and untracked files. `--staged` answers "what am I about to commit";
 * this answers "what have I touched", which is the question a pre-push hook and
 * an agent mid-edit are actually asking.
 */
export function listWorkingTreeFiles(
  cwd: string,
  git: GitRunner = runGit,
): string[] {
  return [
    ...listStagedFiles(cwd, git),
    ...splitPaths(
      tryGit(git, ["diff", "--name-only", "--diff-filter=ACMR", "-z"], cwd),
      cwd,
    ),
    ...splitPaths(
      tryGit(git, ["ls-files", "-z", "--others", "--exclude-standard"], cwd),
      cwd,
    ),
  ].filter(unseen());
}

/**
 * Changed lines on both sides of the index. A file that was staged and then
 * edited again has changed lines in each diff, so taking one side would hide
 * whichever half the other reported.
 */
export function collectWorkingTreeLineRanges(
  filePaths: readonly string[],
  cwd: string,
  git: GitRunner = runGit,
): Map<string, ChangedLineRange[]> {
  const ranges = collectStagedLineRanges(filePaths, cwd, git);

  for (const filePath of filePaths) {
    const parsed = parseChangedLineRanges(
      tryGit(git, ["diff", "--unified=0", "--no-color", "--", filePath], cwd) ||
        "",
    );
    if (parsed.length === 0) {
      continue;
    }
    const key = pathKey(filePath);
    ranges.set(key, [...(ranges.get(key) ?? []), ...parsed]);
  }

  return ranges;
}

function tryGit(
  git: GitRunner,
  args: string[],
  cwd: string,
): string | undefined {
  try {
    return git(args, cwd);
  } catch {
    return undefined;
  }
}

function splitPaths(output: string | undefined, cwd: string): string[] {
  return (output || "")
    .split("\0")
    .filter((entry) => entry.length > 0)
    .map((entry) => path.resolve(cwd, entry));
}

function unseen(): (filePath: string) => boolean {
  const seen = new Set<string>();
  return (filePath) => {
    const key = pathKey(filePath);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  };
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
 * Changed line ranges for each staged file, keyed by absolute path — case
 * folded only where the filesystem is, so Linux keeps `Foo.ts` and `foo.ts`
 * apart.
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
      ranges.set(pathKey(filePath), parsed);
    }
  }

  return ranges;
}
