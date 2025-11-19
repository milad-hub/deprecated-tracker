import * as vscode from 'vscode';
import { activate, deactivate } from '../../src/extension';

describe('Extension', () => {
  let mockContext: vscode.ExtensionContext;

  beforeEach(() => {
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
  });

  it('should activate extension', () => {
    const registerCommandSpy = jest.spyOn(vscode.commands, 'registerCommand');
    registerCommandSpy.mockReturnValue({ dispose: jest.fn() } as vscode.Disposable);

    activate(mockContext);

    expect(registerCommandSpy).toHaveBeenCalledWith('deprecatedTracker.scan', expect.any(Function));
    expect(mockContext.subscriptions.length).toBeGreaterThan(0);

    registerCommandSpy.mockRestore();
  });

  it('should deactivate without errors', () => {
    expect(() => deactivate()).not.toThrow();
  });
});
