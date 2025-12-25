import * as vscode from "vscode";
import { TagsManager } from "../config/tagsManager";
import { DiagnosticManager } from "../diagnostics/diagnosticManager";
import { ScanHistory } from "../history";
import { DeprecatedTrackerConfig } from "../interfaces";
import { DeprecatedItem, Scanner } from "../scanner";
import { IgnoreManager } from "../scanner/ignoreManager";
import { MainPanel } from "../webview";

export class DeprecatedTrackerSidebarProvider
  implements vscode.WebviewViewProvider {
  public static readonly viewType = "deprecatedTrackerSidebar";
  private scanner: Scanner;
  private ignoreManager: IgnoreManager;
  private tagsManager: TagsManager;
  private diagnosticManager: DiagnosticManager;
  private currentResults: DeprecatedItem[] = [];
  private webviewView?: vscode.WebviewView;
  private context: vscode.ExtensionContext;

  constructor(
    context: vscode.ExtensionContext,
    config?: DeprecatedTrackerConfig,
  ) {
    this.context = context;
    this.ignoreManager = new IgnoreManager(context);
    this.tagsManager = new TagsManager(context);
    this.scanner = new Scanner(this.ignoreManager, this.tagsManager, config);
    this.diagnosticManager = new DiagnosticManager();

    context.subscriptions.push(this.diagnosticManager);

    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(
        DeprecatedTrackerSidebarProvider.viewType,
        this,
      ),
    );

    context.subscriptions.push(
      vscode.commands.registerCommand("deprecatedTracker.refresh", () => {
        this.refresh();
      }),
    );

    context.subscriptions.push(
      vscode.commands.registerCommand(
        "deprecatedTracker.openResults",
        (item?: DeprecatedItem) => {
          this.openResultsPanel(item);
        },
      ),
    );

    context.subscriptions.push(
      vscode.commands.registerCommand(
        "deprecatedTracker.updateTreeView",
        (results: DeprecatedItem[]) => {
          this.updateResults(results);
        },
      ),
    );
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this.webviewView = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      enableForms: false,
      enableCommandUris: false,
      localResourceRoots: [],
    };

    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case "scan":
          await this.scanProject();
          break;
        case "cancelScan":
          this.cancellationTokenSource?.cancel();
          break;
        case "openResults":
          await this.openResultsPanel();
          break;
        case "openSettings":
          vscode.commands.executeCommand("deprecatedTracker.openSettings");
          break;
        case "ignoreMethod":
          await this.ignoreMethod(message.filePath, message.methodName);
          break;
        case "ignoreFile":
          await this.ignoreFile(message.filePath);
          break;
        case "getHistory":
          const scanHistory = new ScanHistory(this.context);
          const metadata = await scanHistory.getHistoryMetadata(message.limit || 10);
          this.webviewView?.webview.postMessage({
            command: 'historyData',
            history: metadata
          });
          break;
        case "viewScan":
          const scanHistoryForView = new ScanHistory(this.context);
          const historicalScan = await scanHistoryForView.getScanById(message.scanId);
          if (historicalScan) {
            this.currentResults = historicalScan.results;
            await this.openResultsPanel();
          } else {
            vscode.window.showWarningMessage('Scan not found in history');
          }
          break;
        case "confirmClearHistory":
          const confirmed = await vscode.window.showWarningMessage(
            'Are you sure you want to clear all scan history? This action cannot be undone.',
            { modal: true },
            'Clear History'
          );
          if (confirmed === 'Clear History') {
            const scanHistoryForClear = new ScanHistory(this.context);
            await scanHistoryForClear.clearHistory();
            this.webviewView?.webview.postMessage({
              command: 'historyData',
              history: []
            });
            vscode.window.showInformationMessage('Scan history cleared');
          }
          break;
        case "clearHistory":
          const scanHistoryForClear = new ScanHistory(this.context);
          await scanHistoryForClear.clearHistory();
          // Refresh webview to update history display
          this.webviewView?.webview.postMessage({
            command: 'historyData',
            history: []
          });
          vscode.window.showInformationMessage('Scan history cleared');
          break;
      }
    });

    const html = this.getHtmlForWebview(webviewView.webview);
    webviewView.webview.html = html;

    setTimeout(async () => {
      const scanHistory = new ScanHistory(this.context);
      const metadata = await scanHistory.getHistoryMetadata(5);
      this.webviewView?.webview.postMessage({
        command: 'historyData',
        history: metadata
      });
    }, 500);

    webviewView.show?.(true);
  }

  private cancellationTokenSource?: vscode.CancellationTokenSource;

  public async scanProject(): Promise<void> {
    this.ignoreManager.reload();
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

    if (!workspaceFolder) {
      vscode.window.showErrorMessage("No workspace folder found");
      return;
    }

    this.cancellationTokenSource = new vscode.CancellationTokenSource();
    const scanStartTime = Date.now();

    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Scanning for deprecated items...",
          cancellable: true,
        },
        async (progress, token) => {
          token.onCancellationRequested(() => {
            this.cancellationTokenSource?.cancel();
          });

          progress.report({ increment: 0, message: "Initializing scan..." });
          if (this.webviewView) {
            this.webviewView.webview.postMessage({ command: "scanStarted" });
          }

          // Clear existing diagnostics
          this.diagnosticManager.clear();

          const results = await this.scanner.scanProject(
            workspaceFolder,
            (filePath: string, current: number, total: number) => {
              const percentage = Math.floor((current / total) * 100);
              progress.report({
                increment: percentage / total,
                message: `Scanning file ${current}/${total}...`,
              });
              if (this.webviewView) {
                this.webviewView.webview.postMessage({
                  command: "scanningFile",
                  filePath: filePath,
                  current: current,
                  total: total,
                });
              }
            },
            this.cancellationTokenSource?.token,
          );
          progress.report({ increment: 100, message: "Scan complete" });

          this.updateResults(results);

          // Update diagnostics with new results
          this.diagnosticManager.updateDiagnostics(results);

          // Save scan to history
          const scanDuration = Date.now() - scanStartTime;
          const scanHistory = new ScanHistory(this.context);
          await scanHistory.saveScan(results, scanDuration);

          const message =
            results.length > 0
              ? `Found ${results.length} deprecated item(s)`
              : "No deprecated items found";

          vscode.window.showInformationMessage(message);

          // Auto-open results panel after successful scan
          if (results.length > 0) {
            await this.openResultsPanel();
          }

          if (this.webviewView) {
            this.webviewView.webview.postMessage({
              command: "scanComplete",
              resultsCount: results.length,
              message: message,
            });

            // Load updated history to show new scan
            const historyMetadata = await scanHistory.getHistoryMetadata(5);
            this.webviewView.webview.postMessage({
              command: 'historyData',
              history: historyMetadata
            });
          }
        },
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
      if (errorMessage.includes("cancelled")) {
        vscode.window.showWarningMessage("Scan cancelled by user");
        if (this.webviewView) {
          this.webviewView.webview.postMessage({
            command: "scanCancelled",
          });
        }
      } else {
        vscode.window.showErrorMessage(`Scan failed: ${errorMessage}`);
      }
    } finally {
      this.cancellationTokenSource?.dispose();
      this.cancellationTokenSource = undefined;
    }
  }

  public async scanFolder(targetFolderPath?: string): Promise<void> {
    this.ignoreManager.reload();
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

    if (!workspaceFolder) {
      vscode.window.showErrorMessage("No workspace folder found");
      return;
    }

    let folderPath = targetFolderPath;
    if (!folderPath) {
      const result = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        defaultUri: workspaceFolder.uri,
        openLabel: "Select Folder to Scan",
      });

      if (!result || result.length === 0) {
        return;
      }

      folderPath = result[0].fsPath;
    }

    this.cancellationTokenSource = new vscode.CancellationTokenSource();

    try {
      const folderName = vscode.workspace.asRelativePath(folderPath);
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Scanning folder: ${folderName}...`,
          cancellable: true,
        },
        async (progress, token) => {
          token.onCancellationRequested(() => {
            this.cancellationTokenSource?.cancel();
          });

          progress.report({
            increment: 0,
            message: "Initializing folder scan...",
          });
          if (this.webviewView) {
            this.webviewView.webview.postMessage({ command: "scanStarted" });
          }

          this.diagnosticManager.clear();

          const results = await this.scanner.scanFolder(
            workspaceFolder,
            folderPath,
            (filePath: string, current: number, total: number) => {
              const percentage = Math.floor((current / total) * 100);
              progress.report({
                increment: percentage / total,
                message: `Scanning file ${current}/${total}...`,
              });
              if (this.webviewView) {
                this.webviewView.webview.postMessage({
                  command: "scanningFile",
                  filePath: filePath,
                  current: current,
                  total: total,
                });
              }
            },
            this.cancellationTokenSource?.token,
          );
          progress.report({ increment: 100, message: "Folder scan complete" });

          this.updateResults(results);

          this.diagnosticManager.updateDiagnostics(results);

          const message =
            results.length > 0
              ? `Found ${results.length} deprecated item(s) in ${folderName}`
              : `No deprecated items found in ${folderName}`;

          vscode.window.showInformationMessage(message);
          if (this.webviewView) {
            this.webviewView.webview.postMessage({
              command: "scanComplete",
              resultsCount: results.length,
              message: message,
            });
          }
        },
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
      if (errorMessage.includes("cancelled")) {
        vscode.window.showWarningMessage("Folder scan cancelled by user");
        if (this.webviewView) {
          this.webviewView.webview.postMessage({
            command: "scanCancelled",
          });
        }
      } else {
        vscode.window.showErrorMessage(`Folder scan failed: ${errorMessage}`);
      }
    } finally {
      this.cancellationTokenSource?.dispose();
      this.cancellationTokenSource = undefined;
    }
  }

  public async scanFile(targetFilePath?: string): Promise<void> {
    this.ignoreManager.reload();
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

    if (!workspaceFolder) {
      vscode.window.showErrorMessage("No workspace folder found");
      return;
    }

    let filePath = targetFilePath;
    if (!filePath) {
      const result = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        defaultUri: workspaceFolder.uri,
        openLabel: "Select File to Scan",
        filters: {
          "TypeScript files": ["ts", "tsx"],
        },
      });

      if (!result || result.length === 0) {
        return;
      }

      filePath = result[0].fsPath;
    }

    try {
      const fileName = vscode.workspace.asRelativePath(filePath);
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Scanning file: ${fileName}...`,
          cancellable: false,
        },
        async (progress) => {
          progress.report({
            increment: 0,
            message: "Initializing file scan...",
          });
          if (this.webviewView) {
            this.webviewView.webview.postMessage({ command: "scanStarted" });
          }

          this.diagnosticManager.clear();

          const results = await this.scanner.scanSpecificFiles(
            workspaceFolder,
            [filePath],
            (current: number, total: number) => {
              const percentage = Math.floor((current / total) * 100);
              progress.report({
                increment: percentage,
                message: `Scanning...`,
              });
            },
          );
          progress.report({ increment: 100, message: "File scan complete" });

          this.updateResults(results);

          this.diagnosticManager.updateDiagnostics(results);

          const message =
            results.length > 0
              ? `Found ${results.length} deprecated item(s) in ${fileName}`
              : `No deprecated items found in ${fileName}`;

          vscode.window.showInformationMessage(message);
          if (this.webviewView) {
            this.webviewView.webview.postMessage({
              command: "scanComplete",
              resultsCount: results.length,
              message: message,
            });
          }
        },
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
      vscode.window.showErrorMessage(`File scan failed: ${errorMessage}`);
    }
  }

  public refresh(): void {
    if (this.webviewView) {
      this.webviewView.webview.html = this.getHtmlForWebview(
        this.webviewView.webview,
      );
    }
  }

  public getCurrentResults(): DeprecatedItem[] {
    return this.currentResults;
  }

  public updateResults(results: DeprecatedItem[]): void {
    this.currentResults = results;
    this.refresh();
  }

  private async openResultsPanel(
    _selectedItem?: DeprecatedItem,
  ): Promise<void> {
    const panel = MainPanel.currentPanel;
    if (panel) {
      panel.reveal();
      if (this.currentResults.length > 0) {
        panel.updateResults(this.currentResults);
      }
    } else {
      const scanHistory = new ScanHistory(this.context);
      const newPanel = MainPanel.createOrShow(
        this.context.extensionUri,
        this.context,
        scanHistory,
      );
      if (this.currentResults.length > 0) {
        newPanel.updateResults(this.currentResults);
      }
    }
  }

  private async ignoreMethod(
    filePath: string,
    methodName: string,
  ): Promise<void> {
    this.ignoreManager.ignoreMethod(filePath, methodName);

    this.currentResults = this.currentResults.filter((result) => {
      const isDirectMatch =
        result.name === methodName && result.kind !== "usage";
      const isUsageOfIgnored =
        result.kind === "usage" &&
        result.deprecatedDeclaration &&
        result.deprecatedDeclaration.name === methodName;
      const isUsageByNameOnly =
        result.kind === "usage" &&
        !result.deprecatedDeclaration &&
        result.name === methodName;

      return !isDirectMatch && !isUsageOfIgnored && !isUsageByNameOnly;
    });

    this.updateResults(this.currentResults);
    vscode.window.showInformationMessage(`Ignored method: ${methodName}`);
  }

  private async ignoreFile(filePath: string): Promise<void> {
    this.ignoreManager.ignoreFile(filePath);

    this.currentResults = this.currentResults.filter((result) => {
      const isDirectMatch = result.filePath === filePath;
      const isUsageOfIgnoredDecl =
        result.kind === "usage" &&
        result.deprecatedDeclaration &&
        result.deprecatedDeclaration.filePath === filePath;
      return !isDirectMatch && !isUsageOfIgnoredDecl;
    });

    this.updateResults(this.currentResults);
    vscode.window.showInformationMessage(
      `Ignored file: ${vscode.workspace.asRelativePath(filePath)}`,
    );
  }

  private getHtmlForWebview(_webview: vscode.Webview): string {
    return `<!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Deprecated Tracker</title>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            padding: 16px;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-foreground);
            line-height: 1.5;
          }
          
          .container {
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 16px;
          }
          
          .header {
            display: flex;
            align-items: center;
            justify-content: center;
            margin-bottom: 16px;
            padding-bottom: 12px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          }
          
          .logo {
            width: 40px;
            height: 40px;
            background-color: var(--vscode-button-background);
            border-radius: 50%;
            margin-right: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 20px;
            flex-shrink: 0;
            background-image: url('vscode-file://vscode-app/icon.png');
            background-size: contain;
            background-repeat: no-repeat;
            background-position: center;
          }
          
          @keyframes pulse {
            0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(255, 107, 107, 0.7); }
            70% { transform: scale(1.05); box-shadow: 0 0 0 10px rgba(255, 107, 107, 0); }
            100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(255, 107, 107, 0); }
          }
          
          .title-section h1 {
            font-size: 18px;
            font-weight: 700;
            margin: 0 0 4px 0;
            color: var(--vscode-foreground);
            text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
          }

          .title-section {
            text-align: center;
          }
          
          .subtitle {
            font-size: 13px;
            color: var(--vscode-descriptionForeground);
            margin: 0;
            opacity: 0.8;
          }
          
          .status {
            background: rgba(0, 122, 204, 0.2);
            border: 1px solid rgba(0, 122, 204, 0.4);
            border-radius: 8px;
            padding: 12px 16px;
            margin: 12px 0;
            font-size: 13px;
            color: var(--vscode-foreground);
            transition: all 0.3s ease;
            backdrop-filter: blur(5px);
          }
          
          .status.scanning {
            background: rgba(255, 165, 0, 0.2);
            border-color: rgba(255, 165, 0, 0.4);
            animation: scanning 1.5s ease-in-out infinite;
          }
          
          @keyframes scanning {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.7; }
          }
          
          .status.success {
            background: rgba(0, 128, 0, 0.2);
            border-color: rgba(0, 128, 0, 0.4);
          }
          
          .status.error {
            background: rgba(255, 0, 0, 0.2);
            border-color: rgba(255, 0, 0, 0.4);
          }
          
          .button-container {
            display: flex;
            flex-direction: column;
            gap: 12px;
            margin-top: 20px;
          }
          
          button {
            background: #007ACC; /* VS Code blue */
            color: white;
            border: none;
            padding: 12px 20px;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            text-align: center;
            font-family: inherit;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
          }
          
          button:hover {
            background: #005a9e; /* Darker blue for hover */
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
          }
          
          button:active {
            transform: translateY(0);
          }
          
          button:focus {
            outline: 2px solid var(--vscode-focusBorder);
            outline-offset: 2px;
          }
          
          button.btn-secondary {
            background: #6c757d; /* Gray color */
            color: white;
          }
          
          button.btn-secondary:hover {
            background: #5a6268; /* Darker gray for hover */
          }
          
          .icon {
            margin-right: 6px;
            font-size: 14px;
          }
          
          .scanning-files {
            background: rgba(255, 165, 0, 0.1);
            border: 1px solid rgba(255, 165, 0, 0.3);
            border-radius: 8px;
            padding: 12px 16px;
            margin: 12px 0;
            font-size: 12px;
            color: var(--vscode-foreground);
            backdrop-filter: blur(5px);
          }
          
          .scanning-container {
            background: rgba(255, 165, 0, 0.15);
            border: 1px solid rgba(255, 165, 0, 0.4);
            border-radius: 8px;
            padding: 16px;
            margin: 12px 0;
            text-align: center;
            backdrop-filter: blur(5px);
          }
          
          .scanning-title {
            font-size: 14px;
            font-weight: 600;
            color: var(--vscode-foreground);
            margin-bottom: 8px;
          }
          
          .scanning-subtitle {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 12px;
          }
          
          .cancel-button {
            background: #dc3545;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.3s ease;
          }
          
          .cancel-button:hover {
            background: #c82333;
            transform: translateY(-1px);
          }
          
          .scanning-header {
            font-weight: 600;
            margin-bottom: 8px;
            opacity: 0.9;
          }
          
          .current-file {
            font-family: 'Courier New', monospace;
            font-size: 11px;
            opacity: 0.8;
            word-break: break-all;
            animation: fadeInOut 2s ease-in-out infinite;
          }
          
          @keyframes fadeInOut {
            0%, 100% { opacity: 0.6; }
            50% { opacity: 1; }
          }
          
          /* History Section */
          .history-section {
            margin-top: 16px;
            background: rgba(100, 100, 255, 0.08);
            border: 1px solid rgba(100, 100, 255, 0.2);
            border-radius: 8px;
            padding: 12px;
          }
          
          .history-header {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 13px;
            font-weight: 600;
            color: var(--vscode-foreground);
            margin-bottom: 12px;
            padding-bottom: 8px;
            border-bottom: 1px solid rgba(100, 100, 255, 0.2);
          }
          
          .history-count {
            margin-left: auto;
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
          }
          
          .history-list {
            max-height: 300px;
            overflow-y: auto;
            overflow-x: hidden;
          }
          
          .history-item {
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 6px;
            padding: 10px;
            margin-bottom: 8px;
            cursor: pointer;
            transition: all 0.2s;
            overflow: hidden;
          }
          
          .history-item:hover {
            background: rgba(255, 255, 255, 0.1);
            border-color: rgba(100, 100, 255, 0.4);
          }
          
          .history-item-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            font-size: 11px;
          }
          
          .history-item-time {
            color: var(--vscode-descriptionForeground);
            flex-shrink: 0;
          }
          
          .history-item-count {
            color: #4ec9b0;
            font-weight: 600;
            flex-shrink: 0;
          }
          
          .clear-history-btn {
            background: transparent;
            border: none;
            color: #ff6b6b;
            cursor: pointer;
            padding: 2px 6px;
            border-radius: 4px;
            transition: all 0.2s;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-left: auto;
            font-size: 14px;
          }
          
          .clear-history-btn:hover {
            background: rgba(255, 100, 100, 0.3);
            color: #ff4444;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="title-section">
              <h1>Deprecated Tracker</h1>
              <p class="subtitle">Find and manage deprecated code</p>
            </div>
          </div>
          
          <div class="status" id="status">Ready to scan your project</div>
          
          <div class="scanning-files" id="scanningFiles" style="display: none;">
            <div class="scanning-header">🔍 Currently scanning:</div>
            <div class="current-file" id="currentFile">Initializing...</div>
          </div>
          
          <div class="button-container" id="scanButtonContainer">
            <button onclick="scanProject()" id="scanButton">
              <span class="icon">🔎</span>Scan Project
            </button>
            <button onclick="openSettings()" class="btn-secondary" id="settingsBtn">
              <span class="icon">⚙️</span>Settings
            </button>
          </div>
          
          <div class="scanning-container" id="scanningContainer" style="display: none;">
            <div class="scanning-title">Please wait...</div>
            <div class="scanning-subtitle">Scanning project for deprecated items</div>
            <button class="cancel-button" onclick="cancelScan()">Cancel Scan</button>
          </div>
          <!-- Scan History Section -->
          <div class="history-section" id="historySection" style="display: none;">
            <div class="history-header">
              <span class="icon">🕒</span>
              <span>Scan History</span>
              <button class="clear-history-btn" id="clearHistoryBtn" onclick="clearHistory()" title="Clear Scan History">
                ×
              </button>
            </div>
            <div class="history-list" id="historyList">
            </div>
          </div>
        </div>

        <script>
          let vscode;
          try {
            vscode = acquireVsCodeApi();
            updateStatus('Ready to scan your project', 'ready');
          } catch (e) {
            updateStatus('Failed to connect', 'error');
          }

          function updateStatus(message, type = 'ready') {
            const statusElement = document.getElementById('status');
            statusElement.textContent = message;
            statusElement.className = 'status';
            
            if (type === 'scanning') {
              statusElement.classList.add('scanning');
            } else if (type === 'success') {
              statusElement.classList.add('success');
            } else if (type === 'error') {
              statusElement.classList.add('error');
            }
          }
          
          function showScanningState(show = true) {
            const scanButtonContainer = document.getElementById('scanButtonContainer');
            const scanningContainer = document.getElementById('scanningContainer');
            
            if (show) {
              scanButtonContainer.style.display = 'none';
              scanningContainer.style.display = 'block';
            } else {
              scanButtonContainer.style.display = 'flex';
              scanningContainer.style.display = 'none';
            }
          }
          
          function showViewResultsButton(show = true) {
            const viewResultsBtn = document.getElementById('viewResultsBtn');
            if (viewResultsBtn) {
              viewResultsBtn.style.display = show ? 'block' : 'none';
            }
          }
          
          function updateScanningFile(filePath) {
            const scanningFilesElement = document.getElementById('scanningFiles');
            const currentFileElement = document.getElementById('currentFile');
            
            if (filePath) {
              scanningFilesElement.style.display = 'block';
              currentFileElement.textContent = filePath;
            } else {
              scanningFilesElement.style.display = 'none';
            }
          }

          function scanProject() {
            if (vscode) {
              updateStatus('Scanning project for deprecated items...', 'scanning');
              showViewResultsButton(false);
              showScanningState(true);
              vscode.postMessage({ command: 'scan' });
            } else {
              updateStatus('Error: VS Code API not available', 'error');
            }
          }
          
          function cancelScan() {
            if (vscode) {
              updateStatus('Scan cancelled', 'error');
              showScanningState(false);
              showViewResultsButton(false);
              vscode.postMessage({ command: 'cancelScan' });
            }
          }

          function openResults() {
            if (vscode) {
              vscode.postMessage({ command: 'openResults' });
            } else {
              updateStatus('Error: VS Code API not available', 'error');
            }
          }

          function openSettings() {
            if (vscode) {
              vscode.postMessage({ command: 'openSettings' });
            } else {
              updateStatus('Error: VS Code API not available', 'error');
            }
          }

          function openHistory() {
            if (vscode) {
              vscode.postMessage({ command: 'openHistory' });
            } else {
              updateStatus('Error: VS Code API not available', 'error');
            }
          }
          
          function showHistoryButton(show = true) {
            const viewHistoryBtn = document.getElementById('viewHistoryBtn');
            if (viewHistoryBtn) {
              viewHistoryBtn.style.display = show ? 'block' : 'none';
            }
          }

          let currentHistoryLimit = 100;
          function loadHistory() {
            if (vscode) {
              vscode.postMessage({ command: 'getHistory', limit: currentHistoryLimit });
            }
          }
          
          function clearHistory() {
            if (vscode) {
              vscode.postMessage({ command: 'confirmClearHistory' });
            }
          }
          function renderHistory(history) {
            const historySection = document.getElementById('historySection');
            const historyList = document.getElementById('historyList');
            
            if (!history || history.length === 0) {
              historySection.style.display = 'none';
              return;
            }
            
            historySection.style.display = 'block';
            historyList.innerHTML = '';
            
            history.forEach((scan) => {
              const item = document.createElement('div');
              item.className = 'history-item';
              item.onclick = () => {
                vscode.postMessage({ command: 'viewScan', scanId: scan.scanId });
              };
              
              const date = new Date(scan.timestamp);
              
              const day = date.getDate();
              const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
              const month = months[date.getMonth()];
              const year = date.getFullYear();
              const hours = date.getHours();
              const minutes = date.getMinutes().toString().padStart(2, '0');
              const ampm = hours >= 12 ? 'PM' : 'AM';
              const displayHours = hours % 12 || 12;
              const timeStr = day + ' ' + month + ' ' + year + ', ' + displayHours + ':' + minutes + ' ' + ampm;
              
              item.innerHTML = '' +
                '\u003cdiv class=\"history-item-row\"\u003e' +
                  '\u003cspan class=\"history-item-time\"\u003e' + timeStr + '\u003c/span\u003e' +
                  '\u003cspan class=\"history-item-count\"\u003e' + scan.totalItems + ' items\u003c/span\u003e' +
                '\u003c/div\u003e';
              
              historyList.appendChild(item);
            });
          }

          window.addEventListener('message', event => {
            const message = event.data;

            if (message.command === 'scanStarted') {
              updateStatus('Scanning project for deprecated items...', 'scanning');
              updateScanningFile('Initializing scan...');
              showScanningState(true);
            } else if (message.command === 'scanningFile') {
              const progressText = message.total 
                ? 'Scanning file ' + message.current + '/' + message.total + '...'
                : 'Scanning...';
              updateScanningFile(message.filePath || progressText);
            } else if (message.command === 'scanComplete') {
              const count = message.resultsCount || 0;
              const statusMsg = count > 0
                ? 'Found ' + count + ' deprecated item(s)'
                : 'No deprecated items found - your code is clean';
              updateStatus(statusMsg, 'success');
              updateScanningFile(null);
              showScanningState(false);
              showViewResultsButton(true);
              showHistoryButton(true);
              loadHistory();
            } else if (message.command === 'scanCancelled') {
              updateStatus('Scan cancelled by user', 'error');
              updateScanningFile(null);
              showScanningState(false);
              showViewResultsButton(false);
            } else if (message.command === 'historyData') {
              renderHistory(message.history || []);
            }
          });
</script>
  </body>
  </html>`;
  }
}