import * as vscode from "vscode";
import { ConfigReader } from "./config/configReader";
import { ResultExporter } from "./exporter";
import {
  COMMAND_SCAN,
  COMMAND_SCAN_FILE,
  COMMAND_SCAN_FOLDER,
} from "./constants";
import { DeprecatedTrackerConfig } from "./interfaces";
import { IgnoreManager } from "./scanner/ignoreManager";
import { DeprecatedTrackerSidebarProvider } from "./sidebar";
import { StatisticsCalculator } from "./stats";
import { PathUtils } from "./utils/pathUtils";
import { MainPanel, SettingsPanel, StatisticsPanel } from "./webview";

let sidebarProvider: DeprecatedTrackerSidebarProvider;

export async function activate(
  context: vscode.ExtensionContext,
): Promise<void> {
  let config: DeprecatedTrackerConfig | undefined;
  const configReader = new ConfigReader();
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  try {
    if (workspaceFolder) {
      config = await configReader.loadConfiguration(workspaceFolder.uri.fsPath);
    }
  } catch (error) {
    console.warn("Failed to load configuration, using defaults:", error);
  }

  sidebarProvider = new DeprecatedTrackerSidebarProvider(context, config);

  if (workspaceFolder) {
    let reloadTimer: NodeJS.Timeout | undefined;
    const reloadConfiguration = async (): Promise<void> => {
      try {
        config = await configReader.loadConfiguration(
          workspaceFolder.uri.fsPath,
        );
        sidebarProvider.updateConfig(config);
        MainPanel.currentPanel?.updateConfig(config);
      } catch (error) {
        console.warn("Failed to reload configuration:", error);
      }
    };
    const scheduleReload = (): void => {
      if (reloadTimer) {
        clearTimeout(reloadTimer);
      }
      reloadTimer = setTimeout(() => void reloadConfiguration(), 200);
    };

    for (const fileName of [".deprecatedtrackerrc", "package.json"]) {
      const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(workspaceFolder, fileName),
      );
      context.subscriptions.push(
        watcher,
        watcher.onDidCreate(scheduleReload),
        watcher.onDidChange(scheduleReload),
        watcher.onDidDelete(scheduleReload),
      );
    }
    context.subscriptions.push({
      dispose: (): void => {
        if (reloadTimer) {
          clearTimeout(reloadTimer);
        }
      },
    });
  }

  const settingsPanel = new SettingsPanel(context, context.extensionUri);

  const scanCommand = vscode.commands.registerCommand(
    COMMAND_SCAN,
    async () => {
      try {
        await sidebarProvider.scanProject();
      } catch (error) {
        vscode.window.showErrorMessage(`Deprecated Tracker Error: ${error}`);
      }
    },
  );

  context.subscriptions.push(scanCommand);

  const ignoreFileCommand = vscode.commands.registerCommand(
    "deprecatedTracker.ignoreFile",
    async () => {
      try {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
          vscode.window.showErrorMessage("No workspace folder found");
          return;
        }

        let targetFileUri = vscode.window.activeTextEditor?.document.uri;
        if (
          !targetFileUri ||
          targetFileUri.scheme !== "file" ||
          !PathUtils.isWithin(workspaceFolder.uri.fsPath, targetFileUri.fsPath)
        ) {
          const result = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            defaultUri: workspaceFolder.uri,
            openLabel: "Select File to Ignore",
          });
          if (!result?.length) {
            return;
          }
          targetFileUri = result[0];
        }

        if (
          !PathUtils.isWithin(workspaceFolder.uri.fsPath, targetFileUri.fsPath)
        ) {
          vscode.window.showErrorMessage(
            "Selected file must be within the workspace",
          );
          return;
        }

        const ignoreManager = new IgnoreManager(context);
        ignoreManager.ignoreFile(targetFileUri.fsPath);
        await vscode.commands.executeCommand(COMMAND_SCAN);
      } catch (error) {
        vscode.window.showErrorMessage(`Ignore File failed: ${error}`);
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

        const exporter = new ResultExporter();
        await exporter.saveToFile(
          exporter.export(results, format.value),
          uri.fsPath,
        );
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

        if (!PathUtils.isWithin(workspacePath, targetFolderPath)) {
          vscode.window.showErrorMessage(
            "Selected folder must be within the workspace",
          );
          return;
        }

        await sidebarProvider.scanFolder(targetFolderPath);
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

        if (!PathUtils.isWithin(workspacePath, targetFilePath)) {
          vscode.window.showErrorMessage(
            "Selected file must be within the workspace",
          );
          return;
        }

        await sidebarProvider.scanFile(targetFilePath);
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
