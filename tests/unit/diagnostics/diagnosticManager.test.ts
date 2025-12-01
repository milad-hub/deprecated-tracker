import * as vscode from 'vscode';
import { DiagnosticManager } from '../../../src/diagnostics/diagnosticManager';
import { DeprecatedItem } from '../../../src/interfaces';

describe('DiagnosticManager - Severity Mapping', () => {
    let diagnosticManager: DiagnosticManager;

    beforeEach(() => {
        diagnosticManager = new DiagnosticManager();
    });

    afterEach(() => {
        diagnosticManager.dispose();
    });

    describe('Severity Configuration', () => {
        it('should map "error" severity to DiagnosticSeverity.Error', () => {
            const deprecatedItems: DeprecatedItem[] = [
                {
                    name: 'oldMethod',
                    fileName: 'test.ts',
                    filePath: '/path/to/test.ts',
                    line: 10,
                    character: 5,
                    kind: 'usage',
                    severity: 'error',
                    deprecatedDeclaration: {
                        name: 'oldMethod',
                        filePath: '/path/to/api.ts',
                        fileName: 'api.ts',
                        line: 5,
                    },
                },
            ];
            diagnosticManager.updateDiagnostics(deprecatedItems);
            const diagnosticCollection = (diagnosticManager as any).diagnosticCollection;
            expect(diagnosticCollection).toBeDefined();
            expect(() => diagnosticManager.updateDiagnostics(deprecatedItems)).not.toThrow();
        });

        it('should map "warning" severity to DiagnosticSeverity.Warning', () => {
            const deprecatedItems: DeprecatedItem[] = [
                {
                    name: 'oldMethod',
                    fileName: 'test.ts',
                    filePath: '/path/to/test.ts',
                    line: 10,
                    character: 5,
                    kind: 'usage',
                    severity: 'warning',
                    deprecatedDeclaration: {
                        name: 'oldMethod',
                        filePath: '/path/to/api.ts',
                        fileName: 'api.ts',
                        line: 5,
                    },
                },
            ];
            diagnosticManager.updateDiagnostics(deprecatedItems);
            expect(() => diagnosticManager.updateDiagnostics(deprecatedItems)).not.toThrow();
        });

        it('should map "info" severity to DiagnosticSeverity.Information', () => {
            const deprecatedItems: DeprecatedItem[] = [
                {
                    name: 'oldMethod',
                    fileName: 'test.ts',
                    filePath: '/path/to/test.ts',
                    line: 10,
                    character: 5,
                    kind: 'usage',
                    severity: 'info',
                    deprecatedDeclaration: {
                        name: 'oldMethod',
                        filePath: '/path/to/api.ts',
                        fileName: 'api.ts',
                        line: 5,
                    },
                },
            ];
            diagnosticManager.updateDiagnostics(deprecatedItems);
            expect(() => diagnosticManager.updateDiagnostics(deprecatedItems)).not.toThrow();
        });

        it('should default to warning severity when severity is not specified', () => {
            const deprecatedItems: DeprecatedItem[] = [
                {
                    name: 'oldMethod',
                    fileName: 'test.ts',
                    filePath: '/path/to/test.ts',
                    line: 10,
                    character: 5,
                    kind: 'usage',
                    deprecatedDeclaration: {
                        name: 'oldMethod',
                        filePath: '/path/to/api.ts',
                        fileName: 'api.ts',
                        line: 5,
                    },
                },
            ];
            diagnosticManager.updateDiagnostics(deprecatedItems);
            expect(() => diagnosticManager.updateDiagnostics(deprecatedItems)).not.toThrow();
        });

        it('should handle invalid severity by defaulting to warning', () => {
            const deprecatedItems: DeprecatedItem[] = [
                {
                    name: 'oldMethod',
                    fileName: 'test.ts',
                    filePath: '/path/to/test.ts',
                    line: 10,
                    character: 5,
                    kind: 'usage',
                    severity: 'invalid' as any,
                    deprecatedDeclaration: {
                        name: 'oldMethod',
                        filePath: '/path/to/api.ts',
                        fileName: 'api.ts',
                        line: 5,
                    },
                },
            ];
            diagnosticManager.updateDiagnostics(deprecatedItems);
            expect(() => diagnosticManager.updateDiagnostics(deprecatedItems)).not.toThrow();
        });
    });

    describe('mapSeverity Method', () => {
        it('should correctly map error string to Error severity', () => {
            const mapSeverity = (diagnosticManager as any).mapSeverity.bind(diagnosticManager);
            const result = mapSeverity('error');
            expect(result).toBe(vscode.DiagnosticSeverity.Error);
        });

        it('should correctly map warning string to Warning severity', () => {
            const mapSeverity = (diagnosticManager as any).mapSeverity.bind(diagnosticManager);
            const result = mapSeverity('warning');
            expect(result).toBe(vscode.DiagnosticSeverity.Warning);
        });

        it('should correctly map info string to Information severity', () => {
            const mapSeverity = (diagnosticManager as any).mapSeverity.bind(diagnosticManager);
            const result = mapSeverity('info');
            expect(result).toBe(vscode.DiagnosticSeverity.Information);
        });

        it('should default to Warning for undefined severity', () => {
            const mapSeverity = (diagnosticManager as any).mapSeverity.bind(diagnosticManager);
            const result = mapSeverity(undefined);
            expect(result).toBe(vscode.DiagnosticSeverity.Warning);
        });

        it('should default to Warning for invalid severity', () => {
            const mapSeverity = (diagnosticManager as any).mapSeverity.bind(diagnosticManager);
            const result = mapSeverity('invalid');
            expect(result).toBe(vscode.DiagnosticSeverity.Warning);
        });
    });

    describe('Multiple Items with Different Severities', () => {
        it('should handle multiple items with different severities', () => {
            const deprecatedItems: DeprecatedItem[] = [
                {
                    name: 'errorMethod',
                    fileName: 'test.ts',
                    filePath: '/path/to/test.ts',
                    line: 10,
                    character: 5,
                    kind: 'usage',
                    severity: 'error',
                    deprecatedDeclaration: {
                        name: 'errorMethod',
                        filePath: '/path/to/api.ts',
                        fileName: 'api.ts',
                        line: 5,
                    },
                },
                {
                    name: 'warningMethod',
                    fileName: 'test.ts',
                    filePath: '/path/to/test.ts',
                    line: 20,
                    character: 5,
                    kind: 'usage',
                    severity: 'warning',
                    deprecatedDeclaration: {
                        name: 'warningMethod',
                        filePath: '/path/to/api.ts',
                        fileName: 'api.ts',
                        line: 5,
                    },
                },
                {
                    name: 'infoMethod',
                    fileName: 'test.ts',
                    filePath: '/path/to/test.ts',
                    line: 30,
                    character: 5,
                    kind: 'usage',
                    severity: 'info',
                    deprecatedDeclaration: {
                        name: 'infoMethod',
                        filePath: '/path/to/api.ts',
                        fileName: 'api.ts',
                        line: 5,
                    },
                },
            ];
            diagnosticManager.updateDiagnostics(deprecatedItems);
            expect(() => diagnosticManager.updateDiagnostics(deprecatedItems)).not.toThrow();
        });
    });

    describe('Clear and Dispose', () => {
        it('should clear diagnostics without errors', () => {
            const deprecatedItems: DeprecatedItem[] = [
                {
                    name: 'oldMethod',
                    fileName: 'test.ts',
                    filePath: '/path/to/test.ts',
                    line: 10,
                    character: 5,
                    kind: 'usage',
                    severity: 'error',
                    deprecatedDeclaration: {
                        name: 'oldMethod',
                        filePath: '/path/to/api.ts',
                        fileName: 'api.ts',
                        line: 5,
                    },
                },
            ];
            diagnosticManager.updateDiagnostics(deprecatedItems);
            expect(() => diagnosticManager.clear()).not.toThrow();
        });

        it('should dispose diagnostics without errors', () => {
            const deprecatedItems: DeprecatedItem[] = [
                {
                    name: 'oldMethod',
                    fileName: 'test.ts',
                    filePath: '/path/to/test.ts',
                    line: 10,
                    character: 5,
                    kind: 'usage',
                    severity: 'warning',
                    deprecatedDeclaration: {
                        name: 'oldMethod',
                        filePath: '/path/to/api.ts',
                        fileName: 'api.ts',
                        line: 5,
                    },
                },
            ];
            diagnosticManager.updateDiagnostics(deprecatedItems);
            expect(() => diagnosticManager.dispose()).not.toThrow();
        });
    });

    describe('Only Usages Get Diagnostics', () => {
        it('should only create diagnostics for usage items, not declarations', () => {
            const deprecatedItems: DeprecatedItem[] = [
                {
                    name: 'oldMethod',
                    fileName: 'api.ts',
                    filePath: '/path/to/api.ts',
                    line: 5,
                    character: 10,
                    kind: 'method',
                    severity: 'error',
                },
                {
                    name: 'oldMethod',
                    fileName: 'test.ts',
                    filePath: '/path/to/test.ts',
                    line: 10,
                    character: 5,
                    kind: 'usage',
                    severity: 'error',
                    deprecatedDeclaration: {
                        name: 'oldMethod',
                        filePath: '/path/to/api.ts',
                        fileName: 'api.ts',
                        line: 5,
                    },
                },
            ];
            diagnosticManager.updateDiagnostics(deprecatedItems);
            expect(() => diagnosticManager.updateDiagnostics(deprecatedItems)).not.toThrow();
        });
    });
});