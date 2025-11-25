import * as vscode from 'vscode';
import { COMMAND_SCAN } from './constants';
import { TreeNode } from './interfaces';
import { IgnoreManager } from './scanner/ignoreManager';
import { DeprecatedTrackerSidebarProvider } from './sidebar';
import { MainPanel } from './webview';

let sidebarProvider: DeprecatedTrackerSidebarProvider;

export function activate(context: vscode.ExtensionContext): void {
  sidebarProvider = new DeprecatedTrackerSidebarProvider(context);

  const scanCommand = vscode.commands.registerCommand(COMMAND_SCAN, async () => {
    try {
      await sidebarProvider.scanProject();
      MainPanel.createOrShow(context.extensionUri, context);
    } catch (error) {
      vscode.window.showErrorMessage(`Deprecated Tracker Error: ${error}`);
    }
  });

  context.subscriptions.push(scanCommand);

  const ignoreFileCommand = vscode.commands.registerCommand(
    'deprecatedTracker.ignoreFile',
    async () => {
      vscode.window.showInformationMessage(
        'Ignoring by file is no longer supported. Please ignore methods/properties.'
      );
    }
  );

  const ignoreMethodCommand = vscode.commands.registerCommand(
    'deprecatedTracker.ignoreMethod',
    async (node?: TreeNode) => {
      try {
        const ignoreManager = new IgnoreManager(context);
        const filePath = node?.item?.filePath;
        const methodName = node?.item?.name;
        if (
          typeof filePath === 'string' &&
          filePath.length > 0 &&
          typeof methodName === 'string' &&
          methodName.length > 0
        ) {
          ignoreManager.ignoreMethod(filePath, methodName);
          await vscode.commands.executeCommand(COMMAND_SCAN);
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Ignore Method failed: ${error}`);
      }
    }
  );

  const exportCommand = vscode.commands.registerCommand(
    'deprecatedTracker.exportResults',
    async () => {
      try {
        const results = MainPanel.getCurrentResults();
        if (!results || results.length === 0) {
          vscode.window.showWarningMessage(
            'No deprecated items to export. Please run a scan first.'
          );
          return;
        }

        const format = await vscode.window.showQuickPick(
          [
            { label: 'CSV', value: 'csv' },
            { label: 'JSON', value: 'json' },
            { label: 'Markdown', value: 'markdown' },
          ],
          { placeHolder: 'Select export format' }
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

        const { ResultExporter } = await import('./exporter');
        const exporter = new ResultExporter();
        let content: string;

        switch (format.value) {
          case 'csv':
            content = exporter.exportToCSV(results);
            break;
          case 'json':
            content = exporter.exportToJSON(results);
            break;
          case 'markdown':
            content = exporter.exportToMarkdown(results);
            break;
          default:
            throw new Error(`Unsupported format: ${format.value}`);
        }

        await exporter.saveToFile(content, uri.fsPath);
        vscode.window.showInformationMessage(`Results exported successfully to ${uri.fsPath}`);
      } catch (error) {
        vscode.window.showErrorMessage(`Export failed: ${error}`);
      }
    }
  );

  context.subscriptions.push(ignoreFileCommand, ignoreMethodCommand, exportCommand);
}

export function deactivate(): void {
  // Cleanup is handled by VS Code's context subscriptions
}
