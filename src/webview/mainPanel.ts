import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { TagsManager } from "../config/tagsManager";
import {
  ERROR_MESSAGES,
  MESSAGE_COMMANDS,
  STORAGE_KEY_FILTER_STATE,
} from "../constants";
import { ResultExporter } from "../exporter";
import { ScanHistory } from "../history";
import { DeprecatedItem, Scanner } from "../scanner";
import { IgnoreManager } from "../scanner/ignoreManager";
import { IgnorePanel } from "./ignorePanel";

export class MainPanel {
  public static currentPanel: MainPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private readonly _context: vscode.ExtensionContext;
  private _disposables: vscode.Disposable[] = [];
  private _scanner: Scanner;
  private _ignoreManager: IgnoreManager;
  private _tagsManager: TagsManager;
  private _currentResults: DeprecatedItem[] = [];
  private _scanHistory: ScanHistory;
  private _exporter: ResultExporter;

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    context: vscode.ExtensionContext,
    scanHistory: ScanHistory,
  ) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._context = context;
    this._ignoreManager = new IgnoreManager(context);
    this._tagsManager = new TagsManager(context);
    this._scanner = new Scanner(this._ignoreManager, this._tagsManager);
    this._scanHistory = scanHistory;
    this._exporter = new ResultExporter();

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case MESSAGE_COMMANDS.WEBVIEW_READY:
            this._panel.webview.postMessage({
              command: MESSAGE_COMMANDS.RESULTS,
              results: this._currentResults,
            });
            return;
          case MESSAGE_COMMANDS.OPEN_FILE:
            await this.openFile(message.filePath as string);
            return;
          case MESSAGE_COMMANDS.OPEN_FILE_AT_LINE:
            await this.openFileAtLine(
              message.filePath as string,
              message.line as number,
            );
            return;
          case MESSAGE_COMMANDS.IGNORE_METHOD:
            this.ignoreMethod(
              message.filePath as string,
              message.methodName as string,
            );
            return;
          case MESSAGE_COMMANDS.IGNORE_FILE:
            this.ignoreFile(message.filePath as string);
            return;
          case MESSAGE_COMMANDS.REFRESH_RESULTS:
            await this.handleRefresh();
            return;
          case MESSAGE_COMMANDS.SAVE_FILTER_STATE:
            this._saveFilterState(
              message.nameFilter,
              message.fileFilter,
              message.usageCountFilter || 0,
              message.regexEnabled || false,
            );
            return;
          case MESSAGE_COMMANDS.SHOW_IGNORE_MANAGER:
            IgnorePanel.createOrShow(this._extensionUri, this._context);
            return;
          case MESSAGE_COMMANDS.OPEN_SETTINGS:
            await vscode.commands.executeCommand(
              "deprecatedTracker.openSettings",
            );
            return;
          case MESSAGE_COMMANDS.VIEW_HISTORY:
            await this.handleViewHistory();
            return;
          case MESSAGE_COMMANDS.VIEW_SCAN:
            await this.handleViewScan(message.scanId as string);
            return;
          case MESSAGE_COMMANDS.EXPORT_HISTORICAL_SCAN:
            await this.handleExportHistoricalScan(
              message.scanId as string,
              message.format as string,
            );
            return;
          case MESSAGE_COMMANDS.CLEAR_HISTORY:
            await this.handleClearHistory();
            return;
        }
      },
      null,
      this._disposables,
    );

    this._initializeWebview();
  }

  private async _initializeWebview(): Promise<void> {
    try {
      await this._update();
    } catch (error) {
      console.error("Failed to initialize webview:", error);
    }
  }

  public static createOrShow(
    extensionUri: vscode.Uri,
    context: vscode.ExtensionContext,
    scanHistory: ScanHistory,
  ): MainPanel {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (MainPanel.currentPanel) {
      MainPanel.currentPanel.reveal(column);
      return MainPanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      "deprecatedTracker",
      "Deprecated Tracker",
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: false,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, "out", "src", "webview", "assets"),
        ],
      },
    );

    MainPanel.currentPanel = new MainPanel(
      panel,
      extensionUri,
      context,
      scanHistory,
    );
    return MainPanel.currentPanel;
  }

  public reveal(column?: vscode.ViewColumn): void {
    this._panel.reveal(column);

    this._panel.webview.postMessage({
      command: MESSAGE_COMMANDS.RESULTS,
      results: this._currentResults,
    });
  }

  public static getCurrentResults(): DeprecatedItem[] | undefined {
    return MainPanel.currentPanel?._currentResults;
  }

  public updateResults(results: DeprecatedItem[]): void {
    this._currentResults = results;
    this._panel.webview.postMessage({
      command: MESSAGE_COMMANDS.RESULTS,
      results: this._currentResults,
    });
  }

  public async performScan(): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showErrorMessage(ERROR_MESSAGES.NO_WORKSPACE);
      return;
    }

    const startTime = Date.now();
    try {
      this._panel.webview.postMessage({
        command: MESSAGE_COMMANDS.SCANNING,
        scanning: true,
      });
      const results = await this._scanner.scanProject(workspaceFolder);
      const duration = Date.now() - startTime;

      this._currentResults = results;

      await this._scanHistory.saveScan(results, duration);

      this._panel.webview.postMessage({
        command: MESSAGE_COMMANDS.RESULTS,
        results,
      });
      this._panel.webview.postMessage({
        command: MESSAGE_COMMANDS.SCANNING,
        scanning: false,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : ERROR_MESSAGES.UNKNOWN_ERROR;
      vscode.window.showErrorMessage(
        `${ERROR_MESSAGES.SCAN_FAILED}: ${errorMessage}`,
      );
      this._panel.webview.postMessage({
        command: MESSAGE_COMMANDS.SCANNING,
        scanning: false,
      });
    }
  }

  private async handleRefresh(): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showErrorMessage(ERROR_MESSAGES.NO_WORKSPACE);
      return;
    }

    if (!this._currentResults || this._currentResults.length === 0) {
      vscode.window.showInformationMessage(
        "No results to refresh. Please run a scan first.",
      );
      return;
    }

    try {
      this._panel.webview.postMessage({
        command: MESSAGE_COMMANDS.SCANNING,
        scanning: true,
      });

      const uniqueFilePaths = [
        ...new Set(this._currentResults.map((item) => item.filePath)),
      ];

      const results = await this._scanner.scanSpecificFiles(
        workspaceFolder,
        uniqueFilePaths,
        () => {
          this._panel.webview.postMessage({
            command: MESSAGE_COMMANDS.SCANNING,
            scanning: true,
          });
        },
      );

      this._currentResults = results;
      this._panel.webview.postMessage({
        command: MESSAGE_COMMANDS.RESULTS,
        results,
      });
      this._panel.webview.postMessage({
        command: MESSAGE_COMMANDS.SCANNING,
        scanning: false,
      });

      vscode.window.showInformationMessage("Results refreshed successfully.");
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : ERROR_MESSAGES.UNKNOWN_ERROR;
      vscode.window.showErrorMessage(`Refresh failed: ${errorMessage}`);
      this._panel.webview.postMessage({
        command: MESSAGE_COMMANDS.SCANNING,
        scanning: false,
      });
    }
  }

  private ignoreMethod(filePath: string, methodName: string): void {
    this._ignoreManager.ignoreMethod(filePath, methodName);
    this._currentResults = this._currentResults.filter((item) => {
      const isDirectMatch = item.name === methodName && item.kind !== "usage";
      const isUsageOfIgnored =
        item.kind === "usage" &&
        item.deprecatedDeclaration &&
        item.deprecatedDeclaration.name === methodName;
      const isUsageByNameOnly =
        item.kind === "usage" &&
        !item.deprecatedDeclaration &&
        item.name === methodName;

      return !isDirectMatch && !isUsageOfIgnored && !isUsageByNameOnly;
    });
    this._panel.webview.postMessage({
      command: MESSAGE_COMMANDS.RESULTS,
      results: this._currentResults,
    });
    vscode.commands.executeCommand(
      "deprecatedTracker.updateTreeView",
      this._currentResults,
    );
    vscode.window.showInformationMessage(`Ignored method: ${methodName}`);
  }

  private ignoreFile(filePath: string): void {
    this._ignoreManager.ignoreFile(filePath);
    this._currentResults = this._currentResults.filter((item) => {
      const isDirectMatch = item.filePath === filePath;
      const isUsageOfIgnoredDecl =
        item.kind === "usage" &&
        item.deprecatedDeclaration &&
        item.deprecatedDeclaration.filePath === filePath;
      return !isDirectMatch && !isUsageOfIgnoredDecl;
    });
    this._panel.webview.postMessage({
      command: MESSAGE_COMMANDS.RESULTS,
      results: this._currentResults,
    });
    vscode.commands.executeCommand(
      "deprecatedTracker.updateTreeView",
      this._currentResults,
    );
    vscode.window.showInformationMessage(
      `Ignored file: ${path.basename(filePath)}`,
    );
  }

  private async openFile(filePath: string): Promise<void> {
    const uri = vscode.Uri.file(filePath);
    await vscode.window.showTextDocument(uri);
  }

  private async openFileAtLine(filePath: string, line: number): Promise<void> {
    const uri = vscode.Uri.file(filePath);
    const document = await vscode.window.showTextDocument(uri);
    const position = new vscode.Position(line - 1, 0);
    const selection = new vscode.Selection(position, position);
    document.selection = selection;
    vscode.window.activeTextEditor?.revealRange(
      selection,
      vscode.TextEditorRevealType.InCenter,
    );
  }

  private _saveFilterState(
    nameFilter: string,
    fileFilter: string,
    usageCountFilter: number,
    regexEnabled: boolean,
  ): void {
    this._context.workspaceState.update(STORAGE_KEY_FILTER_STATE, {
      nameFilter,
      fileFilter,
      usageCountFilter,
      regexEnabled,
    });
  }

  private _restoreFilterState(): {
    nameFilter: string;
    fileFilter: string;
    usageCountFilter: number;
    regexEnabled: boolean;
  } {
    try {
      const savedState = this._context.workspaceState.get<{
        nameFilter: string;
        fileFilter: string;
        usageCountFilter?: number;
        regexEnabled?: boolean;
      }>(STORAGE_KEY_FILTER_STATE);
      return {
        nameFilter: savedState?.nameFilter || "",
        fileFilter: savedState?.fileFilter || "",
        usageCountFilter: savedState?.usageCountFilter || 0,
        regexEnabled: savedState?.regexEnabled || false,
      };
    } catch {
      return {
        nameFilter: "",
        fileFilter: "",
        usageCountFilter: 0,
        regexEnabled: false,
      };
    }
  }

  private async handleViewHistory(): Promise<void> {
    try {
      const metadata = await this._scanHistory.getHistoryMetadata(20);

      this._panel.webview.postMessage({
        command: "historyMetadata",
        history: metadata,
      });
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to load history: ${error}`);
    }
  }

  private async handleViewScan(scanId: string): Promise<void> {
    try {
      const scan = await this._scanHistory.getScanById(scanId);

      if (!scan) {
        vscode.window.showWarningMessage("Scan not found in history.");
        return;
      }

      this._panel.webview.postMessage({
        command: MESSAGE_COMMANDS.RESULTS,
        results: scan.results,
        viewOnly: true,
      });
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to load scan: ${error}`);
    }
  }

  private async handleExportHistoricalScan(
    scanId: string,
    format: string,
  ): Promise<void> {
    try {
      const scan = await this._scanHistory.getScanById(scanId);

      if (!scan) {
        vscode.window.showWarningMessage("Scan not found in history.");
        return;
      }

      const extension = format;
      const timestamp = new Date(scan.metadata.timestamp)
        .toISOString()
        .split("T")[0];
      const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(
          `deprecated-items-${timestamp}.${extension}`,
        ),
        filters: {
          [format.toUpperCase()]: [extension],
        },
      });

      if (!uri) {
        return;
      }

      let content: string;

      switch (format) {
        case "csv":
          content = this._exporter.exportToCSV(scan.results);
          break;
        case "json":
          content = this._exporter.exportToJSON(scan.results);
          break;
        case "markdown":
          content = this._exporter.exportToMarkdown(scan.results);
          break;
        default:
          throw new Error(`Unsupported format: ${format}`);
      }

      await this._exporter.saveToFile(content, uri.fsPath);
      vscode.window.showInformationMessage(
        `Historical scan exported successfully to ${uri.fsPath}`,
      );
    } catch (error) {
      vscode.window.showErrorMessage(`Export failed: ${error}`);
    }
  }

  private async handleClearHistory(): Promise<void> {
    const confirmed = await vscode.window.showWarningMessage(
      "Are you sure you want to clear all scan history? This cannot be undone.",
      { modal: true },
      "Clear History",
    );

    if (confirmed === "Clear History") {
      try {
        await this._scanHistory.clearHistory();
        vscode.window.showInformationMessage(
          "Scan history cleared successfully.",
        );

        this._panel.webview.postMessage({
          command: "historyData",
          history: [],
        });
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to clear history: ${error}`);
      }
    }
  }

  private async handleExport(format: string): Promise<void> {
    try {
      if (!this._currentResults || this._currentResults.length === 0) {
        vscode.window.showWarningMessage(
          "No deprecated items to export. Please run a scan first.",
        );
        return;
      }

      const extension = format;
      const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(`deprecated-items.${extension}`),
        filters: {
          [format.toUpperCase()]: [extension],
        },
      });

      if (!uri) {
        return;
      }

      const { ResultExporter } = await import("../exporter");
      const exporter = new ResultExporter();
      let content: string;

      switch (format) {
        case "csv":
          content = exporter.exportToCSV(this._currentResults);
          break;
        case "json":
          content = exporter.exportToJSON(this._currentResults);
          break;
        case "markdown":
          content = exporter.exportToMarkdown(this._currentResults);
          break;
        default:
          throw new Error(`Unsupported format: ${format}`);
      }

      await exporter.saveToFile(content, uri.fsPath);
      vscode.window.showInformationMessage(
        `Results exported successfully to ${uri.fsPath}`,
      );
    } catch (error) {
      vscode.window.showErrorMessage(`Export failed: ${error}`);
    }
  }

  public dispose(): void {
    MainPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }

  private async _update() {
    const webview = this._panel.webview;
    this._panel.webview.html = await this._getHtmlForWebview(webview);
  }

  private async _getHtmlForWebview(webview: vscode.Webview): Promise<string> {
    const filterState = this._restoreFilterState();
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this._extensionUri,
        "out",
        "src",
        "webview",
        "assets",
        "main.js",
      ),
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this._extensionUri,
        "out",
        "src",
        "webview",
        "assets",
        "style.css",
      ),
    );

    const htmlContent = await this._loadTemplate(webview);

    return htmlContent
      .replace(/{{cspSource}}/g, webview.cspSource)
      .replace(/{{scriptUri}}/g, scriptUri.toString())
      .replace(/{{styleUri}}/g, styleUri.toString())
      .replace(/{{nameFilter}}/g, this._escapeHtml(filterState.nameFilter))
      .replace(/{{fileFilter}}/g, this._escapeHtml(filterState.fileFilter))
      .replace(
        /{{usageCountFilter}}/g,
        filterState.usageCountFilter.toString(),
      );
  }

  private async _loadTemplate(webview: vscode.Webview): Promise<string> {
    const compiledTemplateUri = vscode.Uri.joinPath(
      this._extensionUri,
      "out",
      "src",
      "webview",
      "assets",
      "main.html",
    );
    const sourceTemplatePath = path.join(
      this._context.extensionPath,
      "src",
      "webview",
      "assets",
      "main.html",
    );

    try {
      const fileData = await vscode.workspace.fs.readFile(compiledTemplateUri);
      return new TextDecoder().decode(fileData);
    } catch (error) {
      console.warn("Failed to load template using VS Code API:", error);
    }

    try {
      return fs.readFileSync(compiledTemplateUri.fsPath, "utf8");
    } catch (error) {
      console.warn("Failed to load template from compiled path:", error);
    }

    try {
      return fs.readFileSync(sourceTemplatePath, "utf8");
    } catch (error) {
      console.error("Failed to load template from all paths:", error);
      return this._getFallbackHtml(webview);
    }
  }

  private _escapeHtml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  private _getFallbackHtml(webview: vscode.Webview): string {
    return `<!DOCTYPE html>
            <html lang="en">
              <head>
                  <meta charset="UTF-8">
                  <meta name="viewport" content="width=device-width, initial-scale=1.0">
                  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src ${webview.cspSource};"/>
                  <title>Deprecated Tracker - Error</title>
                  <style>
                      body { font-family: var(--vscode-font-family); background-color: var(--vscode-editor-background); color: var(--vscode-foreground); padding: 20px; }
                      .error-container { text-align: center; margin-top: 50px; }
                      .error-title { color: var(--vscode-errorForeground); font-size: 18px; margin-bottom: 10px; }
                      .error-message { color: var(--vscode-descriptionForeground); }
                  </style>
              </head>
              <body>
                  <div class="error-container">
                      <div class="error-title">Failed to load main HTML template</div>
                      <div class="error-message">Please check the extension installation and try again.</div>
                  </div>
              </body>
            </html>`;
  }
}
