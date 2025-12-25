import * as vscode from 'vscode';
import { ScanHistory } from '../../src/history';
import { MainPanel } from '../../src/webview/mainPanel';
import { DeprecatedItem } from '../../src/scanner';

// Mock VS Code API
const mockPostMessage = jest.fn();
const mockOnDidReceiveMessage = jest.fn();
const mockReveal = jest.fn();
const mockDispose = jest.fn();

const mockWebview = {
  postMessage: mockPostMessage,
  onDidReceiveMessage: mockOnDidReceiveMessage,
  asWebviewUri: jest.fn((uri: vscode.Uri) => uri),
  html: '',
  options: {},
};

const mockPanel = {
  webview: mockWebview,
  reveal: mockReveal,
  onDidDispose: jest.fn((callback: () => void) => ({ dispose: jest.fn() })),
  dispose: mockDispose,
  viewColumn: vscode.ViewColumn.One,
  title: 'Deprecated Tracker',
  active: true,
  visible: true,
};

describe('Webview Handshake Tests', () => {
  let mockContext: vscode.ExtensionContext;
  let mockResults: DeprecatedItem[];

  beforeEach(() => {
    jest.clearAllMocks();
    const extensionPath = '/test/path';
    const extensionUri = vscode.Uri.file(extensionPath);
    mockContext = {
      subscriptions: [],
      workspaceState: {
        get: jest.fn(),
        update: jest.fn(),
        keys: jest.fn(() => []),
      },
      globalState: {
        get: jest.fn(),
        update: jest.fn(),
        keys: jest.fn(() => []),
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
    mockResults = [
      {
        name: 'oldMethod',
        fileName: 'test.ts',
        filePath: '/test/src/test.ts',
        line: 10,
        character: 5,
        kind: 'method'
      },
      {
        name: 'deprecatedProperty',
        fileName: 'utils.ts',
        filePath: '/test/src/utils.ts',
        line: 25,
        character: 12,
        kind: 'property'
      }
    ];
    jest.spyOn(vscode.window, 'createWebviewPanel').mockReturnValue(mockPanel as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    MainPanel.currentPanel = undefined;
  });

  describe('Webview Ready Handshake', () => {
    it('should send empty results when webview is ready with no current results', () => {
      const panel = MainPanel.createOrShow(mockContext.extensionUri, mockContext, {} as ScanHistory);
      const webviewReadyHandler = mockOnDidReceiveMessage.mock.calls.find(
        call => call[0] && typeof call[0] === 'function'
      )?.[0];
      expect(webviewReadyHandler).toBeDefined();
      webviewReadyHandler({ command: 'webviewReady' });
      expect(mockPostMessage).toHaveBeenCalledWith({
        command: 'results',
        results: []
      });
    });

    it('should send current results when webview is ready with existing results', () => {
      const panel = MainPanel.createOrShow(mockContext.extensionUri, mockContext, {} as ScanHistory);
      panel.updateResults(mockResults);
      mockPostMessage.mockClear();
      const webviewReadyHandler = mockOnDidReceiveMessage.mock.calls.find(
        call => call[0] && typeof call[0] === 'function'
      )?.[0];
      expect(webviewReadyHandler).toBeDefined();
      webviewReadyHandler({ command: 'webviewReady' });
      expect(mockPostMessage).toHaveBeenCalledWith({
        command: 'results',
        results: mockResults
      });
    });

    it('should always send results when panel is revealed', () => {
      const panel = MainPanel.createOrShow(mockContext.extensionUri, mockContext, {} as ScanHistory);
      mockPostMessage.mockClear();
      panel.reveal();
      expect(mockPostMessage).toHaveBeenCalledWith({
        command: 'results',
        results: []
      });
      panel.updateResults(mockResults);
      mockPostMessage.mockClear();
      panel.reveal();
      expect(mockPostMessage).toHaveBeenCalledWith({
        command: 'results',
        results: mockResults
      });
    });

    it('should handle multiple webview ready messages correctly', () => {
      const panel = MainPanel.createOrShow(mockContext.extensionUri, mockContext, {} as ScanHistory);
      const webviewReadyHandler = mockOnDidReceiveMessage.mock.calls.find(
        call => call[0] && typeof call[0] === 'function'
      )?.[0];
      expect(webviewReadyHandler).toBeDefined();
      webviewReadyHandler({ command: 'webviewReady' });
      expect(mockPostMessage).toHaveBeenCalledWith({
        command: 'results',
        results: []
      });
      mockPostMessage.mockClear();
      panel.updateResults(mockResults);
      mockPostMessage.mockClear();
      webviewReadyHandler({ command: 'webviewReady' });
      expect(mockPostMessage).toHaveBeenCalledWith({
        command: 'results',
        results: mockResults
      });
    });
  });

  describe('Results Message Handling', () => {
    it('should update current results and send to webview', () => {
      const panel = MainPanel.createOrShow(mockContext.extensionUri, mockContext, {} as ScanHistory);
      mockPostMessage.mockClear();
      panel.updateResults(mockResults);
      expect(mockPostMessage).toHaveBeenCalledWith({
        command: 'results',
        results: mockResults
      });
    });

    it('should handle empty results correctly', () => {
      const panel = MainPanel.createOrShow(mockContext.extensionUri, mockContext, {} as ScanHistory);
      panel.updateResults(mockResults);
      mockPostMessage.mockClear();
      panel.updateResults([]);
      expect(mockPostMessage).toHaveBeenCalledWith({
        command: 'results',
        results: []
      });
    });
  });
});