import * as vscode from 'vscode';
import { Navigation } from '../../../src/utils/navigation';

describe('Navigation', () => {
    describe('openFile', () => {
        it('should open file with valid path', async () => {
            const mockTextEditor = {} as vscode.TextEditor;
            const showTextDocumentSpy = jest
                .spyOn(vscode.window, 'showTextDocument')
                .mockResolvedValue(mockTextEditor);
            await Navigation.openFile('/test/file.ts');
            expect(showTextDocumentSpy).toHaveBeenCalled();
            const callArg = showTextDocumentSpy.mock.calls[0][0];
            expect(callArg.fsPath).toContain('file.ts');
            showTextDocumentSpy.mockRestore();
        });

        it('should handle Windows paths', async () => {
            const mockTextEditor = {} as vscode.TextEditor;
            const showTextDocumentSpy = jest
                .spyOn(vscode.window, 'showTextDocument')
                .mockResolvedValue(mockTextEditor);
            await Navigation.openFile('C:\\test\\file.ts');
            expect(showTextDocumentSpy).toHaveBeenCalled();
            showTextDocumentSpy.mockRestore();
        });

        it('should create URI from file path', async () => {
            const mockTextEditor = {} as vscode.TextEditor;
            const showTextDocumentSpy = jest
                .spyOn(vscode.window, 'showTextDocument')
                .mockResolvedValue(mockTextEditor);
            await Navigation.openFile('/test/path/file.ts');
            const callArg = showTextDocumentSpy.mock.calls[0][0];
            expect(callArg).toHaveProperty('scheme');
            showTextDocumentSpy.mockRestore();
        });
    });

    describe('openFileAtLine', () => {
        it('should open file and set cursor position', async () => {
            const mockTextEditor = {
                selection: new vscode.Selection(0, 0, 0, 0),
            } as unknown as vscode.TextEditor;
            const showTextDocumentSpy = jest
                .spyOn(vscode.window, 'showTextDocument')
                .mockResolvedValue(mockTextEditor);
            await Navigation.openFileAtLine('/test/file.ts', 10);
            expect(showTextDocumentSpy).toHaveBeenCalled();
            showTextDocumentSpy.mockRestore();
        });

        it('should open file with character position', async () => {
            const mockTextEditor = {
                selection: new vscode.Selection(0, 0, 0, 0),
            } as unknown as vscode.TextEditor;
            const showTextDocumentSpy = jest
                .spyOn(vscode.window, 'showTextDocument')
                .mockResolvedValue(mockTextEditor);
            await Navigation.openFileAtLine('/test/file.ts', 10, 5);
            expect(showTextDocumentSpy).toHaveBeenCalled();
            showTextDocumentSpy.mockRestore();
        });

        it('should handle line number 0', async () => {
            const mockTextEditor = {
                selection: new vscode.Selection(0, 0, 0, 0),
            } as unknown as vscode.TextEditor;
            const showTextDocumentSpy = jest
                .spyOn(vscode.window, 'showTextDocument')
                .mockResolvedValue(mockTextEditor);
            await Navigation.openFileAtLine('/test/file.ts', 0);
            expect(showTextDocumentSpy).toHaveBeenCalled();
            showTextDocumentSpy.mockRestore();
        });

        it('should handle negative line numbers', async () => {
            const mockTextEditor = {
                selection: new vscode.Selection(0, 0, 0, 0),
            } as unknown as vscode.TextEditor;
            const showTextDocumentSpy = jest
                .spyOn(vscode.window, 'showTextDocument')
                .mockResolvedValue(mockTextEditor);
            await Navigation.openFileAtLine('/test/file.ts', -5);
            expect(showTextDocumentSpy).toHaveBeenCalled();
            showTextDocumentSpy.mockRestore();
        });

        it('should handle negative character positions', async () => {
            const mockTextEditor = {
                selection: new vscode.Selection(0, 0, 0, 0),
            } as unknown as vscode.TextEditor;
            const showTextDocumentSpy = jest
                .spyOn(vscode.window, 'showTextDocument')
                .mockResolvedValue(mockTextEditor);
            await Navigation.openFileAtLine('/test/file.ts', 10, -5);
            expect(showTextDocumentSpy).toHaveBeenCalled();
            showTextDocumentSpy.mockRestore();
        });

        it('should call revealRange when active editor exists', async () => {
            const revealRangeSpy = jest.fn();
            const mockTextEditor = {
                selection: new vscode.Selection(0, 0, 0, 0),
                revealRange: revealRangeSpy,
            } as unknown as vscode.TextEditor;
            Object.defineProperty(vscode.window, 'activeTextEditor', {
                get: () => mockTextEditor,
                configurable: true,
            });
            const showTextDocumentSpy = jest
                .spyOn(vscode.window, 'showTextDocument')
                .mockResolvedValue(mockTextEditor);
            await Navigation.openFileAtLine('/test/file.ts', 10, 5);
            expect(revealRangeSpy).toHaveBeenCalledWith(
                expect.any(vscode.Selection),
                vscode.TextEditorRevealType.InCenter
            );
            showTextDocumentSpy.mockRestore();
        });

        it('should create selection from position', async () => {
            const mockTextEditor = {
                selection: new vscode.Selection(0, 0, 0, 0),
            } as unknown as vscode.TextEditor;
            const showTextDocumentSpy = jest
                .spyOn(vscode.window, 'showTextDocument')
                .mockResolvedValue(mockTextEditor);
            await Navigation.openFileAtLine('/test/file.ts', 10, 5);
            expect(showTextDocumentSpy).toHaveBeenCalled();
            showTextDocumentSpy.mockRestore();
        });
    });
});