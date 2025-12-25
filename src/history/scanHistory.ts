import { randomUUID } from "crypto";
import * as vscode from "vscode";
import {
  DEFAULT_HISTORY_RETENTION,
  STORAGE_KEY_SCAN_HISTORY,
} from "../constants";
import {
  DeprecatedItem,
  HistoricalScan,
  ScanHistoryConfig,
  ScanMetadata,
} from "../interfaces";

export class ScanHistory {
  private readonly context: vscode.ExtensionContext;
  private config: ScanHistoryConfig;

  constructor(
    context: vscode.ExtensionContext,
    config?: Partial<ScanHistoryConfig>,
  ) {
    this.context = context;
    this.config = {
      maxScans: config?.maxScans ?? DEFAULT_HISTORY_RETENTION,
      enabled: config?.enabled ?? true,
    };
  }

  public async saveScan(
    results: DeprecatedItem[],
    duration: number,
    fileCount?: number,
  ): Promise<string> {
    if (!this.config.enabled) {
      return "";
    }

    const scanId = randomUUID();
    const timestamp = Date.now();

    const declarationCount = results.filter(
      (item) => item.kind !== "usage",
    ).length;
    const usageCount = results.filter((item) => item.kind === "usage").length;

    const metadata: ScanMetadata = {
      scanId,
      timestamp,
      totalItems: results.length,
      declarationCount,
      usageCount,
      duration,
      fileCount,
    };

    const historicalScan: HistoricalScan = {
      metadata,
      results,
    };

    const history = await this.getHistory();
    history.unshift(historicalScan);

    await this.cleanup(history);

    await this.context.workspaceState.update(STORAGE_KEY_SCAN_HISTORY, history);

    return scanId;
  }

  public async getHistory(limit?: number): Promise<HistoricalScan[]> {
    const stored =
      this.context.workspaceState.get<HistoricalScan[]>(
        STORAGE_KEY_SCAN_HISTORY,
      ) || [];

    if (limit && limit > 0) {
      return stored.slice(0, limit);
    }

    return stored;
  }

  public async getScanById(scanId: string): Promise<HistoricalScan | null> {
    const history = await this.getHistory();
    const scan = history.find((h) => h.metadata.scanId === scanId);
    return scan || null;
  }

  public async deleteScan(scanId: string): Promise<boolean> {
    const history = await this.getHistory();
    const initialLength = history.length;
    const filtered = history.filter((h) => h.metadata.scanId !== scanId);

    if (filtered.length === initialLength) {
      return false;
    }

    await this.context.workspaceState.update(
      STORAGE_KEY_SCAN_HISTORY,
      filtered,
    );
    return true;
  }

  public async clearHistory(): Promise<void> {
    await this.context.workspaceState.update(STORAGE_KEY_SCAN_HISTORY, []);
  }

  public async getHistoryMetadata(limit?: number): Promise<ScanMetadata[]> {
    const history = await this.getHistory(limit);
    return history.map((h) => h.metadata);
  }

  private async cleanup(history: HistoricalScan[]): Promise<void> {
    if (history.length > this.config.maxScans) {
      history.splice(this.config.maxScans);
    }
  }

  public getConfig(): ScanHistoryConfig {
    return { ...this.config };
  }

  public updateConfig(config: Partial<ScanHistoryConfig>): void {
    this.config = {
      ...this.config,
      ...config,
    };
  }
}
