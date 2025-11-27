import * as fs from 'fs';
import { DeprecatedItem } from '../interfaces';

export type ExportFormat = 'csv' | 'json' | 'markdown';

export class ResultExporter {
  public exportToCSV(results: DeprecatedItem[]): string {
    const headers = [
      'Name',
      'File',
      'Line',
      'Column',
      'Kind',
      'Declaration File',
      'Declaration Line',
      'Deprecation Reason',
    ];
    const rows = results.map((item) => {
      const declarationInfo = item.deprecatedDeclaration ? item.deprecatedDeclaration.fileName : '';

      return [
        this.escapeCsvValue(item.name),
        this.escapeCsvValue(item.fileName),
        item.line.toString(),
        item.character.toString(),
        item.kind,
        this.escapeCsvValue(declarationInfo),
        '',
        this.escapeCsvValue(item.deprecationReason || ''),
      ].join(',');
    });

    return [headers.join(','), ...rows].join('\n');
  }

  public exportToJSON(results: DeprecatedItem[]): string {
    return JSON.stringify(results, null, 2);
  }

  public exportToMarkdown(results: DeprecatedItem[]): string {
    const totalItems = results.length;
    const usageCount = results.filter((r) => r.kind === 'usage').length;
    const declarationCount = totalItems - usageCount;

    let markdown = '# Deprecated Items Report\n\n';
    markdown += `**Generated**: ${new Date().toLocaleString()}\n\n`;
    markdown += `## Summary\n\n`;
    markdown += `- **Total Items**: ${totalItems}\n`;
    markdown += `- **Declarations**: ${declarationCount}\n`;
    markdown += `- **Usages**: ${usageCount}\n\n`;

    if (results.length === 0) {
      markdown += '*No deprecated items found.*\n';
      return markdown;
    }

    markdown += `## Items\n\n`;
    markdown += `| Name | File | Line | Kind | Declaration | Reason |\n`;
    markdown += `|------|------|------|------|-------------|--------|\n`;

    results.forEach((item) => {
      const declaration = item.deprecatedDeclaration
        ? `${item.deprecatedDeclaration.fileName}`
        : '-';
      const reason = item.deprecationReason
        ? item.deprecationReason.substring(0, 50) +
          (item.deprecationReason.length > 50 ? '...' : '')
        : '-';

      markdown += `| ${item.name} | ${item.fileName} | ${item.line} | ${item.kind} | ${declaration} | ${reason} |\n`;
    });

    return markdown;
  }

  public async saveToFile(content: string, filePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      fs.writeFile(filePath, content, 'utf8', (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  private escapeCsvValue(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }
}
