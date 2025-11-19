"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = __importStar(require("vscode"));
const mainPanel_1 = require("../webview/mainPanel");
// Mock VS Code API
const mockPostMessage = jest.fn();
const mockOnDidReceiveMessage = jest.fn();
const mockReveal = jest.fn();
const mockDispose = jest.fn();
const mockWebview = {
    postMessage: mockPostMessage,
    onDidReceiveMessage: mockOnDidReceiveMessage,
    asWebviewUri: jest.fn((uri) => uri),
    html: '',
    options: {},
};
const mockPanel = {
    webview: mockWebview,
    reveal: mockReveal,
    onDidDispose: jest.fn((callback) => ({ dispose: jest.fn() })),
    dispose: mockDispose,
    viewColumn: vscode.ViewColumn.One,
    title: 'Deprecated Tracker',
    active: true,
    visible: true,
};
describe('Webview Handshake Tests', () => {
    let mockContext;
    let mockResults;
    beforeEach(() => {
        jest.clearAllMocks();
        // Set up mock context
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
            secrets: {},
            environmentVariableCollection: {},
            asAbsolutePath: (relativePath) => vscode.Uri.joinPath(extensionUri, relativePath).fsPath,
            storageUri: vscode.Uri.file('/test/storage'),
            globalStorageUri: vscode.Uri.file('/test/global-storage'),
            logUri: vscode.Uri.file('/test/log'),
            extension: undefined,
            languageModelAccessInformation: undefined,
        };
        // Sample mock results
        mockResults = [
            {
                name: 'oldMethod',
                fileName: 'test.ts',
                filePath: '/test/src/test.ts',
                line: 10,
                character: 5,
                kind: 'method'
            },
            {
                name: 'deprecatedProperty',
                fileName: 'utils.ts',
                filePath: '/test/src/utils.ts',
                line: 25,
                character: 12,
                kind: 'property'
            }
        ];
        // Mock vscode.window.createWebviewPanel
        jest.spyOn(vscode.window, 'createWebviewPanel').mockReturnValue(mockPanel);
    });
    afterEach(() => {
        jest.restoreAllMocks();
        mainPanel_1.MainPanel.currentPanel = undefined;
    });
    describe('Webview Ready Handshake', () => {
        it('should send empty results when webview is ready with no current results', () => {
            // Create panel without initial results
            const panel = mainPanel_1.MainPanel.createOrShow(mockContext.extensionUri, mockContext);
            // Simulate webview ready message
            const webviewReadyHandler = mockOnDidReceiveMessage.mock.calls.find(call => call[0] && typeof call[0] === 'function')?.[0];
            expect(webviewReadyHandler).toBeDefined();
            // Trigger webview ready
            webviewReadyHandler({ command: 'webviewReady' });
            // Verify postMessage was called with empty results
            expect(mockPostMessage).toHaveBeenCalledWith({
                command: 'results',
                results: []
            });
        });
        it('should send current results when webview is ready with existing results', () => {
            // Create panel
            const panel = mainPanel_1.MainPanel.createOrShow(mockContext.extensionUri, mockContext);
            // Update with results first
            panel.updateResults(mockResults);
            // Clear previous calls
            mockPostMessage.mockClear();
            // Simulate webview ready message
            const webviewReadyHandler = mockOnDidReceiveMessage.mock.calls.find(call => call[0] && typeof call[0] === 'function')?.[0];
            expect(webviewReadyHandler).toBeDefined();
            // Trigger webview ready
            webviewReadyHandler({ command: 'webviewReady' });
            // Verify postMessage was called with the results
            expect(mockPostMessage).toHaveBeenCalledWith({
                command: 'results',
                results: mockResults
            });
        });
        it('should always send results when panel is revealed', () => {
            const panel = mainPanel_1.MainPanel.createOrShow(mockContext.extensionUri, mockContext);
            // Clear previous calls
            mockPostMessage.mockClear();
            // Reveal panel (should send empty results)
            panel.reveal();
            expect(mockPostMessage).toHaveBeenCalledWith({
                command: 'results',
                results: []
            });
            // Update with results
            panel.updateResults(mockResults);
            mockPostMessage.mockClear();
            // Reveal again (should send the results)
            panel.reveal();
            expect(mockPostMessage).toHaveBeenCalledWith({
                command: 'results',
                results: mockResults
            });
        });
        it('should handle multiple webview ready messages correctly', () => {
            const panel = mainPanel_1.MainPanel.createOrShow(mockContext.extensionUri, mockContext);
            const webviewReadyHandler = mockOnDidReceiveMessage.mock.calls.find(call => call[0] && typeof call[0] === 'function')?.[0];
            expect(webviewReadyHandler).toBeDefined();
            // First webview ready (empty results)
            webviewReadyHandler({ command: 'webviewReady' });
            expect(mockPostMessage).toHaveBeenCalledWith({
                command: 'results',
                results: []
            });
            mockPostMessage.mockClear();
            // Update results
            panel.updateResults(mockResults);
            mockPostMessage.mockClear();
            // Second webview ready (with results)
            webviewReadyHandler({ command: 'webviewReady' });
            expect(mockPostMessage).toHaveBeenCalledWith({
                command: 'results',
                results: mockResults
            });
        });
    });
    describe('Results Message Handling', () => {
        it('should update current results and send to webview', () => {
            const panel = mainPanel_1.MainPanel.createOrShow(mockContext.extensionUri, mockContext);
            mockPostMessage.mockClear();
            // Update results
            panel.updateResults(mockResults);
            expect(mockPostMessage).toHaveBeenCalledWith({
                command: 'results',
                results: mockResults
            });
        });
        it('should handle empty results correctly', () => {
            const panel = mainPanel_1.MainPanel.createOrShow(mockContext.extensionUri, mockContext);
            // First update with some results
            panel.updateResults(mockResults);
            mockPostMessage.mockClear();
            // Then update with empty results
            panel.updateResults([]);
            expect(mockPostMessage).toHaveBeenCalledWith({
                command: 'results',
                results: []
            });
        });
    });
});
//# sourceMappingURL=webview-handshake.test.js.map