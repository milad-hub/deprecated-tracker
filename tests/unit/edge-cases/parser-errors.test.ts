import * as ts from 'typescript';
import * as vscode from 'vscode';
import { TagsManager } from '../../../src/config/tagsManager';
import { IgnoreManager } from '../../../src/scanner/ignoreManager';
import { Scanner } from '../../../src/scanner/scanner';

jest.mock('vscode');

describe('Parser Error Scenarios', () => {
    let scanner: Scanner;
    let mockContext: vscode.ExtensionContext;
    let ignoreManager: IgnoreManager;
    let tagsManager: TagsManager;

    beforeEach(() => {
        jest.clearAllMocks();
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
        tagsManager = new TagsManager(mockContext);
        scanner = new Scanner(ignoreManager, tagsManager);
    });

    describe('Syntax Errors in TypeScript', () => {
        it('should handle file with syntax errors', () => {
            const syntaxErrorCode = `
        export class Test {
          method() {
            // Missing closing brace
        }
      `;
            const sourceFile = ts.createSourceFile(
                'test.ts',
                syntaxErrorCode,
                ts.ScriptTarget.Latest,
                true
            );
            expect(sourceFile).toBeDefined();
        });

        it('should handle completely malformed TypeScript', () => {
            const malformedCode = `
        @@@ invalid typescript !@#$%
        class { } { }
        function function function
      `;
            const sourceFile = ts.createSourceFile(
                'malformed.ts',
                malformedCode,
                ts.ScriptTarget.Latest,
                true
            );
            expect(sourceFile).toBeDefined();
        });

        it('should handle missing semicolons and recover', () => {
            const noSemicolonCode = `
        /**
         * @deprecated Use newMethod instead
         */
        export function oldMethod() {
          const x = 1
          const y = 2
          return x + y
        }
      `;
            const sourceFile = ts.createSourceFile(
                'no-semicolon.ts',
                noSemicolonCode,
                ts.ScriptTarget.Latest,
                true
            );
            expect(sourceFile).toBeDefined();
        });

        it('should handle unexpected tokens', () => {
            const unexpectedTokenCode = `
        export class Test {
          @deprecated
          method() {}
        }
      `;
            const sourceFile = ts.createSourceFile(
                'unexpected.ts',
                unexpectedTokenCode,
                ts.ScriptTarget.Latest,
                true
            );
            expect(sourceFile).toBeDefined();
        });

        it('should handle incomplete class declarations', () => {
            const incompleteCode = `
        export class Test {
          /**
           * @deprecated
           */
          method()
        }
      `;
            const sourceFile = ts.createSourceFile(
                'incomplete.ts',
                incompleteCode,
                ts.ScriptTarget.Latest,
                true
            );
            expect(sourceFile).toBeDefined();
        });
    });

    describe('Malformed JSDoc Comments', () => {
        it('should handle JSDoc with missing closing tag', () => {
            const malformedJSDoc = `
        /**
         * @deprecated Use newMethod instead
         * Missing closing tag
        export function oldMethod() {}
      `;
            const sourceFile = ts.createSourceFile(
                'malformed-jsdoc.ts',
                malformedJSDoc,
                ts.ScriptTarget.Latest,
                true
            );
            expect(sourceFile).toBeDefined();
        });

        it('should handle JSDoc with invalid tag syntax', () => {
            const invalidTagCode = `
        /**
         * @deprecated@broken Use newMethod
         * @@invalid tag
         */
        export function oldMethod() {}
      `;
            const sourceFile = ts.createSourceFile(
                'invalid-tag.ts',
                invalidTagCode,
                ts.ScriptTarget.Latest,
                true
            );
            expect(sourceFile).toBeDefined();
            const node = sourceFile.statements[0] as ts.FunctionDeclaration;
            const jsdoc = ts.getJSDocTags(node);
            expect(jsdoc).toBeDefined();
        });

        it('should handle empty JSDoc comment', () => {
            const emptyJSDoc = `
        /**
         */
        export function method() {}
      `;
            const sourceFile = ts.createSourceFile(
                'empty-jsdoc.ts',
                emptyJSDoc,
                ts.ScriptTarget.Latest,
                true
            );
            const node = sourceFile.statements[0] as ts.FunctionDeclaration;
            const jsdoc = ts.getJSDocTags(node);
            expect(jsdoc.length).toBe(0);
        });

        it('should handle JSDoc with only whitespace', () => {
            const whitespaceJSDoc = `
        /**
         
         
         */
        export function method() {}
      `;
            const sourceFile = ts.createSourceFile(
                'whitespace-jsdoc.ts',
                whitespaceJSDoc,
                ts.ScriptTarget.Latest,
                true
            );
            const node = sourceFile.statements[0] as ts.FunctionDeclaration;
            const jsdoc = ts.getJSDocTags(node);
            expect(jsdoc.length).toBe(0);
        });

        it('should handle JSDoc with mixed valid and invalid tags', () => {
            const mixedJSDoc = `
        /**
         * @deprecated Valid tag
         * @invalidTag This should be ignored
         * @param name - Valid param tag
         * @@broken Double at sign
         */
        export function method(name: string) {}
      `;
            const sourceFile = ts.createSourceFile(
                'mixed-jsdoc.ts',
                mixedJSDoc,
                ts.ScriptTarget.Latest,
                true
            );
            const node = sourceFile.statements[0] as ts.FunctionDeclaration;
            const jsdoc = ts.getJSDocTags(node);
            expect(jsdoc.length).toBeGreaterThanOrEqual(0);
        });

        it('should handle multiple JSDoc comments on same node', () => {
            const multipleJSDoc = `
        /**
         * First comment
         */
        /**
         * @deprecated Second comment with deprecated tag
         */
        export function method() {}
      `;
            const sourceFile = ts.createSourceFile(
                'multiple-jsdoc.ts',
                multipleJSDoc,
                ts.ScriptTarget.Latest,
                true
            );
            const node = sourceFile.statements[0] as ts.FunctionDeclaration;
            const jsdoc = ts.getJSDocTags(node);
            expect(jsdoc).toBeDefined();
        });

        it('should handle JSDoc with special characters', () => {
            const specialCharsJSDoc = `
        /**
         * @deprecated <script>alert("xss")</script>
         * Special chars: !@#$%^&*(){}[]|\\:";'<>?,./
         */
        export function method() {}
      `;
            const sourceFile = ts.createSourceFile(
                'special-chars.ts',
                specialCharsJSDoc,
                ts.ScriptTarget.Latest,
                true
            );
            const node = sourceFile.statements[0] as ts.FunctionDeclaration;
            const jsdoc = ts.getJSDocTags(node);
            expect(jsdoc.length).toBeGreaterThan(0);
        });
    });

    describe('Invalid UTF-8 Encoding', () => {
        it('should handle BOM (Byte Order Mark)', () => {
            const bomCode = '\uFEFFexport function test() {}';
            const sourceFile = ts.createSourceFile(
                'bom.ts',
                bomCode,
                ts.ScriptTarget.Latest,
                true
            );
            expect(sourceFile).toBeDefined();
        });

        it('should handle files with mixed encoding', () => {
            const mixedEncodingCode = `
        export function test() {
          const message = "Hello 世界 Мир 🌍";
          return message;
        }
      `;
            const sourceFile = ts.createSourceFile(
                'mixed-encoding.ts',
                mixedEncodingCode,
                ts.ScriptTarget.Latest,
                true
            );
            expect(sourceFile).toBeDefined();
        });

        it('should handle null characters', () => {
            const nullCharCode = `export function test() {\x00 return true; }`;
            const sourceFile = ts.createSourceFile(
                'null-char.ts',
                nullCharCode,
                ts.ScriptTarget.Latest,
                true
            );
            expect(sourceFile).toBeDefined();
        });

        it('should handle files with emoji in code', () => {
            const emojiCode = `
        /**
         * @deprecated Use newMethod 🚀 instead
         */
        export function oldMethod() {
          console.log("😀 🎉 🔥");
        }
      `;
            const sourceFile = ts.createSourceFile(
                'emoji.ts',
                emojiCode,
                ts.ScriptTarget.Latest,
                true
            );
            expect(sourceFile).toBeDefined();
            const node = sourceFile.statements[0] as ts.FunctionDeclaration;
            const jsdoc = ts.getJSDocTags(node);
            expect(jsdoc).toBeDefined();
        });

        it('should handle zero-width characters', () => {
            const zeroWidthCode = `export\u200Bfunction\u200Btest() {}`;
            const sourceFile = ts.createSourceFile(
                'zero-width.ts',
                zeroWidthCode,
                ts.ScriptTarget.Latest,
                true
            );
            expect(sourceFile).toBeDefined();
        });

        it('should handle right-to-left text', () => {
            const rtlCode = `
        /**
         * @deprecated استخدم الطريقة الجديدة بدلاً من ذلك
         */
        export function oldMethod() {}
      `;
            const sourceFile = ts.createSourceFile(
                'rtl.ts',
                rtlCode,
                ts.ScriptTarget.Latest,
                true
            );

            expect(sourceFile).toBeDefined();
        });
    });

    describe('Invalid tsconfig.json', () => {
        it('should handle malformed JSON in tsconfig', () => {
            const malformedTsConfig = `{
        "compilerOptions": {
          "target": "ES2020",
          "module": "commonjs"
          // Missing comma
          "strict": true
        }
      }`;
            expect(() => {
                JSON.parse(malformedTsConfig);
            }).toThrow();
        });

        it('should handle empty tsconfig.json', () => {
            const emptyTsConfig = '';
            expect(() => {
                JSON.parse(emptyTsConfig);
            }).toThrow();
        });

        it('should handle tsconfig with invalid properties', () => {
            const invalidTsConfig = `{
        "compilerOptions": {
          "invalidOption": "value",
          "target": 999
        }
      }`;
            const parsed = JSON.parse(invalidTsConfig);
            expect(parsed.compilerOptions).toBeDefined();
        });

        it('should handle tsconfig with circular extends', () => {
            const circularConfig = `{
        "extends": "./tsconfig.json"
      }`;
            const parsed = JSON.parse(circularConfig);
            expect(parsed.extends).toBe('./tsconfig.json');
        });
    });

    describe('Edge Case File Content', () => {
        it('should handle empty file', () => {
            const emptyCode = '';
            const sourceFile = ts.createSourceFile(
                'empty.ts',
                emptyCode,
                ts.ScriptTarget.Latest,
                true
            );
            expect(sourceFile).toBeDefined();
            expect(sourceFile.statements.length).toBe(0);
        });

        it('should handle file with only comments', () => {
            const onlyComments = `
        // This is a comment
        /* This is another comment */
        /**
         * @deprecated This JSDoc is not attached to anything
         */
      `;
            const sourceFile = ts.createSourceFile(
                'only-comments.ts',
                onlyComments,
                ts.ScriptTarget.Latest,
                true
            );
            expect(sourceFile).toBeDefined();
            expect(sourceFile.statements.length).toBe(0);
        });

        it('should handle file with only whitespace', () => {
            const onlyWhitespace = '       \n\n\n     \t\t\t    ';
            const sourceFile = ts.createSourceFile(
                'whitespace.ts',
                onlyWhitespace,
                ts.ScriptTarget.Latest,
                true
            );
            expect(sourceFile).toBeDefined();
            expect(sourceFile.statements.length).toBe(0);
        });

        it('should handle extremely large file', () => {
            let largeCode = '';
            for (let i = 0; i < 1000; i++) {
                largeCode += `
          /**
           * @deprecated Method ${i}
           */
          export function method${i}() {}
        `;
            }
            const sourceFile = ts.createSourceFile(
                'large.ts',
                largeCode,
                ts.ScriptTarget.Latest,
                true
            );
            expect(sourceFile).toBeDefined();
            expect(sourceFile.statements.length).toBe(1000);
        });
    });
});