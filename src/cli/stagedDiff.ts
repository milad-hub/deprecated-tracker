import { execFileSync } from "child_process";
import * as path from "path";
import { SCANNABLE_EXTENSIONS } from "../constants";
import { ChangedLineRange } from "../interfaces";
import {
  DiffHunk,
  addedRanges,
  parseHunks,
  pathKey,
  shiftRanges,
} from "../utils";

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
      ["diff", "--cached", "--name-only", "--relative", "--diff-filter=ACMR", "-z"],
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
      tryGit(
        git,
        ["diff", "--name-only", "--relative", "--diff-filter=ACMR", "-z"],
        cwd,
      ),
      cwd,
    ),
    ...splitPaths(
      tryGit(git, ["ls-files", "-z", "--others", "--exclude-standard"], cwd),
      cwd,
    ),
  ].filter(unseen());
}

/**
 * Changed lines in the working tree against HEAD, which is what is on disk and
 * what the scanner reads. Untracked files have no entry and count as new.
 */
export function collectWorkingTreeLineRanges(
  filePaths: readonly string[],
  cwd: string,
  git: GitRunner = runGit,
): Map<string, ChangedLineRange[]> {
  const head = diffByFile(git, ["HEAD"], cwd, filePaths);
  const ranges = new Map<string, ChangedLineRange[]>();
  for (const filePath of filePaths) {
    const hunks = head.get(pathKey(path.resolve(filePath)));
    if (hunks) {
      ranges.set(pathKey(path.resolve(filePath)), addedRanges(hunks));
    }
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
    const key = pathKey(path.resolve(filePath));
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
 * Changed line ranges for each staged file, keyed by absolute path and
 * numbered the way the working tree is, because the scanner reads the file on
 * disk. A file staged and then edited again has its staged lines moved by the
 * unstaged edits.
 *
 * `--unified=0` keeps the hunks tight to the edited lines, and `-M` lets a
 * rename show only what changed. A file whose diff adds nothing, such as a
 * deletion or a pure rename, gets an empty list: nothing on it is new. A file
 * git has no diff for at all is left out, which `isWithinChangedLines` reads
 * as entirely changed.
 */
export function collectStagedLineRanges(
  filePaths: readonly string[],
  cwd: string,
  git: GitRunner = runGit,
): Map<string, ChangedLineRange[]> {
  const staged = diffByFile(git, ["--cached"], cwd, filePaths);
  const unstaged = diffByFile(git, [], cwd, filePaths);
  const ranges = new Map<string, ChangedLineRange[]>();

  for (const filePath of filePaths) {
    const key = pathKey(path.resolve(filePath));
    const hunks = staged.get(key);
    if (!hunks) {
      continue;
    }
    const later = unstaged.get(key);
    ranges.set(
      key,
      later ? shiftRanges(addedRanges(hunks), later) : addedRanges(hunks),
    );
  }

  return ranges;
}

/** Working tree against the index: what is changed and not yet staged. */
export function collectUnstagedLineRanges(
  filePaths: readonly string[],
  cwd: string,
  git: GitRunner = runGit,
): Map<string, ChangedLineRange[]> {
  const unstaged = diffByFile(git, [], cwd, filePaths);
  const ranges = new Map<string, ChangedLineRange[]>();
  for (const filePath of filePaths) {
    const hunks = unstaged.get(pathKey(path.resolve(filePath)));
    if (hunks) {
      ranges.set(pathKey(path.resolve(filePath)), addedRanges(hunks));
    }
  }
  return ranges;
}

const PATHSPEC_BATCH = 100;

/**
 * One diff of everything first, because rename detection needs both sides of
 * a rename. If that fails — a diff too large for the buffer, say — the files
 * that were asked about are diffed on their own, in batches, so a huge
 * unrelated change cannot turn every finding into a "changed line".
 */
function diffByFile(
  git: GitRunner,
  args: string[],
  cwd: string,
  filePaths: readonly string[],
): Map<string, DiffHunk[]> {
  const command = [
    "-c",
    "core.quotePath=false",
    "diff",
    ...args,
    "--unified=0",
    "--no-color",
    "-M",
    "--relative",
  ];
  const whole = tryGit(git, command, cwd);
  if (whole !== undefined) {
    return parseDiffByFile(whole, cwd);
  }
  const files = new Map<string, DiffHunk[]>();
  for (let start = 0; start < filePaths.length; start += PATHSPEC_BATCH) {
    const batch = filePaths.slice(start, start + PATHSPEC_BATCH);
    const output = tryGit(git, [...command, "--", ...batch], cwd) ?? "";
    for (const [key, hunks] of parseDiffByFile(output, cwd)) {
      files.set(key, hunks);
    }
  }
  return files;
}

/** Splits a multi-file unified diff into hunks per resulting file path. */
export function parseDiffByFile(
  diff: string,
  cwd: string,
): Map<string, DiffHunk[]> {
  const files = new Map<string, DiffHunk[]>();
  for (const section of diff.split(/^diff --git /m).slice(1)) {
    const name =
      /^\+\+\+ b\/(.+)$/m.exec(section)?.[1] ??
      /^rename to (.+)$/m.exec(section)?.[1] ??
      /^a\/.+ b\/(.+)$/m.exec(section)?.[1];
    if (!name || /^\+\+\+ \/dev\/null$/m.test(section)) {
      continue;
    }
    files.set(pathKey(path.resolve(cwd, name.trimEnd())), parseHunks(section));
  }
  return files;
}
