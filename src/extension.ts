import * as vscode from "vscode";
import { ConfigReader } from "./config/configReader";
import { TagsManager } from "./config/tagsManager";
import { ResultExporter } from "./exporter";
import {
  COMMAND_CHECK_REQUIREMENTS,
  COMMAND_SCAN,
  COMMAND_SCAN_CHANGES,
  COMMAND_SCAN_FILE,
  COMMAND_SCAN_FOLDER,
} from "./constants";
import { DEFAULT_CONFIG, DeprecatedTrackerConfig } from "./interfaces";
import { evaluateRequirements } from "./requirements";
import { IgnoreManager } from "./scanner/ignoreManager";
import { DeprecatedTrackerSidebarProvider } from "./sidebar";
import { StatisticsCalculator } from "./stats";
import { PathUtils } from "./utils/pathUtils";
import {
  MainPanel,
  RequirementsPanel,
  SettingsPanel,
  StatisticsPanel,
} from "./webview";

let sidebarProvider: DeprecatedTrackerSidebarProvider;

export async function activate(
  context: vscode.ExtensionContext,
): Promise<void> {
  const configReader = new ConfigReader();
  const ignoreManager = new IgnoreManager(context);
  const tagsManager = new TagsManager(context);

  sidebarProvider = new DeprecatedTrackerSidebarProvider(
    context,
    ignoreManager,
    tagsManager,
  );

  let reloadTimer: NodeJS.Timeout | undefined;
  let configWatchers: vscode.Disposable[] = [];

  /**
   * Resolves the workspace configuration. Every folder is consulted in order
   * and the first one that defines a config wins, so a multi-root workspace
   * whose config lives outside the first folder is still honoured.
   */
  const loadWorkspaceConfiguration = async (): Promise<
    DeprecatedTrackerConfig | undefined
  > => {
    const folders = vscode.workspace.workspaceFolders || [];
    for (const folder of folders) {
      const folderConfig = await configReader.tryLoadConfiguration(
        folder.uri.fsPath,
      );
      if (folderConfig) {
        return folderConfig;
      }
    }
    return folders.length > 0 ? { ...DEFAULT_CONFIG } : undefined;
  };

  const applyConfiguration = async (): Promise<void> => {
    try {
      const loaded = await loadWorkspaceConfiguration();
      if (loaded) {
        sidebarProvider.updateConfig(loaded);
      }
    } catch (error) {
      console.warn("Failed to load configuration, using defaults:", error);
    }
  };

  const scheduleReload = (): void => {
    if (reloadTimer) {
      clearTimeout(reloadTimer);
    }
    reloadTimer = setTimeout(() => void applyConfiguration(), 200);
  };

  // Watchers are rebuilt whenever the folder set changes so that folders added
  // after activation get their config picked up too.
  const rebuildConfigWatchers = (): void => {
    for (const disposable of configWatchers) {
      disposable.dispose();
    }
    configWatchers = [];

    for (const folder of vscode.workspace.workspaceFolders || []) {
      for (const fileName of [".deprecatedtrackerrc", "package.json"]) {
        const watcher = vscode.workspace.createFileSystemWatcher(
          new vscode.RelativePattern(folder, fileName),
        );
        configWatchers.push(
          watcher,
          watcher.onDidCreate(scheduleReload),
          watcher.onDidChange(scheduleReload),
          watcher.onDidDelete(scheduleReload),
        );
      }
    }
  };

  rebuildConfigWatchers();

  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      rebuildConfigWatchers();
      scheduleReload();
      syncScanChangesStatusItem();
    }),
    {
      dispose: (): void => {
        if (reloadTimer) {
          clearTimeout(reloadTimer);
        }
        for (const disposable of configWatchers) {
          disposable.dispose();
        }
        configWatchers = [];
      },
    },
  );

  const settingsPanel = new SettingsPanel(
    context,
    context.extensionUri,
    tagsManager,
  );
  context.subscriptions.push(settingsPanel);

  /**
   * Guards the actions that cannot work without a scannable project. Raising
   * the page here — rather than at activation — means a user who opens an
   * unrelated repository is never interrupted by a tool they did not ask for.
   */
  const blockedByRequirements = (): boolean =>
    RequirementsPanel.showIfBlocked(context.extensionUri, context);

  const scanCommand = vscode.commands.registerCommand(
    COMMAND_SCAN,
    async () => {
      try {
        if (blockedByRequirements()) {
          return;
        }
        await sidebarProvider.scanProject();
      } catch (error) {
        vscode.window.showErrorMessage(`Deprecated Tracker Error: ${error}`);
      }
    },
  );

  context.subscriptions.push(scanCommand);

  const ignoreFileCommand = vscode.commands.registerCommand(
    "deprecatedTracker.ignoreFile",
    async (uri?: vscode.Uri) => {
      try {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        const workspaceFolder = workspaceFolders?.[0];
        if (!workspaceFolder) {
          vscode.window.showErrorMessage("No workspace folder found");
          return;
        }
        let targetFileUri = uri || vscode.window.activeTextEditor?.document.uri;
        if (
          !targetFileUri ||
          targetFileUri.scheme !== "file" ||
          !PathUtils.folderContaining(workspaceFolders, targetFileUri.fsPath)
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

        if (!PathUtils.folderContaining(workspaceFolders, targetFileUri.fsPath)) {
          vscode.window.showErrorMessage(
            "Selected file must be within the workspace",
          );
          return;
        }

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
            { label: "Copy prompt for AI fix", value: "ai-prompt" },
          ],
          { placeHolder: "Select export format" },
        );

        if (!format) {
          return;
        }

        if (format.value === "ai-prompt") {
          MainPanel.currentPanel?.showAiFixPrompt();
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
        if (blockedByRequirements()) {
          return;
        }
        const workspaceFolders = vscode.workspace.workspaceFolders;
        const workspaceFolder = workspaceFolders?.[0];
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

        if (!PathUtils.folderContaining(workspaceFolders, targetFolderPath)) {
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
        if (blockedByRequirements()) {
          return;
        }
        const workspaceFolders = vscode.workspace.workspaceFolders;
        const workspaceFolder = workspaceFolders?.[0];
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

        if (!PathUtils.folderContaining(workspaceFolders, targetFilePath)) {
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

  const scanChangesCommand = vscode.commands.registerCommand(
    COMMAND_SCAN_CHANGES,
    async () => {
      try {
        if (blockedByRequirements()) {
          return;
        }
        await sidebarProvider.scanChanges();
      } catch (error) {
        vscode.window.showErrorMessage(`Changes Scan Error: ${error}`);
      }
    },
  );

  const scanChangesStatusItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  );
  // Icon only. Status bar text takes codicons, not the extension's own SVG —
  // a custom glyph there would need an icon font, not media/activity-icon.svg.
  scanChangesStatusItem.text = "$(code)";
  scanChangesStatusItem.tooltip =
    "Deprecated Tracker: Scan Changes — scan the files git says you have changed";
  scanChangesStatusItem.command = COMMAND_SCAN_CHANGES;

  // Nothing to scan without a folder open. No setting to hide it: VS Code
  // already lets users hide any status bar item from its context menu.
  const syncScanChangesStatusItem = (): void => {
    if ((vscode.workspace.workspaceFolders || []).length > 0) {
      scanChangesStatusItem.show();
    } else {
      scanChangesStatusItem.hide();
    }
  };
  syncScanChangesStatusItem();

  const showStatisticsCommand = vscode.commands.registerCommand(
    "deprecatedTracker.showStatistics",
    async () => {
      try {
        const results = await sidebarProvider.getLatestScanResults();
        if (!results || results.length === 0) {
          vscode.window.showWarningMessage(
            "No scan results available. Please run a scan first.",
          );
          return;
        }

        const calculator = new StatisticsCalculator();
        const statistics = calculator.calculateStatistics(results);
        const trend = await sidebarProvider.getScanTrend();
        StatisticsPanel.createOrShow(
          context.extensionUri,
          context,
          statistics,
          trend,
        );
      } catch (error) {
        vscode.window.showErrorMessage(`Statistics Error: ${error}`);
      }
    },
  );

  const checkRequirementsCommand = vscode.commands.registerCommand(
    COMMAND_CHECK_REQUIREMENTS,
    () => {
      RequirementsPanel.createOrShow(
        context.extensionUri,
        context,
        evaluateRequirements(),
      );
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
    scanChangesCommand,
    scanChangesStatusItem,
    showStatisticsCommand,
    checkRequirementsCommand,
    openSettingsCommand,
  );

  // Loaded last: commands must be usable immediately, and the config only
  // affects the scanner, which is rebuilt when this resolves.
  await applyConfiguration();
}

export function deactivate(): void {
  // Cleanup is handled by VS Code's context subscriptions
}
