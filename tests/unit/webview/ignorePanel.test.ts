import * as vscode from 'vscode';
import { IgnorePanel } from '../../../src/webview/ignorePanel';

jest.mock('typescript', () => ({
    createSourceFile: jest.fn(),
    forEachChild: jest.fn(),
    isIdentifier: jest.fn(),
    isPropertyAccessExpression: jest.fn(),
    isCallExpression: jest.fn(),
    ScriptTarget: { Latest: 99 },
    SyntaxKind: {
        Identifier: 1,
        PropertyAccessExpression: 2,
        CallExpression: 3,
        JSDocComment: 4,
    }
}));

jest.mock('fs', () => ({
    readFileSync: jest.fn()
}));

jest.mock('vscode', () => {
    const mockCreateWebviewPanel = jest.fn();
    return {
        ...jest.requireActual('vscode'),
        window: {
            createWebviewPanel: mockCreateWebviewPanel,
            showErrorMessage: jest.fn(),
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
            file: (path: string) => ({ fsPath: path }),
            joinPath: jest.fn((uri, ...paths) => ({ 
                fsPath: `${uri.fsPath}${uri.fsPath.endsWith('/') || uri.fsPath.endsWith('\\') ? '' : '/'}${paths.join('/')}` 
            })),
        },
        ViewColumn: {
            One: 1,
            Two: 2,
        },
        ExtensionMode: {
            Test: 2,
        },
        _mockCreateWebviewPanel: mockCreateWebviewPanel,
    };
});

describe('IgnorePanel', () => {
    let mockContext: vscode.ExtensionContext;
    let mockPanel: vscode.WebviewPanel;
    let mockWebview: vscode.Webview;

    beforeEach(() => {
        (vscode.workspace.fs.readFile as jest.Mock).mockRejectedValue(new Error('VS Code API not available'));
        mockWebview = {
            html: '',
            postMessage: jest.fn().mockResolvedValue(true),
            onDidReceiveMessage: jest.fn((callback) => {
                return { dispose: jest.fn() };
            }),
            asWebviewUri: jest.fn((uri) => ({
                ...uri,
                toString: () => `vscode-resource:${uri.path}`
            })),
            cspSource: 'mock-csp-source',
        } as unknown as vscode.Webview;
        mockPanel = {
            webview: mockWebview,
            reveal: jest.fn(),
            dispose: jest.fn(),
            onDidDispose: jest.fn((callback) => {
                return { dispose: jest.fn() };
            }),
        } as unknown as vscode.WebviewPanel;
        jest.spyOn(vscode.window, 'createWebviewPanel').mockReturnValue(mockPanel);
        const fs = require('fs');
        fs.readFileSync.mockImplementation((path: string) => {
            if (path.includes('src') && path.includes('webview') && path.includes('assets') && path.includes('ignore.html')) {
                return `<!DOCTYPE html>
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
                    </html>`;
            }
            throw new Error('File not found');
        });
        const extensionPath = '/test/path';
        const extensionUri = vscode.Uri.file(extensionPath);
        mockContext = {
            subscriptions: [],
            workspaceState: {
                get: jest.fn().mockReturnValue({}),
                update: jest.fn().mockResolvedValue(undefined),
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
    });

    afterEach(() => {
        (IgnorePanel as any).currentPanel = undefined;
        jest.restoreAllMocks();
    });

    describe('createOrShow', () => {
        it('should create new panel if none exists', () => {
            const extensionUri = vscode.Uri.file('/test/path');
            IgnorePanel.createOrShow(extensionUri, mockContext);
            expect(vscode.window.createWebviewPanel).toHaveBeenCalled();
            expect((IgnorePanel as any).currentPanel).toBeDefined();
        });

        it('should reveal existing panel if it exists', () => {
            const extensionUri = vscode.Uri.file('/test/path');
            IgnorePanel.createOrShow(extensionUri, mockContext);
            const revealSpy = jest.spyOn(mockPanel, 'reveal');
            IgnorePanel.createOrShow(extensionUri, mockContext);
            expect(revealSpy).toHaveBeenCalled();
        });

        it('should use ViewColumn.Two by default', () => {
            const extensionUri = vscode.Uri.file('/test/path');
            IgnorePanel.createOrShow(extensionUri, mockContext);
            expect(vscode.window.createWebviewPanel).toHaveBeenCalledWith(
                expect.any(String),
                expect.any(String),
                vscode.ViewColumn.Two,
                expect.any(Object)
            );
        });
    });

    describe('dispose', () => {
        it('should dispose panel and clear singleton', () => {
            const extensionUri = vscode.Uri.file('/test/path');
            IgnorePanel.createOrShow(extensionUri, mockContext);
            const panel = (IgnorePanel as any).currentPanel;
            panel.dispose();
            expect(mockPanel.dispose).toHaveBeenCalled();
            expect((IgnorePanel as any).currentPanel).toBeUndefined();
        });
    });

    describe('HTML generation', () => {
        it('should set HTML content on panel creation', async () => {
            const extensionUri = vscode.Uri.file('/test/path');
            IgnorePanel.createOrShow(extensionUri, mockContext);
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(mockWebview.html).toBeTruthy();
            expect(typeof mockWebview.html).toBe('string');
        });

        it('should generate valid HTML structure', async () => {
            const extensionUri = vscode.Uri.file('/test/path');
            IgnorePanel.createOrShow(extensionUri, mockContext);
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(mockWebview.html).toContain('<!DOCTYPE html>');
            expect(mockWebview.html).toContain('</html>');
        });

        it('should include ignore management UI elements', async () => {
            const extensionUri = vscode.Uri.file('/test/path');
            IgnorePanel.createOrShow(extensionUri, mockContext);
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(mockWebview.html).toContain('Ignore Management');
            expect(mockWebview.html).toContain('clearAllBtn');
        });
    });

    describe('panel configuration', () => {
        it('should enable scripts in webview', () => {
            const extensionUri = vscode.Uri.file('/test/path');
            IgnorePanel.createOrShow(extensionUri, mockContext);
            expect(vscode.window.createWebviewPanel).toHaveBeenCalledWith(
                expect.any(String),
                expect.any(String),
                expect.any(Number),
                expect.objectContaining({
                    enableScripts: true,
                })
            );
        });

        it('should set correct panel ID', () => {
            const extensionUri = vscode.Uri.file('/test/path');
            IgnorePanel.createOrShow(extensionUri, mockContext);
            expect(vscode.window.createWebviewPanel).toHaveBeenCalledWith(
                'deprecatedTrackerIgnore',
                expect.any(String),
                expect.any(Number),
                expect.any(Object)
            );
        });

        it('should set correct panel title', () => {
            const extensionUri = vscode.Uri.file('/test/path');
            IgnorePanel.createOrShow(extensionUri, mockContext);
            expect(vscode.window.createWebviewPanel).toHaveBeenCalledWith(
                expect.any(String),
                'Deprecated Tracker - Ignore Management',
                expect.any(Number),
                expect.any(Object)
            );
        });
    });

    describe('message handling', () => {
        it('should register message handler on creation', async () => {
            const extensionUri = vscode.Uri.file('/test/path');
            IgnorePanel.createOrShow(extensionUri, mockContext);
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(mockWebview.onDidReceiveMessage).toHaveBeenCalled();
        });

        it('should send initial update after creation', async () => {
            const extensionUri = vscode.Uri.file('/test/path');
            IgnorePanel.createOrShow(extensionUri, mockContext);
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(mockWebview.postMessage).toHaveBeenCalled();
        });
    });
});