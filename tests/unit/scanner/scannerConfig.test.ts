import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { TagsManager } from '../../../src/config/tagsManager';
import { DEFAULT_CONFIG, DeprecatedTrackerConfig } from '../../../src/interfaces';
import { IgnoreManager } from '../../../src/scanner/ignoreManager';
import { Scanner } from '../../../src/scanner/scanner';

describe('Scanner - Configuration Integration', () => {
    let tempDir: string;
    let workspaceFolder: vscode.WorkspaceFolder;
    let mockContext: vscode.ExtensionContext;
    let ignoreManager: IgnoreManager;
    let tagsManager: TagsManager;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deprecated-tracker-config-test-'));
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
    });

    afterEach(() => {
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    describe('Custom Trusted Packages', () => {
        it('should respect custom trusted packages from configuration', async () => {
            const config: DeprecatedTrackerConfig = {
                trustedPackages: ['rxjs', 'lodash', 'custom-lib'],
                excludePatterns: [],
                includePatterns: [],
                severity: 'warning',
            };
            const scanner = new Scanner(ignoreManager, tagsManager, config);
            const tsconfigPath = path.join(tempDir, 'tsconfig.json');
            fs.writeFileSync(
                tsconfigPath,
                JSON.stringify({
                    compilerOptions: { target: 'ES2020', module: 'commonjs' },
                    include: ['src/**/*'],
                })
            );
            const customLibDir = path.join(tempDir, 'node_modules', 'custom-lib');
            fs.mkdirSync(customLibDir, { recursive: true });
            fs.writeFileSync(
                path.join(customLibDir, 'index.d.ts'),
                '/** @deprecated */\nexport function oldCustomFunc(): void;'
            );
            const srcDir = path.join(tempDir, 'src');
            fs.mkdirSync(srcDir);
            fs.writeFileSync(
                path.join(srcDir, 'test.ts'),
                `import { oldCustomFunc } from 'custom-lib';\noldCustomFunc();`
            );
            const results = await scanner.scanProject(workspaceFolder.uri.fsPath);
            const customLibResults = results.filter((r) => r.name === 'oldCustomFunc');
            expect(customLibResults.length).toBe(0);
        });
    });

    describe('Exclude Patterns', () => {
        it('should exclude files matching excludePatterns', async () => {
            const config: DeprecatedTrackerConfig = {
                trustedPackages: ['rxjs'],
                excludePatterns: ['**/*.test.ts', '**/*.spec.ts'],
                includePatterns: [],
                severity: 'warning',
            };
            const scanner = new Scanner(ignoreManager, tagsManager, config);
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
                path.join(srcDir, 'app.ts'),
                '/** @deprecated */\nexport class DeprecatedClass {}'
            );
            fs.writeFileSync(
                path.join(srcDir, 'app.test.ts'),
                '/** @deprecated */\nexport class TestDeprecatedClass {}'
            );
            const results = await scanner.scanProject(workspaceFolder.uri.fsPath);
            const testFileResults = results.filter((r) => r.fileName === 'app.test.ts');
            expect(testFileResults.length).toBe(0);
        });

        it('should handle glob patterns with wildcards', async () => {
            const config: DeprecatedTrackerConfig = {
                trustedPackages: [],
                excludePatterns: ['**/test/**/*.ts'],
                includePatterns: [],
                severity: 'warning',
            };
            const scanner = new Scanner(ignoreManager, tagsManager, config);
            const tsconfigPath = path.join(tempDir, 'tsconfig.json');
            fs.writeFileSync(
                tsconfigPath,
                JSON.stringify({
                    compilerOptions: { target: 'ES2020', module: 'commonjs' },
                    include: ['src/**/*'],
                })
            );
            const srcDir = path.join(tempDir, 'src');
            const testDir = path.join(srcDir, 'test');
            fs.mkdirSync(testDir, { recursive: true });
            fs.writeFileSync(
                path.join(srcDir, 'app.ts'),
                '/** @deprecated */\nexport class AppClass {}'
            );
            fs.writeFileSync(
                path.join(testDir, 'helper.ts'),
                '/** @deprecated */\nexport class TestHelper {}'
            );
            const results = await scanner.scanProject(workspaceFolder.uri.fsPath);
            const testResults = results.filter(
                (result) => result.filePath === path.join(testDir, 'helper.ts')
            );
            expect(testResults.length).toBe(0);
        });
    });

    describe('Include Patterns', () => {
        it('should only scan files matching includePatterns when specified', async () => {
            const config: DeprecatedTrackerConfig = {
                trustedPackages: [],
                excludePatterns: [],
                includePatterns: ['**/src/app/**/*.ts'],
                severity: 'warning',
            };
            const scanner = new Scanner(ignoreManager, tagsManager, config);
            const tsconfigPath = path.join(tempDir, 'tsconfig.json');
            fs.writeFileSync(
                tsconfigPath,
                JSON.stringify({
                    compilerOptions: { target: 'ES2020', module: 'commonjs' },
                    include: ['src/**/*'],
                })
            );
            const appDir = path.join(tempDir, 'src', 'app');
            const libDir = path.join(tempDir, 'src', 'lib');
            fs.mkdirSync(appDir, { recursive: true });
            fs.mkdirSync(libDir, { recursive: true });
            fs.writeFileSync(
                path.join(appDir, 'component.ts'),
                '/** @deprecated */\nexport class Component {}'
            );
            fs.writeFileSync(
                path.join(libDir, 'utility.ts'),
                '/** @deprecated */\nexport class Utility {}'
            );
            const results = await scanner.scanProject(workspaceFolder.uri.fsPath);
            const libResults = results.filter((r) => r.filePath.includes('lib'));
            expect(libResults.length).toBe(0);
        });
    });

    it('should apply file filters consistently across scan entry points', async () => {
        const config: DeprecatedTrackerConfig = {
            trustedPackages: [],
            excludePatterns: ['**/*.test.ts'],
            includePatterns: ['**/src/**/*.ts'],
            severity: 'warning',
        };
        const scanner = new Scanner(ignoreManager, tagsManager, config);
        fs.writeFileSync(
            path.join(tempDir, 'tsconfig.json'),
            JSON.stringify({
                compilerOptions: { target: 'ES2020', module: 'commonjs' },
                include: ['src/**/*'],
            })
        );
        const srcDir = path.join(tempDir, 'src');
        fs.mkdirSync(srcDir);
        const includedFile = path.join(srcDir, 'included.ts');
        const excludedFile = path.join(srcDir, 'excluded.test.ts');
        fs.writeFileSync(includedFile, '/** @deprecated */\nexport class Included {}');
        fs.writeFileSync(excludedFile, '/** @deprecated */\nexport class Excluded {}');

        const projectResults = await scanner.scanProject(workspaceFolder.uri.fsPath);
        const folderResults = await scanner.scanFolder(workspaceFolder.uri.fsPath, srcDir);
        const specificResults = await scanner.scanSpecificFiles(
            workspaceFolder.uri.fsPath,
            [includedFile, excludedFile],
        );

        for (const results of [projectResults, folderResults, specificResults]) {
            expect(results.some((result) => result.name === 'Included')).toBe(true);
            expect(results.some((result) => result.name === 'Excluded')).toBe(false);
        }
    });

    describe('Configuration without Patterns', () => {
        it('should scan all files when no patterns are specified', async () => {
            const config: DeprecatedTrackerConfig = {
                trustedPackages: ['rxjs'],
                excludePatterns: [],
                includePatterns: [],
                severity: 'warning',
            };
            const scanner = new Scanner(ignoreManager, tagsManager, config);
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
                path.join(srcDir, 'file1.ts'),
                '/** @deprecated */\nexport class Class1 {}'
            );
            fs.writeFileSync(
                path.join(srcDir, 'file2.ts'),
                '/** @deprecated */\nexport class Class2 {}'
            );
            const results = await scanner.scanProject(workspaceFolder.uri.fsPath);
            expect(results).toBeDefined();
            expect(Array.isArray(results)).toBe(true);
        });
    });

    describe('Default Configuration', () => {
        it('uses the shared default configuration', () => {
            const scanner = new Scanner(ignoreManager, tagsManager);
            const config = (scanner as unknown as {
                config: DeprecatedTrackerConfig;
            }).config;

            expect(config).toEqual(DEFAULT_CONFIG);
        });

        it('should work with default configuration when none provided', async () => {
            const scanner = new Scanner(ignoreManager, tagsManager);
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
                   * @deprecated This method is deprecated
                   */
                  public oldMethod(): void {
                    console.log('old');
                  }
                }`
            );
            const results = await scanner.scanProject(workspaceFolder.uri.fsPath);
            expect(results).toBeDefined();
            expect(Array.isArray(results)).toBe(true);
        });
    });
});
