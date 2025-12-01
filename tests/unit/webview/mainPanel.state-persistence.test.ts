import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { MESSAGE_COMMANDS, STORAGE_KEY_FILTER_STATE } from '../../../src/constants';
import { MainPanel } from '../../../src/webview/mainPanel';

let messageHandler: (message: any) => Promise<void>;

jest.mock('fs', () => ({
    readFileSync: jest.fn()
}));

jest.mock('path', () => ({
    join: jest.fn((...args) => args.join('/'))
}));

jest.mock('../../../src/scanner', () => ({
    Scanner: jest.fn().mockImplementation(() => ({
        scan: jest.fn().mockResolvedValue([]),
        getResults: jest.fn().mockReturnValue([]),
    }))
}));

jest.mock('../../../src/scanner/ignoreManager', () => ({
    IgnoreManager: jest.fn().mockImplementation(() => ({
        getIgnoredItems: jest.fn().mockReturnValue([]),
        addIgnoredItem: jest.fn(),
        removeIgnoredItem: jest.fn(),
        isIgnored: jest.fn().mockReturnValue(false),
    }))
}));

jest.mock('vscode', () => {
    const mockCreateWebviewPanel = jest.fn();
    const mockShowErrorMessage = jest.fn();
    return {
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
            fs: {
                readFile: jest.fn().mockRejectedValue(new Error('Not implemented')),
            },
        },
        Uri: {
            file: (path: string) => ({ fsPath: path, path }),
            joinPath: (base: any, ...paths: string[]) => ({
                fsPath: `${base.fsPath}/${paths.join('/')}`,
                path: `${base.path}/${paths.join('/')}`,
            }),
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
    let mockContext: any;
    let mockPanel: any;
    let mockCreateWebviewPanel: jest.Mock;
    let mockShowErrorMessage: jest.Mock;
    let mockWorkspaceState: any;

    beforeEach(() => {
        jest.clearAllMocks();
        const originalReadFileSync = (fs.readFileSync as jest.Mock);
        originalReadFileSync.mockImplementation((path) => {
            if (path && path.toString && path.toString().includes('main.html')) {
                return `<!DOCTYPE html>
                        <html lang="en">
                        <head>
                            <meta charset="UTF-8">
                            <meta name="viewport" content="width=device-width, initial-scale=1.0">
                            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src {{cspSource}}; script-src {{cspSource}};"/>
                            <link href="{{styleUri}}" rel="stylesheet">
                            <title>Deprecated Tracker</title>
                        </head>
                        <body>
                            <div class="container">
                                <h1>Deprecated Tracker</h1>
                                <button id="exportBtn">Export</button>
                                <button id="ignoreManagerBtn">Manage Ignores</button>
                                <div id="status"></div>
                                <input type="text" id="nameFilter" value="{{nameFilter}}">
                                <input type="text" id="fileFilter" value="{{fileFilter}}">
                                <button id="refreshBtn">Refresh</button>
                                <div id="resultsBody"></div>
                            </div>
                            <script src="{{scriptUri}}"></script>
                        </body>
                        </html>`;
            }
            throw new Error('File not found');
        });
        (vscode.workspace.fs.readFile as jest.Mock).mockRejectedValue(new Error('VS Code API not available'));
        mockCreateWebviewPanel = (vscode as any)._mockCreateWebviewPanel;
        mockShowErrorMessage = (vscode as any)._mockShowErrorMessage;
        mockPanel = {
            webview: {
                html: '',
                postMessage: jest.fn(),
                asWebviewUri: jest.fn((uri) => {
                    if (uri.fsPath.includes('main.js')) return { toString: () => 'script-uri' };
                    if (uri.fsPath.includes('style.css')) return { toString: () => 'style-uri' };
                    return { toString: () => 'unknown-uri' };
                }),
                cspSource: 'csp-source',
                onDidReceiveMessage: jest.fn((handler) => {
                    messageHandler = handler;
                    return { dispose: jest.fn() };
                }),
            },
            onDidDispose: jest.fn(),
            reveal: jest.fn(),
            dispose: jest.fn(),
        };
        mockWorkspaceState = {
            get: jest.fn(),
            update: jest.fn(),
            keys: jest.fn(),
        };
        mockContext = {
            extensionPath: '/test',
            extensionUri: vscode.Uri.file('/test'),
            globalState: {
                get: jest.fn(),
                update: jest.fn(),
            },
            workspaceState: mockWorkspaceState,
            subscriptions: [],
        };
        (MainPanel as any).currentPanel = undefined;
    });

    describe('Filter State Restoration', () => {
        it('should restore filter state from workspace state on webview creation', async () => {
            const savedFilters = {
                nameFilter: 'oldMethod',
                fileFilter: 'test.ts',
            };
            mockWorkspaceState.get.mockReturnValue(savedFilters);
            mockCreateWebviewPanel.mockReturnValue(mockPanel);
            const panel = MainPanel.createOrShow(vscode.Uri.file('/test'), mockContext);
            await new Promise(resolve => setTimeout(resolve, 0));
            console.log('Actual HTML content:', mockPanel.webview.html);
            expect(mockWorkspaceState.get).toHaveBeenCalledWith(STORAGE_KEY_FILTER_STATE);
            expect(mockPanel.webview.html).toContain('value="oldMethod"');
            expect(mockPanel.webview.html).toContain('value="test.ts"');
        });

        it('should use empty strings when no saved state exists', async () => {
            mockWorkspaceState.get.mockReturnValue(undefined);
            mockCreateWebviewPanel.mockReturnValue(mockPanel);
            const panel = MainPanel.createOrShow(vscode.Uri.file('/test'), mockContext);
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(mockWorkspaceState.get).toHaveBeenCalledWith(STORAGE_KEY_FILTER_STATE);
            expect(mockPanel.webview.html).toContain('value=""');
        });

        it('should handle null saved state gracefully', async () => {
            mockWorkspaceState.get.mockReturnValue(null);
            mockCreateWebviewPanel.mockReturnValue(mockPanel);
            const panel = MainPanel.createOrShow(vscode.Uri.file('/test'), mockContext);
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(mockWorkspaceState.get).toHaveBeenCalledWith(STORAGE_KEY_FILTER_STATE);
            expect(mockPanel.webview.html).toContain('value=""');
        });

        it('should escape HTML special characters in filter values', async () => {
            mockWorkspaceState.get.mockReturnValue({
                nameFilter: '<script>alert("xss")</script>',
                fileFilter: '"quoted" & \'single\'',
            });
            mockCreateWebviewPanel.mockReturnValue(mockPanel);
            const panel = MainPanel.createOrShow(vscode.Uri.file('/test'), mockContext);
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(mockWorkspaceState.get).toHaveBeenCalledWith(STORAGE_KEY_FILTER_STATE);
            expect(mockPanel.webview.html).toContain('value="&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;"');
            expect(mockPanel.webview.html).toContain('value="&quot;quoted&quot; &amp; &#39;single&#39;"');
        });
    });

    describe('Filter State Saving', () => {
        it('should save filter state to workspace state when receiving saveFilterState message', async () => {
            mockCreateWebviewPanel.mockReturnValue(mockPanel);
            const panel = MainPanel.createOrShow(vscode.Uri.file('/test'), mockContext);
            await new Promise(resolve => setTimeout(resolve, 0));
            const message = {
                command: MESSAGE_COMMANDS.SAVE_FILTER_STATE,
                nameFilter: 'newMethod',
                fileFilter: 'newFile.ts',
            };
            await messageHandler(message);
            expect(mockWorkspaceState.update).toHaveBeenCalledWith(
                STORAGE_KEY_FILTER_STATE,
                {
                    nameFilter: 'newMethod',
                    fileFilter: 'newFile.ts',
                    usageCountFilter: 0,
                    regexEnabled: false,
                }
            );
        });

        it('should save empty filter values', async () => {
            mockCreateWebviewPanel.mockReturnValue(mockPanel);
            const panel = MainPanel.createOrShow(vscode.Uri.file('/test'), mockContext);
            await new Promise(resolve => setTimeout(resolve, 0));
            const message = {
                command: MESSAGE_COMMANDS.SAVE_FILTER_STATE,
                nameFilter: '',
                fileFilter: '',
            };
            await messageHandler(message);
            expect(mockWorkspaceState.update).toHaveBeenCalledWith(
                STORAGE_KEY_FILTER_STATE,
                {
                    nameFilter: '',
                    fileFilter: '',
                    usageCountFilter: 0,
                    regexEnabled: false,
                }
            );
        });

        it('should overwrite previous saved state', async () => {
            mockCreateWebviewPanel.mockReturnValue(mockPanel);
            const panel = MainPanel.createOrShow(vscode.Uri.file('/test'), mockContext);
            await new Promise(resolve => setTimeout(resolve, 0));
            const firstMessage = {
                command: MESSAGE_COMMANDS.SAVE_FILTER_STATE,
                nameFilter: 'firstMethod',
                fileFilter: 'firstFile.ts',
            };
            await messageHandler(firstMessage);
            const secondMessage = {
                command: MESSAGE_COMMANDS.SAVE_FILTER_STATE,
                nameFilter: 'secondMethod',
                fileFilter: 'secondFile.ts',
            };
            await messageHandler(secondMessage);
            expect(mockWorkspaceState.update).toHaveBeenCalledTimes(2);
            expect(mockWorkspaceState.update).toHaveBeenLastCalledWith(
                STORAGE_KEY_FILTER_STATE,
                {
                    nameFilter: 'secondMethod',
                    fileFilter: 'secondFile.ts',
                    usageCountFilter: 0,
                    regexEnabled: false,
                }
            );
        });
    });
});