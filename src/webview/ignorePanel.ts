import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { MESSAGE_COMMANDS } from '../constants';
import { IgnoreManager } from '../scanner/ignoreManager';

export class IgnorePanel {
  public static currentPanel: IgnorePanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private readonly _context: vscode.ExtensionContext;
  private readonly _ignoreManager: IgnoreManager;
  private _disposables: vscode.Disposable[] = [];

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    context: vscode.ExtensionContext
  ) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._context = context;
    this._ignoreManager = new IgnoreManager(context);

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case MESSAGE_COMMANDS.REMOVE_FILE_IGNORE:
            this._ignoreManager.removeFileIgnore(message.filePath as string);
            this.updateIgnoreList();
            return;
          case MESSAGE_COMMANDS.REMOVE_METHOD_IGNORE:
            this._ignoreManager.removeMethodIgnore(
              message.filePath as string,
              message.methodName as string
            );
            this.updateIgnoreList();
            return;
          case MESSAGE_COMMANDS.ADD_FILE_PATTERN:
            {
              const pattern = message.pattern as string;
              const success = this._ignoreManager.addFilePattern(pattern);
              if (success) {
                this.updateIgnoreList();
                vscode.window.showInformationMessage(`File pattern added: ${pattern}`);
              } else {
                vscode.window.showErrorMessage('Invalid regex pattern');
              }
            }
            return;
          case MESSAGE_COMMANDS.ADD_METHOD_PATTERN:
            {
              const pattern = message.pattern as string;
              const success = this._ignoreManager.addMethodPattern(pattern);
              if (success) {
                this.updateIgnoreList();
                vscode.window.showInformationMessage(`Method pattern added: ${pattern}`);
              } else {
                vscode.window.showErrorMessage('Invalid regex pattern');
              }
            }
            return;
          case MESSAGE_COMMANDS.REMOVE_FILE_PATTERN:
            this._ignoreManager.removeFilePattern(message.pattern as string);
            this.updateIgnoreList();
            return;
          case MESSAGE_COMMANDS.REMOVE_METHOD_PATTERN:
            this._ignoreManager.removeMethodPattern(message.pattern as string);
            this.updateIgnoreList();
            return;
          case MESSAGE_COMMANDS.CLEAR_ALL:
            this._ignoreManager.clearAll();
            this.updateIgnoreList();
            vscode.window.showInformationMessage('All ignore rules cleared');
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
      this.updateIgnoreList();
    } catch (error) {
      console.error('Failed to initialize ignore panel webview:', error);
    }
  }

  public static createOrShow(extensionUri: vscode.Uri, context: vscode.ExtensionContext): void {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (IgnorePanel.currentPanel) {
      IgnorePanel.currentPanel._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'deprecatedTrackerIgnore',
      'Deprecated Tracker - Ignore Management',
      column || vscode.ViewColumn.Two,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'out', 'src', 'webview', 'assets')],
      }
    );

    IgnorePanel.currentPanel = new IgnorePanel(panel, extensionUri, context);
  }

  private updateIgnoreList(): void {
    const rules = this._ignoreManager.getAllRules();
    this._panel.webview.postMessage({
      command: MESSAGE_COMMANDS.UPDATE_IGNORE_LIST,
      rules,
    });
  }

  public dispose(): void {
    IgnorePanel.currentPanel = undefined;
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
      vscode.Uri.joinPath(this._extensionUri, 'out', 'src', 'webview', 'assets', 'ignore.js')
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
      'ignore.html'
    );
    const sourceTemplatePath = path.join(
      this._context.extensionPath,
      'src',
      'webview',
      'assets',
      'ignore.html'
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
                      <div class="error-title">Failed to load ignore HTML template</div>
                      <div class="error-message">Please check the extension installation and try again.</div>
                  </div>
              </body>
            </html>`;
  }
}
