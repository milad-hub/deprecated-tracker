/**
 * Whether a changed-files scan reports everything in the modified files or only
 * the rows inside changed hunks. Mutually exclusive, so a radio pair rather
 * than a checkbox in the settings page.
 */
export type ScanGranularity = "files" | "lines";

export interface ScanChangesScope {
  staged: boolean;
  unstaged: boolean;
  granularity: ScanGranularity;
}

export interface ChangedLineRange {
  start: number;
  end: number;
}
