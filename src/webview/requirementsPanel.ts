import * as vscode from "vscode";
import { MESSAGE_COMMANDS, TSCONFIG_FILE } from "../constants";
import { RequirementActionId, RequirementReport } from "../interfaces";
import { evaluateRequirements } from "../requirements";
import { getWebviewHtml } from "./templateLoader";

const STARTER_TSCONFIG = `{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "allowJs": true,
    "checkJs": false,
    "skipLibCheck": true
  }
}
`;

export class RequirementsPanel {
  public static currentPanel: RequirementsPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private readonly _context: vscode.ExtensionContext;
  private _disposables: vscode.Disposable[] = [];
  private _report: RequirementReport;
  private _isWebviewReady = false;

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    context: vscode.ExtensionContext,
    report: RequirementReport,
  ) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._context = context;
    this._report = report;

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case MESSAGE_COMMANDS.WEBVIEW_READY:
            this._isWebviewReady = true;
            this.updateReport(this._report);
            return;
          case MESSAGE_COMMANDS.REFRESH_REQUIREMENTS:
            this.updateReport(evaluateRequirements());
            return;
          case MESSAGE_COMMANDS.RUN_REQUIREMENT_ACTION:
            await this.runAction(message.action as RequirementActionId);
            return;
        }
      },
      null,
      this._disposables,
    );

    void this._update();
  }

  public static createOrShow(
    extensionUri: vscode.Uri,
    context: vscode.ExtensionContext,
    report: RequirementReport,
  ): void {
    if (RequirementsPanel.currentPanel) {
      RequirementsPanel.currentPanel._panel.reveal();
      RequirementsPanel.currentPanel.updateReport(report);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      "deprecatedTrackerRequirements",
      "Deprecated Tracker - Requirements",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, "out", "src", "webview", "assets"),
        ],
      },
    );

    RequirementsPanel.currentPanel = new RequirementsPanel(
      panel,
      extensionUri,
      context,
      report,
    );
  }

  /**
   * Opens the page only when something blocking is unmet, and reports whether
   * it did. Called when the user reaches for the extension rather than at
   * activation: opening an unrelated folder should not raise a page about a
   * missing tsconfig for a tool the user never invoked.
   *
   * Never throws — a failed check must not take the caller's command with it.
   */
  public static showIfBlocked(
    extensionUri: vscode.Uri,
    context: vscode.ExtensionContext,
  ): boolean {
    try {
      const report = evaluateRequirements();
      if (!report.unmetBlocking) {
        return false;
      }
      RequirementsPanel.createOrShow(extensionUri, context, report);
      return true;
    } catch (error) {
      console.warn("Requirements check failed:", error);
      return false;
    }
  }

  public updateReport(report: RequirementReport): void {
    this._report = report;
    if (!this._isWebviewReady) {
      return;
    }
    this._panel.webview.postMessage({
      command: MESSAGE_COMMANDS.UPDATE_REQUIREMENTS,
      requirements: report.requirements,
    });
  }

  private async runAction(action: RequirementActionId): Promise<void> {
    try {
      switch (action) {
        case "openFolder":
          await vscode.commands.executeCommand(
            "workbench.action.files.openFolder",
          );
          break;
        case "reload":
          await vscode.commands.executeCommand("workbench.action.reloadWindow");
          break;
        case "createTsconfig":
          await this.createStarterTsconfig();
          break;
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Requirement action failed: ${error}`);
    }
    this.updateReport(evaluateRequirements());
  }

  private async createStarterTsconfig(): Promise<void> {
    const folder = (vscode.workspace.workspaceFolders || [])[0];
    if (!folder) {
      vscode.window.showErrorMessage(
        "Open a folder before creating a tsconfig.json.",
      );
      return;
    }

    const target = vscode.Uri.joinPath(folder.uri, TSCONFIG_FILE);
    let exists = true;
    try {
      await vscode.workspace.fs.stat(target);
    } catch {
      exists = false;
    }
    if (exists) {
      vscode.window.showWarningMessage(
        `${target.fsPath} already exists — leaving it alone.`,
      );
      return;
    }

    await vscode.workspace.fs.writeFile(
      target,
      new TextEncoder().encode(STARTER_TSCONFIG),
    );
    vscode.window.showInformationMessage(`Created ${target.fsPath}`);
  }

  public dispose(): void {
    RequirementsPanel.currentPanel = undefined;
    this._panel.dispose();
    for (const disposable of this._disposables.splice(0)) {
      disposable.dispose();
    }
  }

  private async _update(): Promise<void> {
    try {
      this._isWebviewReady = false;
      this._panel.webview.html = await getWebviewHtml(
        this._panel.webview,
        this._extensionUri,
        this._context,
        "requirements",
      );
    } catch (error) {
      console.error("Failed to initialize requirements panel webview:", error);
    }
  }
}
