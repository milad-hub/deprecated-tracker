import * as vscode from "vscode";
import { ConfigReader } from "./config/configReader";
import {
  COMMAND_SCAN,
  COMMAND_SCAN_FILE,
  COMMAND_SCAN_FOLDER,
} from "./constants";
import { TreeNode } from "./interfaces";
import { IgnoreManager } from "./scanner/ignoreManager";
import { DeprecatedTrackerSidebarProvider } from "./sidebar";
import { StatisticsCalculator } from "./stats";
import { MainPanel, SettingsPanel, StatisticsPanel } from "./webview";

let sidebarProvider: DeprecatedTrackerSidebarProvider;

export async function activate(
  context: vscode.ExtensionContext,
): Promise<void> {
  let config;
  try {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
      const configReader = new ConfigReader();
      config = await configReader.loadConfiguration(workspaceFolder.uri.fsPath);
    }
  } catch (error) {
    console.warn("Failed to load configuration, using defaults:", error);
  }

  sidebarProvider = new DeprecatedTrackerSidebarProvider(context, config);
  const settingsPanel = new SettingsPanel(context, context.extensionUri);

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
    async (node?: TreeNode) => {
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

  const exportCommand = vscode.commands.registerCommand(
    "deprecatedTracker.exportResults",
    async () => {
      try {
        const results = MainPanel.getCurrentResults();
        if (!results || results.length === 0) {
          vscode.window.showWarningMessage(
            "No deprecated items to export. Please run a scan first.",
          );
          return;
        }

        const format = await vscode.window.showQuickPick(
          [
            { label: "CSV", value: "csv" },
            { label: "JSON", value: "json" },
            { label: "Markdown", value: "markdown" },
          ],
          { placeHolder: "Select export format" },
        );

        if (!format) {
          return;
        }

        const extension = format.value;
        const uri = await vscode.window.showSaveDialog({
          defaultUri: vscode.Uri.file(`deprecated-items.${extension}`),
          filters: {
            [format.label]: [extension],
          },
        });

        if (!uri) {
          return;
        }

        const { ResultExporter } = await import("./exporter");
        const exporter = new ResultExporter();
        let content: string;

        switch (format.value) {
          case "csv":
            content = exporter.exportToCSV(results);
            break;
          case "json":
            content = exporter.exportToJSON(results);
            break;
          case "markdown":
            content = exporter.exportToMarkdown(results);
            break;
          default:
            throw new Error(`Unsupported format: ${format.value}`);
        }

        await exporter.saveToFile(content, uri.fsPath);
        vscode.window.showInformationMessage(
          `Results exported successfully to ${uri.fsPath}`,
        );
      } catch (error) {
        vscode.window.showErrorMessage(`Export failed: ${error}`);
      }
    },
  );

  const scanFolderCommand = vscode.commands.registerCommand(
    COMMAND_SCAN_FOLDER,
    async (uri?: vscode.Uri) => {
      try {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
          vscode.window.showErrorMessage("No workspace folder found");
          return;
        }

        let targetFolderUri: vscode.Uri | undefined = uri;

        if (!targetFolderUri) {
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

          targetFolderUri = result[0];
        }

        const targetFolderPath = targetFolderUri.fsPath;
        const workspacePath = workspaceFolder.uri.fsPath;

        if (!targetFolderPath.startsWith(workspacePath)) {
          vscode.window.showErrorMessage(
            "Selected folder must be within the workspace",
          );
          return;
        }

        await sidebarProvider.scanFolder(targetFolderPath);
        const panel = MainPanel.createOrShow(context.extensionUri, context);
        const results = sidebarProvider.getCurrentResults();
        panel.updateResults(results);
      } catch (error) {
        vscode.window.showErrorMessage(`Folder Scan Error: ${error}`);
      }
    },
  );

  const scanFileCommand = vscode.commands.registerCommand(
    COMMAND_SCAN_FILE,
    async (uri?: vscode.Uri) => {
      try {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
          vscode.window.showErrorMessage("No workspace folder found");
          return;
        }

        let targetFileUri: vscode.Uri | undefined = uri;

        if (!targetFileUri) {
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

          targetFileUri = result[0];
        }

        const targetFilePath = targetFileUri.fsPath;
        const workspacePath = workspaceFolder.uri.fsPath;

        if (!targetFilePath.startsWith(workspacePath)) {
          vscode.window.showErrorMessage(
            "Selected file must be within the workspace",
          );
          return;
        }

        await sidebarProvider.scanFile(targetFilePath);
        const panel = MainPanel.createOrShow(context.extensionUri, context);
        const results = sidebarProvider.getCurrentResults();
        panel.updateResults(results);
      } catch (error) {
        vscode.window.showErrorMessage(`File Scan Error: ${error}`);
      }
    },
  );

  const showStatisticsCommand = vscode.commands.registerCommand(
    "deprecatedTracker.showStatistics",
    async () => {
      try {
        const results = MainPanel.getCurrentResults();
        if (!results || results.length === 0) {
          vscode.window.showWarningMessage(
            "No scan results available. Please run a scan first.",
          );
          return;
        }

        const calculator = new StatisticsCalculator();
        const statistics = calculator.calculateStatistics(results);
        StatisticsPanel.createOrShow(context.extensionUri, context, statistics);
      } catch (error) {
        vscode.window.showErrorMessage(`Statistics Error: ${error}`);
      }
    },
  );

  const openSettingsCommand = vscode.commands.registerCommand(
    "deprecatedTracker.openSettings",
    () => {
      settingsPanel.show();
    },
  );

  context.subscriptions.push(
    ignoreFileCommand,
    ignoreMethodCommand,
    exportCommand,
    scanFolderCommand,
    scanFileCommand,
    showStatisticsCommand,
    openSettingsCommand,
  );
}

export function deactivate(): void {
  // Cleanup is handled by VS Code's context subscriptions
}
