import { DeprecatedItem } from "./deprecated-item.interface";

/**
 * How much of the workspace a scan covered. Only `"project"` scans belong on
 * the trend chart — plotting a one-file scan beside a full one makes the line
 * fall off a cliff for a reason that has nothing to do with the codebase.
 * Entries recorded before this field existed read as `undefined` and are
 * treated as `"project"`, which is what they mostly were.
 */
export type ScanScopeKind = "project" | "folder" | "file" | "changed";

export interface ScanMetadata {
  scanId: string;
  timestamp: number;
  totalItems: number;
  declarationCount: number;
  usageCount: number;
  duration: number;
  fileCount?: number;
  scope?: ScanScopeKind;
}

export interface HistoricalScan {
  metadata: ScanMetadata;
  results: DeprecatedItem[];
}

export interface ScanHistoryConfig {
  maxScans: number;
  enabled: boolean;
}
