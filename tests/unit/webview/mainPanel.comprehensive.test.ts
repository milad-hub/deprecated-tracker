import * as fs from 'fs';
import * as vscode from 'vscode';
import { ERROR_MESSAGES, MESSAGE_COMMANDS } from '../../../src/constants';
import { ScanHistory } from '../../../src/history';
import { DeprecatedItem } from '../../../src/scanner';
import { MainPanel } from '../../../src/webview/mainPanel';
import { IgnoreManager } from '../../../src/scanner/ignoreManager';
import { TagsManager } from '../../../src/config/tagsManager';

jest.mock('fs', () => ({
    readFileSync: jest.fn()
}));

jest.mock('vscode', () => {
    const mockPostMessage = jest.fn();
    const mockShowErrorMessage = jest.fn();
    const mockShowInformationMessage = jest.fn();
    const mockShowTextDocument = jest.fn();
    const mockExecuteCommand = jest.fn();
    const mockRevealRange = jest.fn();
    return {
        window: {
            createWebviewPanel: jest.fn(),
            showErrorMessage: mockShowErrorMessage,
            showInformationMessage: mockShowInformationMessage,
            showTextDocument: mockShowTextDocument,
            activeTextEditor: undefined,
        },
        workspace: {
            workspaceFolders: undefined,
            fs: {
                readFile: jest.fn().mockRejectedValue(new Error('Not implemented')),
            },
        },
        commands: {
            executeCommand: mockExecuteCommand,
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
        Position: class {
            constructor(public line: number, public character: number) { }
        },
        Selection: class {
            constructor(public anchor: any, public active: any) { }
        },
        TextEditorRevealType: {
            InCenter: 2,
        },
        _mockPostMessage: mockPostMessage,
        _mockShowErrorMessage: mockShowErrorMessage,
        _mockShowInformationMessage: mockShowInformationMessage,
        _mockShowTextDocument: mockShowTextDocument,
        _mockExecuteCommand: mockExecuteCommand,
        _mockRevealRange: mockRevealRange,
    };
});

jest.mock('../../../src/scanner', () => {
    return {
        Scanner: jest.fn().mockImplementation(() => ({
            scanProject: jest.fn().mockResolvedValue([]),
        })),
    };
});

jest.mock('../../../src/scanner/ignoreManager', () => {
    return {
        IgnoreManager: jest.fn().mockImplementation(() => ({
            ignoreMethod: jest.fn(),
            ignoreFile: jest.fn(),
            reload: jest.fn(),
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

describe('MainPanel - Complete Coverage', () => {
    let mockContext: vscode.ExtensionContext;
    let mockPanel: vscode.WebviewPanel;
    let mockWebview: vscode.Webview;
    let messageHandler: (message: any) => Promise<void>;
    let disposeHandler: () => void;

    beforeEach(() => {
        jest.clearAllMocks();
        const originalReadFileSync = (fs.readFileSync as jest.Mock);
        originalReadFileSync.mockImplementation((path) => {
            if (path.includes('main.html')) {
                return `<!DOCTYPE html>
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
                    </html>`;
            }
            throw new Error('File not found');
        });
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
        mockContext = {
            subscriptions: [],
            extensionUri: vscode.Uri.file('/test/extension'),
            extensionPath: '/test/extension',
            workspaceState: {
                get: jest.fn(),
                update: jest.fn().mockResolvedValue(undefined),
                keys: jest.fn(() => []),
            },
        } as unknown as vscode.ExtensionContext;
        (MainPanel as any).currentPanel = undefined;
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('Message Handling - Lines 40-59', () => {
        it('passes custom configuration to its scanner', () => {
            const { Scanner } = require('../../../src/scanner');
            const config = { includePatterns: ['src/**'] };

            MainPanel.createOrShow(
                mockContext.extensionUri,
                mockContext,
                {} as ScanHistory,
                new IgnoreManager(mockContext),
                new TagsManager(mockContext),
                config
            );

            expect(Scanner).toHaveBeenCalledWith(
                expect.any(Object),
                expect.any(Object),
                config
            );
        });

        it('honors history limits and reports whether more entries exist', async () => {
            const history = Array.from({ length: 11 }, (_, index) => ({ scanId: `${index}` }));
            const getHistoryMetadata = jest.fn().mockResolvedValue(history);
            MainPanel.createOrShow(
                mockContext.extensionUri,
                mockContext,
                { getHistoryMetadata } as unknown as ScanHistory,
                new IgnoreManager(mockContext),
                new TagsManager(mockContext)
            );

            await messageHandler({ command: MESSAGE_COMMANDS.VIEW_HISTORY, limit: 10 });

            expect(getHistoryMetadata).toHaveBeenCalledWith(11);
            expect((vscode as any)._mockPostMessage).toHaveBeenCalledWith({
                command: 'historyMetadata',
                history: history.slice(0, 10),
                hasMore: true,
            });
        });

        it('falls back to ten history entries for invalid limits', async () => {
            const getHistoryMetadata = jest.fn().mockResolvedValue([]);
            MainPanel.createOrShow(
                mockContext.extensionUri,
                mockContext,
                { getHistoryMetadata } as unknown as ScanHistory,
                new IgnoreManager(mockContext),
                new TagsManager(mockContext)
            );

            await messageHandler({ command: MESSAGE_COMMANDS.VIEW_HISTORY, limit: 0 });

            expect(getHistoryMetadata).toHaveBeenCalledWith(11);
        });

        it('should handle OPEN_FILE message', async () => {
            const mockedVscode = vscode as any;
            const panel = MainPanel.createOrShow(mockContext.extensionUri, mockContext, {} as ScanHistory, new IgnoreManager(mockContext), new TagsManager(mockContext));
            await messageHandler({
                command: MESSAGE_COMMANDS.OPEN_FILE,
                filePath: '/test/file.ts',
            });
            expect(mockedVscode.window.showTextDocument).toHaveBeenCalledWith(
                expect.objectContaining({ fsPath: '/test/file.ts' })
            );
        });

        it('should handle OPEN_FILE_AT_LINE message', async () => {
            const mockedVscode = vscode as any;
            const mockDocument = {
                selection: null,
            };
            mockedVscode.window.showTextDocument.mockResolvedValue(mockDocument);
            mockedVscode.window.activeTextEditor = {
                revealRange: mockedVscode._mockRevealRange,
            };
            const panel = MainPanel.createOrShow(mockContext.extensionUri, mockContext, {} as ScanHistory, new IgnoreManager(mockContext), new TagsManager(mockContext));
            await messageHandler({
                command: MESSAGE_COMMANDS.OPEN_FILE_AT_LINE,
                filePath: '/test/file.ts',
                line: 42,
            });
            expect(mockedVscode.window.showTextDocument).toHaveBeenCalled();
            expect(mockDocument.selection).toBeDefined();
            expect(mockedVscode._mockRevealRange).toHaveBeenCalled();
        });

        it('should handle IGNORE_METHOD message', async () => {
            const mockedVscode = vscode as any;
            const panel = MainPanel.createOrShow(mockContext.extensionUri, mockContext, {} as ScanHistory, new IgnoreManager(mockContext), new TagsManager(mockContext));
            const results: DeprecatedItem[] = [
                {
                    name: 'oldMethod',
                    fileName: 'test.ts',
                    filePath: '/test/file.ts',
                    line: 10,
                    character: 5,
                    kind: 'method' as any,
                },
                {
                    name: 'oldMethod',
                    fileName: 'other.ts',
                    filePath: '/test/other.ts',
                    line: 10,
                    character: 5,
                    kind: 'method',
                },
            ];
            panel.updateResults(results);
            await messageHandler({
                command: MESSAGE_COMMANDS.IGNORE_METHOD,
                filePath: '/test/file.ts',
                methodName: 'oldMethod',
            });
            expect(mockedVscode._mockShowInformationMessage).toHaveBeenCalledWith(
                'Ignored method: oldMethod'
            );
            expect(mockedVscode._mockExecuteCommand).toHaveBeenCalledWith(
                'deprecatedTracker.updateTreeView',
                [expect.objectContaining({ filePath: '/test/other.ts' })]
            );
        });

        it('should handle IGNORE_FILE message', async () => {
            const mockedVscode = vscode as any;
            const panel = MainPanel.createOrShow(mockContext.extensionUri, mockContext, {} as ScanHistory, new IgnoreManager(mockContext), new TagsManager(mockContext));
            const results: DeprecatedItem[] = [
                {
                    name: 'oldMethod',
                    fileName: 'test.ts',
                    filePath: '/test/file.ts',
                    line: 10,
                    character: 5,
                    kind: 'method',
                },
            ];
            panel.updateResults(results);
            await messageHandler({
                command: MESSAGE_COMMANDS.IGNORE_FILE,
                filePath: '/test/file.ts',
            });
            expect(mockedVscode._mockShowInformationMessage).toHaveBeenCalled();
            expect(mockedVscode._mockExecuteCommand).toHaveBeenCalled();
        });

        it('should handle EXPORT_RESULTS message', async () => {
            const panel = MainPanel.createOrShow(mockContext.extensionUri, mockContext, {} as ScanHistory, new IgnoreManager(mockContext), new TagsManager(mockContext));
            const handleExport = jest
                .spyOn(panel as unknown as { handleExport: (format: string) => Promise<void> }, 'handleExport')
                .mockResolvedValue();

            await messageHandler({
                command: MESSAGE_COMMANDS.EXPORT_RESULTS,
                format: 'csv',
            });

            expect(handleExport).toHaveBeenCalledWith('csv');
        });


    });

    describe('performScan - Lines 122-147', () => {
        it('should send scanning messages and perform scan successfully', async () => {
            const mockedVscode = vscode as any;
            const { Scanner } = require('../../../src/scanner');
            const mockResults: DeprecatedItem[] = [
                {
                    name: 'oldMethod',
                    fileName: 'test.ts',
                    filePath: '/test/file.ts',
                    line: 10,
                    character: 5,
                    kind: 'method' as any,
                },
            ];
            Scanner.mockImplementation(() => ({
                scanProject: jest.fn().mockImplementation(async (_workspace, onProgress) => {
                    onProgress('/test/file.ts', 1, 3);
                    return mockResults;
                }),
            }));
            mockedVscode.workspace.workspaceFolders = [{ uri: vscode.Uri.file('/workspace') }];
            const mockScanHistory = {
                saveScan: jest.fn().mockResolvedValue('mock-scan-id'),
            } as unknown as ScanHistory;
            const panel = MainPanel.createOrShow(mockContext.extensionUri, mockContext, mockScanHistory, new IgnoreManager(mockContext), new TagsManager(mockContext));
            await panel.performScan();
            expect(mockedVscode._mockPostMessage).toHaveBeenCalledWith({
                command: MESSAGE_COMMANDS.SCANNING,
                scanning: true,
            });
            expect(mockedVscode._mockPostMessage).toHaveBeenCalledWith({
                command: MESSAGE_COMMANDS.RESULTS,
                results: mockResults,
            });
            expect(mockedVscode._mockPostMessage).toHaveBeenCalledWith({
                command: MESSAGE_COMMANDS.SCANNING,
                scanning: false,
            });
            expect(mockScanHistory.saveScan).toHaveBeenCalledWith(
                mockResults,
                expect.any(Number),
                3,
            );
        });

        it('should handle scan error and show error message', async () => {
            const mockedVscode = vscode as any;
            const { Scanner } = require('../../../src/scanner');
            const testError = new Error('Scan failed');
            Scanner.mockImplementation(() => ({
                scanProject: jest.fn().mockRejectedValue(testError),
            }));
            mockedVscode.workspace.workspaceFolders = [{ uri: vscode.Uri.file('/workspace') }];
            const panel = MainPanel.createOrShow(mockContext.extensionUri, mockContext, {} as ScanHistory, new IgnoreManager(mockContext), new TagsManager(mockContext));
            await panel.performScan();
            expect(mockedVscode._mockShowErrorMessage).toHaveBeenCalledWith(
                `${ERROR_MESSAGES.SCAN_FAILED}: Scan failed`
            );
            expect(mockedVscode._mockPostMessage).toHaveBeenCalledWith({
                command: MESSAGE_COMMANDS.SCANNING,
                scanning: false,
            });
        });

        it('should handle non-Error exceptions in scan', async () => {
            const mockedVscode = vscode as any;
            const { Scanner } = require('../../../src/scanner');
            Scanner.mockImplementation(() => ({
                scanProject: jest.fn().mockRejectedValue('String error'),
            }));
            mockedVscode.workspace.workspaceFolders = [{ uri: vscode.Uri.file('/workspace') }];
            const panel = MainPanel.createOrShow(mockContext.extensionUri, mockContext, {} as ScanHistory, new IgnoreManager(mockContext), new TagsManager(mockContext));
            await panel.performScan();
            expect(mockedVscode._mockShowErrorMessage).toHaveBeenCalledWith(
                `${ERROR_MESSAGES.SCAN_FAILED}: ${ERROR_MESSAGES.UNKNOWN_ERROR}`
            );
        });
    });

    describe('HTML Generation - Lines 220-222', () => {
        it('should dispose properly cleaning up resources', () => {
            const panel = MainPanel.createOrShow(mockContext.extensionUri, mockContext, {} as ScanHistory, new IgnoreManager(mockContext), new TagsManager(mockContext));
            disposeHandler();
            expect(mockPanel.dispose).toHaveBeenCalled();
            expect(MainPanel.currentPanel).toBeUndefined();
        });

        it('should clean up all disposables', () => {
            const panel = MainPanel.createOrShow(mockContext.extensionUri, mockContext, {} as ScanHistory, new IgnoreManager(mockContext), new TagsManager(mockContext));
            panel.dispose();
            expect(MainPanel.currentPanel).toBeUndefined();
            expect(mockPanel.dispose).toHaveBeenCalled();
        });
    });
});
