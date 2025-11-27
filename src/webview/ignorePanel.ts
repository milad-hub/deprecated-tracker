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

    this._update();
    this.updateIgnoreList();
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

  private _update(): void {
    const webview = this._panel.webview;
    this._panel.webview.html = this._getHtmlForWebview(webview);
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'out', 'src', 'webview', 'assets', 'ignore.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'out', 'src', 'webview', 'assets', 'style.css')
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src ${webview.cspSource};">
    <link href="${styleUri}" rel="stylesheet">
    <title>Ignore Management</title>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Ignore Management</h1>
            <button id="clearAllBtn" class="btn btn-danger">Clear All</button>
        </div>

        <div class="tabs">
            <button class="tab-btn active" data-tab="ignore-tab">Ignore Management</button>
            <button class="tab-btn" data-tab="patterns-tab">Regex Patterns</button>
        </div>
        
        <div id="ignore-tab" class="tab-content active">
            <div class="section">
                <h2>Ignored Methods</h2>
                <div id="methodsSection">
                    <ul id="methodsList"></ul>
                </div>
            </div>
        </div>

        <div id="patterns-tab" class="tab-content">
            <div class="section">
                <h2>Regex Patterns</h2>
                <p class="section-description">Use regular expressions to ignore files and methods by pattern.</p>
                
                <div class="pattern-section">
                    <h3>File Patterns</h3>
                    <div class="pattern-input-group">
                        <input type="text" id="filePatternInput" placeholder="e.g., .*\.test\.ts$ or .*/node_modules/.*" class="pattern-input">
                        <button id="addFilePatternBtn" class="btn btn-primary">Add Pattern</button>
                    </div>
                    <div class="pattern-hint">Examples: <code>.*\.test\.ts$</code> (test files), <code>.*/dist/.*</code> (dist folder)</div>
                    <ul id="filePatternsList" class="patterns-list"></ul>
                </div>
                
                <div class="pattern-section">
                    <h3>Method Patterns</h3>
                    <div class="pattern-input-group">
                        <input type="text" id="methodPatternInput" placeholder="e.g., ^_private.* or .*Internal$" class="pattern-input">
                        <button id="addMethodPatternBtn" class="btn btn-primary">Add Pattern</button>
                    </div>
                    <div class="pattern-hint">Examples: <code>^_.*</code> (private methods), <code>.*Internal$</code> (internal methods)</div>
                    <ul id="methodPatternsList" class="patterns-list"></ul>
                </div>
            </div>
        </div>
    </div>
    <script src="${scriptUri}"></script>
</body>
</html>`;
  }
}
