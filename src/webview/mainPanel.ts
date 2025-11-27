import * as path from 'path';
import * as vscode from 'vscode';
import { ERROR_MESSAGES, MESSAGE_COMMANDS, STORAGE_KEY_FILTER_STATE } from '../constants';
import { DeprecatedItem, Scanner } from '../scanner';
import { IgnoreManager } from '../scanner/ignoreManager';
import { IgnorePanel } from './ignorePanel';

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
    context: vscode.ExtensionContext
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
            await this.openFileAtLine(message.filePath as string, message.line as number);
            return;
          case MESSAGE_COMMANDS.IGNORE_METHOD:
            this.ignoreMethod(message.filePath as string, message.methodName as string);
            return;
          case MESSAGE_COMMANDS.IGNORE_FILE:
            this.ignoreFile(message.filePath as string);
            return;
          case MESSAGE_COMMANDS.SHOW_IGNORE_MANAGER:
            IgnorePanel.createOrShow(this._extensionUri, this._context);
            return;
          case MESSAGE_COMMANDS.SAVE_FILTER_STATE:
            this._saveFilterState(message.nameFilter as string, message.fileFilter as string);
            return;
          case MESSAGE_COMMANDS.EXPORT_RESULTS:
            await this.handleExport(message.format as string);
            return;
          case MESSAGE_COMMANDS.REFRESH_RESULTS:
            await this.handleRefresh();
            return;
        }
      },
      null,
      this._disposables
    );

    this._update();
  }

  public static createOrShow(
    extensionUri: vscode.Uri,
    context: vscode.ExtensionContext
  ): MainPanel {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (MainPanel.currentPanel) {
      MainPanel.currentPanel.reveal(column);
      return MainPanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      'deprecatedTracker',
      'Deprecated Tracker',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: false,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'out', 'src', 'webview', 'assets')],
      }
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
      const errorMessage = error instanceof Error ? error.message : ERROR_MESSAGES.UNKNOWN_ERROR;
      vscode.window.showErrorMessage(`${ERROR_MESSAGES.SCAN_FAILED}: ${errorMessage}`);
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
      vscode.window.showInformationMessage('No results to refresh. Please run a scan first.');
      return;
    }

    try {
      this._panel.webview.postMessage({
        command: MESSAGE_COMMANDS.SCANNING,
        scanning: true,
      });

      const uniqueFilePaths = [...new Set(this._currentResults.map((item) => item.filePath))];

      const results = await this._scanner.scanSpecificFiles(
        workspaceFolder,
        uniqueFilePaths,
        () => {
          this._panel.webview.postMessage({
            command: MESSAGE_COMMANDS.SCANNING,
            scanning: true,
          });
        }
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

      vscode.window.showInformationMessage('Results refreshed successfully.');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : ERROR_MESSAGES.UNKNOWN_ERROR;
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
      const isDirectMatch = item.name === methodName && item.kind !== 'usage';
      const isUsageOfIgnored =
        item.kind === 'usage' &&
        item.deprecatedDeclaration &&
        item.deprecatedDeclaration.name === methodName;
      const isUsageByNameOnly =
        item.kind === 'usage' && !item.deprecatedDeclaration && item.name === methodName;

      return !isDirectMatch && !isUsageOfIgnored && !isUsageByNameOnly;
    });
    this._panel.webview.postMessage({
      command: MESSAGE_COMMANDS.RESULTS,
      results: this._currentResults,
    });
    vscode.commands.executeCommand('deprecatedTracker.updateTreeView', this._currentResults);
    vscode.window.showInformationMessage(`Ignored method: ${methodName}`);
  }

  private ignoreFile(filePath: string): void {
    this._ignoreManager.ignoreFile(filePath);
    this._currentResults = this._currentResults.filter((item) => {
      const isDirectMatch = item.filePath === filePath;
      const isUsageOfIgnoredDecl =
        item.kind === 'usage' &&
        item.deprecatedDeclaration &&
        item.deprecatedDeclaration.filePath === filePath;
      return !isDirectMatch && !isUsageOfIgnoredDecl;
    });
    this._panel.webview.postMessage({
      command: MESSAGE_COMMANDS.RESULTS,
      results: this._currentResults,
    });
    vscode.commands.executeCommand('deprecatedTracker.updateTreeView', this._currentResults);
    vscode.window.showInformationMessage(`Ignored file: ${path.basename(filePath)}`);
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
    vscode.window.activeTextEditor?.revealRange(selection, vscode.TextEditorRevealType.InCenter);
  }

  private _saveFilterState(nameFilter: string, fileFilter: string): void {
    this._context.workspaceState.update(STORAGE_KEY_FILTER_STATE, {
      nameFilter,
      fileFilter,
    });
  }

  private _restoreFilterState(): { nameFilter: string; fileFilter: string } {
    try {
      const savedState = this._context.workspaceState.get<{
        nameFilter: string;
        fileFilter: string;
      }>(STORAGE_KEY_FILTER_STATE);
      return savedState || { nameFilter: '', fileFilter: '' };
    } catch {
      // If state retrieval fails, return empty filters
      return { nameFilter: '', fileFilter: '' };
    }
  }

  private async handleExport(format: string): Promise<void> {
    try {
      if (!this._currentResults || this._currentResults.length === 0) {
        vscode.window.showWarningMessage('No deprecated items to export. Please run a scan first.');
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

      const { ResultExporter } = await import('../exporter');
      const exporter = new ResultExporter();
      let content: string;

      switch (format) {
        case 'csv':
          content = exporter.exportToCSV(this._currentResults);
          break;
        case 'json':
          content = exporter.exportToJSON(this._currentResults);
          break;
        case 'markdown':
          content = exporter.exportToMarkdown(this._currentResults);
          break;
        default:
          throw new Error(`Unsupported format: ${format}`);
      }

      await exporter.saveToFile(content, uri.fsPath);
      vscode.window.showInformationMessage(`Results exported successfully to ${uri.fsPath}`);
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

  private _update() {
    const webview = this._panel.webview;
    this._panel.webview.html = this._getHtmlForWebview(webview);
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    const filterState = this._restoreFilterState();
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'out', 'src', 'webview', 'assets', 'main.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'out', 'src', 'webview', 'assets', 'style.css')
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src ${webview.cspSource};"/>
    <link href="${styleUri}" rel="stylesheet">
    <title>Deprecated Tracker</title>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Deprecated Tracker</h1>
            <div class="controls">
                <div class="dropdown">
                    <button id="exportBtn" class="btn btn-primary">Export ▼</button>
                    <div id="exportMenu" class="dropdown-menu">
                        <a href="#" data-format="csv">Export as CSV</a>
                        <a href="#" data-format="json">Export as JSON</a>
                        <a href="#" data-format="markdown">Export as Markdown</a>
                    </div>
                </div>
                <button id="ignoreManagerBtn" class="btn btn-primary">Manage Ignores</button>
            </div>
        </div>
        <div id="status" class="status"></div>
        <div id="results" class="results">
            <table id="resultsTable">
                <thead>
                    <tr>
                        <th>
                            Deprecated Name
                            <input type="text" id="nameFilter" placeholder="Filter..." class="column-filter" value="${this._escapeHtml(filterState.nameFilter)}">
                        </th>
                        <th>
                            File Name
                            <input type="text" id="fileFilter" placeholder="Filter..." class="column-filter" value="${this._escapeHtml(filterState.fileFilter)}">
                        </th>
                        <th>Reason</th>
                        <th>Action</th>
                        <th class="refresh-header">
                            <button id="refreshBtn" class="btn btn-primary btn-small btn-icon" title="Update results (rescan changed files)">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M17.651 7.65a7.131 7.131 0 0 0-12.68 3.15M18.001 4v4h-4m-7.652 8.35a7.13 7.13 0 0 0 12.68-3.15M6 20v-4h4"/>
                                </svg>
                            </button>
                        </th>
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

  private _escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
