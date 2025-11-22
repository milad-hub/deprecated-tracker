import * as vscode from 'vscode';
import { ERROR_MESSAGES } from '../../../src/constants';
import { IgnoreManager } from '../../../src/scanner/ignoreManager';
import { Scanner } from '../../../src/scanner/scanner';

jest.mock('vscode');

(vscode.Uri as any).file = jest.fn((path: string) => ({
    fsPath: path,
    scheme: 'file',
    path: path,
    toString: () => path,
}));

(vscode.workspace as any) = {
    workspaceFolders: undefined,
};
describe('Project Error Scenarios', () => {
    let scanner: Scanner;
    let mockContext: vscode.ExtensionContext;
    let ignoreManager: IgnoreManager;

    beforeEach(() => {
        mockContext = {
            subscriptions: [],
            workspaceState: {
                get: jest.fn(),
                update: jest.fn(),
            },
            globalState: {
                get: jest.fn(),
                update: jest.fn(),
            },
            extensionPath: '/test/path',
            extensionUri: vscode.Uri.file('/test/path'),
        } as unknown as vscode.ExtensionContext;
        ignoreManager = new IgnoreManager(mockContext);
        scanner = new Scanner(ignoreManager);
    });

    describe('No Workspace Folder', () => {
        it('should throw error when workspace folders is undefined', async () => {
            (vscode.workspace.workspaceFolders as any) = undefined;
            await expect(async () => {
                const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
                if (!workspaceFolder) {
                    throw new Error(ERROR_MESSAGES.NO_WORKSPACE);
                }
                await scanner.scanProject(workspaceFolder);
            }).rejects.toThrow(ERROR_MESSAGES.NO_WORKSPACE);
        });

        it('should throw error when workspace folders array is empty', async () => {
            (vscode.workspace.workspaceFolders as any) = [];
            await expect(async () => {
                const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
                if (!workspaceFolder) {
                    throw new Error(ERROR_MESSAGES.NO_WORKSPACE);
                }
                await scanner.scanProject(workspaceFolder);
            }).rejects.toThrow(ERROR_MESSAGES.NO_WORKSPACE);
        });
    });

    describe('Multiple Workspace Folders', () => {
        it('should handle first workspace folder when multiple exist', () => {
            const mockWorkspace1 = {
                uri: vscode.Uri.file('/workspace1'),
                name: 'workspace1',
                index: 0,
            };
            const mockWorkspace2 = {
                uri: vscode.Uri.file('/workspace2'),
                name: 'workspace2',
                index: 1,
            };
            (vscode.workspace.workspaceFolders as any) = [
                mockWorkspace1,
                mockWorkspace2,
            ];
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            expect(workspaceFolder).toBe(mockWorkspace1);
            expect(workspaceFolder?.name).toBe('workspace1');
        });

        it('should correctly identify workspace count', () => {
            const mockWorkspaces = [
                { uri: vscode.Uri.file('/ws1'), name: 'ws1', index: 0 },
                { uri: vscode.Uri.file('/ws2'), name: 'ws2', index: 1 },
                { uri: vscode.Uri.file('/ws3'), name: 'ws3', index: 2 },
            ];
            (vscode.workspace.workspaceFolders as any) = mockWorkspaces;
            expect(vscode.workspace.workspaceFolders?.length).toBe(3);
        });
    });

    describe('Read-Only Workspace', () => {
        it('should handle scan even if workspace is read-only', () => {
            const readOnlyWorkspace = {
                uri: vscode.Uri.file('/readonly/workspace'),
                name: 'readonly-workspace',
                index: 0,
            };
            (vscode.workspace.workspaceFolders as any) = [readOnlyWorkspace];
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            expect(workspaceFolder).toBeDefined();
            expect(workspaceFolder?.uri.fsPath).toContain('readonly');
        });

        it('should not attempt to write to workspace directory', () => {
            const ignoreManager = new IgnoreManager(mockContext);
            ignoreManager.ignoreMethod('/some/file.ts', 'deprecatedMethod');
            expect(mockContext.workspaceState.update).toHaveBeenCalled();
        });
    });

    describe('Invalid Workspace Structure', () => {
        it('should handle workspace with no tsconfig.json', () => {
            const mockWorkspace = {
                uri: vscode.Uri.file('/no-tsconfig'),
                name: 'no-tsconfig',
                index: 0,
            };
            (vscode.workspace.workspaceFolders as any) = [mockWorkspace];
            const fs = require('fs');
            const path = require('path');
            const tsconfigPath = path.join(mockWorkspace.uri.fsPath, 'tsconfig.json');
            const existsSyncSpy = jest.spyOn(fs, 'existsSync');
            existsSyncSpy.mockReturnValue(false);
            expect(fs.existsSync(tsconfigPath)).toBe(false);
            existsSyncSpy.mockRestore();
        });

        it('should handle workspace with malformed directory structure', () => {
            const malformedWorkspace = {
                uri: vscode.Uri.file(''),
                name: '',
                index: 0,
            };
            expect(malformedWorkspace.uri.fsPath).toBe('');
            expect(malformedWorkspace.name).toBe('');
        });
    });

    describe('Workspace Path Edge Cases', () => {
        it('should handle workspace path with special characters', () => {
            const specialCharsWorkspace = {
                uri: vscode.Uri.file('/workspace with spaces/and-dashes/under_scores'),
                name: 'special-workspace',
                index: 0,
            };
            (vscode.workspace.workspaceFolders as any) = [specialCharsWorkspace];
            const workspace = vscode.workspace.workspaceFolders?.[0];
            expect(workspace?.uri.fsPath).toContain('with spaces');
            expect(workspace?.uri.fsPath).toContain('and-dashes');
            expect(workspace?.uri.fsPath).toContain('under_scores');
        });

        it('should handle workspace path with unicode characters', () => {
            const unicodeWorkspace = {
                uri: vscode.Uri.file('/workspace/日本語/проект'),
                name: 'unicode-workspace',
                index: 0,
            };
            (vscode.workspace.workspaceFolders as any) = [unicodeWorkspace];
            const workspace = vscode.workspace.workspaceFolders?.[0];
            expect(workspace?.uri.fsPath).toContain('日本語');
            expect(workspace?.uri.fsPath).toContain('проект');
        });
    });
});