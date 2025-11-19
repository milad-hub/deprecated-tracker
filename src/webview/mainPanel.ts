import * as path from "path";
import * as vscode from "vscode";
import { ERROR_MESSAGES, MESSAGE_COMMANDS } from "../constants";
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
  private _currentResults: DeprecatedItem[] = [];

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    context: vscode.ExtensionContext,
  ) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._context = context;
    this._ignoreManager = new IgnoreManager(context);
    this._scanner = new Scanner(this._ignoreManager);

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case "webviewReady":
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
          case MESSAGE_COMMANDS.SHOW_IGNORE_MANAGER:
            IgnorePanel.createOrShow(this._extensionUri, this._context);
            return;
        }
      },
      null,
      this._disposables,
    );

    this._update();
  }

  public static createOrShow(
    extensionUri: vscode.Uri,
    context: vscode.ExtensionContext,
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
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, "out", "src", "webview", "assets"),
        ],
      },
    );

    MainPanel.currentPanel = new MainPanel(panel, extensionUri, context);
    return MainPanel.currentPanel;
  }

  public reveal(column?: vscode.ViewColumn): void {
    this._panel.reveal(column);

    this._panel.webview.postMessage({
      command: MESSAGE_COMMANDS.RESULTS,
      results: this._currentResults,
    });
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

    try {
      this._panel.webview.postMessage({
        command: MESSAGE_COMMANDS.SCANNING,
        scanning: true,
      });
      const results = await this._scanner.scanProject(workspaceFolder);
      this._currentResults = results;
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

  private _update() {
    const webview = this._panel.webview;
    this._panel.webview.html = this._getHtmlForWebview(webview);
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
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

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src ${webview.cspSource};">
    <link href="${styleUri}" rel="stylesheet">
    <title>Deprecated Tracker</title>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Deprecated Tracker</h1>
            <div class="controls">
                <button id="ignoreManagerBtn" class="btn btn-secondary">Manage Ignores</button>
            </div>
        </div>
        <div id="status" class="status"></div>
        <div id="results" class="results">
            <table id="resultsTable">
                <thead>
                    <tr>
                        <th>
                            Deprecated Name
                            <input type="text" id="nameFilter" placeholder="Filter..." class="column-filter">
                        </th>
                        <th>
                            File Name
                            <input type="text" id="fileFilter" placeholder="Filter..." class="column-filter">
                        </th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody id="resultsBody">
                </tbody>
            </table>
        </div>
    </div>
    <script src="${scriptUri}"></script>
</body>
</html>`;
  }
}