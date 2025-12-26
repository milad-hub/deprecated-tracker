import { DeprecatedItem } from "./deprecated-item.interface";

export interface ScanMetadata {
  scanId: string;
  timestamp: number;
  totalItems: number;
  declarationCount: number;
  usageCount: number;
  duration: number;
  fileCount?: number;
}

export interface HistoricalScan {
  metadata: ScanMetadata;
  results: DeprecatedItem[];
}

export interface ScanHistoryConfig {
  maxScans: number;
  enabled: boolean;
}
