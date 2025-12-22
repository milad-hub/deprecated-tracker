import * as vscode from 'vscode';
import { activate, deactivate } from '../../src/extension';

describe('Extension', () => {
  let mockContext: vscode.ExtensionContext;
  let registeredCommands: Map<string, Function>;

  beforeEach(() => {
    jest.clearAllMocks();
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
  });

  afterEach(() => {
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

    it('should register ignoreMethod command', () => {
      activate(mockContext);
      expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
        'deprecatedTracker.ignoreMethod',
        expect.any(Function)
      );
    });

    it('should register all commands in subscriptions', () => {
      activate(mockContext);
      expect(mockContext.subscriptions.length).toBe(13);
    });

    it('should call MainPanel.createOrShow when scan command succeeds', async () => {
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
      expect(mockCreateOrShow).toHaveBeenCalledWith(mockContext.extensionUri, mockContext);
    });

    it('should show information message when ignoreFile command is called', async () => {
      activate(mockContext);
      const ignoreFileCommand = registeredCommands.get('deprecatedTracker.ignoreFile');
      expect(ignoreFileCommand).toBeDefined();
      await ignoreFileCommand!();
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        'Ignoring by file is no longer supported. Please ignore methods/properties.'
      );
    });

    it('should not call executeCommand when ignoreMethod is called without a node', async () => {
      activate(mockContext);
      const ignoreMethodCommand = registeredCommands.get('deprecatedTracker.ignoreMethod');
      await ignoreMethodCommand!();
      expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
    });

    it('should not call executeCommand when filePath is empty string', async () => {
      activate(mockContext);
      const mockNode = {
        item: {
          filePath: '',
          name: 'deprecatedMethod',
        },
      };
      const ignoreMethodCommand = registeredCommands.get('deprecatedTracker.ignoreMethod');
      await ignoreMethodCommand!(mockNode);
      expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
    });

    it('should not call executeCommand when methodName is empty string', async () => {
      activate(mockContext);
      const mockNode = {
        item: {
          filePath: '/test/file.ts',
          name: '',
        },
      };
      const ignoreMethodCommand = registeredCommands.get('deprecatedTracker.ignoreMethod');
      await ignoreMethodCommand!(mockNode);
      expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
    });

    it('should handle ignoreMethod command with valid node and trigger scan', async () => {
      activate(mockContext);
      const mockNode = {
        item: {
          filePath: '/test/file.ts',
          name: 'deprecatedMethod',
        },
      };
      const ignoreMethodCommand = registeredCommands.get('deprecatedTracker.ignoreMethod');
      await ignoreMethodCommand!(mockNode);
      expect(vscode.commands.executeCommand).toHaveBeenCalledWith('deprecatedTracker.scan');
    });

    it('should show error message when ignoreMethod fails', async () => {
      activate(mockContext);
      const mockNode = {
        item: {
          filePath: '/test/file.ts',
          name: 'deprecatedMethod',
        },
      };
      const testError = new Error('Execute failed');
      jest.spyOn(vscode.commands, 'executeCommand').mockRejectedValue(testError);
      const ignoreMethodCommand = registeredCommands.get('deprecatedTracker.ignoreMethod');
      await ignoreMethodCommand!(mockNode);
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining('Ignore Method failed:')
      );
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