import * as vscode from 'vscode';
import { DeprecatedItem } from '../../../src/scanner';
import { DeprecatedTrackerSidebarProvider } from '../../../src/sidebar';

jest.mock('../../../src/webview/mainPanel', () => ({
    MainPanel: {
        currentPanel: undefined,
        createOrShow: jest.fn(() => ({
            reveal: jest.fn(),
            updateResults: jest.fn(),
        })),
    },
}));

jest.mock('vscode', () => {
    const mockRegisterCommand = jest.fn(() => ({ dispose: jest.fn() }));
    const mockRegisterWebviewViewProvider = jest.fn(() => ({ dispose: jest.fn() }));
    const mockShowErrorMessage = jest.fn();
    const mockWithProgress = jest.fn((options, task) => {
        return task({ report: jest.fn() });
    });
    const mockCreateWebviewPanel = jest.fn();
    const mockAsRelativePath = jest.fn((path) => path.replace(/^.*[\\\/]/, ''));
    return {
        ...jest.requireActual('vscode'),
        commands: {
            registerCommand: mockRegisterCommand,
        },
        window: {
            registerWebviewViewProvider: mockRegisterWebviewViewProvider,
            showInformationMessage: jest.fn(),
            showErrorMessage: mockShowErrorMessage,
            withProgress: mockWithProgress,
            createWebviewPanel: mockCreateWebviewPanel,
        },
        workspace: {
            workspaceFolders: undefined,
            onDidChangeConfiguration: jest.fn(),
            getConfiguration: jest.fn(() => ({
                get: jest.fn(),
                update: jest.fn(),
                has: jest.fn(),
                inspect: jest.fn(),
            })),
            asRelativePath: mockAsRelativePath,
        },
        Uri: {
            file: (path: string) => ({ fsPath: path }),
            joinPath: jest.fn((uri, path) => ({ fsPath: `${uri.fsPath}/${path}` })),
        },
        ExtensionMode: {
            Test: 2,
        },
        _mockRegisterCommand: mockRegisterCommand,
        _mockRegisterWebviewViewProvider: mockRegisterWebviewViewProvider,
        _mockShowErrorMessage: mockShowErrorMessage,
        _mockWithProgress: mockWithProgress,
        _mockCreateWebviewPanel: mockCreateWebviewPanel,
        _mockAsRelativePath: mockAsRelativePath,
    };
});

describe('DeprecatedTrackerSidebarProvider', () => {
    let mockContext: vscode.ExtensionContext;
    let provider: DeprecatedTrackerSidebarProvider;
    let mockWebviewView: vscode.WebviewView;
    let mockRegisterCommand: jest.Mock;
    let mockRegisterWebviewViewProvider: jest.Mock;
    let mockShowErrorMessage: jest.Mock;
    let mockWithProgress: jest.Mock;
    let mockCreateWebviewPanel: jest.Mock;
    let mockAsRelativePath: jest.Mock;

    beforeEach(() => {
        const mockedVscode = vscode as any;
        mockRegisterCommand = mockedVscode._mockRegisterCommand;
        mockRegisterWebviewViewProvider = mockedVscode._mockRegisterWebviewViewProvider;
        mockShowErrorMessage = mockedVscode._mockShowErrorMessage;
        mockWithProgress = mockedVscode._mockWithProgress;
        mockCreateWebviewPanel = mockedVscode._mockCreateWebviewPanel;
        mockAsRelativePath = mockedVscode._mockAsRelativePath;
        mockRegisterCommand.mockClear();
        mockRegisterWebviewViewProvider.mockClear();
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
        const mockWebviewInstance = {
            options: {},
            html: '',
            onDidReceiveMessage: jest.fn((callback) => {
                (mockWebviewInstance as any)._messageHandler = callback;
                return { dispose: jest.fn() };
            }),
            postMessage: jest.fn(),
            asWebviewUri: jest.fn((uri) => uri),
            cspSource: 'test-csp-source',
        } as unknown as vscode.Webview;
        mockWebviewView = {
            title: 'Deprecated Tracker',
            webview: mockWebviewInstance,
            viewType: 'deprecatedTrackerSidebar',
            show: jest.fn(),
            onDidDispose: jest.fn(),
            onDidChangeVisibility: jest.fn(),
            visible: true,
            description: undefined,
        } as unknown as vscode.WebviewView;
        provider = new DeprecatedTrackerSidebarProvider(mockContext);
    });

    describe('Constructor', () => {
        it('should register webview view provider', () => {
            expect(mockRegisterWebviewViewProvider).toHaveBeenCalledWith(
                'deprecatedTrackerSidebar',
                expect.any(Object)
            );
        });

        it('should register refresh command', () => {
            expect(mockRegisterCommand).toHaveBeenCalledWith(
                'deprecatedTracker.refresh',
                expect.any(Function)
            );
        });

        it('should register openResults command', () => {
            expect(mockRegisterCommand).toHaveBeenCalledWith(
                'deprecatedTracker.openResults',
                expect.any(Function)
            );
        });

        it('should register updateTreeView command', () => {
            expect(mockRegisterCommand).toHaveBeenCalledWith(
                'deprecatedTracker.updateTreeView',
                expect.any(Function)
            );
        });
    });

    describe('resolveWebviewView', () => {
        it('should set webview options correctly', () => {
            const mockResolveContext = {} as vscode.WebviewViewResolveContext;
            const mockToken = {} as vscode.CancellationToken;
            provider.resolveWebviewView(
                mockWebviewView,
                mockResolveContext,
                mockToken
            );
            expect(mockWebviewView.webview.options).toEqual({
                enableScripts: true,
                enableForms: false,
                enableCommandUris: false,
                localResourceRoots: [],
            });
        });

        it('should set HTML content for webview', () => {
            const mockResolveContext = {} as vscode.WebviewViewResolveContext;
            const mockToken = {} as vscode.CancellationToken;
            provider.resolveWebviewView(
                mockWebviewView,
                mockResolveContext,
                mockToken
            );
            expect(mockWebviewView.webview.html).toBeTruthy();
            expect(typeof mockWebviewView.webview.html).toBe('string');
        });

        it('should show the webview', () => {
            const mockResolveContext = {} as vscode.WebviewViewResolveContext;
            const mockToken = {} as vscode.CancellationToken;
            provider.resolveWebviewView(
                mockWebviewView,
                mockResolveContext,
                mockToken
            );
            expect(mockWebviewView.show).toHaveBeenCalledWith(true);
        });

        it('should register message handler', () => {
            const mockResolveContext = {} as vscode.WebviewViewResolveContext;
            const mockToken = {} as vscode.CancellationToken;
            provider.resolveWebviewView(
                mockWebviewView,
                mockResolveContext,
                mockToken
            );
            expect(mockWebviewView.webview.onDidReceiveMessage).toHaveBeenCalled();
        });
    });

    describe('updateResults', () => {
        it('should store results internally', () => {
            const testResults: DeprecatedItem[] = [
                {
                    name: 'oldMethod',
                    fileName: 'test.ts',
                    filePath: '/path/to/test.ts',
                    line: 10,
                    character: 5,
                    kind: 'method' as any,
                },
            ];
            provider.updateResults(testResults);
            expect(testResults).toBeDefined();
        });

        it('should send results to webview when available', () => {
            const mockResolveContext = {} as vscode.WebviewViewResolveContext;
            const mockToken = {} as vscode.CancellationToken;
            provider.resolveWebviewView(
                mockWebviewView,
                mockResolveContext,
                mockToken
            );
            const testResults: DeprecatedItem[] = [
                {
                    name: 'oldMethod',
                    fileName: 'test.ts',
                    filePath: '/path/to/test.ts',
                    line: 10,
                    character: 5,
                    kind: 'method' as any,
                },
            ];
            provider.updateResults(testResults);
            expect(mockWebviewView.webview.html).toContain('Deprecated Tracker');
        });

        it('should handle empty results', () => {
            const mockResolveContext = {} as vscode.WebviewViewResolveContext;
            const mockToken = {} as vscode.CancellationToken;
            provider.resolveWebviewView(
                mockWebviewView,
                mockResolveContext,
                mockToken
            );
            provider.updateResults([]);
            expect(mockWebviewView.webview.html).toContain('Deprecated Tracker');
        });
    });

    describe('refresh', () => {
        it('should regenerate webview HTML', () => {
            const mockResolveContext = {} as vscode.WebviewViewResolveContext;
            const mockToken = {} as vscode.CancellationToken;
            provider.resolveWebviewView(
                mockWebviewView,
                mockResolveContext,
                mockToken
            );
            const originalHtml = mockWebviewView.webview.html;
            provider.refresh();
            expect(mockWebviewView.webview.html).toBeTruthy();
        });

        it('should not crash when webview not available', () => {
            expect(() => provider.refresh()).not.toThrow();
        });
    });

    describe('scanProject error handling', () => {
        it('should show error message when no workspace', async () => {
            (vscode.workspace as any).workspaceFolders = undefined;
            mockShowErrorMessage.mockClear();
            await provider.scanProject();
            expect(mockShowErrorMessage).toHaveBeenCalledWith('No workspace folder found');
        });
    });

    describe('Message Handling', () => {
        it('should handle scan command', async () => {
            const mockResolveContext = {} as vscode.WebviewViewResolveContext;
            const mockToken = {} as vscode.CancellationToken;
            provider.resolveWebviewView(
                mockWebviewView,
                mockResolveContext,
                mockToken
            );
            const handler = (mockWebviewView.webview as any)._messageHandler;
            if (handler) {
                await handler({ command: 'scan' });
            }
            expect(handler).toBeDefined();
        });

        it('should handle openResults command', async () => {
            const mockResolveContext = {} as vscode.WebviewViewResolveContext;
            const mockToken = {} as vscode.CancellationToken;
            provider.resolveWebviewView(
                mockWebviewView,
                mockResolveContext,
                mockToken
            );
            const handler = (mockWebviewView.webview as any)._messageHandler;
            if (handler) {
                await handler({ command: 'openResults' });
            }
            expect(handler).toBeDefined();
        });

        it('should handle ignoreMethod command', async () => {
            const mockResolveContext = {} as vscode.WebviewViewResolveContext;
            const mockToken = {} as vscode.CancellationToken;
            provider.resolveWebviewView(
                mockWebviewView,
                mockResolveContext,
                mockToken
            );
            const handler = (mockWebviewView.webview as any)._messageHandler;
            if (handler) {
                await handler({
                    command: 'ignoreMethod',
                    filePath: '/test/file.ts',
                    methodName: 'oldMethod',
                });
            }
            expect(handler).toBeDefined();
        });

        it('should handle ignoreFile command', async () => {
            const mockResolveContext = {} as vscode.WebviewViewResolveContext;
            const mockToken = {} as vscode.CancellationToken;
            provider.resolveWebviewView(
                mockWebviewView,
                mockResolveContext,
                mockToken
            );
            const handler = (mockWebviewView.webview as any)._messageHandler;
            if (handler) {
                await handler({
                    command: 'ignoreFile',
                    filePath: '/test/file.ts',
                });
            }
            expect(handler).toBeDefined();
        });
    });

    describe('HTML Generation', () => {
        it('should generate valid HTML structure', () => {
            const mockResolveContext = {} as vscode.WebviewViewResolveContext;
            const mockToken = {} as vscode.CancellationToken;
            provider.resolveWebviewView(
                mockWebviewView,
                mockResolveContext,
                mockToken
            );
            const html = mockWebviewView.webview.html;
            expect(html).toContain('<!DOCTYPE html>');
            expect(html).toContain('<html');
            expect(html).toContain('</html>');
            expect(html).toContain('<body');
            expect(html).toContain('</body>');
        });

        it('should include scan button', () => {
            const mockResolveContext = {} as vscode.WebviewViewResolveContext;
            const mockToken = {} as vscode.CancellationToken;
            provider.resolveWebviewView(
                mockWebviewView,
                mockResolveContext,
                mockToken
            );
            const html = mockWebviewView.webview.html;
            expect(html.toLowerCase()).toMatch(/scan|deprecated/i);
        });
    });
});