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
const extension_1 = require("../extension");
describe('Extension', () => {
    let mockContext;
    beforeEach(() => {
        const extensionPath = '/test/path';
        const extensionUri = vscode.Uri.file(extensionPath);
        const workspaceState = {};
        const globalState = {};
        mockContext = {
            subscriptions: [],
            workspaceState: {
                get: jest.fn((key) => workspaceState[key]),
                update: jest.fn((key, value) => {
                    workspaceState[key] = value;
                    return Promise.resolve();
                }),
                keys: jest.fn(() => Object.keys(workspaceState)),
            },
            globalState: {
                get: jest.fn((key) => globalState[key]),
                update: jest.fn((key, value) => {
                    globalState[key] = value;
                    return Promise.resolve();
                }),
                keys: jest.fn(() => Object.keys(globalState)),
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
    });
    it('should activate extension', () => {
        const registerCommandSpy = jest.spyOn(vscode.commands, 'registerCommand');
        registerCommandSpy.mockReturnValue({ dispose: jest.fn() });
        (0, extension_1.activate)(mockContext);
        expect(registerCommandSpy).toHaveBeenCalledWith('deprecatedTracker.scan', expect.any(Function));
        expect(mockContext.subscriptions.length).toBeGreaterThan(0);
        registerCommandSpy.mockRestore();
    });
    it('should deactivate without errors', () => {
        expect(() => (0, extension_1.deactivate)()).not.toThrow();
    });
});
//# sourceMappingURL=extension.test.js.map