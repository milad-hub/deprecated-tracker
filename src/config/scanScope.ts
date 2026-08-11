import * as vscode from "vscode";
import { STORAGE_KEY_SCAN_CHANGES_SCOPE } from "../constants";
import { ScanChangesScope, ScanGranularity } from "../interfaces";

export const DEFAULT_SCAN_CHANGES_SCOPE: ScanChangesScope = {
  staged: true,
  unstaged: true,
  granularity: "files",
};

/**
 * Which side of the working tree a changed-files scan looks at, and whether it
 * reports whole files or only changed lines.
 *
 * Kept in `workspaceState` rather than `.deprecatedtrackerrc`: that file is
 * scan-shaping config the `Scanner` consumes and a team shares through the
 * repo, while this is one person's workflow preference. Keeping it out also
 * keeps it out of the "config keys may be added, never repurposed" promise.
 */
export class ScanScopeManager {
  constructor(private readonly context: vscode.ExtensionContext) {}

  public getScope(): ScanChangesScope {
    const stored = this.context.workspaceState.get<Partial<ScanChangesScope>>(
      STORAGE_KEY_SCAN_CHANGES_SCOPE,
    );
    if (!stored) {
      return { ...DEFAULT_SCAN_CHANGES_SCOPE };
    }

    return {
      staged:
        typeof stored.staged === "boolean"
          ? stored.staged
          : DEFAULT_SCAN_CHANGES_SCOPE.staged,
      unstaged:
        typeof stored.unstaged === "boolean"
          ? stored.unstaged
          : DEFAULT_SCAN_CHANGES_SCOPE.unstaged,
      granularity: normalizeGranularity(stored.granularity),
    };
  }

  /**
   * Rejects a scope with neither side selected rather than storing it. A
   * setting that silently disables its own feature is a support ticket.
   */
  public async setScope(next: Partial<ScanChangesScope>): Promise<void> {
    const current = this.getScope();
    const merged: ScanChangesScope = {
      staged: next.staged ?? current.staged,
      unstaged: next.unstaged ?? current.unstaged,
      granularity: normalizeGranularity(
        next.granularity ?? current.granularity,
      ),
    };

    if (!merged.staged && !merged.unstaged) {
      throw new Error(
        "Select at least one of Staged or Unstaged — a scan with neither has nothing to look at.",
      );
    }

    await this.context.workspaceState.update(
      STORAGE_KEY_SCAN_CHANGES_SCOPE,
      merged,
    );
  }
}

function normalizeGranularity(value: unknown): ScanGranularity {
  return value === "lines" ? "lines" : "files";
}
