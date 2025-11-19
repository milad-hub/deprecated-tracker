import * as vscode from "vscode";
import { COMMAND_SCAN } from "./constants";
import { IgnoreManager } from "./scanner/ignoreManager";
import { DeprecatedTrackerSidebarProvider } from "./sidebar";
import { MainPanel } from "./webview";

let sidebarProvider: DeprecatedTrackerSidebarProvider;

export function activate(context: vscode.ExtensionContext): void {
  sidebarProvider = new DeprecatedTrackerSidebarProvider(context);

  const scanCommand = vscode.commands.registerCommand(
    COMMAND_SCAN,
    async () => {
      try {
        await sidebarProvider.scanProject();
        MainPanel.createOrShow(context.extensionUri, context);
      } catch (error) {
        vscode.window.showErrorMessage(`Deprecated Tracker Error: ${error}`);
      }
    },
  );

  context.subscriptions.push(scanCommand);

  const ignoreFileCommand = vscode.commands.registerCommand(
    "deprecatedTracker.ignoreFile",
    async () => {
      vscode.window.showInformationMessage(
        "Ignoring by file is no longer supported. Please ignore methods/properties.",
      );
    },
  );

  const ignoreMethodCommand = vscode.commands.registerCommand(
    "deprecatedTracker.ignoreMethod",
    async (node?: any) => {
      try {
        const ignoreManager = new IgnoreManager(context);
        const filePath = node?.item?.filePath;
        const methodName = node?.item?.name;
        if (
          typeof filePath === "string" &&
          filePath.length > 0 &&
          typeof methodName === "string" &&
          methodName.length > 0
        ) {
          ignoreManager.ignoreMethod(filePath, methodName);
          await vscode.commands.executeCommand(COMMAND_SCAN);
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Ignore Method failed: ${error}`);
      }
    },
  );

  context.subscriptions.push(ignoreFileCommand, ignoreMethodCommand);
}

export function deactivate(): void {
  // Cleanup is handled by VS Code's context subscriptions
}
