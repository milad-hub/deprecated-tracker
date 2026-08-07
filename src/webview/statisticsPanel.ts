import * as vscode from "vscode";
import { getWebviewHtml } from "./templateLoader";
import { MESSAGE_COMMANDS } from "../constants";
import { DeprecationStatistics, ScanMetadata } from "../interfaces";

export class StatisticsPanel {
  public static currentPanel: StatisticsPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private readonly _context: vscode.ExtensionContext;
  private _disposables: vscode.Disposable[] = [];
  private _statistics: DeprecationStatistics;
  private _trend: ScanMetadata[];
  private _isWebviewReady = false;

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    context: vscode.ExtensionContext,
    statistics: DeprecationStatistics,
    trend: ScanMetadata[],
  ) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._context = context;
    this._statistics = statistics;
    this._trend = trend;

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case MESSAGE_COMMANDS.WEBVIEW_READY:
            this._isWebviewReady = true;
            this.updateStatistics(this._statistics, this._trend);
            return;
          case MESSAGE_COMMANDS.OPEN_FILE_AT_LINE:
            if (message.filePath && typeof message.line === "number") {
              await this.openFileAtLine(
                message.filePath as string,
                message.line as number,
              );
            }
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
      console.error("Failed to initialize statistics panel webview:", error);
    }
  }

  public static createOrShow(
    extensionUri: vscode.Uri,
    context: vscode.ExtensionContext,
    statistics: DeprecationStatistics,
    trend: ScanMetadata[] = [],
  ): void {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (StatisticsPanel.currentPanel) {
      StatisticsPanel.currentPanel._panel.reveal(column);
      StatisticsPanel.currentPanel.updateStatistics(statistics, trend);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      "deprecatedTrackerStatistics",
      "Deprecated Tracker - Statistics Dashboard",
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, "out", "src", "webview", "assets"),
        ],
      },
    );

    StatisticsPanel.currentPanel = new StatisticsPanel(
      panel,
      extensionUri,
      context,
      statistics,
      trend,
    );
  }

  public updateStatistics(
    statistics: DeprecationStatistics,
    trend: ScanMetadata[] = [],
  ): void {
    this._statistics = statistics;
    this._trend = trend;
    if (!this._isWebviewReady) {
      return;
    }
    this._panel.webview.postMessage({
      command: MESSAGE_COMMANDS.UPDATE_STATISTICS,
      statistics,
      trend,
    });
  }

  private async openFileAtLine(filePath: string, line: number): Promise<void> {
    const document = await vscode.workspace.openTextDocument(filePath);
    const editor = await vscode.window.showTextDocument(document);
    const position = new vscode.Position(line - 1, 0);
    editor.selection = new vscode.Selection(position, position);
    editor.revealRange(new vscode.Range(position, position));
  }

  public dispose(): void {
    StatisticsPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }

  private async _update(): Promise<void> {
    const webview = this._panel.webview;
    this._isWebviewReady = false;
    this._panel.webview.html = await this._getHtmlForWebview(webview);
  }

  private async _getHtmlForWebview(webview: vscode.Webview): Promise<string> {
    return getWebviewHtml(
      webview,
      this._extensionUri,
      this._context,
      "statistics",
    );
  }
}
