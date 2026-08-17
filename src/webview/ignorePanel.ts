import * as vscode from "vscode";
import { getWebviewHtml } from "./templateLoader";
import { MESSAGE_COMMANDS } from "../constants";
import { IgnoreManager } from "../scanner/ignoreManager";

export class IgnorePanel {
  public static currentPanel: IgnorePanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private readonly _context: vscode.ExtensionContext;
  private readonly _ignoreManager: IgnoreManager;
  private _disposables: vscode.Disposable[] = [];
  private _isWebviewReady = false;

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    context: vscode.ExtensionContext,
    ignoreManager: IgnoreManager,
  ) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._context = context;
    this._ignoreManager = ignoreManager;

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case MESSAGE_COMMANDS.WEBVIEW_READY:
            this._isWebviewReady = true;
            this.updateIgnoreList();
            return;
          case MESSAGE_COMMANDS.REMOVE_FILE_IGNORE:
            this._ignoreManager.removeFileIgnore(message.filePath as string);
            this.updateIgnoreList();
            return;
          case MESSAGE_COMMANDS.REMOVE_METHOD_IGNORE:
            this._ignoreManager.removeMethodIgnore(
              message.filePath as string,
              message.methodName as string,
            );
            this.updateIgnoreList();
            return;
          case MESSAGE_COMMANDS.ADD_FILE_PATTERN:
            {
              const pattern = message.pattern as string;
              const success = this._ignoreManager.addFilePattern(pattern);
              if (success) {
                this.updateIgnoreList();
                vscode.window.showInformationMessage(
                  `File pattern added: ${pattern}`,
                );
              } else {
                vscode.window.showErrorMessage("Invalid regex pattern");
              }
            }
            return;
          case MESSAGE_COMMANDS.ADD_METHOD_PATTERN:
            {
              const pattern = message.pattern as string;
              const success = this._ignoreManager.addMethodPattern(pattern);
              if (success) {
                this.updateIgnoreList();
                vscode.window.showInformationMessage(
                  `Method pattern added: ${pattern}`,
                );
              } else {
                vscode.window.showErrorMessage("Invalid regex pattern");
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
            vscode.window.showInformationMessage("All ignore rules cleared");
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
      console.error("Failed to initialize ignore panel webview:", error);
    }
  }

  public static createOrShow(
    extensionUri: vscode.Uri,
    context: vscode.ExtensionContext,
    ignoreManager: IgnoreManager,
  ): void {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (IgnorePanel.currentPanel) {
      IgnorePanel.currentPanel._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      "deprecatedTrackerIgnore",
      "Deprecated Tracker - Ignore Management",
      column || vscode.ViewColumn.Two,
      {
        enableScripts: true,
        // Same reason as MainPanel: without this the tab is rebuilt from
        // scratch every time it returns to the foreground.
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, "out", "src", "webview", "assets"),
        ],
      },
    );

    panel.iconPath = {
      light: vscode.Uri.joinPath(extensionUri, "media", "scan-changes-light.svg"),
      dark: vscode.Uri.joinPath(extensionUri, "media", "scan-changes-dark.svg"),
    };

    IgnorePanel.currentPanel = new IgnorePanel(
      panel,
      extensionUri,
      context,
      ignoreManager,
    );
  }

  private updateIgnoreList(): void {
    if (!this._isWebviewReady) {
      return;
    }
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
    this._isWebviewReady = false;
    this._panel.webview.html = await this._getHtmlForWebview(webview);
  }

  private async _getHtmlForWebview(webview: vscode.Webview): Promise<string> {
    return getWebviewHtml(webview, this._extensionUri, this._context, "ignore");
  }
}
