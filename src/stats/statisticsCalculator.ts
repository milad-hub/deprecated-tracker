import { DeprecatedItem } from "../interfaces/deprecated-item.interface";
import { DeprecationStatistics } from "../interfaces/statistics.interface";

export class StatisticsCalculator {
  /**
   * Calculate comprehensive statistics from deprecated items
   */
  public calculateStatistics(items: DeprecatedItem[]): DeprecationStatistics {
    const totalItems = items.length;
    const totalUsages = items.filter((item) => item.kind === "usage").length;
    const totalDeclarations = totalItems - totalUsages;

    const usageMap = this.buildUsageMap(items);
    const byKind = this.calculateByKind(items);
    const topMostUsed = this.calculateTopMostUsed(usageMap);
    const hotspotFiles = this.calculateHotspotFiles(items);
    const quickWins = this.calculateQuickWins(usageMap);
    const needsAttention = this.calculateNeedsAttention(items);

    return {
      totalItems,
      totalDeclarations,
      totalUsages,
      byKind,
      topMostUsed,
      hotspotFiles,
      quickWins,
      needsAttention,
    };
  }

  /**
   * Calculate count of deprecated items by kind (excluding usages)
   */
  private calculateByKind(
    items: DeprecatedItem[],
  ): Record<DeprecatedItem["kind"], number> {
    const byKind: Record<DeprecatedItem["kind"], number> = {
      method: 0,
      property: 0,
      class: 0,
      interface: 0,
      function: 0,
      usage: 0,
    };

    items.forEach((item) => {
      // Only count declaration types, not usages
      if (item.kind !== "usage" && item.kind in byKind) {
        byKind[item.kind]++;
      }
    });

    return byKind;
  }

  /**
   * Group usages by their deprecated declaration.
   */
  private buildUsageMap(
    items: DeprecatedItem[],
  ): Map<
    string,
    { name: string; filePath: string; fileName: string; count: number }
  > {
    const usageMap = new Map<
      string,
      { name: string; filePath: string; fileName: string; count: number }
    >();

    for (const item of items) {
      if (item.kind !== "usage" || !item.deprecatedDeclaration) {
        continue;
      }
      const decl = item.deprecatedDeclaration;
      const key = `${decl.name}|${decl.filePath}`;
      const entry = usageMap.get(key);
      if (entry) {
        entry.count++;
      } else {
        usageMap.set(key, {
          name: decl.name,
          filePath: decl.filePath,
          fileName: decl.fileName,
          count: 1,
        });
      }
    }

    return usageMap;
  }

  /**
   * Calculate top 10 most-used deprecated items based on usage count
   */
  private calculateTopMostUsed(
    usageMap: Map<
      string,
      { name: string; filePath: string; fileName: string; count: number }
    >,
  ): Array<{
    name: string;
    filePath: string;
    fileName: string;
    usageCount: number;
  }> {
    return Array.from(usageMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map((item) => ({
        name: item.name,
        filePath: item.filePath,
        fileName: item.fileName,
        usageCount: item.count,
      }));
  }

  /**
   * Calculate files with most deprecated items (hotspots)
   */
  private calculateHotspotFiles(
    items: DeprecatedItem[],
  ): Array<{ fileName: string; filePath: string; count: number }> {
    const fileMap = new Map<string, { fileName: string; count: number }>();

    items.forEach((item) => {
      const filePath = item.filePath;
      if (fileMap.has(filePath)) {
        fileMap.get(filePath)!.count++;
      } else {
        fileMap.set(filePath, {
          fileName: item.fileName,
          count: 1,
        });
      }
    });

    // Convert to array and sort by count (descending), take top 10
    const sorted = Array.from(fileMap.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)
      .map(([filePath, data]) => ({
        fileName: data.fileName,
        filePath,
        count: data.count,
      }));

    return sorted;
  }

  /**
   * Calculate quick wins - deprecated items with low usage count (≤2 usages)
   */
  private calculateQuickWins(
    usageMap: Map<
      string,
      { name: string; filePath: string; fileName: string; count: number }
    >,
  ): Array<{
    name: string;
    filePath: string;
    fileName: string;
    usageCount: number;
  }> {
    return Array.from(usageMap.values())
      .filter((item) => item.count <= 2)
      .sort((a, b) => a.count - b.count)
      .slice(0, 10)
      .map((item) => ({
        name: item.name,
        filePath: item.filePath,
        fileName: item.fileName,
        usageCount: item.count,
      }));
  }

  /**
   * Calculate items needing attention - those without deprecation reasons
   */
  private calculateNeedsAttention(items: DeprecatedItem[]): Array<{
    name: string;
    filePath: string;
    fileName: string;
    kind: DeprecatedItem["kind"];
  }> {
    // Get declarations without deprecation reasons
    const needsAttention = items
      .filter((item) => item.kind !== "usage" && !item.deprecationReason)
      .slice(0, 10)
      .map((item) => ({
        name: item.name,
        filePath: item.filePath,
        fileName: item.fileName,
        kind: item.kind,
      }));

    return needsAttention;
  }
}
