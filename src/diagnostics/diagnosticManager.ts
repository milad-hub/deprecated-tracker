import * as vscode from "vscode";
import {
  DIAGNOSTIC_CODE_DEPRECATED_USAGE,
  DIAGNOSTIC_SOURCE,
} from "../constants";
import { DeprecatedItem } from "../interfaces";

export class DiagnosticManager {
  private diagnosticCollection: vscode.DiagnosticCollection;

  constructor() {
    this.diagnosticCollection =
      vscode.languages.createDiagnosticCollection("deprecatedTracker");
  }

  public updateDiagnostics(results: DeprecatedItem[]): void {
    this.diagnosticCollection.clear();

    const diagnosticsByFile = new Map<string, vscode.Diagnostic[]>();

    for (const item of results) {
      // Only show usages in diagnostics, not declarations
      if (item.kind !== "usage") continue;

      const diagnostic = this.createDiagnostic(item);

      const fileDiagnostics = diagnosticsByFile.get(item.filePath) || [];
      fileDiagnostics.push(diagnostic);
      diagnosticsByFile.set(item.filePath, fileDiagnostics);
    }

    for (const [filePath, diagnostics] of diagnosticsByFile) {
      const uri = vscode.Uri.file(filePath);
      this.diagnosticCollection.set(uri, diagnostics);
    }
  }

  private createDiagnostic(item: DeprecatedItem): vscode.Diagnostic {
    const character = Math.max(0, item.character - 1);
    // Prefer the span the scanner measured; item.name can be the declaration's
    // name rather than the source text, so its length is not a reliable width.
    const endCharacter =
      item.endCharacter !== undefined && item.endCharacter - 1 > character
        ? item.endCharacter - 1
        : character + item.name.length;
    const range = new vscode.Range(
      item.line - 1,
      character,
      item.line - 1,
      endCharacter,
    );

    const deprecatedName = item.deprecatedDeclaration?.name || item.name;
    let message = `'${deprecatedName}' is deprecated`;
    if (item.deprecationReason) {
      message += `: ${item.deprecationReason}`;
    }

    const severity = this.mapSeverity(item.severity);

    const diagnostic = new vscode.Diagnostic(range, message, severity);
    diagnostic.source = DIAGNOSTIC_SOURCE;
    diagnostic.code = DIAGNOSTIC_CODE_DEPRECATED_USAGE;

    const declaration = item.deprecatedDeclaration;
    if (declaration) {
      const at = new vscode.Position(declaration.line - 1, 0);
      diagnostic.relatedInformation = [
        new vscode.DiagnosticRelatedInformation(
          new vscode.Location(
            vscode.Uri.file(declaration.filePath),
            new vscode.Range(at, at),
          ),
          `'${declaration.name}' is declared here`,
        ),
      ];
    }

    return diagnostic;
  }

  private mapSeverity(configSeverity?: string): vscode.DiagnosticSeverity {
    switch (configSeverity) {
      case "error":
        return vscode.DiagnosticSeverity.Error;
      case "warning":
        return vscode.DiagnosticSeverity.Warning;
      case "info":
        return vscode.DiagnosticSeverity.Information;
      default:
        return vscode.DiagnosticSeverity.Warning;
    }
  }

  public clear(): void {
    this.diagnosticCollection.clear();
  }

  public dispose(): void {
    this.diagnosticCollection.dispose();
  }
}
