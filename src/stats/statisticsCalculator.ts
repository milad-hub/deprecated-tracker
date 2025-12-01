import { DeprecatedItem } from '../interfaces/deprecated-item.interface';
import { DeprecationStatistics } from '../interfaces/statistics.interface';

export class StatisticsCalculator {
  /**
   * Calculate comprehensive statistics from deprecated items
   */
  public calculateStatistics(items: DeprecatedItem[]): DeprecationStatistics {
    const totalItems = items.length;
    const declarations = items.filter((item) => item.kind !== 'usage');
    const usages = items.filter((item) => item.kind === 'usage');
    const totalDeclarations = declarations.length;
    const totalUsages = usages.length;

    const byKind = this.calculateByKind(items);
    const topMostUsed = this.calculateTopMostUsed(items);
    const hotspotFiles = this.calculateHotspotFiles(items);
    const quickWins = this.calculateQuickWins(items);
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
  private calculateByKind(items: DeprecatedItem[]): Record<string, number> {
    const byKind: Record<string, number> = {
      method: 0,
      property: 0,
      class: 0,
      interface: 0,
      function: 0,
    };

    items.forEach((item) => {
      // Only count declaration types, not usages
      if (item.kind !== 'usage' && item.kind in byKind) {
        byKind[item.kind]++;
      }
    });

    return byKind;
  }

  /**
   * Calculate top 10 most-used deprecated items based on usage count
   */
  private calculateTopMostUsed(items: DeprecatedItem[]): Array<{
    name: string;
    filePath: string;
    fileName: string;
    usageCount: number;
  }> {
    // Group usages by deprecated declaration
    const usageMap = new Map<
      string,
      { name: string; filePath: string; fileName: string; count: number }
    >();

    items
      .filter((item) => item.kind === 'usage' && item.deprecatedDeclaration)
      .forEach((item) => {
        const decl = item.deprecatedDeclaration!;
        const key = `${decl.name}|${decl.filePath}`;

        if (usageMap.has(key)) {
          usageMap.get(key)!.count++;
        } else {
          usageMap.set(key, {
            name: decl.name,
            filePath: decl.filePath,
            fileName: decl.fileName,
            count: 1,
          });
        }
      });

    // Convert to array and sort by usage count (descending)
    const sorted = Array.from(usageMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map((item) => ({
        name: item.name,
        filePath: item.filePath,
        fileName: item.fileName,
        usageCount: item.count,
      }));

    return sorted;
  }

  /**
   * Calculate files with most deprecated items (hotspots)
   */
  private calculateHotspotFiles(
    items: DeprecatedItem[]
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
  private calculateQuickWins(items: DeprecatedItem[]): Array<{
    name: string;
    filePath: string;
    fileName: string;
    usageCount: number;
  }> {
    // Group usages by deprecated declaration
    const usageMap = new Map<
      string,
      { name: string; filePath: string; fileName: string; count: number }
    >();

    items
      .filter((item) => item.kind === 'usage')
      .forEach((item) => {
        let key: string;
        let name: string;
        let filePath: string;
        let fileName: string;

        if (item.deprecatedDeclaration) {
          const decl = item.deprecatedDeclaration;
          key = `${decl.name}|${decl.filePath}`;
          name = decl.name;
          filePath = decl.filePath;
          fileName = decl.fileName;
        } else {
          // Fallback for usages without resolved declaration
          key = `${item.name}|unknown`;
          name = item.name;
          filePath = '';
          fileName = 'Unknown (External)';
        }

        if (usageMap.has(key)) {
          usageMap.get(key)!.count++;
        } else {
          usageMap.set(key, {
            name,
            filePath,
            fileName,
            count: 1,
          });
        }
      });

    // Filter items with 2 or fewer usages and sort
    const quickWins = Array.from(usageMap.values())
      .filter((item) => item.count <= 2)
      .sort((a, b) => a.count - b.count)
      .slice(0, 10)
      .map((item) => ({
        name: item.name,
        filePath: item.filePath,
        fileName: item.fileName,
        usageCount: item.count,
      }));

    return quickWins;
  }

  /**
   * Calculate items needing attention - those without deprecation reasons
   */
  private calculateNeedsAttention(items: DeprecatedItem[]): Array<{
    name: string;
    filePath: string;
    fileName: string;
    kind: DeprecatedItem['kind'];
  }> {
    // Get declarations without deprecation reasons
    const needsAttention = items
      .filter((item) => item.kind !== 'usage' && !item.deprecationReason)
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
