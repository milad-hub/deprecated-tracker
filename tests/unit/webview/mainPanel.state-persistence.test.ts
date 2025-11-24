import * as vscode from 'vscode';
import { MESSAGE_COMMANDS, STORAGE_KEY_FILTER_STATE } from '../../../src/constants';
import { MainPanel } from '../../../src/webview/mainPanel';

jest.mock('vscode', () => {
    const mockCreateWebviewPanel = jest.fn();
    const mockShowErrorMessage = jest.fn();
    return {
        ...jest.requireActual('vscode'),
        window: {
            createWebviewPanel: mockCreateWebviewPanel,
            showErrorMessage: mockShowErrorMessage,
            showInformationMessage: jest.fn(),
            activeTextEditor: undefined,
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
            openTextDocument: jest.fn(),
        },
        Uri: {
            file: (path: string) => ({ fsPath: path }),
            joinPath: jest.fn((uri, ...paths) => ({ fsPath: `${uri.fsPath}/${paths.join('/')}` })),
        },
        ViewColumn: {
            One: 1,
            Two: 2,
        },
        ExtensionMode: {
            Test: 2,
        },
        _mockCreateWebviewPanel: mockCreateWebviewPanel,
        _mockShowErrorMessage: mockShowErrorMessage,
    };
});

describe('MainPanel - State Persistence', () => {
    let mockContext: vscode.ExtensionContext;
    let mockPanel: vscode.WebviewPanel;
    let mockCreateWebviewPanel: jest.Mock;
    let mockShowErrorMessage: jest.Mock;
    let mockWorkspaceState: {
        get: jest.Mock;
        update: jest.Mock;
        keys: jest.Mock;
    };

    beforeEach(() => {
        const mockedVscode = vscode as any;
        mockCreateWebviewPanel = mockedVscode._mockCreateWebviewPanel;
        mockShowErrorMessage = mockedVscode._mockShowErrorMessage;
        mockCreateWebviewPanel.mockClear();
        mockShowErrorMessage.mockClear();
        mockWorkspaceState = {
            get: jest.fn(),
            update: jest.fn(),
            keys: jest.fn(() => []),
        };
        const extensionPath = '/test/path';
        const extensionUri = vscode.Uri.file(extensionPath);
        mockContext = {
            subscriptions: [],
            workspaceState: mockWorkspaceState,
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
        const mockWebview = {
            options: {},
            html: '',
            onDidReceiveMessage: jest.fn(() => ({ dispose: jest.fn() })),
            postMessage: jest.fn(),
            asWebviewUri: jest.fn((uri) => uri),
            cspSource: 'test-csp-source',
        } as unknown as vscode.Webview;
        mockPanel = {
            webview: mockWebview,
            title: 'Deprecated Tracker',
            viewType: 'deprecatedTracker',
            onDidDispose: jest.fn((callback) => {
                (mockPanel as any)._disposeCallback = callback;
                return { dispose: jest.fn() };
            }),
            onDidChangeViewState: jest.fn(() => ({ dispose: jest.fn() })),
            reveal: jest.fn(),
            dispose: jest.fn(),
            visible: true,
            active: true,
            viewColumn: vscode.ViewColumn.One,
            options: {},
        } as unknown as vscode.WebviewPanel;
        (MainPanel as any).currentPanel = undefined;
    });

    describe('Filter State Restoration', () => {
        it('should restore filter state from workspace state on webview creation', () => {
            const savedFilters = {
                nameFilter: 'oldMethod',
                fileFilter: 'test.ts',
            };
            mockWorkspaceState.get.mockReturnValue(savedFilters);
            mockCreateWebviewPanel.mockReturnValue(mockPanel);
            const panel = MainPanel.createOrShow(vscode.Uri.file('/test'), mockContext);
            expect(mockWorkspaceState.get).toHaveBeenCalledWith(STORAGE_KEY_FILTER_STATE);
            expect(mockPanel.webview.html).toContain('value="oldMethod"');
            expect(mockPanel.webview.html).toContain('value="test.ts"');
        });

        it('should use empty strings when no saved state exists', () => {
            mockWorkspaceState.get.mockReturnValue(undefined);
            mockCreateWebviewPanel.mockReturnValue(mockPanel);
            const panel = MainPanel.createOrShow(vscode.Uri.file('/test'), mockContext);
            expect(mockWorkspaceState.get).toHaveBeenCalledWith(STORAGE_KEY_FILTER_STATE);
            expect(mockPanel.webview.html).toContain('value=""');
        });

        it('should handle null saved state gracefully', () => {
            mockWorkspaceState.get.mockReturnValue(null);
            mockCreateWebviewPanel.mockReturnValue(mockPanel);
            const panel = MainPanel.createOrShow(vscode.Uri.file('/test'), mockContext);
            expect(mockWorkspaceState.get).toHaveBeenCalledWith(STORAGE_KEY_FILTER_STATE);
            expect(mockPanel.webview.html).toContain('value=""');
        });

        it('should escape HTML special characters in filter values', () => {
            const savedFilters = {
                nameFilter: '<script>alert("xss")</script>',
                fileFilter: 'file&name.ts',
            };
            mockWorkspaceState.get.mockReturnValue(savedFilters);
            mockCreateWebviewPanel.mockReturnValue(mockPanel);
            const panel = MainPanel.createOrShow(vscode.Uri.file('/test'), mockContext);
            expect(mockPanel.webview.html).toContain('&lt;script&gt;');
            expect(mockPanel.webview.html).toContain('file&amp;name.ts');
            expect(mockPanel.webview.html).not.toContain('<script>');
        });
    });

    describe('Filter State Saving', () => {
        it('should save filter state to workspace state when receiving saveFilterState message', async () => {
            mockCreateWebviewPanel.mockReturnValue(mockPanel);
            const panel = MainPanel.createOrShow(vscode.Uri.file('/test'), mockContext);
            const messageHandler = (mockPanel.webview.onDidReceiveMessage as jest.Mock).mock.calls[0][0];
            await messageHandler({
                command: MESSAGE_COMMANDS.SAVE_FILTER_STATE,
                nameFilter: 'deprecated',
                fileFilter: 'app.ts',
            });
            expect(mockWorkspaceState.update).toHaveBeenCalledWith(STORAGE_KEY_FILTER_STATE, {
                nameFilter: 'deprecated',
                fileFilter: 'app.ts',
            });
        });

        it('should save empty filter values', async () => {
            mockCreateWebviewPanel.mockReturnValue(mockPanel);
            const panel = MainPanel.createOrShow(vscode.Uri.file('/test'), mockContext);
            const messageHandler = (mockPanel.webview.onDidReceiveMessage as jest.Mock).mock.calls[0][0];
            await messageHandler({
                command: MESSAGE_COMMANDS.SAVE_FILTER_STATE,
                nameFilter: '',
                fileFilter: '',
            });
            expect(mockWorkspaceState.update).toHaveBeenCalledWith(STORAGE_KEY_FILTER_STATE, {
                nameFilter: '',
                fileFilter: '',
            });
        });

        it('should overwrite previous saved state', async () => {
            const initialSavedFilters = {
                nameFilter: 'old',
                fileFilter: 'old.ts',
            };
            mockWorkspaceState.get.mockReturnValue(initialSavedFilters);
            mockCreateWebviewPanel.mockReturnValue(mockPanel);
            const panel = MainPanel.createOrShow(vscode.Uri.file('/test'), mockContext);
            const messageHandler = (mockPanel.webview.onDidReceiveMessage as jest.Mock).mock.calls[0][0];
            await messageHandler({
                command: MESSAGE_COMMANDS.SAVE_FILTER_STATE,
                nameFilter: 'new',
                fileFilter: 'new.ts',
            });
            expect(mockWorkspaceState.update).toHaveBeenCalledWith(STORAGE_KEY_FILTER_STATE, {
                nameFilter: 'new',
                fileFilter: 'new.ts',
            });
        });
    });

    describe('Backward Compatibility', () => {
        it('should work without errors when workspace state is unavailable', () => {
            mockWorkspaceState.get.mockImplementation(() => {
                throw new Error('State unavailable');
            });
            mockCreateWebviewPanel.mockReturnValue(mockPanel);
            expect(() => {
                MainPanel.createOrShow(vscode.Uri.file('/test'), mockContext);
            }).not.toThrow();
            expect(mockPanel.webview.html).toContain('value=""');
        });

        it('should continue working if state save fails', async () => {
            mockWorkspaceState.update.mockRejectedValue(new Error('Save failed'));
            mockCreateWebviewPanel.mockReturnValue(mockPanel);
            const panel = MainPanel.createOrShow(vscode.Uri.file('/test'), mockContext);
            const messageHandler = (mockPanel.webview.onDidReceiveMessage as jest.Mock).mock.calls[0][0];
            await expect(
                messageHandler({
                    command: MESSAGE_COMMANDS.SAVE_FILTER_STATE,
                    nameFilter: 'test',
                    fileFilter: 'test.ts',
                })
            ).rejects.toThrow('Save failed');
        });
    });
});