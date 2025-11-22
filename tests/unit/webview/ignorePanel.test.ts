import * as vscode from 'vscode';
import { IgnorePanel } from '../../../src/webview/ignorePanel';

describe('IgnorePanel', () => {
    let mockContext: vscode.ExtensionContext;
    let mockPanel: vscode.WebviewPanel;
    let mockWebview: vscode.Webview;

    beforeEach(() => {
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
        it('should set HTML content on panel creation', () => {
            const extensionUri = vscode.Uri.file('/test/path');
            IgnorePanel.createOrShow(extensionUri, mockContext);
            expect(mockWebview.html).toBeTruthy();
            expect(typeof mockWebview.html).toBe('string');
        });

        it('should generate valid HTML structure', () => {
            const extensionUri = vscode.Uri.file('/test/path');
            IgnorePanel.createOrShow(extensionUri, mockContext);
            expect(mockWebview.html).toContain('<!DOCTYPE html>');
            expect(mockWebview.html).toContain('</html>');
        });

        it('should include ignore management UI elements', () => {
            const extensionUri = vscode.Uri.file('/test/path');
            IgnorePanel.createOrShow(extensionUri, mockContext);
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
        it('should register message handler on creation', () => {
            const extensionUri = vscode.Uri.file('/test/path');
            IgnorePanel.createOrShow(extensionUri, mockContext);
            expect(mockWebview.onDidReceiveMessage).toHaveBeenCalled();
        });

        it('should send initial update after creation', () => {
            const extensionUri = vscode.Uri.file('/test/path');
            IgnorePanel.createOrShow(extensionUri, mockContext);
            expect(mockWebview.postMessage).toHaveBeenCalled();
        });
    });
});