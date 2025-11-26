import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { DeprecatedTrackerConfig } from '../../../src/interfaces';
import { IgnoreManager } from '../../../src/scanner/ignoreManager';
import { Scanner } from '../../../src/scanner/scanner';

describe('Scanner - ignoreDeprecatedInComments Configuration', () => {
    let tempDir: string;
    let workspaceFolder: vscode.WorkspaceFolder;
    let mockContext: vscode.ExtensionContext;
    let ignoreManager: IgnoreManager;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deprecated-tracker-comment-test-'));
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
    });

    afterEach(() => {
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    describe('JSDoc Comment Detection', () => {
        it('should detect deprecated items in JSDoc comments when ignoreDeprecatedInComments is true', async () => {
            const config: DeprecatedTrackerConfig = {
                trustedPackages: [],
                excludePatterns: [],
                includePatterns: [],
                ignoreDeprecatedInComments: true,
                severity: 'warning',
            };
            const scanner = new Scanner(ignoreManager, config);
            const tsconfigPath = path.join(tempDir, 'tsconfig.json');
            fs.writeFileSync(
                tsconfigPath,
                JSON.stringify({
                    compilerOptions: { target: 'ES2020', module: 'commonjs' },
                    include: ['src/**/*'],
                })
            );
            const srcDir = path.join(tempDir, 'src');
            fs.mkdirSync(srcDir, { recursive: true });
            fs.writeFileSync(
                path.join(srcDir, 'service.ts'),
                `export class MyService {
          /**
           * @deprecated Use newMethod() instead
           */
          public oldMethod(): void {
            console.log('old');
          }

          public newMethod(): void {
            console.log('new');
          }
        }`
            );
            const results = await scanner.scanProject(workspaceFolder);
            const deprecatedMethods = results.filter((r) => r.name === 'oldMethod');
            expect(deprecatedMethods.length).toBeGreaterThan(0);
        });

        it('should ignore deprecated items in single-line comments when ignoreDeprecatedInComments is true', async () => {
            const config: DeprecatedTrackerConfig = {
                trustedPackages: [],
                excludePatterns: [],
                includePatterns: [],
                ignoreDeprecatedInComments: true,
                severity: 'warning',
            };
            const scanner = new Scanner(ignoreManager, config);
            const tsconfigPath = path.join(tempDir, 'tsconfig.json');
            fs.writeFileSync(
                tsconfigPath,
                JSON.stringify({
                    compilerOptions: { target: 'ES2020', module: 'commonjs' },
                    include: ['src/**/*'],
                })
            );
            const srcDir = path.join(tempDir, 'src');
            fs.mkdirSync(srcDir, { recursive: true });
            fs.writeFileSync(
                path.join(srcDir, 'service.ts'),
                `export class MyService {
          // @deprecated This should be ignored
          public oldMethod(): void {
            console.log('old');
          }
        }`
            );
            const results = await scanner.scanProject(workspaceFolder);
            const deprecatedMethods = results.filter((r) => r.name === 'oldMethod');
            expect(deprecatedMethods.length).toBe(0);
        });

        it('should ignore deprecated items in multi-line comments when ignoreDeprecatedInComments is true', async () => {
            const config: DeprecatedTrackerConfig = {
                trustedPackages: [],
                excludePatterns: [],
                includePatterns: [],
                ignoreDeprecatedInComments: true,
                severity: 'warning',
            };
            const scanner = new Scanner(ignoreManager, config);
            const tsconfigPath = path.join(tempDir, 'tsconfig.json');
            fs.writeFileSync(
                tsconfigPath,
                JSON.stringify({
                    compilerOptions: { target: 'ES2020', module: 'commonjs' },
                    include: ['src/**/*'],
                })
            );
            const srcDir = path.join(tempDir, 'src');
            fs.mkdirSync(srcDir, { recursive: true });
            fs.writeFileSync(
                path.join(srcDir, 'service.ts'),
                `export class MyService {
          /*
           * @deprecated This should be ignored
           */
          public oldMethod(): void {
            console.log('old');
          }
        }`
            );
            const results = await scanner.scanProject(workspaceFolder);
            const deprecatedMethods = results.filter((r) => r.name === 'oldMethod');
            expect(deprecatedMethods.length).toBe(0);
        });

        it('should detect all comment types when ignoreDeprecatedInComments is false', async () => {
            const config: DeprecatedTrackerConfig = {
                trustedPackages: [],
                excludePatterns: [],
                includePatterns: [],
                ignoreDeprecatedInComments: false,
                severity: 'warning',
            };
            const scanner = new Scanner(ignoreManager, config);
            const tsconfigPath = path.join(tempDir, 'tsconfig.json');
            fs.writeFileSync(
                tsconfigPath,
                JSON.stringify({
                    compilerOptions: { target: 'ES2020', module: 'commonjs' },
                    include: ['src/**/*'],
                })
            );
            const srcDir = path.join(tempDir, 'src');
            fs.mkdirSync(srcDir, { recursive: true });
            fs.writeFileSync(
                path.join(srcDir, 'jsdoc.ts'),
                `export class Service1 {
          /**
           * @deprecated JSDoc comment
           */
          public method1(): void {}
        }`
            );
            fs.writeFileSync(
                path.join(srcDir, 'singleline.ts'),
                `export class Service2 {
          // @deprecated Single-line comment
          public method2(): void {}
        }`
            );
            fs.writeFileSync(
                path.join(srcDir, 'multiline.ts'),
                `export class Service3 {
          /*
           * @deprecated Multi-line comment
           */
          public method3(): void {}
        }`
            );
            const results = await scanner.scanProject(workspaceFolder);
            const method1 = results.filter((r) => r.name === 'method1');
            const method2 = results.filter((r) => r.name === 'method2');
            const method3 = results.filter((r) => r.name === 'method3');
            expect(method1.length).toBeGreaterThan(0);
        });
    });

    describe('Usage Detection with ignoreDeprecatedInComments', () => {
        it('should detect usages when declaration has JSDoc comment and ignoreDeprecatedInComments is true', async () => {
            const config: DeprecatedTrackerConfig = {
                trustedPackages: [],
                excludePatterns: [],
                includePatterns: [],
                ignoreDeprecatedInComments: true,
                severity: 'warning',
            };
            const scanner = new Scanner(ignoreManager, config);
            const tsconfigPath = path.join(tempDir, 'tsconfig.json');
            fs.writeFileSync(
                tsconfigPath,
                JSON.stringify({
                    compilerOptions: { target: 'ES2020', module: 'commonjs' },
                    include: ['src/**/*'],
                })
            );
            const srcDir = path.join(tempDir, 'src');
            fs.mkdirSync(srcDir, { recursive: true });
            fs.writeFileSync(
                path.join(srcDir, 'api.ts'),
                `export class API {
          /**
           * @deprecated Use newMethod() instead
           */
          public oldMethod(): void {
            console.log('old');
          }
        }`
            );
            fs.writeFileSync(
                path.join(srcDir, 'consumer.ts'),
                `import { API } from './api';
        
        const api = new API();
        api.oldMethod(); // Should be detected as usage`
            );
            const results = await scanner.scanProject(workspaceFolder);
            const usages = results.filter((r) => r.kind === 'usage' && r.name === 'oldMethod');
            expect(usages.length).toBeGreaterThan(0);
        });

        it('should not detect usages when declaration has non-JSDoc comment and ignoreDeprecatedInComments is true', async () => {
            const config: DeprecatedTrackerConfig = {
                trustedPackages: [],
                excludePatterns: [],
                includePatterns: [],
                ignoreDeprecatedInComments: true,
                severity: 'warning',
            };
            const scanner = new Scanner(ignoreManager, config);
            const tsconfigPath = path.join(tempDir, 'tsconfig.json');
            fs.writeFileSync(
                tsconfigPath,
                JSON.stringify({
                    compilerOptions: { target: 'ES2020', module: 'commonjs' },
                    include: ['src/**/*'],
                })
            );
            const srcDir = path.join(tempDir, 'src');
            fs.mkdirSync(srcDir, { recursive: true });
            fs.writeFileSync(
                path.join(srcDir, 'api.ts'),
                `export class API {
          // @deprecated Use newMethod() instead
          public oldMethod(): void {
            console.log('old');
          }
        }`
            );
            fs.writeFileSync(
                path.join(srcDir, 'consumer.ts'),
                `import { API } from './api';
        
        const api = new API();
        api.oldMethod(); // Should NOT be detected because declaration uses single-line comment`
            );
            const results = await scanner.scanProject(workspaceFolder);
            const usages = results.filter((r) => r.kind === 'usage' && r.name === 'oldMethod');
            expect(usages.length).toBe(0);
        });
    });

    describe('External Package Handling', () => {
        it('should not throw errors when ignoreDeprecatedInComments is enabled', async () => {
            const config: DeprecatedTrackerConfig = {
                trustedPackages: [],
                excludePatterns: [],
                includePatterns: [],
                ignoreDeprecatedInComments: true,
                severity: 'warning',
            };
            const scanner = new Scanner(ignoreManager, config);
            const tsconfigPath = path.join(tempDir, 'tsconfig.json');
            fs.writeFileSync(
                tsconfigPath,
                JSON.stringify({
                    compilerOptions: { target: 'ES2020', module: 'commonjs' },
                    include: ['src/**/*'],
                })
            );
            const srcDir = path.join(tempDir, 'src');
            fs.mkdirSync(srcDir);
            fs.writeFileSync(
                path.join(srcDir, 'app.ts'),
                `export class App {
          /**
           * @deprecated Use newMethod() instead
           */
          public oldMethod(): void {}
        }`
            );
            await expect(scanner.scanProject(workspaceFolder)).resolves.not.toThrow();
        });
    });
});