import * as path from "path";
import * as vscode from "vscode";
import { SCANNABLE_EXTENSIONS } from "../constants";
import { ChangedLineRange, ScanChangesScope } from "../interfaces";
import {
  PathUtils,
  isWithinChangedLines,
  parseChangedLineRanges,
} from "../utils";

/**
 * The slice of the built-in Git extension's API this module uses, declared
 * locally rather than depending on `@types/vscode.git`. The API is untyped at
 * runtime and the extension can be disabled, so everything here treats it as
 * possibly-absent data rather than a contract.
 */
export interface GitChange {
  uri: vscode.Uri;
  originalUri?: vscode.Uri;
  status: number;
}

export interface GitRepository {
  rootUri: vscode.Uri;
  state: {
    indexChanges?: GitChange[];
    workingTreeChanges?: GitChange[];
  };
  diffWithHEAD?(filePath: string): Promise<string>;
  diffIndexWithHEAD?(filePath: string): Promise<string>;
}

export interface GitApi {
  repositories: GitRepository[];
}

/** Matches the built-in Git extension's `Status` enum for the deleted states. */
const STATUS_INDEX_DELETED = 2;
const STATUS_DELETED = 6;
const STATUS_UNTRACKED = 7;

/**
 * Resolves the built-in Git extension's API, activating it if the host has not
 * already. Returns undefined when the extension is disabled or missing, which
 * is a state the caller must report rather than treat as "no changes".
 *
 * `vscode.git` is deliberately not in `extensionDependencies` — that would
 * force-enable it for every user to serve one optional command.
 */
export async function getGitApi(): Promise<GitApi | undefined> {
  try {
    const extension = vscode.extensions.getExtension("vscode.git");
    if (!extension) {
      return undefined;
    }
    const exports = extension.isActive
      ? extension.exports
      : await extension.activate();
    return exports?.getAPI?.(1);
  } catch {
    return undefined;
  }
}

/**
 * The changed files worth scanning, across every repository in the workspace.
 *
 * Four filters, each for a reason that would otherwise arrive as a bug report:
 * deleted paths cannot be scanned; a rename's `originalUri` no longer exists so
 * only `uri` is used; a changed `README.md` is not an error, just not
 * scannable; and a repository can extend past the open folders while the
 * scanner rejects outside paths outright.
 */
export function collectChangedFiles(
  api: GitApi,
  scope: ScanChangesScope,
  workspaceFolders: readonly vscode.WorkspaceFolder[],
): string[] {
  const seen = new Set<string>();
  const files: string[] = [];

  for (const repository of api.repositories || []) {
    for (const change of changesInScope(repository, scope)) {
      const filePath = change.uri?.fsPath;
      if (
        !filePath ||
        isDeleted(change) ||
        !isScannable(filePath) ||
        !PathUtils.folderContaining(workspaceFolders, filePath)
      ) {
        continue;
      }

      // A file that is staged and then modified again appears in both lists.
      const key = filePath.toLowerCase();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      files.push(filePath);
    }
  }

  return files;
}

/**
 * Changed line ranges per file, for the granularity filter. The sides must
 * match the scope the files were collected under — filtering unstaged results
 * against a staged diff produces confident nonsense.
 *
 * A file with no diff (untracked, or a repository that cannot produce one) is
 * reported as entirely changed, which is the honest reading of a new file.
 */
export async function collectChangedLineRanges(
  api: GitApi,
  scope: ScanChangesScope,
  filePaths: readonly string[],
): Promise<Map<string, ChangedLineRange[]>> {
  const wanted = new Set(filePaths.map((filePath) => filePath.toLowerCase()));
  const ranges = new Map<string, ChangedLineRange[]>();

  for (const repository of api.repositories || []) {
    for (const change of changesInScope(repository, scope)) {
      const filePath = change.uri?.fsPath;
      if (!filePath || !wanted.has(filePath.toLowerCase())) {
        continue;
      }
      if (change.status === STATUS_UNTRACKED) {
        continue;
      }

      const staged = isStagedChange(repository, change);
      const diff = await safeDiff(repository, filePath, staged);
      if (!diff) {
        continue;
      }

      const parsed = parseChangedLineRanges(diff);
      const existing = ranges.get(filePath.toLowerCase());
      ranges.set(
        filePath.toLowerCase(),
        existing ? existing.concat(parsed) : parsed,
      );
    }
  }

  return ranges;
}

export { isWithinChangedLines, parseChangedLineRanges };

function changesInScope(
  repository: GitRepository,
  scope: ScanChangesScope,
): GitChange[] {
  const changes: GitChange[] = [];
  if (scope.staged) {
    changes.push(...(repository.state?.indexChanges || []));
  }
  if (scope.unstaged) {
    changes.push(...(repository.state?.workingTreeChanges || []));
  }
  return changes;
}

function isStagedChange(repository: GitRepository, change: GitChange): boolean {
  return (repository.state?.indexChanges || []).includes(change);
}

async function safeDiff(
  repository: GitRepository,
  filePath: string,
  staged: boolean,
): Promise<string | undefined> {
  try {
    const diff = staged
      ? await repository.diffIndexWithHEAD?.(filePath)
      : await repository.diffWithHEAD?.(filePath);
    return diff || undefined;
  } catch {
    return undefined;
  }
}

function isDeleted(change: GitChange): boolean {
  return (
    change.status === STATUS_DELETED || change.status === STATUS_INDEX_DELETED
  );
}

function isScannable(filePath: string): boolean {
  return SCANNABLE_EXTENSIONS.includes(path.extname(filePath).toLowerCase());
}
