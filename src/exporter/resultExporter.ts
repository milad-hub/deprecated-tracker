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
    markdown += `| Name | File | Line | Kind | Declaration |\n`;
    markdown += `|------|------|------|------|-------------|\n`;

    results.forEach((item) => {
      const declaration = item.deprecatedDeclaration
        ? `${item.deprecatedDeclaration.fileName}`
        : '-';

      markdown += `| ${item.name} | ${item.fileName} | ${item.line} | ${item.kind} | ${declaration} |\n`;
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
