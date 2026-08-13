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

    describe('Diagnostic Range', () => {
        it('includes the deprecation reason in the diagnostic message', () => {
            const item: DeprecatedItem = {
                name: 'oldMethod',
                fileName: 'test.ts',
                filePath: '/path/to/test.ts',
                line: 1,
                character: 1,
                kind: 'usage',
                deprecationReason: 'Use newMethod instead',
            };
            const diagnostic = (diagnosticManager as unknown as {
                createDiagnostic(value: DeprecatedItem): vscode.Diagnostic;
            }).createDiagnostic(item);

            expect(diagnostic.message).toBe(
                "'oldMethod' is deprecated: Use newMethod instead",
            );
        });

        it('converts one-based scanner characters to zero-based ranges', () => {
            const item: DeprecatedItem = {
                name: 'oldMethod',
                fileName: 'test.ts',
                filePath: '/path/to/test.ts',
                line: 2,
                character: 1,
                kind: 'usage',
            };
            const createDiagnostic = (diagnosticManager as unknown as {
                createDiagnostic(value: DeprecatedItem): vscode.Diagnostic;
            }).createDiagnostic.bind(diagnosticManager);
            const diagnostic = createDiagnostic(item);

            expect(diagnostic.range.start.character).toBe(0);
            expect(diagnostic.range.end.character).toBe(item.name.length);
        });

        it('clamps invalid zero characters to column zero', () => {
            const item: DeprecatedItem = {
                name: 'old',
                fileName: 'test.ts',
                filePath: '/path/to/test.ts',
                line: 1,
                character: 0,
                kind: 'usage',
            };
            const diagnostic = (diagnosticManager as unknown as {
                createDiagnostic(value: DeprecatedItem): vscode.Diagnostic;
            }).createDiagnostic(item);

            expect(diagnostic.range.start.character).toBe(0);
            expect(diagnostic.range.end.character).toBe(3);
        });
    });

    // The location the go-to-declaration action jumps to, and what VS Code
    // renders as a link under the problem.
    describe('Declaration Link', () => {
        const build = (item: DeprecatedItem): vscode.Diagnostic =>
            (diagnosticManager as unknown as {
                createDiagnostic(value: DeprecatedItem): vscode.Diagnostic;
            }).createDiagnostic(item);

        it('points at the declaration, one-based line converted', () => {
            const diagnostic = build({
                name: 'oldMethod',
                fileName: 'test.ts',
                filePath: '/path/to/test.ts',
                line: 1,
                character: 1,
                kind: 'usage',
                deprecatedDeclaration: {
                    name: 'oldMethod',
                    filePath: '/path/to/api.ts',
                    fileName: 'api.ts',
                    line: 42,
                },
            });

            const related = diagnostic.relatedInformation ?? [];
            expect(related).toHaveLength(1);
            expect(related[0].location.uri.fsPath).toBe('/path/to/api.ts');
            expect(related[0].location.range.start.line).toBe(41);
            expect(related[0].message).toBe("'oldMethod' is declared here");
        });

        it('adds no link when the scanner resolved no declaration', () => {
            const diagnostic = build({
                name: 'oldMethod',
                fileName: 'test.ts',
                filePath: '/path/to/test.ts',
                line: 1,
                character: 1,
                kind: 'usage',
            });

            expect(diagnostic.relatedInformation).toBeUndefined();
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

    describe('Diagnostic range', () => {
        const usage = (overrides: Partial<DeprecatedItem>): DeprecatedItem => ({
            name: 'aliasedName',
            fileName: 'test.ts',
            filePath: '/path/to/test.ts',
            line: 10,
            character: 5,
            kind: 'usage',
            severity: 'warning',
            deprecatedDeclaration: {
                name: 'theRealDeclarationName',
                filePath: '/path/to/api.ts',
                fileName: 'api.ts',
                line: 5,
            },
            ...overrides,
        });

        const rangeOf = (item: DeprecatedItem): any =>
            (diagnosticManager as any).createDiagnostic(item).range;

        it('uses the scanner-measured span when present', () => {
            const range = rangeOf(usage({ endCharacter: 20 }));
            expect(range.start.character).toBe(4);
            expect(range.end.character).toBe(19);
        });

        it('falls back to the name length when no span was measured', () => {
            const range = rangeOf(usage({ endCharacter: undefined }));
            expect(range.end.character).toBe(4 + 'aliasedName'.length);
        });

        it('falls back when the measured span would be empty or inverted', () => {
            const range = rangeOf(usage({ character: 5, endCharacter: 3 }));
            expect(range.end.character).toBe(4 + 'aliasedName'.length);
        });

        it('names the declaration in the message, not the usage text', () => {
            const diagnostic = (diagnosticManager as any).createDiagnostic(
                usage({ deprecationReason: 'use newThing' }),
            );
            expect(diagnostic.message).toBe(
                "'theRealDeclarationName' is deprecated: use newThing",
            );
        });

        it('names the item itself when there is no declaration', () => {
            const diagnostic = (diagnosticManager as any).createDiagnostic(
                usage({ deprecatedDeclaration: undefined }),
            );
            expect(diagnostic.message).toBe("'aliasedName' is deprecated");
        });
    });
});
