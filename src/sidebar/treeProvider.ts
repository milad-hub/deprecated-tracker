import { randomUUID } from "crypto";
import * as vscode from "vscode";
import { ScanScopeManager } from "../config/scanScope";
import { TagsManager } from "../config/tagsManager";
import { DiagnosticManager } from "../diagnostics/diagnosticManager";
import { ScanHistory } from "../history";
import { DeprecatedTrackerConfig, ScanMetadata } from "../interfaces";
import { DeprecatedItem, Scanner } from "../scanner";
import {
  collectChangedFiles,
  collectChangedLineRanges,
  getGitApi,
  isWithinChangedLines,
} from "../scanner/gitChanges";
import { IgnoreManager } from "../scanner/ignoreManager";
import { PathUtils } from "../utils/pathUtils";
import { MainPanel, RequirementsPanel } from "../webview";

export class DeprecatedTrackerSidebarProvider
  implements vscode.WebviewViewProvider
{
  public static readonly viewType = "deprecatedTrackerSidebar";
  private scanner: Scanner;
  private ignoreManager: IgnoreManager;
  private tagsManager: TagsManager;
  private diagnosticManager: DiagnosticManager;
  private currentResults: DeprecatedItem[] = [];
  private webviewView?: vscode.WebviewView;
  private context: vscode.ExtensionContext;
  private scanHistory: ScanHistory;
  private isWebviewReady = false;
  private webviewDisposables: vscode.Disposable[] = [];
  private scanScope: ScanScopeManager;

  constructor(
    context: vscode.ExtensionContext,
    ignoreManager: IgnoreManager,
    tagsManager: TagsManager,
    config?: DeprecatedTrackerConfig,
  ) {
    this.context = context;
    this.ignoreManager = ignoreManager;
    this.tagsManager = tagsManager;
    this.scanner = new Scanner(this.ignoreManager, this.tagsManager, config);
    this.diagnosticManager = new DiagnosticManager();
    this.scanHistory = new ScanHistory(context);
    this.scanScope = new ScanScopeManager(context);

    context.subscriptions.push(this.diagnosticManager, {
      dispose: (): void => this.disposeWebviewListeners(),
    });

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
          this.updateResults(results || []);
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
    this.isWebviewReady = false;

    webviewView.webview.options = {
      enableScripts: true,
      enableForms: false,
      enableCommandUris: false,
      localResourceRoots: [this.context.extensionUri],
    };

    this.disposeWebviewListeners();

    this.webviewDisposables.push(
      webviewView.webview.onDidReceiveMessage(async (message) => {
        switch (message.command) {
          case "webviewReady":
            this.isWebviewReady = true;
            await this.loadHistory();
            await this.hydrateFromLatestScan();
            this.refresh();
            break;
          case "scan":
            await this.scanProject();
            break;
          case "cancelScan":
            this.scanAbortController?.abort();
            break;
          case "openResults":
            await this.openResultsPanel();
            break;
          case "openSettings":
            vscode.commands.executeCommand("deprecatedTracker.openSettings");
            break;
          case "openDashboard":
            vscode.commands.executeCommand("deprecatedTracker.showStatistics");
            break;
          case "ignoreMethod":
            await this.ignoreMethod(message.filePath, message.methodName);
            break;
          case "ignoreFile":
            await this.ignoreFile(message.filePath);
            break;
          case "getHistory": {
            const metadata = await this.scanHistory.getHistoryMetadata(
              message.limit || 10,
            );
            this.webviewView?.webview.postMessage({
              command: "historyData",
              history: metadata,
            });
            break;
          }
          case "viewScan": {
            const historicalScan = await this.scanHistory.getScanById(
              message.scanId,
            );
            if (historicalScan) {
              if (
                historicalScan.results.length <
                historicalScan.metadata.totalItems
              ) {
                vscode.window.showWarningMessage(
                  `Showing ${historicalScan.results.length} of ${historicalScan.metadata.totalItems} stored scan results.`,
                );
              }
              this.updateResults(historicalScan.results);
              await this.openResultsPanel();
            } else {
              vscode.window.showWarningMessage("Scan not found in history");
            }
            break;
          }
          case "confirmClearHistory": {
            const confirmed = await vscode.window.showWarningMessage(
              "Are you sure you want to clear all scan history? This action cannot be undone.",
              { modal: true },
              "Clear History",
            );
            if (confirmed === "Clear History") {
              await this.scanHistory.clearHistory();
              this.webviewView?.webview.postMessage({
                command: "historyData",
                history: [],
              });
              this.updateResults([]);
              vscode.window.showInformationMessage("Scan history cleared");
            }
            break;
          }
        }
      }),
    );

    const html = this.getHtmlForWebview(webviewView.webview);
    webviewView.webview.html = html;

    // Reload history when sidebar becomes visible
    this.webviewDisposables.push(
      webviewView.onDidChangeVisibility(() => {
        if (webviewView.visible && this.isWebviewReady) {
          void this.loadHistory();
        }
      }),
    );

    webviewView.show?.(true);

    // Opening the extension's own view is the user reaching for it, so this is
    // the moment to say the project cannot be scanned — not extension startup,
    // which fires for every folder they open.
    RequirementsPanel.showIfBlocked(this.context.extensionUri, this.context);
  }

  private scanAbortController?: AbortController;
  private isScanning = false;

  public async scanProject(): Promise<void> {
    if (this.isScanning) {
      vscode.window.showWarningMessage("A scan is already in progress");
      return;
    }
    this.ignoreManager.reload();
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (!workspaceFolders || workspaceFolders.length === 0) {
      vscode.window.showErrorMessage("No workspace folder found");
      return;
    }

    this.isScanning = true;
    this.scanAbortController = new AbortController();
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
            this.scanAbortController?.abort();
          });

          progress.report({ increment: 0, message: "Initializing scan..." });
          if (this.webviewView) {
            this.webviewView.webview.postMessage({ command: "scanStarted" });
          }

          // Clear existing diagnostics
          this.diagnosticManager.clear();

          let lastPercentage = 0;
          let fileCount = 0;
          const results = await this.scanner.scanWorkspace(
            workspaceFolders.map((folder) => folder.uri.fsPath),
            (filePath: string, current: number, total: number) => {
              fileCount += 1;
              const percentage = Math.floor((current / total) * 100);
              progress.report({
                increment: percentage - lastPercentage,
                message: `Scanning file ${current}/${total}...`,
              });
              lastPercentage = percentage;
              if (this.webviewView) {
                this.webviewView.webview.postMessage({
                  command: "scanningFile",
                  filePath: filePath,
                  current: current,
                  total: total,
                });
              }
            },
            this.scanAbortController?.signal,
          );
          progress.report({
            increment: 100 - lastPercentage,
            message: "Scan complete",
          });

          this.updateResults(results);

          // Save scan to history
          const scanDuration = Date.now() - scanStartTime;
          await this.scanHistory.saveScan(results, scanDuration, fileCount);

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
        this.webviewView?.webview.postMessage({
          command: "scanFailed",
          message: errorMessage,
        });
      }
    } finally {
      this.isScanning = false;
      this.scanAbortController = undefined;
    }
  }

  public async scanFolder(targetFolderPath?: string): Promise<void> {
    if (this.isScanning) {
      vscode.window.showWarningMessage("A scan is already in progress");
      return;
    }
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

    this.isScanning = true;
    this.scanAbortController = new AbortController();
    const scanStartTime = Date.now();

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
            this.scanAbortController?.abort();
          });

          progress.report({
            increment: 0,
            message: "Initializing folder scan...",
          });
          if (this.webviewView) {
            this.webviewView.webview.postMessage({ command: "scanStarted" });
          }

          this.diagnosticManager.clear();

          let lastPercentage = 0;
          let fileCount = 0;
          const results = await this.scanner.scanFolder(
            (
              PathUtils.folderContaining(
                vscode.workspace.workspaceFolders,
                folderPath,
              ) ?? workspaceFolder
            ).uri.fsPath,
            folderPath,
            (filePath: string, current: number, total: number) => {
              fileCount = total;
              const percentage = Math.floor((current / total) * 100);
              progress.report({
                increment: percentage - lastPercentage,
                message: `Scanning file ${current}/${total}...`,
              });
              lastPercentage = percentage;
              if (this.webviewView) {
                this.webviewView.webview.postMessage({
                  command: "scanningFile",
                  filePath: filePath,
                  current: current,
                  total: total,
                });
              }
            },
            this.scanAbortController?.signal,
          );
          progress.report({
            increment: 100 - lastPercentage,
            message: "Folder scan complete",
          });

          this.updateResults(results);

          // Save scan to history
          const scanDuration = Date.now() - scanStartTime;
          await this.scanHistory.saveScan(
            results,
            scanDuration,
            fileCount,
            "folder",
          );

          const message =
            results.length > 0
              ? `Found ${results.length} deprecated item(s) in ${folderName}`
              : `No deprecated items found in ${folderName}`;

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
        this.webviewView?.webview.postMessage({
          command: "scanFailed",
          message: errorMessage,
        });
      }
    } finally {
      this.isScanning = false;
      this.scanAbortController = undefined;
    }
  }

  public async scanFile(targetFilePath?: string): Promise<void> {
    if (this.isScanning) {
      vscode.window.showWarningMessage("A scan is already in progress");
      return;
    }
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

    const scanStartTime = Date.now();
    this.isScanning = true;

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

          let lastPercentage = 0;
          const results = await this.scanner.scanSpecificFiles(
            (
              PathUtils.folderContaining(
                vscode.workspace.workspaceFolders,
                filePath,
              ) ?? workspaceFolder
            ).uri.fsPath,
            [filePath],
            (current: number, total: number) => {
              const percentage = Math.floor((current / total) * 100);
              progress.report({
                increment: percentage - lastPercentage,
                message: `Scanning...`,
              });
              lastPercentage = percentage;
            },
          );
          progress.report({
            increment: 100 - lastPercentage,
            message: "File scan complete",
          });

          this.updateResults(results);

          // Save scan to history
          const scanDuration = Date.now() - scanStartTime;
          await this.scanHistory.saveScan(results, scanDuration, 1, "file");

          const message =
            results.length > 0
              ? `Found ${results.length} deprecated item(s) in ${fileName}`
              : `No deprecated items found in ${fileName}`;

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
          }
        },
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
      vscode.window.showErrorMessage(`File scan failed: ${errorMessage}`);
      this.webviewView?.webview.postMessage({
        command: "scanFailed",
        message: errorMessage,
      });
    } finally {
      this.isScanning = false;
    }
  }

  /**
   * Scans only what git reports as changed, across every repository in the
   * workspace. Deliberately not written to history: `getScanTrend` plots every
   * entry, and a button people click all day would fill the chart with partial
   * scans.
   */
  public async scanChanges(): Promise<void> {
    if (this.isScanning) {
      vscode.window.showWarningMessage("A scan is already in progress");
      return;
    }

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      vscode.window.showErrorMessage("No workspace folder found");
      return;
    }

    const api = await getGitApi();
    if (!api) {
      vscode.window.showErrorMessage(
        "The built-in Git extension is not available, so changed files cannot be listed.",
      );
      return;
    }

    const scope = this.scanScope.getScope();
    const changedFiles = collectChangedFiles(api, scope, workspaceFolders);

    if (changedFiles.length === 0) {
      // Deliberately does not clear existing results: wiping a full scan
      // because the working tree is clean is destructive and surprising.
      vscode.window.showInformationMessage(
        "No changed files to scan. Existing results are unchanged.",
      );
      return;
    }

    this.ignoreManager.reload();
    this.isScanning = true;

    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Scanning ${changedFiles.length} changed file(s)...`,
          cancellable: false,
        },
        async (progress) => {
          progress.report({ increment: 0, message: "Reading changes..." });
          if (this.webviewView) {
            this.webviewView.webview.postMessage({ command: "scanStarted" });
          }

          // Deliberately not cleared up front: if this scan finds nothing it
          // keeps the previous results, and their squiggles have to survive
          // with them.
          let lastPercentage = 0;
          const scanned = await this.scanner.scanWorkspaceFiles(
            workspaceFolders.map((folder) => folder.uri.fsPath),
            changedFiles,
            (current: number, total: number) => {
              const percentage = Math.floor((current / total) * 100);
              progress.report({
                increment: percentage - lastPercentage,
                message: "Scanning...",
              });
              lastPercentage = percentage;
            },
          );
          progress.report({
            increment: 100 - lastPercentage,
            message: "Changed files scan complete",
          });

          const results =
            scope.granularity === "lines"
              ? await this.filterToChangedLines(
                  api,
                  scope,
                  changedFiles,
                  scanned,
                )
              : scanned;

          // A subset that found nothing does not mean the project is clean, so
          // it must not replace a full scan's results with an empty set — the
          // same reason a clean working tree does not clear them above.
          if (results.length > 0) {
            this.updateResults(results);
          }

          const message = this.describeChangesScan(
            changedFiles.length,
            results.length,
            scanned.length,
            scope.granularity === "lines",
          );
          vscode.window.showInformationMessage(message);

          if (results.length > 0) {
            await this.openResultsPanel();
            MainPanel.currentPanel?.showSubsetNote(message);
          }

          if (this.webviewView) {
            this.webviewView.webview.postMessage({
              command: "scanComplete",
              resultsCount: this.currentResults.length,
              message,
            });
          }
        },
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
      vscode.window.showErrorMessage(`Changes scan failed: ${errorMessage}`);
      this.webviewView?.webview.postMessage({
        command: "scanFailed",
        message: errorMessage,
      });
    } finally {
      this.isScanning = false;
    }
  }

  private async filterToChangedLines(
    api: Awaited<ReturnType<typeof getGitApi>>,
    scope: ReturnType<ScanScopeManager["getScope"]>,
    changedFiles: string[],
    scanned: DeprecatedItem[],
  ): Promise<DeprecatedItem[]> {
    if (!api) {
      return scanned;
    }
    const ranges = await collectChangedLineRanges(api, scope, changedFiles);
    return scanned.filter((item) =>
      isWithinChangedLines(item.filePath, item.line, ranges),
    );
  }

  /**
   * A subset scan that renders like a full one tells the user their debt
   * collapsed, and a quiet filter looks identical to a clean bill of health.
   */
  private describeChangesScan(
    fileCount: number,
    shown: number,
    total: number,
    lineFiltered: boolean,
  ): string {
    const scanned = `Scanned ${fileCount} changed file(s)`;
    if (!lineFiltered) {
      return `${scanned} — ${shown} deprecated item(s)`;
    }
    const elsewhere = total - shown;
    return elsewhere > 0
      ? `${scanned} — ${shown} item(s) in changed lines (${elsewhere} elsewhere in the modified files)`
      : `${scanned} — ${shown} item(s) in changed lines`;
  }

  private disposeWebviewListeners(): void {
    for (const disposable of this.webviewDisposables) {
      disposable.dispose();
    }
    this.webviewDisposables = [];
  }

  public refresh(): void {
    this.webviewView?.webview.postMessage({
      command: "resultsUpdated",
      resultsCount: this.currentResults.length,
    });
  }

  public getCurrentResults(): DeprecatedItem[] {
    return this.currentResults;
  }

  private async hydrateFromLatestScan(): Promise<void> {
    if (this.currentResults.length > 0) {
      return;
    }

    const [latestScan] = await this.scanHistory.getHistory(1);
    if (latestScan) {
      this.updateResults(latestScan.results);
    }
  }

  public async getLatestScanResults(): Promise<DeprecatedItem[] | null> {
    const [latestScan] = await this.scanHistory.getHistory(1);
    if (!latestScan) {
      return null;
    }

    if (latestScan.results.length < latestScan.metadata.totalItems) {
      vscode.window.showWarningMessage(
        `Statistics cover ${latestScan.results.length} of ${latestScan.metadata.totalItems} items from the latest scan.`,
      );
    }

    return latestScan.results;
  }

  /**
   * Whole-project scans only. A folder or single-file scan counts a fraction of
   * the codebase, so plotting it beside a full scan drops the line for a reason
   * that has nothing to do with the debt shrinking. Entries written before the
   * scope field existed have none, and were almost always project scans.
   */
  public async getScanTrend(): Promise<ScanMetadata[]> {
    const history = await this.scanHistory.getHistoryMetadata();
    return history
      .filter((scan) => (scan.scope ?? "project") === "project")
      .reverse();
  }

  public updateConfig(config: DeprecatedTrackerConfig): void {
    this.scanner = new Scanner(this.ignoreManager, this.tagsManager, config);
  }

  public updateResults(results: DeprecatedItem[]): void {
    this.currentResults = results;
    this.diagnosticManager.updateDiagnostics(results);
    MainPanel.currentPanel?.updateResults(results);
    this.refresh();
  }

  private async openResultsPanel(
    _selectedItem?: DeprecatedItem,
  ): Promise<void> {
    const panel = MainPanel.currentPanel;
    if (panel) {
      panel.reveal();
      panel.updateResults(this.currentResults);
    } else {
      // Resolved lazily so the panel always sees the current Scanner, which
      // updateConfig replaces. This is the extension's only Scanner instance.
      const newPanel = MainPanel.createOrShow(
        this.context.extensionUri,
        this.context,
        this.scanHistory,
        this.ignoreManager,
        () => this.scanner,
      );
      newPanel.updateResults(this.currentResults);
    }
  }

  private async ignoreMethod(
    filePath: string,
    methodName: string,
  ): Promise<void> {
    this.ignoreManager.ignoreMethod(filePath, methodName);

    this.currentResults = this.currentResults.filter((result) => {
      const isDirectMatch =
        result.filePath === filePath &&
        result.name === methodName &&
        result.kind !== "usage";
      const isUsageOfIgnored =
        result.kind === "usage" &&
        result.deprecatedDeclaration &&
        result.deprecatedDeclaration.filePath === filePath &&
        result.deprecatedDeclaration.name === methodName;

      return !isDirectMatch && !isUsageOfIgnored;
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

  private async loadHistory(limit = 100): Promise<void> {
    const metadata = await this.scanHistory.getHistoryMetadata(limit);
    this.webviewView?.webview.postMessage({
      command: "historyData",
      history: metadata,
    });
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const nonce = randomUUID();
    const iconUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "icon.png"),
    );
    return `<!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource}; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
        <title>Deprecated Tracker</title>
        <style>
          /* Nordic tokens, declared locally: this view is built inside
             treeProvider.ts and never loads assets/style.css. */
          :root,
          body.vscode-dark {
            --dt-line: #262c32;
            --dt-line-hi: #364049;
            --dt-raised: #1f2429;
            --dt-hover: #1e2429;
            --dt-text: #dde4e8;
            --dt-dim: #95a2aa;
            --dt-faint: #8a959c;
            --dt-accent: #74bccb;
            --dt-accent-ink: #07171c;
            --dt-accent-soft: rgba(116, 188, 203, 0.15);
            --dt-good: #8fc7a4;
            --dt-warn: #de9c7c;
            --dt-warn-soft: rgba(222, 156, 124, 0.14);
            --dt-danger: #e0827c;
          }

          body.vscode-light {
            --dt-line: #e3e8ea;
            --dt-line-hi: #c6d0d4;
            --dt-raised: #ffffff;
            --dt-hover: #f0f4f5;
            --dt-text: #14191c;
            --dt-dim: #54626a;
            --dt-faint: #6b767d;
            --dt-accent: #1c6a7a;
            --dt-accent-ink: #ffffff;
            --dt-accent-soft: rgba(28, 106, 122, 0.12);
            --dt-good: #2e6b47;
            --dt-warn: #9e4e2a;
            --dt-warn-soft: rgba(158, 78, 42, 0.12);
            --dt-danger: #b3261e;
          }

          /* Never override a high-contrast theme — hand every token back. */
          body.vscode-high-contrast,
          body.vscode-high-contrast-light {
            --dt-line: var(--vscode-contrastBorder, var(--vscode-panel-border));
            --dt-line-hi: var(--vscode-contrastBorder, var(--vscode-panel-border));
            --dt-raised: var(--vscode-editor-background);
            --dt-hover: var(--vscode-list-hoverBackground);
            --dt-text: var(--vscode-foreground);
            --dt-dim: var(--vscode-foreground);
            --dt-faint: var(--vscode-descriptionForeground);
            --dt-accent: var(--vscode-textLink-foreground);
            --dt-accent-ink: var(--vscode-editor-background);
            --dt-accent-soft: transparent;
            --dt-good: var(--vscode-foreground);
            --dt-warn: var(--vscode-foreground);
            --dt-warn-soft: transparent;
            --dt-danger: var(--vscode-errorForeground);
          }

          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }

          /* VS Code's own font rather than a hardcoded -apple-system stack, so
             the view matches the tree items directly above it. Transparent, so
             it sits on the side bar's background instead of the editor's. */
          body {
            font-family: var(--vscode-font-family), system-ui, sans-serif;
            font-size: 13px;
            line-height: 1.5;
            padding: 12px 14px 16px;
            background-color: transparent;
            color: var(--dt-text);
          }

          :focus-visible {
            outline: 1px solid var(--dt-accent);
            outline-offset: 2px;
            border-radius: 2px;
          }

          @media (prefers-reduced-motion: reduce) {
            *,
            *::before,
            *::after {
              animation-duration: 0.001ms !important;
              animation-iteration-count: 1 !important;
              transition-duration: 0.001ms !important;
            }
          }

          /* The card border and 20px of padding are gone: this view is often
             250px wide, and a box inside a box wasted a fifth of it. */
          .container {
            display: block;
          }

          .header {
            display: flex;
            align-items: center;
            gap: 9px;
            padding-bottom: 12px;
            margin-bottom: 12px;
            border-bottom: 1px solid var(--dt-line);
          }

          /* Matched to the title-and-subtitle block beside it: 13px and 11.5px
             on a line-height of 1.5 stack to just under 37px. */
          .logo {
            width: 36px;
            height: 36px;
            flex-shrink: 0;
            border-radius: 4px;
            overflow: hidden;
            background-image: url('${iconUri}');
            background-size: contain;
            background-repeat: no-repeat;
            background-position: center;
          }

          .title-section {
            min-width: 0;
          }

          .title-section h1 {
            font-size: 13px;
            font-weight: 650;
            letter-spacing: -0.005em;
            color: var(--dt-text);
          }

          .subtitle {
            font-size: 11.5px;
            color: var(--dt-faint);
          }

          /* A left rail rather than a tinted box with a blur behind it: at this
             width the status is a line of text, not a panel. */
          .status {
            padding: 7px 10px;
            margin-bottom: 12px;
            font-size: 12px;
            color: var(--dt-dim);
            background-color: var(--dt-raised);
            border-left: 2px solid var(--dt-line-hi);
            border-radius: 0 3px 3px 0;
          }

          .status.scanning {
            border-left-color: var(--dt-accent);
            color: var(--dt-text);
          }

          .status.success {
            border-left-color: var(--dt-good);
            color: var(--dt-text);
          }

          .status.error {
            border-left-color: var(--dt-danger);
            color: var(--dt-text);
          }

          .button-container {
            display: flex;
            flex-direction: column;
            gap: 6px;
          }

          /* Flat, full-width, 28px. The old buttons were 44px tall with a drop
             shadow and lifted on hover — three of them filled the view. */
          button {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 100%;
            min-height: 28px;
            padding: 0 12px;
            border: 1px solid transparent;
            border-radius: 4px;
            background-color: var(--dt-accent);
            color: var(--dt-accent-ink);
            font-family: inherit;
            font-size: 12.5px;
            font-weight: 600;
            cursor: pointer;
            transition:
              background-color 0.12s ease,
              border-color 0.12s ease;
          }

          button:hover {
            background-color: var(--dt-text);
          }

          button.btn-secondary {
            background-color: transparent;
            border-color: var(--dt-line-hi);
            color: var(--dt-text);
            font-weight: 550;
          }

          button.btn-secondary:hover {
            background-color: var(--dt-hover);
            border-color: var(--dt-accent);
          }

          /* The label is a bare text node, so it is an anonymous flex item and
             a gap on the button is not dependable across it. An explicit margin
             on the icon is, and it gives all four buttons the same spacing
             regardless of how close each glyph draws to its own right edge. */
          .icon {
            display: inline-flex;
            flex: none;
            margin-right: 8px;
          }

          .icon svg {
            display: block;
            width: 14px;
            height: 14px;
          }

          .scanning-files {
            padding: 8px 10px;
            margin-bottom: 12px;
            font-size: 11.5px;
            background-color: var(--dt-warn-soft);
            border-left: 2px solid var(--dt-warn);
            border-radius: 0 3px 3px 0;
          }

          .scanning-header {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 9.5px;
            font-weight: 600;
            letter-spacing: 0.13em;
            text-transform: uppercase;
            color: var(--dt-faint);
            margin-bottom: 5px;
          }

          .current-file {
            font-family: var(--vscode-editor-font-family), ui-monospace, monospace;
            font-size: 11px;
            color: var(--dt-dim);
            word-break: break-all;
          }

          .scanning-container {
            padding: 14px 12px;
            text-align: center;
            background-color: var(--dt-raised);
            border: 1px solid var(--dt-line);
            border-radius: 4px;
          }

          .scanning-title {
            position: relative;
            font-size: 12.5px;
            font-weight: 600;
            color: var(--dt-text);
            padding-bottom: 10px;
            margin-bottom: 4px;
          }

          /* A determinate bar would be a lie — the scan reports the file it is
             on, never a percentage — so this pulses rather than filling. */
          .scanning-title::after {
            content: '';
            position: absolute;
            left: 50%;
            bottom: 0;
            width: 90px;
            height: 2px;
            margin-left: -45px;
            border-radius: 1px;
            background-color: var(--dt-accent);
            animation: dt-pulse 1.4s ease-in-out infinite;
          }

          @keyframes dt-pulse {
            0%,
            100% {
              opacity: 0.25;
            }
            50% {
              opacity: 1;
            }
          }

          .scanning-subtitle {
            font-size: 11.5px;
            color: var(--dt-faint);
            margin-bottom: 12px;
          }

          .cancel-button {
            width: auto;
            min-height: 24px;
            padding: 0 12px;
            font-size: 11.5px;
            font-weight: 550;
            background-color: transparent;
            border: 1px solid var(--dt-line-hi);
            color: var(--dt-danger);
            margin: 0 auto;
          }

          .cancel-button:hover {
            background-color: var(--dt-hover);
            border-color: var(--dt-danger);
            color: var(--dt-danger);
          }

          .history-section {
            margin-top: 16px;
            padding-top: 12px;
            border-top: 1px solid var(--dt-line);
          }

          .history-header {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 9.5px;
            font-weight: 600;
            letter-spacing: 0.13em;
            text-transform: uppercase;
            color: var(--dt-faint);
            margin-bottom: 8px;
          }

          .history-count {
            margin-left: auto;
            font-size: 11px;
            letter-spacing: 0;
            text-transform: none;
            color: var(--dt-faint);
          }

          .history-list {
            max-height: 300px;
            overflow-y: auto;
            overflow-x: hidden;
          }

          .history-item {
            position: relative;
            padding: 6px 8px;
            border-radius: 3px;
            cursor: pointer;
            overflow: hidden;
            transition: background-color 0.12s ease;
          }

          /* The sidebar's own background is close enough to --dt-hover that the
             tint alone was almost invisible in dark themes, so an accent rail
             carries the hover instead, matching the results rows. It is a real
             element rather than an inset box-shadow: a shadow painted inside a
             scrolling list leaves repaint fragments behind as the pointer
             moves away. */
          .history-item::before {
            content: '';
            position: absolute;
            left: 0;
            top: 0;
            bottom: 0;
            width: 2px;
            background-color: var(--dt-accent);
            opacity: 0;
            transition: opacity 0.12s ease;
          }

          .history-item:hover {
            background-color: var(--dt-raised);
          }

          .history-item:hover::before {
            opacity: 1;
          }

          .history-item:hover .history-item-time,
          .history-item:hover .history-item-count {
            color: var(--dt-text);
          }

          .history-item-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            font-size: 11.5px;
          }

          .history-item-time {
            color: var(--dt-faint);
            flex-shrink: 0;
          }

          .history-item-count {
            color: var(--dt-dim);
            font-variant-numeric: tabular-nums;
            flex-shrink: 0;
          }

          /* Sits in the uppercase header row, so it is sized to that, not to a
             14px glyph, and pushed to the far edge away from the label. */
          .clear-history-btn {
            width: auto;
            min-height: 18px;
            margin-left: auto;
            padding: 0 5px;
            font-size: 13px;
            font-weight: 400;
            line-height: 1;
            background-color: transparent;
            border: 1px solid transparent;
            color: var(--dt-faint);
            border-radius: 3px;
          }

          .clear-history-btn:hover {
            background-color: transparent;
            border-color: var(--dt-danger);
            color: var(--dt-danger);
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo" aria-hidden="true"></div>
            <div class="title-section">
              <h1>Deprecated Tracker</h1>
              <p class="subtitle">Find and manage deprecated code</p>
            </div>
          </div>
          
          <div class="status" id="status">Ready to scan your project</div>
          
          <div class="scanning-files" id="scanningFiles" style="display: none;">
            <div class="scanning-header"><span class="icon"><svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M10.6 9.5a5 5 0 1 0-1.1 1.1l3.5 3.5 1.1-1.1-3.5-3.5zM6.5 10a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z"/></svg></span>Currently scanning</div>
            <div class="current-file" id="currentFile">Initializing...</div>
          </div>
          
          <div class="button-container" id="scanButtonContainer">
            <button id="scanButton">
              <span class="icon"><svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M10.6 9.5a5 5 0 1 0-1.1 1.1l3.5 3.5 1.1-1.1-3.5-3.5zM6.5 10a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z"/></svg></span>Scan Project
            </button>
            <button class="btn-secondary" id="settingsBtn">
              <span class="icon"><svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 5.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6zm0 1.4a1.4 1.4 0 1 1 0 2.8 1.4 1.4 0 0 1 0-2.8z"/><g><rect x="7.2" y="1" width="1.6" height="3" rx=".5"/><rect x="7.2" y="12" width="1.6" height="3" rx=".5"/><rect x="12" y="7.2" width="3" height="1.6" rx=".5"/><rect x="1" y="7.2" width="3" height="1.6" rx=".5"/></g><g transform="rotate(45 8 8)"><rect x="7.2" y="1" width="1.6" height="3" rx=".5"/><rect x="7.2" y="12" width="1.6" height="3" rx=".5"/><rect x="12" y="7.2" width="3" height="1.6" rx=".5"/><rect x="1" y="7.2" width="3" height="1.6" rx=".5"/></g></svg></span>Settings
            </button>
            <button class="btn-secondary" id="dashboardBtn" style="display: none;">
              <span class="icon"><svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><rect x="3" y="8" width="2.6" height="5.5" rx=".5"/><rect x="6.7" y="4.5" width="2.6" height="9" rx=".5"/><rect x="10.4" y="6.5" width="2.6" height="7" rx=".5"/></svg></span>Dashboard
            </button>
            <button class="btn-secondary" id="viewResultsBtn" style="display: none;">
              <span class="icon"><svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><rect x="3" y="3.5" width="10" height="1.5" rx=".75"/><rect x="3" y="7.25" width="10" height="1.5" rx=".75"/><rect x="3" y="11" width="10" height="1.5" rx=".75"/></svg></span>View Results
            </button>
          </div>
          
          <div class="scanning-container" id="scanningContainer" style="display: none;">
            <div class="scanning-title">Please wait...</div>
            <div class="scanning-subtitle">Scanning project for deprecated items</div>
            <button class="cancel-button" id="cancelScanBtn">Cancel Scan</button>
          </div>
          <!-- Scan History Section -->
          <div class="history-section" id="historySection" style="display: none;">
            <div class="history-header">
              <span class="icon"><svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zm0 1.4a5.1 5.1 0 1 1 0 10.2 5.1 5.1 0 0 1 0-10.2z"/><path d="M7.3 4.4h1.4v3.9l2.6 1.5-.7 1.2-3.3-1.9V4.4z"/></svg></span>
              <span>Scan History</span>
              <button class="clear-history-btn" id="clearHistoryBtn" title="Clear Scan History">
                ×
              </button>
            </div>
            <div class="history-list" id="historyList">
            </div>
          </div>
        </div>

        <script nonce="${nonce}">
          let vscode;
          try {
            vscode = acquireVsCodeApi();
            updateStatus('Ready to scan your project', 'ready');
          } catch (e) {
            updateStatus('Failed to connect', 'error');
          }

          document.getElementById('scanButton').addEventListener('click', scanProject);
          document.getElementById('settingsBtn').addEventListener('click', openSettings);
          document.getElementById('cancelScanBtn').addEventListener('click', cancelScan);
          document.getElementById('clearHistoryBtn').addEventListener('click', clearHistory);
          document.getElementById('viewResultsBtn').addEventListener('click', openResults);
          document.getElementById('dashboardBtn').addEventListener('click', openDashboard);

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

          // View Results is shown whenever results exist, and starting a scan
          // does not destroy the previous ones. Hiding it here left it hidden
          // for good if the scan was cancelled or failed, even though the
          // results it opens were still there. The whole button row is hidden
          // during a scan anyway, so there was nothing to hide.
          function scanProject() {
            if (vscode) {
              updateStatus('Scanning project for deprecated items...', 'scanning');
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

          function openDashboard() {
            if (vscode) {
              vscode.postMessage({ command: 'openDashboard' });
            } else {
              updateStatus('Error: VS Code API not available', 'error');
            }
          }

          function showDashboardButton(show = true) {
            const dashboardBtn = document.getElementById('dashboardBtn');
            if (dashboardBtn) {
              dashboardBtn.style.display = show ? 'block' : 'none';
            }
          }

          function openSettings() {
            if (vscode) {
              vscode.postMessage({ command: 'openSettings' });
            } else {
              updateStatus('Error: VS Code API not available', 'error');
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
              showDashboardButton(false);
              return;
            }

            historySection.style.display = 'block';
            showDashboardButton(true);
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
                '\u003cdiv class="history-item-row"\u003e' +
                  '\u003cspan class="history-item-time"\u003e' + timeStr + '\u003c/span\u003e' +
                  '\u003cspan class="history-item-count"\u003e' + scan.totalItems + ' items\u003c/span\u003e' +
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
              // Prefer the scan's own wording. A subset scan knows it only
              // covered part of the project; "your code is clean" would be a
              // flat lie after scanning six changed files.
              const statusMsg = message.message
                ? message.message
                : count > 0
                  ? 'Found ' + count + ' deprecated item(s)'
                  : 'No deprecated items found - your code is clean';
              updateStatus(statusMsg, 'success');
              updateScanningFile(null);
              showScanningState(false);
              showViewResultsButton(count > 0);
              loadHistory();
            } else if (message.command === 'scanCancelled') {
              updateStatus('Scan cancelled by user', 'error');
              updateScanningFile(null);
              showScanningState(false);
            } else if (message.command === 'scanFailed') {
              updateStatus(message.message || 'Scan failed', 'error');
              updateScanningFile(null);
              showScanningState(false);
            } else if (message.command === 'historyData') {
              renderHistory(message.history || []);
            } else if (message.command === 'resultsUpdated') {
              const count = message.resultsCount || 0;
              showViewResultsButton(count > 0);
            }
          });

          if (vscode) {
            vscode.postMessage({ command: 'webviewReady' });
          }
</script>
  </body>
  </html>`;
  }
}
