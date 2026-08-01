import * as vscode from 'vscode';
import { ConfigReader } from '../../src/config/configReader';
import { activate, deactivate } from '../../src/extension';
import { DEFAULT_CONFIG } from '../../src/interfaces';
import { IgnoreManager } from '../../src/scanner/ignoreManager';
import { DeprecatedTrackerSidebarProvider } from '../../src/sidebar';

describe('Extension', () => {
  let mockContext: vscode.ExtensionContext;
  let registeredCommands: Map<string, Function>;

  beforeEach(() => {
    jest.clearAllMocks();
    (vscode.workspace as any).workspaceFolders = undefined;
    (vscode.window as any).activeTextEditor = undefined;
    registeredCommands = new Map();
    const extensionPath = '/test/path';
    const extensionUri = vscode.Uri.file(extensionPath);
    const workspaceState: { [key: string]: unknown } = {};
    const globalState: { [key: string]: unknown } = {};
    mockContext = {
      subscriptions: [],
      workspaceState: {
        get: jest.fn((key: string) => workspaceState[key]),
        update: jest.fn((key: string, value: unknown) => {
          workspaceState[key] = value;
          return Promise.resolve();
        }),
        keys: jest.fn(() => Object.keys(workspaceState)),
      },
      globalState: {
        get: jest.fn((key: string) => globalState[key]),
        update: jest.fn((key: string, value: unknown) => {
          globalState[key] = value;
          return Promise.resolve();
        }),
        keys: jest.fn(() => Object.keys(globalState)),
      },
      extensionPath,
      extensionUri,
      storagePath: '/test/storage',
      globalStoragePath: '/test/global-storage',
      logPath: '/test/log',
      extensionMode: vscode.ExtensionMode.Test,
      secrets: {} as vscode.SecretStorage,
      environmentVariableCollection: {} as vscode.EnvironmentVariableCollection,
      asAbsolutePath: (relativePath: string) =>
        vscode.Uri.joinPath(extensionUri, relativePath).fsPath,
      storageUri: vscode.Uri.file('/test/storage'),
      globalStorageUri: vscode.Uri.file('/test/global-storage'),
      logUri: vscode.Uri.file('/test/log'),
      extension: undefined,
      languageModelAccessInformation: undefined,
    } as unknown as vscode.ExtensionContext;
    jest.spyOn(vscode.commands, 'registerCommand').mockImplementation((command: string, callback: Function) => {
      registeredCommands.set(command, callback);
      return { dispose: jest.fn() } as vscode.Disposable;
    });
    jest.spyOn(vscode.commands, 'executeCommand').mockResolvedValue(undefined);
    jest.spyOn(vscode.window, 'showErrorMessage').mockResolvedValue(undefined);
    jest.spyOn(vscode.window, 'showInformationMessage').mockResolvedValue(undefined);
    jest.spyOn(vscode.window, 'showOpenDialog').mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('activate', () => {
    it('should activate extension and register scan command', () => {
      activate(mockContext);
      expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
        'deprecatedTracker.scan',
        expect.any(Function)
      );
      expect(mockContext.subscriptions.length).toBeGreaterThan(0);
    });

    it('should register ignoreFile command', () => {
      activate(mockContext);
      expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
        'deprecatedTracker.ignoreFile',
        expect.any(Function)
      );
    });

    it('should register all commands in subscriptions', () => {
      activate(mockContext);
      expect(mockContext.subscriptions.length).toBe(16);
    });

    it('should reload configuration after root config file events', async () => {
      jest.useFakeTimers();
      const callbacks: Array<() => void> = [];
      const watcher = {
        dispose: jest.fn(),
        onDidCreate: jest.fn((callback: () => void) => {
          callbacks.push(callback);
          return { dispose: jest.fn() };
        }),
        onDidChange: jest.fn((callback: () => void) => {
          callbacks.push(callback);
          return { dispose: jest.fn() };
        }),
        onDidDelete: jest.fn((callback: () => void) => {
          callbacks.push(callback);
          return { dispose: jest.fn() };
        }),
      };
      (vscode.workspace as any).workspaceFolders = [{
        uri: vscode.Uri.file('/workspace'),
        name: 'workspace',
        index: 0,
      }];
      jest.spyOn(vscode.workspace, 'createFileSystemWatcher')
        .mockReturnValue(watcher as unknown as vscode.FileSystemWatcher);
      const loadConfiguration = jest.spyOn(ConfigReader.prototype, 'tryLoadConfiguration')
        .mockResolvedValue(DEFAULT_CONFIG);
      const updateConfig = jest.spyOn(
        DeprecatedTrackerSidebarProvider.prototype,
        'updateConfig',
      );

      await activate(mockContext);
      callbacks.forEach((callback) => callback());
      jest.advanceTimersByTime(200);
      await Promise.resolve();

      expect(vscode.workspace.createFileSystemWatcher).toHaveBeenCalledTimes(2);
      expect(watcher.onDidCreate).toHaveBeenCalledTimes(2);
      expect(watcher.onDidChange).toHaveBeenCalledTimes(2);
      expect(watcher.onDidDelete).toHaveBeenCalledTimes(2);
      expect(loadConfiguration).toHaveBeenCalledTimes(2);
      expect(updateConfig).toHaveBeenCalledWith(DEFAULT_CONFIG);
    });

    it('rebuilds watchers and reloads config when the folder set changes', async () => {
      jest.useFakeTimers();
      const watcher = {
        dispose: jest.fn(),
        onDidCreate: jest.fn(() => ({ dispose: jest.fn() })),
        onDidChange: jest.fn(() => ({ dispose: jest.fn() })),
        onDidDelete: jest.fn(() => ({ dispose: jest.fn() })),
      };
      (vscode.workspace as any).workspaceFolders = [{
        uri: vscode.Uri.file('/workspace'),
        name: 'workspace',
        index: 0,
      }];
      jest.spyOn(vscode.workspace, 'createFileSystemWatcher')
        .mockReturnValue(watcher as unknown as vscode.FileSystemWatcher);
      let onFoldersChanged: (() => void) | undefined;
      jest.spyOn(vscode.workspace, 'onDidChangeWorkspaceFolders')
        .mockImplementation(((callback: () => void) => {
          onFoldersChanged = callback;
          return { dispose: jest.fn() };
        }) as any);
      const tryLoadConfiguration = jest
        .spyOn(ConfigReader.prototype, 'tryLoadConfiguration')
        .mockResolvedValue(DEFAULT_CONFIG);

      await activate(mockContext);
      tryLoadConfiguration.mockClear();
      (vscode.workspace as any).workspaceFolders = [
        { uri: vscode.Uri.file('/workspace'), name: 'workspace', index: 0 },
        { uri: vscode.Uri.file('/second'), name: 'second', index: 1 },
      ];

      onFoldersChanged!();
      jest.advanceTimersByTime(200);
      await Promise.resolve();

      // Two watchers for the first folder get disposed and four are created.
      expect(watcher.dispose).toHaveBeenCalled();
      expect(vscode.workspace.createFileSystemWatcher).toHaveBeenCalledTimes(6);
      expect(tryLoadConfiguration).toHaveBeenCalled();
    });

    it('falls through to the next folder until one defines a config', async () => {
      (vscode.workspace as any).workspaceFolders = [
        { uri: vscode.Uri.file('/first'), name: 'first', index: 0 },
        { uri: vscode.Uri.file('/second'), name: 'second', index: 1 },
      ];
      jest.spyOn(vscode.workspace, 'createFileSystemWatcher')
        .mockReturnValue({
          dispose: jest.fn(),
          onDidCreate: jest.fn(() => ({ dispose: jest.fn() })),
          onDidChange: jest.fn(() => ({ dispose: jest.fn() })),
          onDidDelete: jest.fn(() => ({ dispose: jest.fn() })),
        } as unknown as vscode.FileSystemWatcher);
      const folderConfig = { ...DEFAULT_CONFIG, severity: 'error' as const };
      jest.spyOn(ConfigReader.prototype, 'tryLoadConfiguration')
        .mockImplementation(async (root: string) =>
          root.includes('second') ? folderConfig : null,
        );
      const updateConfig = jest.spyOn(
        DeprecatedTrackerSidebarProvider.prototype,
        'updateConfig',
      );

      await activate(mockContext);

      expect(updateConfig).toHaveBeenCalledWith(folderConfig);
    });

    it('applies defaults when folders exist but none define a config', async () => {
      (vscode.workspace as any).workspaceFolders = [{
        uri: vscode.Uri.file('/workspace'),
        name: 'workspace',
        index: 0,
      }];
      jest.spyOn(vscode.workspace, 'createFileSystemWatcher')
        .mockReturnValue({
          dispose: jest.fn(),
          onDidCreate: jest.fn(() => ({ dispose: jest.fn() })),
          onDidChange: jest.fn(() => ({ dispose: jest.fn() })),
          onDidDelete: jest.fn(() => ({ dispose: jest.fn() })),
        } as unknown as vscode.FileSystemWatcher);
      jest.spyOn(ConfigReader.prototype, 'tryLoadConfiguration')
        .mockResolvedValue(null);
      const updateConfig = jest.spyOn(
        DeprecatedTrackerSidebarProvider.prototype,
        'updateConfig',
      );

      await activate(mockContext);

      expect(updateConfig).toHaveBeenCalledWith(DEFAULT_CONFIG);
    });

    it('skips config loading entirely when there is no workspace', async () => {
      (vscode.workspace as any).workspaceFolders = undefined;
      const tryLoadConfiguration = jest
        .spyOn(ConfigReader.prototype, 'tryLoadConfiguration')
        .mockResolvedValue(DEFAULT_CONFIG);
      const updateConfig = jest.spyOn(
        DeprecatedTrackerSidebarProvider.prototype,
        'updateConfig',
      );

      await activate(mockContext);

      expect(tryLoadConfiguration).not.toHaveBeenCalled();
      expect(updateConfig).not.toHaveBeenCalled();
    });

    it('should delegate the scan command to the sidebar without opening a second panel', async () => {
      const mockScanProject = jest.fn().mockResolvedValue([]);
      const mockCreateOrShow = jest.fn();
      const DeprecatedTrackerSidebarProvider = require('../../src/sidebar').DeprecatedTrackerSidebarProvider;
      jest.spyOn(DeprecatedTrackerSidebarProvider.prototype, 'scanProject').mockImplementation(mockScanProject);
      const MainPanel = require('../../src/webview').MainPanel;
      MainPanel.createOrShow = mockCreateOrShow;
      activate(mockContext);
      const scanCommand = registeredCommands.get('deprecatedTracker.scan');
      expect(scanCommand).toBeDefined();
      await scanCommand!();
      expect(mockScanProject).toHaveBeenCalled();
      // Panel opening is owned by the sidebar's scanProject, not the command
      expect(mockCreateOrShow).not.toHaveBeenCalled();
    });

    it('should ignore the active workspace file and trigger a scan', async () => {
      (vscode.workspace as any).workspaceFolders = [{
        uri: vscode.Uri.file('/workspace'),
        name: 'workspace',
        index: 0,
      }];
      (vscode.window as any).activeTextEditor = {
        document: { uri: vscode.Uri.file('/workspace/src/file.ts') },
      };
      jest.spyOn(ConfigReader.prototype, 'tryLoadConfiguration')
        .mockResolvedValue(DEFAULT_CONFIG);
      const ignoreFile = jest.spyOn(IgnoreManager.prototype, 'ignoreFile');
      await activate(mockContext);
      const ignoreFileCommand = registeredCommands.get('deprecatedTracker.ignoreFile');
      await ignoreFileCommand!();

      expect(ignoreFile).toHaveBeenCalledWith('/workspace/src/file.ts');
      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        'deprecatedTracker.scan',
      );
    });

    it('should use a file picker when there is no active workspace file', async () => {
      (vscode.workspace as any).workspaceFolders = [{
        uri: vscode.Uri.file('/workspace'),
        name: 'workspace',
        index: 0,
      }];
      jest.spyOn(ConfigReader.prototype, 'tryLoadConfiguration')
        .mockResolvedValue(DEFAULT_CONFIG);
      jest.spyOn(vscode.window, 'showOpenDialog')
        .mockResolvedValue([vscode.Uri.file('/workspace/src/picked.ts')]);
      const ignoreFile = jest.spyOn(IgnoreManager.prototype, 'ignoreFile');
      await activate(mockContext);

      await registeredCommands.get('deprecatedTracker.ignoreFile')!();

      expect(ignoreFile).toHaveBeenCalledWith('/workspace/src/picked.ts');
    });

    it('should reject a picked file outside the workspace', async () => {
      (vscode.workspace as any).workspaceFolders = [{
        uri: vscode.Uri.file('/workspace'),
        name: 'workspace',
        index: 0,
      }];
      jest.spyOn(ConfigReader.prototype, 'tryLoadConfiguration')
        .mockResolvedValue(DEFAULT_CONFIG);
      jest.spyOn(vscode.window, 'showOpenDialog')
        .mockResolvedValue([vscode.Uri.file('/other/file.ts')]);
      const ignoreFile = jest.spyOn(IgnoreManager.prototype, 'ignoreFile');
      await activate(mockContext);

      await registeredCommands.get('deprecatedTracker.ignoreFile')!();

      expect(ignoreFile).not.toHaveBeenCalled();
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        'Selected file must be within the workspace',
      );
    });

    it('should do nothing when file selection is cancelled', async () => {
      (vscode.workspace as any).workspaceFolders = [{
        uri: vscode.Uri.file('/workspace'),
        name: 'workspace',
        index: 0,
      }];
      jest.spyOn(ConfigReader.prototype, 'tryLoadConfiguration')
        .mockResolvedValue(DEFAULT_CONFIG);
      const ignoreFile = jest.spyOn(IgnoreManager.prototype, 'ignoreFile');
      await activate(mockContext);

      await registeredCommands.get('deprecatedTracker.ignoreFile')!();

      expect(ignoreFile).not.toHaveBeenCalled();
      expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
    });

    it('should handle scan command errors and show error message', async () => {
      const mockError = new Error('Scan failed');
      const mockScanProject = jest.fn().mockRejectedValue(mockError);
      const DeprecatedTrackerSidebarProvider = require('../../src/sidebar').DeprecatedTrackerSidebarProvider;
      jest.spyOn(DeprecatedTrackerSidebarProvider.prototype, 'scanProject').mockImplementation(mockScanProject);
      activate(mockContext);
      const scanCommand = registeredCommands.get('deprecatedTracker.scan');
      expect(scanCommand).toBeDefined();
      await scanCommand!();
      expect(mockScanProject).toHaveBeenCalled();
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        `Deprecated Tracker Error: ${mockError}`
      );
    });
  });

  describe('deactivate', () => {
    it('should deactivate without errors', () => {
      expect(() => deactivate()).not.toThrow();
    });
  });
});
