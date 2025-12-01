import { DeprecatedItemKind } from './deprecated-item.interface';

export interface DeprecationStatistics {
  totalItems: number;
  totalDeclarations: number;
  totalUsages: number;
  byKind: Record<DeprecatedItemKind, number>;
  topMostUsed: Array<{
    name: string;
    filePath: string;
    fileName: string;
    usageCount: number;
  }>;
  hotspotFiles: Array<{
    fileName: string;
    filePath: string;
    count: number;
  }>;
  quickWins: Array<{
    name: string;
    filePath: string;
    fileName: string;
    usageCount: number;
  }>;
  needsAttention: Array<{
    name: string;
    filePath: string;
    fileName: string;
    kind: DeprecatedItemKind;
  }>;
}
