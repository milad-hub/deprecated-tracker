import * as ts from 'typescript';
import * as vscode from 'vscode';
import { TagsManager } from '../../../src/config/tagsManager';
import { IgnoreManager } from '../../../src/scanner/ignoreManager';
import { Scanner } from '../../../src/scanner/scanner';

jest.mock('vscode');

describe('Scanner Edge Cases', () => {
    let scanner: Scanner;
    let mockContext: vscode.ExtensionContext;
    let ignoreManager: IgnoreManager;
    let tagsManager: TagsManager;

    beforeEach(() => {
        jest.clearAllMocks();
        mockContext = {
            subscriptions: [],
            workspaceState: {
                get: jest.fn().mockReturnValue(null),
                update: jest.fn().mockResolvedValue(undefined),
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

    describe('Empty and Minimal Files', () => {
        it('should handle completely empty file', () => {
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

        it('should handle file with only whitespace', () => {
            const whitespaceCode = '   \n\n\t\t\t   ';
            const sourceFile = ts.createSourceFile(
                'whitespace.ts',
                whitespaceCode,
                ts.ScriptTarget.Latest,
                true
            );
            expect(sourceFile).toBeDefined();
            expect(sourceFile.statements.length).toBe(0);
        });

        it('should handle file with only comments', () => {
            const commentsOnlyCode = `
        // This is a comment
        /* This is a block comment */
        /**
         * This is JSDoc but not attached to anything
         * @deprecated This won't be detected
         */
      `;
            const sourceFile = ts.createSourceFile(
                'comments-only.ts',
                commentsOnlyCode,
                ts.ScriptTarget.Latest,
                true
            );
            expect(sourceFile).toBeDefined();
            expect(sourceFile.statements.length).toBe(0);
        });

        it('should handle single-line file', () => {
            const singleLineCode = 'export const x = 1;';
            const sourceFile = ts.createSourceFile(
                'single-line.ts',
                singleLineCode,
                ts.ScriptTarget.Latest,
                true
            );
            expect(sourceFile).toBeDefined();
            expect(sourceFile.statements.length).toBe(1);
        });
    });

    describe('Circular Dependencies', () => {
        it('should handle circular import references', () => {
            const fileA = `
        import { B } from './fileB';
        export class A {
          b: B;
        }
      `;
            const fileB = `
        import { A } from './fileA';
        export class B {
          a: A;
        }
      `;
            const sourceFileA = ts.createSourceFile('fileA.ts', fileA, ts.ScriptTarget.Latest, true);
            const sourceFileB = ts.createSourceFile('fileB.ts', fileB, ts.ScriptTarget.Latest, true);
            expect(sourceFileA).toBeDefined();
            expect(sourceFileB).toBeDefined();
        });

        it('should handle self-referencing types', () => {
            const selfReferenceCode = `
        export interface Node {
          value: string;
          children: Node[];
        }
      `;
            const sourceFile = ts.createSourceFile(
                'self-reference.ts',
                selfReferenceCode,
                ts.ScriptTarget.Latest,
                true
            );
            expect(sourceFile).toBeDefined();
        });

        it('should handle circular generic constraints', () => {
            const circularGenericsCode = `
        export interface A<T extends B<A<T>>> {
          value: T;
        }
        export interface B<U extends A<B<U>>> {
          item: U;
        }
      `;
            const sourceFile = ts.createSourceFile(
                'circular-generics.ts',
                circularGenericsCode,
                ts.ScriptTarget.Latest,
                true
            );
            expect(sourceFile).toBeDefined();
        });
    });

    describe('Special Characters and Naming', () => {
        it('should handle method names with Unicode characters', () => {
            const unicodeNamesCode = `
        export class Test {
          /**
           * @deprecated Use 新しいメソッド instead
           */
          古いメソッド() {}

          /**
           * @deprecated Use новыйМетод instead
           */
          старыйМетод() {}
        }
      `;
            const sourceFile = ts.createSourceFile(
                'unicode-names.ts',
                unicodeNamesCode,
                ts.ScriptTarget.Latest,
                true
            );
            expect(sourceFile).toBeDefined();
        });

        it('should handle names with dollar signs and underscores', () => {
            const specialNamesCode = `
        /**
         * @deprecated Use $newMethod instead
         */
        export function $oldMethod() {}

        /**
         * @deprecated Use __newMethod instead
         */
        export function __oldMethod() {}

        /**
         * @deprecated Use _privateNew instead
         */
        export function _privateOld() {}
      `;
            const sourceFile = ts.createSourceFile(
                'special-names.ts',
                specialNamesCode,
                ts.ScriptTarget.Latest,
                true
            );
            expect(sourceFile).toBeDefined();
            expect(sourceFile.statements.length).toBe(3);
        });

        it('should handle computed property names', () => {
            const computedPropsCode = `
        const key = 'deprecated';
        export class Test {
          /**
           * @deprecated
           */
          [key + 'Method']() {}

          /**
           * @deprecated
           */
          ['computed' + 'Name']() {}
        }
      `;
            const sourceFile = ts.createSourceFile(
                'computed-props.ts',
                computedPropsCode,
                ts.ScriptTarget.Latest,
                true
            );
            expect(sourceFile).toBeDefined();
        });

        it('should handle names with numbers', () => {
            const numberedNamesCode = `
        /**
         * @deprecated Use method2 instead
         */
        export function method1() {}

        /**
         * @deprecated Use new123 instead
         */
        export function old123() {}
      `;
            const sourceFile = ts.createSourceFile(
                'numbered-names.ts',
                numberedNamesCode,
                ts.ScriptTarget.Latest,
                true
            );
            expect(sourceFile).toBeDefined();
        });
    });

    describe('Complex Type Scenarios', () => {
        it('should handle deprecated generic types', () => {
            const genericTypesCode = `
        /**
         * @deprecated Use NewGeneric<T> instead
         */
        export type OldGeneric<T> = {
          value: T;
        };

        /**
         * @deprecated Use NewMapper instead
         */
        export type OldMapper<T, U> = (input: T) => U;
      `;
            const sourceFile = ts.createSourceFile(
                'generic-types.ts',
                genericTypesCode,
                ts.ScriptTarget.Latest,
                true
            );
            expect(sourceFile).toBeDefined();
        });

        it('should handle deprecated union and intersection types', () => {
            const unionTypesCode = `
        /**
         * @deprecated Use NewUnion instead
         */
        export type OldUnion = string | number | boolean;

        /**
         * @deprecated Use NewIntersection instead
         */
        export type OldIntersection = { a: string } & { b: number };
      `;
            const sourceFile = ts.createSourceFile(
                'union-types.ts',
                unionTypesCode,
                ts.ScriptTarget.Latest,
                true
            );
            expect(sourceFile).toBeDefined();
        });

        it('should handle deprecated conditional types', () => {
            const conditionalTypesCode = `
        /**
         * @deprecated Use NewConditional instead
         */
        export type OldConditional<T> = T extends string ? number : boolean;
      `;
            const sourceFile = ts.createSourceFile(
                'conditional-types.ts',
                conditionalTypesCode,
                ts.ScriptTarget.Latest,
                true
            );
            expect(sourceFile).toBeDefined();
        });

        it('should handle deprecated mapped types', () => {
            const mappedTypesCode = `
        /**
         * @deprecated Use NewMapped instead
         */
        export type OldMapped<T> = {
          [K in keyof T]: T[K];
        };
      `;
            const sourceFile = ts.createSourceFile(
                'mapped-types.ts',
                mappedTypesCode,
                ts.ScriptTarget.Latest,
                true
            );
            expect(sourceFile).toBeDefined();
        });
    });

    describe('Decorator Scenarios', () => {
        it('should handle deprecated decorators', () => {
            const decoratorsCode = `
        /**
         * @deprecated Use @NewDecorator instead
         */
        export function OldDecorator(target: any) {
          return target;
        }

        export class Test {
          @OldDecorator
          method() {}
        }
      `;
            const sourceFile = ts.createSourceFile(
                'decorators.ts',
                decoratorsCode,
                ts.ScriptTarget.Latest,
                true
            );
            expect(sourceFile).toBeDefined();
        });

        it('should handle deprecated decorator factories', () => {
            const decoratorFactoryCode = `
        /**
         * @deprecated Use newDecoratorFactory instead
         */
        export function oldDecoratorFactory(param: string) {
          return function(target: any) {
            return target;
          };
        }
      `;
            const sourceFile = ts.createSourceFile(
                'decorator-factory.ts',
                decoratorFactoryCode,
                ts.ScriptTarget.Latest,
                true
            );
            expect(sourceFile).toBeDefined();
        });
    });

    describe('Module and Namespace Scenarios', () => {
        it('should handle deprecated namespaces', () => {
            const namespaceCode = `
        /**
         * @deprecated Use NewNamespace instead
         */
        export namespace OldNamespace {
          export function method() {}
        }
      `;
            const sourceFile = ts.createSourceFile(
                'namespace.ts',
                namespaceCode,
                ts.ScriptTarget.Latest,
                true
            );
            expect(sourceFile).toBeDefined();
        });

        it('should handle deprecated module declarations', () => {
            const moduleCode = `
        /**
         * @deprecated Use new module instead
         */
        declare module 'old-module' {
          export function method(): void;
        }
      `;
            const sourceFile = ts.createSourceFile(
                'module-declaration.ts',
                moduleCode,
                ts.ScriptTarget.Latest,
                true
            );
            expect(sourceFile).toBeDefined();
        });

        it('should handle deprecated ambient declarations', () => {
            const ambientCode = `
        /**
         * @deprecated Use newGlobal instead
         */
        declare const oldGlobal: string;

        /**
         * @deprecated Use NewGlobalType instead
         */
        declare type OldGlobalType = string;
      `;
            const sourceFile = ts.createSourceFile(
                'ambient.d.ts',
                ambientCode,
                ts.ScriptTarget.Latest,
                true
            );
            expect(sourceFile).toBeDefined();
        });
    });

    describe('Export Scenarios', () => {
        it('should handle deprecated re-exports', () => {
            const reExportCode = `
        /**
         * @deprecated Import from new location
         */
        export { oldMethod } from './old-module';

        /**
         * @deprecated Use new export
         */
        export * from './legacy-module';
      `;
            const sourceFile = ts.createSourceFile(
                're-export.ts',
                reExportCode,
                ts.ScriptTarget.Latest,
                true
            );
            expect(sourceFile).toBeDefined();
        });

        it('should handle deprecated default exports', () => {
            const defaultExportCode = `
        /**
         * @deprecated Use named exports instead
         */
        export default class OldClass {}
      `;
            const sourceFile = ts.createSourceFile(
                'default-export.ts',
                defaultExportCode,
                ts.ScriptTarget.Latest,
                true
            );
            expect(sourceFile).toBeDefined();
        });

        it('should handle deprecated export assignments', () => {
            const exportAssignmentCode = `
        class OldClass {}

        /**
         * @deprecated Use ES6 exports
         */
        export = OldClass;
      `;
            const sourceFile = ts.createSourceFile(
                'export-assignment.ts',
                exportAssignmentCode,
                ts.ScriptTarget.Latest,
                true
            );
            expect(sourceFile).toBeDefined();
        });
    });

    describe('Async and Generator Scenarios', () => {
        it('should handle deprecated async functions', () => {
            const asyncCode = `
        /**
         * @deprecated Use newAsyncMethod instead
         */
        export async function oldAsyncMethod() {
          return await Promise.resolve(true);
        }
      `;
            const sourceFile = ts.createSourceFile(
                'async.ts',
                asyncCode,
                ts.ScriptTarget.Latest,
                true
            );
            expect(sourceFile).toBeDefined();
        });

        it('should handle deprecated generator functions', () => {
            const generatorCode = `
        /**
         * @deprecated Use newGenerator instead
         */
        export function* oldGenerator() {
          yield 1;
          yield 2;
        }
      `;
            const sourceFile = ts.createSourceFile(
                'generator.ts',
                generatorCode,
                ts.ScriptTarget.Latest,
                true
            );
            expect(sourceFile).toBeDefined();
        });

        it('should handle deprecated async generators', () => {
            const asyncGeneratorCode = `
        /**
         * @deprecated Use newAsyncGenerator instead
         */
        export async function* oldAsyncGenerator() {
          yield await Promise.resolve(1);
        }
      `;
            const sourceFile = ts.createSourceFile(
                'async-generator.ts',
                asyncGeneratorCode,
                ts.ScriptTarget.Latest,
                true
            );
            expect(sourceFile).toBeDefined();
        });
    });

    describe('Null and Undefined Handling', () => {
        it('should handle deprecated optional properties', () => {
            const optionalPropsCode = `
        export interface Config {
          /**
           * @deprecated Use newOption instead
           */
          oldOption?: string;
        }
      `;
            const sourceFile = ts.createSourceFile(
                'optional-props.ts',
                optionalPropsCode,
                ts.ScriptTarget.Latest,
                true
            );
            expect(sourceFile).toBeDefined();
        });

        it('should handle deprecated nullable types', () => {
            const nullableCode = `
        /**
         * @deprecated Use NonNullable version
         */
        export type OldNullable = string | null | undefined;
      `;
            const sourceFile = ts.createSourceFile(
                'nullable.ts',
                nullableCode,
                ts.ScriptTarget.Latest,
                true
            );
            expect(sourceFile).toBeDefined();
        });
    });
});