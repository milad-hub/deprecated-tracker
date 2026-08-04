import { writeFile } from "fs/promises";
import { DeprecatedItem } from "../interfaces";

export type ExportFormat = "csv" | "json" | "markdown";

export class ResultExporter {
  public export(results: DeprecatedItem[], format: string): string {
    switch (format) {
      case "csv":
        return this.exportToCSV(results);
      case "json":
        return this.exportToJSON(results);
      case "markdown":
        return this.exportToMarkdown(results);
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }

  public exportToCSV(results: DeprecatedItem[]): string {
    const headers = [
      "Name",
      "File",
      "Line",
      "Column",
      "Kind",
      "Declaration File",
      "Declaration Line",
      "Urgency",
      "Since",
      "Removal",
      "Deprecation Reason",
    ];
    const rows = results.map((item) => {
      const declarationFile = item.deprecatedDeclaration?.filePath || "";
      const declarationLine = item.deprecatedDeclaration?.line.toString() || "";

      return [
        this.escapeCsvValue(item.name),
        this.escapeCsvValue(item.fileName),
        item.line.toString(),
        item.character.toString(),
        item.kind,
        this.escapeCsvValue(declarationFile),
        declarationLine,
        item.deprecationSchedule?.urgency || "",
        this.escapeCsvValue(this.formatSince(item)),
        this.escapeCsvValue(this.formatRemoval(item)),
        this.escapeCsvValue(item.deprecationReason || ""),
      ].join(",");
    });

    return [headers.join(","), ...rows].join("\n");
  }

  public exportToJSON(results: DeprecatedItem[]): string {
    return JSON.stringify(results, null, 2);
  }

  public exportToMarkdown(results: DeprecatedItem[]): string {
    const totalItems = results.length;
    const usageCount = results.filter((r) => r.kind === "usage").length;
    const declarationCount = totalItems - usageCount;

    let markdown = "# Deprecated Items Report\n\n";
    markdown += `**Generated**: ${new Date().toLocaleString()}\n\n`;
    markdown += `## Summary\n\n`;
    markdown += `- **Total Items**: ${totalItems}\n`;
    markdown += `- **Declarations**: ${declarationCount}\n`;
    markdown += `- **Usages**: ${usageCount}\n\n`;

    if (results.length === 0) {
      markdown += "*No deprecated items found.*\n";
      return markdown;
    }

    markdown += `## Items\n\n`;
    markdown += `| Name | File | Line | Kind | Declaration | Urgency | Removal | Reason |\n`;
    markdown += `|------|------|------|------|-------------|---------|---------|--------|\n`;

    results.forEach((item) => {
      const declaration = item.deprecatedDeclaration
        ? `${item.deprecatedDeclaration.fileName}`
        : "-";
      const reason = item.deprecationReason
        ? item.deprecationReason.substring(0, 50) +
          (item.deprecationReason.length > 50 ? "..." : "")
        : "-";

      const urgency = item.deprecationSchedule?.urgency || "-";
      const removal = this.formatRemoval(item) || "-";

      markdown += `| ${this.escapeMarkdownCell(item.name)} | ${this.escapeMarkdownCell(item.fileName)} | ${item.line} | ${this.escapeMarkdownCell(item.kind)} | ${this.escapeMarkdownCell(declaration)} | ${this.escapeMarkdownCell(urgency)} | ${this.escapeMarkdownCell(removal)} | ${this.escapeMarkdownCell(reason)} |\n`;
    });

    return markdown;
  }

  public async saveToFile(content: string, filePath: string): Promise<void> {
    await writeFile(filePath, content, "utf8");
  }

  private formatSince(item: DeprecatedItem): string {
    const schedule = item.deprecationSchedule;
    return schedule?.sinceVersion || schedule?.sinceDate || "";
  }

  private formatRemoval(item: DeprecatedItem): string {
    const schedule = item.deprecationSchedule;
    return schedule?.removalVersion || schedule?.removalDate || "";
  }

  private escapeCsvValue(value: string): string {
    const safeValue = /^[=+\-@]/.test(value) ? `'${value}` : value;
    if (
      safeValue.includes(",") ||
      safeValue.includes('"') ||
      safeValue.includes("\n") ||
      safeValue.includes("\r")
    ) {
      return `"${safeValue.replace(/"/g, '""')}"`;
    }
    return safeValue;
  }

  private escapeMarkdownCell(value: string): string {
    return value
      .replace(/\\/g, "\\\\")
      .replace(/\|/g, "\\|")
      .replace(/\r\n|\r|\n/g, "<br>");
  }
}
