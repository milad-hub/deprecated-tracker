import * as vscode from 'vscode';
import { MESSAGE_COMMANDS } from '../../../src/constants';
import { IgnorePanel } from '../../../src/webview/ignorePanel';

jest.mock('fs', () => ({
    readFileSync: jest.fn()
}));

jest.mock('vscode', () => {
    const mockPostMessage = jest.fn();
    const mockShowInformationMessage = jest.fn();
    return {
        window: {
            createWebviewPanel: jest.fn(),
            showInformationMessage: mockShowInformationMessage,
            activeTextEditor: undefined,
        },
        workspace: {
            workspaceFolders: undefined,
            fs: {
                readFile: jest.fn().mockRejectedValue(new Error('VS Code API not available')),
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
        _mockPostMessage: mockPostMessage,
        _mockShowInformationMessage: mockShowInformationMessage,
    };
});

jest.mock('../../../src/scanner/ignoreManager', () => {
    return {
        IgnoreManager: jest.fn().mockImplementation(() => ({
            removeFileIgnore: jest.fn(),
            removeMethodIgnore: jest.fn(),
            clearAll: jest.fn(),
            getAllRules: jest.fn().mockReturnValue({
                ignoredFiles: [],
                ignoredMethods: {},
            }),
        })),
    };
});

describe('IgnorePanel - Complete Coverage', () => {
    let mockContext: vscode.ExtensionContext;
    let mockPanel: vscode.WebviewPanel;
    let mockWebview: vscode.Webview;
    let messageHandler: (message: any) => Promise<void>;
    let disposeHandler: () => void;

    beforeEach(() => {
        jest.clearAllMocks();
        const mockedVscode = vscode as any;
        mockWebview = {
            postMessage: mockedVscode._mockPostMessage,
            asWebviewUri: jest.fn((uri) => uri),
            html: '',
            cspSource: 'vscode-resource:',
            onDidReceiveMessage: jest.fn((handler) => {
                messageHandler = handler;
                return { dispose: jest.fn() };
            }),
        } as unknown as vscode.Webview;
        mockPanel = {
            webview: mockWebview,
            onDidDispose: jest.fn((handler) => {
                disposeHandler = handler;
                return { dispose: jest.fn() };
            }),
            reveal: jest.fn(),
            dispose: jest.fn(),
        } as unknown as vscode.WebviewPanel;
        mockedVscode.window.createWebviewPanel.mockReturnValue(mockPanel);
        const fs = require('fs');
        fs.readFileSync.mockReturnValue(`<!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src {{cspSource}}; script-src {{cspSource}};">
                    <link href="{{styleUri}}" rel="stylesheet">
                    <title>Ignore Management</title>
                </head>
                <body>
                    <div class="container">
                        <h1>Ignore Management</h1>
                        <button id="clearAllBtn">Clear All</button>
                        <div id="methodsList"></div>
                        <input type="text" id="filePatternInput">
                        <button id="addFilePatternBtn">Add Pattern</button>
                        <ul id="filePatternsList"></ul>
                        <input type="text" id="methodPatternInput">
                        <button id="addMethodPatternBtn">Add Pattern</button>
                        <ul id="methodPatternsList"></ul>
                    </div>
                    <script src="{{scriptUri}}"></script>
                </body>
                </html>`);
        mockContext = {
            subscriptions: [],
            extensionUri: vscode.Uri.file('/test/extension'),
            extensionPath: '/test/extension',
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
        } as unknown as vscode.ExtensionContext;
        (IgnorePanel as any).currentPanel = undefined;
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('Message Handling - Lines 26-42', () => {
        it('should handle REMOVE_FILE_IGNORE message', async () => {
            const mockedVscode = vscode as any;
            IgnorePanel.createOrShow(mockContext.extensionUri, mockContext);
            await messageHandler({
                command: MESSAGE_COMMANDS.REMOVE_FILE_IGNORE,
                filePath: '/test/file.ts',
            });
            expect(mockedVscode._mockPostMessage).toHaveBeenCalledWith({
                command: MESSAGE_COMMANDS.UPDATE_IGNORE_LIST,
                rules: expect.any(Object),
            });
        });

        it('should handle REMOVE_METHOD_IGNORE message', async () => {
            const mockedVscode = vscode as any;
            IgnorePanel.createOrShow(mockContext.extensionUri, mockContext);
            await messageHandler({
                command: MESSAGE_COMMANDS.REMOVE_METHOD_IGNORE,
                filePath: '/test/file.ts',
                methodName: 'oldMethod',
            });
            expect(mockedVscode._mockPostMessage).toHaveBeenCalledWith({
                command: MESSAGE_COMMANDS.UPDATE_IGNORE_LIST,
                rules: expect.any(Object),
            });
        });

        it('should handle CLEAR_ALL message and show confirmation', async () => {
            const mockedVscode = vscode as any;
            IgnorePanel.createOrShow(mockContext.extensionUri, mockContext);
            await messageHandler({
                command: MESSAGE_COMMANDS.CLEAR_ALL,
            });
            expect(mockedVscode._mockShowInformationMessage).toHaveBeenCalledWith(
                'All ignore rules cleared'
            );
            expect(mockedVscode._mockPostMessage).toHaveBeenCalledWith({
                command: MESSAGE_COMMANDS.UPDATE_IGNORE_LIST,
                rules: expect.any(Object),
            });
        });
    });

    describe('Resource Cleanup - Lines 93-95', () => {
        it('should dispose properly and clean up all disposables', () => {
            IgnorePanel.createOrShow(mockContext.extensionUri, mockContext);
            const panel = (IgnorePanel as any).currentPanel;
            panel.dispose();
            expect(mockPanel.dispose).toHaveBeenCalled();
            expect((IgnorePanel as any).currentPanel).toBeUndefined();
        });

        it('should handle disposal via onDidDispose callback', () => {
            IgnorePanel.createOrShow(mockContext.extensionUri, mockContext);
            disposeHandler();
            expect(mockPanel.dispose).toHaveBeenCalled();
            expect((IgnorePanel as any).currentPanel).toBeUndefined();
        });
    });

    describe('Additional Coverage', () => {
        it('should send initial ignore list update on panel creation', async () => {
            const mockedVscode = vscode as any;
            IgnorePanel.createOrShow(mockContext.extensionUri, mockContext);
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(mockedVscode._mockPostMessage).toHaveBeenCalledWith({
                command: MESSAGE_COMMANDS.UPDATE_IGNORE_LIST,
                rules: expect.any(Object),
            });
        });

        it('should set correct HTML content with CSP', async () => {
            IgnorePanel.createOrShow(mockContext.extensionUri, mockContext);
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(mockWebview.html).toContain('Ignore Management');
            expect(mockWebview.html).toContain('Content-Security-Policy');
            expect(mockWebview.html).toContain(mockWebview.cspSource);
        });
    });
});