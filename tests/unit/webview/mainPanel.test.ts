import * as fs from 'fs';
import * as vscode from 'vscode';
import { ScanHistory } from '../../../src/history';
import { DeprecatedItem } from '../../../src/scanner';
import { MainPanel } from '../../../src/webview/mainPanel';

jest.mock('fs');

jest.mock('vscode', () => {
    const mockCreateWebviewPanel = jest.fn();
    const mockShowErrorMessage = jest.fn();
    const mockWithProgress = jest.fn((options, task) => {
        return task({ report: jest.fn() });
    });

    return {
        ...jest.requireActual('vscode'),
        window: {
            createWebviewPanel: mockCreateWebviewPanel,
            showErrorMessage: mockShowErrorMessage,
            showInformationMessage: jest.fn(),
            withProgress: mockWithProgress,
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
                readFile: jest.fn().mockRejectedValue(new Error('Mock readFile error')),
            },
        },
        Uri: {
            file: (path: string) => ({ fsPath: path }),
            joinPath: jest.fn((uri, path) => ({ fsPath: `${uri.fsPath}/${path}` })),
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
        _mockWithProgress: mockWithProgress,
    };
});

describe('MainPanel', () => {
    let mockContext: vscode.ExtensionContext;
    let mockPanel: vscode.WebviewPanel;
    let mockCreateWebviewPanel: jest.Mock;
    let mockShowErrorMessage: jest.Mock;
    let mockWithProgress: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        (fs.readFileSync as jest.Mock).mockReturnValue(`<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <title>Deprecated Tracker</title>
            </head>
            <body>
                <input type="text" id="nameFilter" value="{{nameFilter}}">
                <input type="text" id="fileFilter" value="{{fileFilter}}">
                <script src="{{scriptUri}}"></script>
            </body>
            </html>`);
        const mockedVscode = vscode as any;
        mockCreateWebviewPanel = mockedVscode._mockCreateWebviewPanel;
        mockShowErrorMessage = mockedVscode._mockShowErrorMessage;
        mockWithProgress = mockedVscode._mockWithProgress;
        mockCreateWebviewPanel.mockClear();
        mockShowErrorMessage.mockClear();
        mockWithProgress.mockClear();
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

    describe('createOrShow', () => {
        it('should create new panel if none exists', () => {
            mockCreateWebviewPanel.mockReturnValue(mockPanel);
            const panel = MainPanel.createOrShow(vscode.Uri.file('/test'), mockContext, {} as ScanHistory);
            expect(mockCreateWebviewPanel).toHaveBeenCalledWith(
                'deprecatedTracker',
                'Deprecated Tracker',
                vscode.ViewColumn.One,
                expect.objectContaining({
                    enableScripts: true,
                    localResourceRoots: expect.any(Array),
                })
            );
            expect(panel).toBeDefined();
        });

        it('should reveal existing panel if it exists', () => {
            mockCreateWebviewPanel.mockReturnValue(mockPanel);
            const panel1 = MainPanel.createOrShow(vscode.Uri.file('/test'), mockContext, {} as ScanHistory);
            const panel2 = MainPanel.createOrShow(vscode.Uri.file('/test'), mockContext, {} as ScanHistory);
            expect(panel1).toBe(panel2);
            expect(mockPanel.reveal).toHaveBeenCalled();
        });
    });

    describe('updateResults', () => {
        it('should post message to webview with results', () => {
            mockCreateWebviewPanel.mockReturnValue(mockPanel);
            const panel = MainPanel.createOrShow(vscode.Uri.file('/test'), mockContext, {} as ScanHistory);
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
            panel.updateResults(testResults);
            expect(mockPanel.webview.postMessage).toHaveBeenCalled();
        });
    });

    describe('performScan', () => {
        it('should show error when no workspace', async () => {
            mockCreateWebviewPanel.mockReturnValue(mockPanel);
            (vscode.workspace as any).workspaceFolders = undefined;
            const panel = MainPanel.createOrShow(vscode.Uri.file('/test'), mockContext, {} as ScanHistory);
            await panel.performScan();
            expect(mockShowErrorMessage).toHaveBeenCalled();
        });
    });

    describe('dispose', () => {
        it('should dispose panel and clear singleton', () => {
            mockCreateWebviewPanel.mockReturnValue(mockPanel);
            const panel = MainPanel.createOrShow(vscode.Uri.file('/test'), mockContext, {} as ScanHistory);
            panel.dispose();
            expect(mockPanel.dispose).toHaveBeenCalled();
        });
    });
});