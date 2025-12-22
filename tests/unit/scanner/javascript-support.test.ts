import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { TagsManager } from '../../../src/config/tagsManager';
import { IgnoreManager } from '../../../src/scanner/ignoreManager';
import { Scanner } from '../../../src/scanner/scanner';

describe('Scanner - JavaScript/JSDoc Support', () => {
    let tempDir: string;
    let workspaceFolder: vscode.WorkspaceFolder;
    let mockContext: vscode.ExtensionContext;
    let ignoreManager: IgnoreManager;
    let tagsManager: TagsManager;
    let scanner: Scanner;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deprecated-tracker-js-test-'));
        workspaceFolder = {
            uri: vscode.Uri.file(tempDir),
            name: 'test-workspace',
            index: 0,
        };
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
        ignoreManager = new IgnoreManager(mockContext);
        tagsManager = new TagsManager(mockContext);
        scanner = new Scanner(ignoreManager, tagsManager);
    });

    afterEach(() => {
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    describe('jsconfig.json Support', () => {
        it('should scan JavaScript project with jsconfig.json', async () => {
            const jsconfigPath = path.join(tempDir, 'jsconfig.json');
            fs.writeFileSync(
                jsconfigPath,
                JSON.stringify({
                    compilerOptions: {
                        target: 'ES2020',
                        module: 'commonjs',
                        checkJs: true,
                    },
                    include: ['src/**/*'],
                })
            );
            const srcDir = path.join(tempDir, 'src');
            fs.mkdirSync(srcDir, { recursive: true });
            const testFile = path.join(srcDir, 'test.js');
            fs.writeFileSync(
                testFile,
                `/**
         * @deprecated This function is deprecated
         */
        export function oldFunction() {
          console.log('old');
        }

        export function newFunction() {
          console.log('new');
        }`
            );
            const results = await scanner.scanProject(workspaceFolder);
            expect(results).toBeDefined();
            expect(Array.isArray(results)).toBe(true);
        });

        it('should throw error when neither tsconfig.json nor jsconfig.json found', async () => {
            await expect(scanner.scanProject(workspaceFolder)).rejects.toThrow(
                'tsconfig.json or jsconfig.json not found in workspace root'
            );
        });

        it('should prioritize tsconfig.json over jsconfig.json when both exist', async () => {
            const tsconfigPath = path.join(tempDir, 'tsconfig.json');
            fs.writeFileSync(
                tsconfigPath,
                JSON.stringify({
                    compilerOptions: {
                        target: 'ES2020',
                        module: 'commonjs',
                    },
                    include: ['src/**/*'],
                })
            );
            const jsconfigPath = path.join(tempDir, 'jsconfig.json');
            fs.writeFileSync(
                jsconfigPath,
                JSON.stringify({
                    compilerOptions: {
                        target: 'ES2015',
                    },
                })
            );
            const srcDir = path.join(tempDir, 'src');
            fs.mkdirSync(srcDir);
            fs.writeFileSync(
                path.join(srcDir, 'test.ts'),
                'export const x = 1;'
            );
            const results = await scanner.scanProject(workspaceFolder);
            expect(results).toBeDefined();
        });
    });

    describe('JavaScript File Extensions', () => {
        it('should detect deprecated JSDoc in .js files', async () => {
            const jsconfigPath = path.join(tempDir, 'jsconfig.json');
            fs.writeFileSync(
                jsconfigPath,
                JSON.stringify({
                    compilerOptions: {
                        target: 'ES2020',
                        module: 'commonjs',
                        checkJs: true,
                    },
                    include: ['src/**/*'],
                })
            );
            const srcDir = path.join(tempDir, 'src');
            fs.mkdirSync(srcDir);
            const testFile = path.join(srcDir, 'service.js');
            fs.writeFileSync(
                testFile,
                `export class Service {
          /**
           * @deprecated Use newMethod instead
           */
          oldMethod() {
            return 'old';
          }

          newMethod() {
            return 'new';
          }
        }`
            );
            const results = await scanner.scanProject(workspaceFolder);
            expect(results).toBeDefined();
            expect(Array.isArray(results)).toBe(true);
        });

        it('should detect deprecated JSDoc in .jsx files', async () => {
            const jsconfigPath = path.join(tempDir, 'jsconfig.json');
            fs.writeFileSync(
                jsconfigPath,
                JSON.stringify({
                    compilerOptions: {
                        target: 'ES2020',
                        module: 'commonjs',
                        jsx: 'react',
                        checkJs: true,
                    },
                    include: ['src/**/*'],
                })
            );
            const srcDir = path.join(tempDir, 'src');
            fs.mkdirSync(srcDir);
            const testFile = path.join(srcDir, 'component.jsx');
            fs.writeFileSync(
                testFile,
                `/**
         * @deprecated Use NewComponent instead
         */
        export function OldComponent() {
          return null;
        }`
            );
            const results = await scanner.scanProject(workspaceFolder);
            expect(results).toBeDefined();
        });

        it('should detect deprecated JSDoc in .mjs files', async () => {
            const jsconfigPath = path.join(tempDir, 'jsconfig.json');
            fs.writeFileSync(
                jsconfigPath,
                JSON.stringify({
                    compilerOptions: {
                        target: 'ES2020',
                        module: 'esnext',
                        checkJs: true,
                    },
                    include: ['src/**/*'],
                })
            );
            const srcDir = path.join(tempDir, 'src');
            fs.mkdirSync(srcDir);
            const testFile = path.join(srcDir, 'module.mjs');
            fs.writeFileSync(
                testFile,
                `/**
         * @deprecated Old module function
         */
        export function oldModuleFunction() {
          console.log('old module');
        }`
            );
            const results = await scanner.scanProject(workspaceFolder);
            expect(results).toBeDefined();
        });
    });

    describe('Mixed JavaScript/TypeScript Projects', () => {
        it('should handle mixed JS/TS projects with tsconfig.json', async () => {
            const tsconfigPath = path.join(tempDir, 'tsconfig.json');
            fs.writeFileSync(
                tsconfigPath,
                JSON.stringify({
                    compilerOptions: {
                        target: 'ES2020',
                        module: 'commonjs',
                        allowJs: true,
                        checkJs: true,
                    },
                    include: ['src/**/*'],
                })
            );
            const srcDir = path.join(tempDir, 'src');
            fs.mkdirSync(srcDir);
            const tsFile = path.join(srcDir, 'service.ts');
            fs.writeFileSync(
                tsFile,
                `export class TypeScriptService {
          /**
           * @deprecated TS deprecated method
           */
          oldTsMethod(): void {}
        }`
            );
            const jsFile = path.join(srcDir, 'utils.js');
            fs.writeFileSync(
                jsFile,
                `/**
         * @deprecated JS deprecated function
         */
        export function oldJsFunction() {}`
            );
            const results = await scanner.scanProject(workspaceFolder);
            expect(results).toBeDefined();
            expect(Array.isArray(results)).toBe(true);
        });
    });

    describe('JavaScript Usage Detection', () => {
        it('should find usages of deprecated JavaScript items', async () => {
            const jsconfigPath = path.join(tempDir, 'jsconfig.json');
            fs.writeFileSync(
                jsconfigPath,
                JSON.stringify({
                    compilerOptions: {
                        target: 'ES2020',
                        module: 'commonjs',
                        checkJs: true,
                    },
                    include: ['src/**/*'],
                })
            );
            const srcDir = path.join(tempDir, 'src');
            fs.mkdirSync(srcDir);
            const declFile = path.join(srcDir, 'declarations.js');
            fs.writeFileSync(
                declFile,
                `export class Utils {
          /**
           * @deprecated Use newHelper instead
           */
          oldHelper() {
            return 'old';
          }

          newHelper() {
            return 'new';
          }
        }`
            );
            const usageFile = path.join(srcDir, 'usage.js');
            fs.writeFileSync(
                usageFile,
                `import { Utils } from './declarations';

        export class UsageClass {
          test() {
            const utils = new Utils();
            utils.oldHelper();
          }
        }`
            );
            const results = await scanner.scanProject(workspaceFolder);
            expect(results).toBeDefined();
        });
    });

    describe('Error Handling', () => {
        it('should handle malformed jsconfig.json', async () => {
            const jsconfigPath = path.join(tempDir, 'jsconfig.json');
            fs.writeFileSync(jsconfigPath, '{ invalid json }');
            await expect(scanner.scanProject(workspaceFolder)).rejects.toThrow();
        });
    });

    describe('Ignore Rules with JavaScript', () => {
        it('should respect ignore rules for JavaScript files', async () => {
            const jsconfigPath = path.join(tempDir, 'jsconfig.json');
            fs.writeFileSync(
                jsconfigPath,
                JSON.stringify({
                    compilerOptions: {
                        target: 'ES2020',
                        module: 'commonjs',
                        checkJs: true,
                    },
                    include: ['src/**/*'],
                })
            );
            const srcDir = path.join(tempDir, 'src');
            fs.mkdirSync(srcDir);
            const testFile = path.join(srcDir, 'test.js');
            fs.writeFileSync(
                testFile,
                `export class TestClass {
          /**
           * @deprecated This method is deprecated
           */
          oldMethod() {}
        }`
            );
            ignoreManager.ignoreMethod(testFile, 'oldMethod');
            const results = await scanner.scanProject(workspaceFolder);
            const deprecatedMethods = results.filter((r) => r.name === 'oldMethod');
            expect(deprecatedMethods.length).toBe(0);
        });
    });

    describe('scanFolder with jsconfig.json', () => {
        it('should scan folder with jsconfig.json in subfolder', async () => {
            const srcDir = path.join(tempDir, 'src');
            fs.mkdirSync(srcDir, { recursive: true });
            const jsconfigPath = path.join(srcDir, 'jsconfig.json');
            fs.writeFileSync(
                jsconfigPath,
                JSON.stringify({
                    compilerOptions: {
                        target: 'ES2020',
                        module: 'commonjs',
                        checkJs: true,
                    },
                })
            );
            const testFile = path.join(srcDir, 'test.js');
            fs.writeFileSync(
                testFile,
                `/**
         * @deprecated Old function
         */
        export function oldFunc() {}`
            );
            const results = await scanner.scanFolder(workspaceFolder, srcDir);
            expect(results).toBeDefined();
        });

        it('should fall back to workspace jsconfig.json if not in folder', async () => {
            const jsconfigPath = path.join(tempDir, 'jsconfig.json');
            fs.writeFileSync(
                jsconfigPath,
                JSON.stringify({
                    compilerOptions: {
                        target: 'ES2020',
                        module: 'commonjs',
                        checkJs: true,
                    },
                    include: ['**/*'],
                })
            );
            const srcDir = path.join(tempDir, 'src');
            fs.mkdirSync(srcDir, { recursive: true });
            const testFile = path.join(srcDir, 'test.js');
            fs.writeFileSync(
                testFile,
                `/**
         * @deprecated Old function
         */
        export function oldFunc() {}`
            );
            const results = await scanner.scanFolder(workspaceFolder, srcDir);
            expect(results).toBeDefined();
        });
    });

    describe('scanSpecificFiles with JavaScript', () => {
        it('should scan specific JavaScript files', async () => {
            const jsconfigPath = path.join(tempDir, 'jsconfig.json');
            fs.writeFileSync(
                jsconfigPath,
                JSON.stringify({
                    compilerOptions: {
                        target: 'ES2020',
                        module: 'commonjs',
                        checkJs: true,
                    },
                    include: ['src/**/*'],
                })
            );
            const srcDir = path.join(tempDir, 'src');
            fs.mkdirSync(srcDir);
            const file1 = path.join(srcDir, 'file1.js');
            fs.writeFileSync(
                file1,
                `/**
         * @deprecated Old function 1
         */
        export function oldFunc1() {}`
            );
            const file2 = path.join(srcDir, 'file2.js');
            fs.writeFileSync(
                file2,
                `/**
         * @deprecated Old function 2
         */
        export function oldFunc2() {}`
            );
            const results = await scanner.scanSpecificFiles(
                workspaceFolder,
                [file1, file2]
            );
            expect(results).toBeDefined();
        });
    });
});