import * as path from "path";
import * as vscode from "vscode";
import { getWebviewHtml } from "./templateLoader";
import {
  ERROR_MESSAGES,
  MESSAGE_COMMANDS,
  STORAGE_KEY_FILTER_STATE,
} from "../constants";
import { ResultExporter } from "../exporter";
import { ScanHistory } from "../history";
import { DeprecatedItem, Scanner } from "../scanner";
import { IgnoreManager } from "../scanner/ignoreManager";

type FilterState = {
  nameFilter: string;
  fileFilter: string;
  reasonFilter: string;
};

export class MainPanel {
  public static currentPanel: MainPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private readonly _context: vscode.ExtensionContext;
  private _disposables: vscode.Disposable[] = [];
  private _getScanner: () => Scanner;
  private _ignoreManager: IgnoreManager;
  private _currentResults: DeprecatedItem[] = [];
  private _scanHistory: ScanHistory;
  private _exporter: ResultExporter;

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    context: vscode.ExtensionContext,
    scanHistory: ScanHistory,
    ignoreManager: IgnoreManager,
    getScanner: () => Scanner,
  ) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._context = context;
    this._ignoreManager = ignoreManager;
    this._getScanner = getScanner;
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
          case MESSAGE_COMMANDS.EXPORT_RESULTS:
            await this.handleExport(message.format as string);
            return;
          case MESSAGE_COMMANDS.SAVE_FILTER_STATE:
            this._saveFilterState(
              message.nameFilter,
              message.fileFilter,
              message.reasonFilter,
            );
            return;
          case MESSAGE_COMMANDS.SHOW_IGNORE_MANAGER:
            this._sendIgnoreList();
            return;
          case MESSAGE_COMMANDS.REMOVE_FILE_IGNORE:
            this._ignoreManager.removeFileIgnore(message.filePath as string);
            this._sendIgnoreList();
            return;
          case MESSAGE_COMMANDS.REMOVE_METHOD_IGNORE:
            this._ignoreManager.removeMethodIgnore(
              message.filePath as string,
              message.methodName as string,
            );
            this._sendIgnoreList();
            return;
          case MESSAGE_COMMANDS.ADD_FILE_PATTERN:
            this._addIgnorePattern("file", message.pattern as string);
            return;
          case MESSAGE_COMMANDS.ADD_METHOD_PATTERN:
            this._addIgnorePattern("method", message.pattern as string);
            return;
          case MESSAGE_COMMANDS.REMOVE_FILE_PATTERN:
            this._ignoreManager.removeFilePattern(message.pattern as string);
            this._sendIgnoreList();
            return;
          case MESSAGE_COMMANDS.REMOVE_METHOD_PATTERN:
            this._ignoreManager.removeMethodPattern(message.pattern as string);
            this._sendIgnoreList();
            return;
          case MESSAGE_COMMANDS.CLEAR_ALL:
            this._ignoreManager.clearAll();
            this._sendIgnoreList();
            vscode.window.showInformationMessage("All ignore rules cleared");
            return;
          case MESSAGE_COMMANDS.OPEN_SETTINGS:
            await vscode.commands.executeCommand(
              "deprecatedTracker.openSettings",
            );
            return;
          case MESSAGE_COMMANDS.VIEW_HISTORY:
            await this.handleViewHistory(message.limit as number | undefined);
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
    ignoreManager: IgnoreManager,
    getScanner: () => Scanner,
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
      ignoreManager,
      getScanner,
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

  private async handleRefresh(): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      vscode.window.showErrorMessage(ERROR_MESSAGES.NO_WORKSPACE);
      return;
    }

    if (!this._currentResults || this._currentResults.length === 0) {
      vscode.window.showInformationMessage(
        "No results to refresh. Please run a scan first.",
      );
      return;
    }

    this._ignoreManager.reload();
    try {
      this._panel.webview.postMessage({
        command: MESSAGE_COMMANDS.SCANNING,
        scanning: true,
      });

      const uniqueFilePaths = [
        ...new Set(this._currentResults.map((item) => item.filePath)),
      ];

      const results = await this._getScanner().scanWorkspaceFiles(
        workspaceFolders.map((folder) => folder.uri.fsPath),
        uniqueFilePaths,
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
      vscode.commands.executeCommand(
        "deprecatedTracker.updateTreeView",
        results,
      );

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

  private _sendIgnoreList(): void {
    this._panel.webview.postMessage({
      command: MESSAGE_COMMANDS.UPDATE_IGNORE_LIST,
      rules: this._ignoreManager.getAllRules(),
    });
  }

  private _addIgnorePattern(kind: "file" | "method", pattern: string): void {
    const added =
      kind === "file"
        ? this._ignoreManager.addFilePattern(pattern)
        : this._ignoreManager.addMethodPattern(pattern);

    if (!added) {
      vscode.window.showErrorMessage("Invalid regex pattern");
      return;
    }

    this._sendIgnoreList();
    vscode.window.showInformationMessage(
      `${kind === "file" ? "File" : "Method"} pattern added: ${pattern}`,
    );
  }

  private ignoreMethod(filePath: string, methodName: string): void {
    this._ignoreManager.ignoreMethod(filePath, methodName);
    this._currentResults = this._currentResults.filter((item) => {
      const isDirectMatch =
        item.filePath === filePath &&
        item.name === methodName &&
        item.kind !== "usage";
      const isUsageOfIgnored =
        item.kind === "usage" &&
        item.deprecatedDeclaration &&
        item.deprecatedDeclaration.filePath === filePath &&
        item.deprecatedDeclaration.name === methodName;

      return !isDirectMatch && !isUsageOfIgnored;
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
    const editor = await vscode.window.showTextDocument(uri);
    const position = new vscode.Position(line - 1, 0);
    const selection = new vscode.Selection(position, position);
    editor.selection = selection;
    vscode.window.activeTextEditor?.revealRange(
      selection,
      vscode.TextEditorRevealType.InCenter,
    );
  }

  private _saveFilterState(
    nameFilter: string,
    fileFilter: string,
    reasonFilter: string,
  ): void {
    this._context.workspaceState.update(STORAGE_KEY_FILTER_STATE, {
      nameFilter,
      fileFilter,
      reasonFilter,
    });
  }

  private _restoreFilterState(): FilterState {
    try {
      const savedState =
        this._context.workspaceState.get<Partial<FilterState>>(
          STORAGE_KEY_FILTER_STATE,
        );
      return {
        nameFilter: savedState?.nameFilter || "",
        fileFilter: savedState?.fileFilter || "",
        reasonFilter: savedState?.reasonFilter || "",
      };
    } catch {
      return { nameFilter: "", fileFilter: "", reasonFilter: "" };
    }
  }

  private async handleViewHistory(requestedLimit?: number): Promise<void> {
    try {
      const limit =
        typeof requestedLimit === "number" &&
        Number.isFinite(requestedLimit) &&
        requestedLimit > 0
          ? Math.floor(requestedLimit)
          : 10;
      const metadata = await this._scanHistory.getHistoryMetadata(limit + 1);

      this._panel.webview.postMessage({
        command: "historyMetadata",
        history: metadata.slice(0, limit),
        hasMore: metadata.length > limit,
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

      if (scan.results.length < scan.metadata.totalItems) {
        vscode.window.showWarningMessage(
          `Showing ${scan.results.length} of ${scan.metadata.totalItems} stored scan results.`,
        );
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

      if (scan.results.length < scan.metadata.totalItems) {
        vscode.window.showWarningMessage(
          `Export contains ${scan.results.length} of ${scan.metadata.totalItems} stored scan results.`,
        );
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

      await this._exporter.saveToFile(
        this._exporter.export(scan.results, format),
        uri.fsPath,
      );
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
          command: "historyMetadata",
          history: [],
          hasMore: false,
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

      await this._exporter.saveToFile(
        this._exporter.export(this._currentResults, format),
        uri.fsPath,
      );
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
    return getWebviewHtml(webview, this._extensionUri, this._context, "main", {
      nameFilter: this._escapeHtml(filterState.nameFilter),
      fileFilter: this._escapeHtml(filterState.fileFilter),
      reasonFilter: this._escapeHtml(filterState.reasonFilter),
    });
  }

  private _escapeHtml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
}
