import * as vscode from 'vscode';
import { MainPanel } from '../../../src/webview/mainPanel';

jest.mock('vscode');
jest.mock('fs');

describe('MainPanel - Filter State Persistence', () => {
    let mockContext: vscode.ExtensionContext;
    let mockPanel: vscode.WebviewPanel;
    let mockCreateWebviewPanel: jest.Mock;
    let savedState: any;

    beforeEach(() => {
        jest.clearAllMocks();
        savedState = undefined;

        mockContext = {
            subscriptions: [],
            workspaceState: {
                get: jest.fn((key) => {
                    if (key === 'deprecatedTracker.mainPanel.filters') {
                        return savedState;
                    }
                    return undefined;
                }),
                update: jest.fn((key, value) => {
                    if (key === 'deprecatedTracker.mainPanel.filters') {
                        savedState = value;
                    }
                }),
                keys: jest.fn(() => []),
            },
            globalState: {
                get: jest.fn(),
                update: jest.fn(),
                keys: jest.fn(() => []),
            },
            extensionPath: '/test/path',
            extensionUri: { fsPath: '/test/path' } as vscode.Uri,
            storagePath: '/test/storage',
            globalStoragePath: '/test/global-storage',
            logPath: '/test/log',
            extensionMode: 2,
            secrets: {} as vscode.SecretStorage,
            environmentVariableCollection: {} as vscode.EnvironmentVariableCollection,
            asAbsolutePath: (p: string) => p,
            storageUri: { fsPath: '/test/storage' } as vscode.Uri,
            globalStorageUri: { fsPath: '/test/global-storage' } as vscode.Uri,
            logUri: { fsPath: '/test/log' } as vscode.Uri,
            extension: undefined,
            languageModelAccessInformation: undefined,
        } as unknown as vscode.ExtensionContext;

        const mockWebview = {
            options: {},
            html: '',
            onDidReceiveMessage: jest.fn(() => ({ dispose: jest.fn() })),
            postMessage: jest.fn(),
            asWebviewUri: jest.fn((uri) => uri),
            cspSource: 'test-csp',
        } as unknown as vscode.Webview;

        mockPanel = {
            webview: mockWebview,
            title: 'Deprecated Tracker',
            viewType: 'deprecatedTracker',
            onDidDispose: jest.fn(() => ({ dispose: jest.fn() })),
            onDidChangeViewState: jest.fn(() => ({ dispose: jest.fn() })),
            reveal: jest.fn(),
            dispose: jest.fn(),
            visible: true,
            active: true,
            viewColumn: 1,
            options: {},
        } as unknown as vscode.WebviewPanel;

        mockCreateWebviewPanel = jest.fn().mockReturnValue(mockPanel);
        (vscode.window as any).createWebviewPanel = mockCreateWebviewPanel;
    });

    describe('Filter State Defaults', () => {
        it('should provide default values when no saved state exists', () => {
            const mainPanel = new (MainPanel as any)(mockPanel, mockContext.extensionUri, mockContext);
            const filterState = mainPanel._restoreFilterState();

            expect(filterState).toEqual({
                nameFilter: '',
                fileFilter: '',
                usageCountFilter: 0,
                regexEnabled: false,
            });
        });

        it('should restore all filter fields from saved state', () => {
            savedState = {
                nameFilter: 'deprecated',
                fileFilter: 'service',
            };

            const mainPanel = new (MainPanel as any)(mockPanel, mockContext.extensionUri, mockContext);
            const filterState = mainPanel._restoreFilterState();

            expect(filterState).toEqual({
                nameFilter: 'deprecated',
                fileFilter: 'service',
                usageCountFilter: 0,
                regexEnabled: false,
            });
        });

        it('should handle partial saved state with defaults for missing fields', () => {
            savedState = {
                nameFilter: 'test',
                fileFilter: '',
            };

            const mainPanel = new (MainPanel as any)(mockPanel, mockContext.extensionUri, mockContext);
            const filterState = mainPanel._restoreFilterState();

            expect(filterState.nameFilter).toBe('test');
            expect(filterState.fileFilter).toBe('');
        });

        it('should handle corrupted state gracefully', () => {
            mockContext.workspaceState.get = jest.fn((key) => {
                if (key === 'deprecatedTracker.mainPanel.filters') {
                    throw new Error('Corrupted state');
                }
                return undefined;
            });

            const mainPanel = new (MainPanel as any)(mockPanel, mockContext.extensionUri, mockContext);
            const filterState = mainPanel._restoreFilterState();

            expect(filterState).toEqual({
                nameFilter: '',
                fileFilter: '',
                usageCountFilter: 0,
                regexEnabled: false,
            });
        });
    });

    describe('Filter State Saving', () => {
        it('should save all filter state fields', () => {
            const mainPanel = new (MainPanel as any)(mockPanel, mockContext.extensionUri, mockContext);

            mainPanel._saveFilterState(
                'deprecated',
                'service',
                0,
                false
            );

            expect(mockContext.workspaceState.update).toHaveBeenCalledWith(
                'deprecatedTracker.mainPanel.filters',
                {
                    nameFilter: 'deprecated',
                    fileFilter: 'service',
                    usageCountFilter: 0,
                    regexEnabled: false,
                }
            );
        });

        it('should save with default values', () => {
            const mainPanel = new (MainPanel as any)(mockPanel, mockContext.extensionUri, mockContext);

            mainPanel._saveFilterState('', '', 0, false);

            expect(mockContext.workspaceState.update).toHaveBeenCalledWith(
                'deprecatedTracker.mainPanel.filters',
                {
                    nameFilter: '',
                    fileFilter: '',
                    usageCountFilter: 0,
                    regexEnabled: false,
                }
            );
        });
    });

    describe('Backward Compatibility', () => {
        it('should work with old saved state format', () => {
            savedState = {
                nameFilter: 'old',
                fileFilter: 'legacy',
            };

            const mainPanel = new (MainPanel as any)(mockPanel, mockContext.extensionUri, mockContext);
            const filterState = mainPanel._restoreFilterState();

            expect(filterState.nameFilter).toBe('old');
            expect(filterState.fileFilter).toBe('legacy');
        });
    });
});
