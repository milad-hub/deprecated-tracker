import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { MESSAGE_COMMANDS } from '../constants';
import { DeprecationStatistics } from '../interfaces';

export class StatisticsPanel {
  public static currentPanel: StatisticsPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private readonly _context: vscode.ExtensionContext;
  private _disposables: vscode.Disposable[] = [];

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    context: vscode.ExtensionContext
  ) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._context = context;

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case MESSAGE_COMMANDS.OPEN_FILE_AT_LINE:
            if (message.filePath && typeof message.line === 'number') {
              await this.openFileAtLine(message.filePath as string, message.line as number);
            }
            return;
        }
      },
      null,
      this._disposables
    );

    this._initializeWebview();
  }

  private async _initializeWebview(): Promise<void> {
    try {
      await this._update();
    } catch (error) {
      console.error('Failed to initialize statistics panel webview:', error);
    }
  }

  public static createOrShow(
    extensionUri: vscode.Uri,
    context: vscode.ExtensionContext,
    statistics: DeprecationStatistics
  ): void {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (StatisticsPanel.currentPanel) {
      StatisticsPanel.currentPanel._panel.reveal(column);
      StatisticsPanel.currentPanel.updateStatistics(statistics);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'deprecatedTrackerStatistics',
      'Deprecated Tracker - Statistics Dashboard',
      column || vscode.ViewColumn.Two,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'out', 'src', 'webview', 'assets')],
      }
    );

    StatisticsPanel.currentPanel = new StatisticsPanel(panel, extensionUri, context);
    StatisticsPanel.currentPanel.updateStatistics(statistics);
  }

  public updateStatistics(statistics: DeprecationStatistics): void {
    this._panel.webview.postMessage({
      command: MESSAGE_COMMANDS.UPDATE_STATISTICS,
      statistics,
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
    this._panel.webview.html = await this._getHtmlForWebview(webview);
  }

  private async _getHtmlForWebview(webview: vscode.Webview): Promise<string> {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'out', 'src', 'webview', 'assets', 'statistics.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'out', 'src', 'webview', 'assets', 'style.css')
    );

    const htmlContent = await this._loadTemplate(webview);

    return htmlContent
      .replace(/{{cspSource}}/g, webview.cspSource)
      .replace(/{{scriptUri}}/g, scriptUri.toString())
      .replace(/{{styleUri}}/g, styleUri.toString());
  }

  private async _loadTemplate(webview: vscode.Webview): Promise<string> {
    const compiledTemplateUri = vscode.Uri.joinPath(
      this._extensionUri,
      'out',
      'src',
      'webview',
      'assets',
      'statistics.html'
    );
    const sourceTemplatePath = path.join(
      this._context.extensionPath,
      'src',
      'webview',
      'assets',
      'statistics.html'
    );

    try {
      const fileData = await vscode.workspace.fs.readFile(compiledTemplateUri);
      return new TextDecoder().decode(fileData);
    } catch (error) {
      console.warn('Failed to load template using VS Code API:', error);
    }

    try {
      return fs.readFileSync(compiledTemplateUri.fsPath, 'utf8');
    } catch (error) {
      console.warn('Failed to load template from compiled path:', error);
    }

    try {
      return fs.readFileSync(sourceTemplatePath, 'utf8');
    } catch (error) {
      console.error('Failed to load template from all paths:', error);
      return this._getFallbackHtml(webview);
    }
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
                      <div class="error-title">Failed to load statistics HTML template</div>
                      <div class="error-message">Please check the extension installation and try again.</div>
                  </div>
              </body>
            </html>`;
  }
}
