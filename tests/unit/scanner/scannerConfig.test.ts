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

        it('says how much each trusted package hid, so a clean report is not a silent one', async () => {
            const config: DeprecatedTrackerConfig = {
                trustedPackages: ['custom-lib'],
                excludePatterns: [],
                includePatterns: [],
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
            const customLibDir = path.join(tempDir, 'node_modules', 'custom-lib');
            fs.mkdirSync(customLibDir, { recursive: true });
            fs.writeFileSync(
                path.join(customLibDir, 'index.d.ts'),
                '/** @deprecated */\nexport function oldCustomFunc(): void;\nexport function freshFunc(): void;'
            );
            const srcDir = path.join(tempDir, 'src');
            fs.mkdirSync(srcDir, { recursive: true });
            fs.writeFileSync(
                path.join(srcDir, 'test.ts'),
                `import { oldCustomFunc, freshFunc } from 'custom-lib';\noldCustomFunc();\nfreshFunc();`
            );

            const results = await scanner.scanProject(workspaceFolder.uri.fsPath);

            expect(results).toHaveLength(0);
            expect([...scanner.getSuppressedCounts()]).toEqual([['custom-lib', 2]]);
        });

        it('never counts more than the suppression actually removed', async () => {
            // The count has one invariant worth pinning: whatever the suppressed
            // list hides, the report must shrink by exactly that much. A usage
            // that reaches both a suppressed declaration and a reported one is
            // not hidden, and the visit that sees the suppressed side can be the
            // one that runs second.
            fs.writeFileSync(
                path.join(tempDir, 'tsconfig.json'),
                JSON.stringify({
                    compilerOptions: { target: 'ES2020', module: 'commonjs' },
                    include: ['src/**/*'],
                })
            );
            const customLibDir = path.join(tempDir, 'node_modules', 'custom-lib');
            fs.mkdirSync(customLibDir, { recursive: true });
            fs.writeFileSync(
                path.join(customLibDir, 'index.d.ts'),
                '/** @deprecated */\nexport function oldCustomFunc(): number;\n/** @deprecated */\nexport function alsoOld(): number;'
            );
            const srcDir = path.join(tempDir, 'src');
            fs.mkdirSync(srcDir, { recursive: true });
            fs.writeFileSync(
                path.join(srcDir, 'mixed.ts'),
                [
                    `import { oldCustomFunc, alsoOld } from 'custom-lib';`,
                    '/** @deprecated ours */',
                    'export function localOld(value: number): number {',
                    '    return value;',
                    '}',
                    'export const a = localOld(oldCustomFunc());',
                    'export const b = alsoOld();',
                    'export const c = localOld(1);',
                ].join('\n')
            );

            const base: DeprecatedTrackerConfig = {
                excludePatterns: [],
                includePatterns: [],
                severity: 'warning',
            };
            const reporting = new Scanner(ignoreManager, tagsManager, {
                ...base,
                trustedPackages: [],
            });
            const suppressing = new Scanner(ignoreManager, tagsManager, {
                ...base,
                trustedPackages: ['custom-lib'],
            });

            const withEverything = await reporting.scanProject(
                workspaceFolder.uri.fsPath
            );
            const withSuppression = await suppressing.scanProject(
                workspaceFolder.uri.fsPath
            );
            const hidden = [
                ...suppressing.getSuppressedCounts().values(),
            ].reduce((sum, count) => sum + count, 0);

            expect(hidden).toBe(withEverything.length - withSuppression.length);
            expect(hidden).toBeGreaterThan(0);
        });

        it('does not claim credit for what an ignore rule removed', async () => {
            // Both rules end the same way — nothing collected for this call
            // site — so the count has to tell them apart. Crediting the
            // suppressed list with an ignoreMethods removal would send someone
            // to edit the wrong setting.
            const ignoringOld = {
                isFileIgnored: () => false,
                isMethodIgnored: (_file: string, name: string) =>
                    name === 'oldCustomFunc',
            };
            fs.writeFileSync(
                path.join(tempDir, 'tsconfig.json'),
                JSON.stringify({
                    compilerOptions: { target: 'ES2020', module: 'commonjs' },
                    include: ['src/**/*'],
                })
            );
            const customLibDir = path.join(tempDir, 'node_modules', 'custom-lib');
            fs.mkdirSync(customLibDir, { recursive: true });
            fs.writeFileSync(
                path.join(customLibDir, 'index.d.ts'),
                '/** @deprecated */\nexport function oldCustomFunc(): number;'
            );
            const srcDir = path.join(tempDir, 'src');
            fs.mkdirSync(srcDir, { recursive: true });
            fs.writeFileSync(
                path.join(srcDir, 'ignored.ts'),
                `import { oldCustomFunc } from 'custom-lib';\nexport const a = oldCustomFunc();`
            );

            const scanner = new Scanner(ignoringOld, tagsManager, {
                trustedPackages: ['custom-lib'],
                excludePatterns: [],
                includePatterns: [],
                severity: 'warning',
            });

            const results = await scanner.scanProject(workspaceFolder.uri.fsPath);

            expect(results).toHaveLength(0);
            expect(scanner.getSuppressedCounts().size).toBe(0);
        });

        it('never counts a call site the report still shows', async () => {
            // A module augmentation can redeclare a package's own deprecated
            // member, which makes one call site reach a suppressed declaration
            // and a reported one at once. The count must stay at or below what
            // suppression actually removed: claiming a finding was hidden while
            // it sits in the table is the one error worth ruling out.
            fs.writeFileSync(
                path.join(tempDir, 'tsconfig.json'),
                JSON.stringify({
                    compilerOptions: { target: 'ES2020', module: 'commonjs' },
                    include: ['src/**/*'],
                })
            );
            const customLibDir = path.join(tempDir, 'node_modules', 'custom-lib');
            fs.mkdirSync(customLibDir, { recursive: true });
            fs.writeFileSync(
                path.join(customLibDir, 'index.d.ts'),
                [
                    'export interface Api {',
                    '  /** @deprecated from the package */',
                    '  old(): void;',
                    '}',
                ].join('\n')
            );
            const srcDir = path.join(tempDir, 'src');
            fs.mkdirSync(srcDir, { recursive: true });
            fs.writeFileSync(
                path.join(srcDir, 'augment.ts'),
                [
                    `import { Api } from 'custom-lib';`,
                    `declare module 'custom-lib' {`,
                    '  interface Api {',
                    '    /** @deprecated ours, and still reported */',
                    '    old(times: number): void;',
                    '  }',
                    '}',
                    'declare const api: Api;',
                    'export function callIt(): void {',
                    '  api.old(1);',
                    '}',
                ].join('\n')
            );

            const base: DeprecatedTrackerConfig = {
                excludePatterns: [],
                includePatterns: [],
                severity: 'warning',
            };
            const reporting = new Scanner(ignoreManager, tagsManager, {
                ...base,
                trustedPackages: [],
            });
            const suppressing = new Scanner(ignoreManager, tagsManager, {
                ...base,
                trustedPackages: ['custom-lib'],
            });

            const withEverything = await reporting.scanProject(
                workspaceFolder.uri.fsPath
            );
            const withSuppression = await suppressing.scanProject(
                workspaceFolder.uri.fsPath
            );
            const hidden = [
                ...suppressing.getSuppressedCounts().values(),
            ].reduce((sum, count) => sum + count, 0);

            expect(withSuppression.length).toBeGreaterThan(0);
            expect(hidden).toBeLessThanOrEqual(
                withEverything.length - withSuppression.length
            );
        });

        it('counts nothing when the trusted list hid nothing', async () => {
            const config: DeprecatedTrackerConfig = {
                trustedPackages: ['custom-lib'],
                excludePatterns: [],
                includePatterns: [],
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
            fs.mkdirSync(srcDir, { recursive: true });
            fs.writeFileSync(
                path.join(srcDir, 'own.ts'),
                '/** @deprecated */\nexport function mine(): void {}\nmine();'
            );

            const results = await scanner.scanProject(workspaceFolder.uri.fsPath);

            expect(results.length).toBeGreaterThan(0);
            expect(scanner.getSuppressedCounts().size).toBe(0);
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
