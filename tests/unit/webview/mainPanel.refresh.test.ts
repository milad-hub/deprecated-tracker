import * as fs from 'fs';
import * as vscode from 'vscode';
import { ERROR_MESSAGES, MESSAGE_COMMANDS } from '../../../src/constants';
import { DeprecatedItem } from '../../../src/scanner';
import { MainPanel } from '../../../src/webview/mainPanel';

jest.mock('fs', () => ({
    readFileSync: jest.fn()
}));

jest.mock('vscode', () => {
    const mockPostMessage = jest.fn();
    const mockShowErrorMessage = jest.fn();
    const mockShowInformationMessage = jest.fn();
    const mockScanSpecificFiles = jest.fn();
    return {
        window: {
            createWebviewPanel: jest.fn(),
            showErrorMessage: mockShowErrorMessage,
            showInformationMessage: mockShowInformationMessage,
            showTextDocument: jest.fn(),
            activeTextEditor: undefined,
        },
        workspace: {
            workspaceFolders: undefined,
            fs: {
                readFile: jest.fn().mockRejectedValue(new Error('Not implemented')),
            },
        },
        commands: {
            executeCommand: jest.fn(),
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
        _mockShowErrorMessage: mockShowErrorMessage,
        _mockShowInformationMessage: mockShowInformationMessage,
        _mockScanSpecificFiles: mockScanSpecificFiles,
    };
});

jest.mock('../../../src/scanner', () => {
    const mockScanSpecificFiles = jest.fn().mockResolvedValue([]);
    return {
        Scanner: jest.fn().mockImplementation(() => ({
            scanProject: jest.fn().mockResolvedValue([]),
            scanSpecificFiles: mockScanSpecificFiles,
        })),
        _mockScanSpecificFiles: mockScanSpecificFiles,
    };
});

jest.mock('../../../src/scanner/ignoreManager', () => {
    return {
        IgnoreManager: jest.fn().mockImplementation(() => ({
            ignoreMethod: jest.fn(),
            ignoreFile: jest.fn(),
        })),
    };
});

jest.mock('../../../src/webview/ignorePanel', () => {
    return {
        IgnorePanel: {
            createOrShow: jest.fn(),
        },
    };
});

describe('MainPanel - handleRefresh', () => {
    let mockContext: vscode.ExtensionContext;
    let mockPanel: vscode.WebviewPanel;
    let mockWebview: vscode.Webview;
    let messageHandler: (message: any) => Promise<void>;
    let mockScanSpecificFiles: jest.Mock;
    beforeEach(() => {
        jest.clearAllMocks();
        (vscode.workspace.fs.readFile as jest.Mock).mockRejectedValue(new Error('VS Code API not available'));
        (fs.readFileSync as jest.Mock).mockImplementation((path: string) => {
            if (path.includes('main.html')) {
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
        const mockedVscode = vscode as any;
        const Scanner = require('../../../src/scanner').Scanner;
        mockScanSpecificFiles = Scanner().scanSpecificFiles;
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
            onDidDispose: jest.fn(() => ({ dispose: jest.fn() })),
            reveal: jest.fn(),
            dispose: jest.fn(),
        } as unknown as vscode.WebviewPanel;
        mockedVscode.window.createWebviewPanel.mockReturnValue(mockPanel);
        mockContext = {
            subscriptions: [],
            extensionUri: vscode.Uri.file('/test/extension'),
            extensionPath: '/test/extension',
        } as unknown as vscode.ExtensionContext;
        (MainPanel as any).currentPanel = undefined;
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('REFRESH_RESULTS Message Handling', () => {
        it('should handle refresh with existing results successfully', async () => {
            const mockedVscode = vscode as any;
            mockedVscode.workspace.workspaceFolders = [
                { uri: vscode.Uri.file('/workspace') },
            ];
            const initialResults: DeprecatedItem[] = [
                {
                    name: 'oldMethod1',
                    fileName: 'file1.ts',
                    filePath: '/workspace/src/file1.ts',
                    line: 10,
                    character: 5,
                    kind: 'method' as any,
                },
                {
                    name: 'oldMethod2',
                    fileName: 'file2.ts',
                    filePath: '/workspace/src/file2.ts',
                    line: 20,
                    character: 3,
                    kind: 'method' as any,
                },
            ];
            const refreshedResults: DeprecatedItem[] = [
                {
                    name: 'oldMethod1',
                    fileName: 'file1.ts',
                    filePath: '/workspace/src/file1.ts',
                    line: 10,
                    character: 5,
                    kind: 'method' as any,
                },
            ];
            mockScanSpecificFiles.mockResolvedValue(refreshedResults);
            const panel = MainPanel.createOrShow(mockContext.extensionUri, mockContext);
            panel.updateResults(initialResults);
            await messageHandler({
                command: MESSAGE_COMMANDS.REFRESH_RESULTS,
            });
            expect(mockedVscode._mockPostMessage).toHaveBeenCalledWith({
                command: MESSAGE_COMMANDS.SCANNING,
                scanning: true,
            });
            expect(mockScanSpecificFiles).toHaveBeenCalledWith(
                expect.objectContaining({ uri: expect.anything() }),
                expect.arrayContaining([
                    '/workspace/src/file1.ts',
                    '/workspace/src/file2.ts',
                ]),
                expect.any(Function)
            );
            expect(mockedVscode._mockPostMessage).toHaveBeenCalledWith({
                command: MESSAGE_COMMANDS.RESULTS,
                results: refreshedResults,
            });
            expect(mockedVscode._mockPostMessage).toHaveBeenCalledWith({
                command: MESSAGE_COMMANDS.SCANNING,
                scanning: false,
            });
            expect(mockedVscode._mockShowInformationMessage).toHaveBeenCalledWith(
                'Results refreshed successfully.'
            );
        });

        it('should show error when no workspace folder', async () => {
            const mockedVscode = vscode as any;
            mockedVscode.workspace.workspaceFolders = undefined;
            const panel = MainPanel.createOrShow(mockContext.extensionUri, mockContext);
            await messageHandler({
                command: MESSAGE_COMMANDS.REFRESH_RESULTS,
            });
            expect(mockedVscode._mockShowErrorMessage).toHaveBeenCalledWith(
                ERROR_MESSAGES.NO_WORKSPACE
            );
            expect(mockScanSpecificFiles).not.toHaveBeenCalled();
        });

        it('should show information message when no results to refresh', async () => {
            const mockedVscode = vscode as any;
            mockedVscode.workspace.workspaceFolders = [
                { uri: vscode.Uri.file('/workspace') },
            ];
            const panel = MainPanel.createOrShow(mockContext.extensionUri, mockContext);
            panel.updateResults([]);
            await messageHandler({
                command: MESSAGE_COMMANDS.REFRESH_RESULTS,
            });
            expect(mockedVscode._mockShowInformationMessage).toHaveBeenCalledWith(
                'No results to refresh. Please run a scan first.'
            );
            expect(mockScanSpecificFiles).not.toHaveBeenCalled();
        });

        it('should handle refresh with null results', async () => {
            const mockedVscode = vscode as any;
            mockedVscode.workspace.workspaceFolders = [
                { uri: vscode.Uri.file('/workspace') },
            ];
            const panel = MainPanel.createOrShow(mockContext.extensionUri, mockContext);
            await messageHandler({
                command: MESSAGE_COMMANDS.REFRESH_RESULTS,
            });
            expect(mockedVscode._mockShowInformationMessage).toHaveBeenCalledWith(
                'No results to refresh. Please run a scan first.'
            );
            expect(mockScanSpecificFiles).not.toHaveBeenCalled();
        });

        it('should extract unique file paths correctly', async () => {
            const mockedVscode = vscode as any;
            mockedVscode.workspace.workspaceFolders = [
                { uri: vscode.Uri.file('/workspace') },
            ];
            const initialResults: DeprecatedItem[] = [
                {
                    name: 'oldMethod1',
                    fileName: 'file1.ts',
                    filePath: '/workspace/src/file1.ts',
                    line: 10,
                    character: 5,
                    kind: 'method' as any,
                },
                {
                    name: 'oldMethod2',
                    fileName: 'file1.ts',
                    filePath: '/workspace/src/file1.ts',
                    line: 20,
                    character: 3,
                    kind: 'method' as any,
                },
                {
                    name: 'oldMethod3',
                    fileName: 'file2.ts',
                    filePath: '/workspace/src/file2.ts',
                    line: 30,
                    character: 7,
                    kind: 'property' as any,
                },
            ];
            mockScanSpecificFiles.mockResolvedValue([]);
            const panel = MainPanel.createOrShow(mockContext.extensionUri, mockContext);
            panel.updateResults(initialResults);
            await messageHandler({
                command: MESSAGE_COMMANDS.REFRESH_RESULTS,
            });
            expect(mockScanSpecificFiles).toHaveBeenCalledWith(
                expect.anything(),
                expect.arrayContaining([
                    '/workspace/src/file1.ts',
                    '/workspace/src/file2.ts',
                ]),
                expect.any(Function)
            );
            const callArgs = mockScanSpecificFiles.mock.calls[0];
            const filePaths = callArgs[1];
            expect(filePaths.length).toBe(2);
        });

        it('should invoke progress callback during refresh', async () => {
            const mockedVscode = vscode as any;
            mockedVscode.workspace.workspaceFolders = [
                { uri: vscode.Uri.file('/workspace') },
            ];
            const initialResults: DeprecatedItem[] = [
                {
                    name: 'oldMethod',
                    fileName: 'file1.ts',
                    filePath: '/workspace/src/file1.ts',
                    line: 10,
                    character: 5,
                    kind: 'method' as any,
                },
            ];
            mockScanSpecificFiles.mockImplementation(
                async (ws: any, files: string[], onProgress: Function) => {
                    if (onProgress) {
                        onProgress(1, 2);
                        onProgress(2, 2);
                    }
                    return [];
                }
            );
            const panel = MainPanel.createOrShow(mockContext.extensionUri, mockContext);
            panel.updateResults(initialResults);
            await messageHandler({
                command: MESSAGE_COMMANDS.REFRESH_RESULTS,
            });
            expect(mockedVscode._mockPostMessage).toHaveBeenCalledWith({
                command: MESSAGE_COMMANDS.SCANNING,
                scanning: true,
            });
        });

        it('should handle scan error and show error message', async () => {
            const mockedVscode = vscode as any;
            mockedVscode.workspace.workspaceFolders = [
                { uri: vscode.Uri.file('/workspace') },
            ];
            const initialResults: DeprecatedItem[] = [
                {
                    name: 'oldMethod',
                    fileName: 'file1.ts',
                    filePath: '/workspace/src/file1.ts',
                    line: 10,
                    character: 5,
                    kind: 'method' as any,
                },
            ];
            const testError = new Error('Scan failed');
            mockScanSpecificFiles.mockRejectedValue(testError);
            const panel = MainPanel.createOrShow(mockContext.extensionUri, mockContext);
            panel.updateResults(initialResults);
            await messageHandler({
                command: MESSAGE_COMMANDS.REFRESH_RESULTS,
            });
            expect(mockedVscode._mockShowErrorMessage).toHaveBeenCalledWith(
                'Refresh failed: Scan failed'
            );
            expect(mockedVscode._mockPostMessage).toHaveBeenCalledWith({
                command: MESSAGE_COMMANDS.SCANNING,
                scanning: false,
            });
        });

        it('should handle non-Error exceptions during refresh', async () => {
            const mockedVscode = vscode as any;
            mockedVscode.workspace.workspaceFolders = [
                { uri: vscode.Uri.file('/workspace') },
            ];
            const initialResults: DeprecatedItem[] = [
                {
                    name: 'oldMethod',
                    fileName: 'file1.ts',
                    filePath: '/workspace/src/file1.ts',
                    line: 10,
                    character: 5,
                    kind: 'method' as any,
                },
            ];
            mockScanSpecificFiles.mockRejectedValue('String error');
            const panel = MainPanel.createOrShow(mockContext.extensionUri, mockContext);
            panel.updateResults(initialResults);

            await messageHandler({
                command: MESSAGE_COMMANDS.REFRESH_RESULTS,
            });
            expect(mockedVscode._mockShowErrorMessage).toHaveBeenCalledWith(
                `Refresh failed: ${ERROR_MESSAGES.UNKNOWN_ERROR}`
            );
        });

        it('should update current results after successful refresh', async () => {
            const mockedVscode = vscode as any;
            mockedVscode.workspace.workspaceFolders = [
                { uri: vscode.Uri.file('/workspace') },
            ];
            const initialResults: DeprecatedItem[] = [
                {
                    name: 'oldMethod1',
                    fileName: 'file1.ts',
                    filePath: '/workspace/src/file1.ts',
                    line: 10,
                    character: 5,
                    kind: 'method' as any,
                },
            ];
            const newResults: DeprecatedItem[] = [
                {
                    name: 'oldMethod2',
                    fileName: 'file1.ts',
                    filePath: '/workspace/src/file1.ts',
                    line: 20,
                    character: 3,
                    kind: 'method' as any,
                },
            ];
            mockScanSpecificFiles.mockResolvedValue(newResults);
            const panel = MainPanel.createOrShow(mockContext.extensionUri, mockContext);
            panel.updateResults(initialResults);
            await messageHandler({
                command: MESSAGE_COMMANDS.REFRESH_RESULTS,
            });
            expect(mockedVscode._mockPostMessage).toHaveBeenCalledWith({
                command: MESSAGE_COMMANDS.RESULTS,
                results: newResults,
            });
        });

        it('should handle refresh with empty workspace folders array', async () => {
            const mockedVscode = vscode as any;
            mockedVscode.workspace.workspaceFolders = [];
            const panel = MainPanel.createOrShow(mockContext.extensionUri, mockContext);
            await messageHandler({
                command: MESSAGE_COMMANDS.REFRESH_RESULTS,
            });
            expect(mockedVscode._mockShowErrorMessage).toHaveBeenCalledWith(
                ERROR_MESSAGES.NO_WORKSPACE
            );
        });

        it('should send all required messages in correct order', async () => {
            const mockedVscode = vscode as any;
            mockedVscode.workspace.workspaceFolders = [
                { uri: vscode.Uri.file('/workspace') },
            ];
            const initialResults: DeprecatedItem[] = [
                {
                    name: 'oldMethod',
                    fileName: 'file1.ts',
                    filePath: '/workspace/src/file1.ts',
                    line: 10,
                    character: 5,
                    kind: 'method' as any,
                },
            ];
            mockScanSpecificFiles.mockResolvedValue([]);
            const panel = MainPanel.createOrShow(mockContext.extensionUri, mockContext);
            panel.updateResults(initialResults);
            mockedVscode._mockPostMessage.mockClear();
            await messageHandler({
                command: MESSAGE_COMMANDS.REFRESH_RESULTS,
            });
            const calls = mockedVscode._mockPostMessage.mock.calls;
            const scanningTrueIndex = calls.findIndex(
                (call: any[]) =>
                    call[0].command === MESSAGE_COMMANDS.SCANNING &&
                    call[0].scanning === true
            );
            const resultsIndex = calls.findIndex(
                (call: any[]) => call[0].command === MESSAGE_COMMANDS.RESULTS
            );
            const scanningFalseIndex = calls.findIndex(
                (call: any[]) =>
                    call[0].command === MESSAGE_COMMANDS.SCANNING &&
                    call[0].scanning === false
            );
            expect(scanningTrueIndex).toBeGreaterThanOrEqual(0);
            expect(resultsIndex).toBeGreaterThanOrEqual(0);
            expect(scanningFalseIndex).toBeGreaterThanOrEqual(0);
            expect(resultsIndex).toBeGreaterThan(scanningTrueIndex);
            expect(scanningFalseIndex).toBeGreaterThan(resultsIndex);
        });
    });
});