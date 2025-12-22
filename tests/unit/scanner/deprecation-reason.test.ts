import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { TagsManager } from '../../../src/config/tagsManager';
import { IgnoreManager } from '../../../src/scanner/ignoreManager';
import { Scanner } from '../../../src/scanner/scanner';

describe('Scanner - Deprecation Reason Extraction', () => {
    let tempDir: string;
    let workspaceFolder: vscode.WorkspaceFolder;
    let mockContext: vscode.ExtensionContext;
    let ignoreManager: IgnoreManager;
    let scanner: Scanner;
    let tagsManager: TagsManager;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deprecated-tracker-reason-test-'));
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

    it('should extract simple deprecation reason', async () => {
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
        const testFile = path.join(srcDir, 'test.ts');
        fs.writeFileSync(
            testFile,
            `export class TestClass {
        /**
         * @deprecated Use newMethod() instead
         */
        public oldMethod(): void {}
      }`
        );
        const results = await scanner.scanProject(workspaceFolder);
        const deprecatedMethod = results.find((r) => r.name === 'oldMethod');
        expect(deprecatedMethod).toBeDefined();
        expect(deprecatedMethod?.deprecationReason).toBe('Use newMethod() instead');
    });

    it('should extract multiline deprecation reason', async () => {
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
        const testFile = path.join(srcDir, 'test.ts');
        fs.writeFileSync(
            testFile,
            `export class TestClass {
        /**
         * @deprecated This method is deprecated and will be removed in v3.0.
         * Please use newMethod() instead for better performance.
         */
        public oldMethod(): void {}
      }`
        );
        const results = await scanner.scanProject(workspaceFolder);
        const deprecatedMethod = results.find((r) => r.name === 'oldMethod');
        expect(deprecatedMethod).toBeDefined();
        expect(deprecatedMethod?.deprecationReason).toContain('This method is deprecated');
        expect(deprecatedMethod?.deprecationReason).toContain('Please use newMethod()');
    });

    it('should handle empty deprecation tag (no reason)', async () => {
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
        const testFile = path.join(srcDir, 'test.ts');
        fs.writeFileSync(
            testFile,
            `export class TestClass {
        /**
         * @deprecated
         */
        public oldMethod(): void {}
      }`
        );
        const results = await scanner.scanProject(workspaceFolder);
        const deprecatedMethod = results.find((r) => r.name === 'oldMethod');
        expect(deprecatedMethod).toBeDefined();
        expect(deprecatedMethod?.deprecationReason).toBeUndefined();
    });

    it('should extract reason with special characters', async () => {
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
        const testFile = path.join(srcDir, 'test.ts');
        fs.writeFileSync(
            testFile,
            `export class TestClass {
        /**
         * @deprecated Use <strong>newMethod()</strong> & check "docs"
         */
        public oldMethod(): void {}
      }`
        );
        const results = await scanner.scanProject(workspaceFolder);
        const deprecatedMethod = results.find((r) => r.name === 'oldMethod');
        expect(deprecatedMethod).toBeDefined();
        expect(deprecatedMethod?.deprecationReason).toContain('<strong>newMethod()</strong>');
        expect(deprecatedMethod?.deprecationReason).toContain('"docs"');
    });

    it('should extract reason with code examples', async () => {
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
        const testFile = path.join(srcDir, 'test.ts');
        fs.writeFileSync(
            testFile,
            `export class TestClass {
        /**
         * @deprecated Use: this.newMethod({ param: 'value' })
         */
        public oldMethod(): void {}
      }`
        );
        const results = await scanner.scanProject(workspaceFolder);
        const deprecatedMethod = results.find((r) => r.name === 'oldMethod');
        expect(deprecatedMethod).toBeDefined();
        expect(deprecatedMethod?.deprecationReason).toContain("this.newMethod({ param: 'value' })");
    });

    it('should extract reason from external packages', async () => {
        const tsconfigPath = path.join(tempDir, 'tsconfig.json');
        fs.writeFileSync(
            tsconfigPath,
            JSON.stringify({
                compilerOptions: { target: 'ES2020', module: 'commonjs' },
                include: ['src/**/*'],
            })
        );
        const nodeModulesDir = path.join(tempDir, 'node_modules', 'test-pkg');
        fs.mkdirSync(nodeModulesDir, { recursive: true });
        const pkgTypesFile = path.join(nodeModulesDir, 'index.d.ts');
        fs.writeFileSync(
            pkgTypesFile,
            `export declare class TestPkgClass {
        /**
         * @deprecated Use newExternalMethod() instead. Will be removed in v2.0
         */
        oldExternalMethod(): void;
      }`
        );
        const srcDir = path.join(tempDir, 'src');
        fs.mkdirSync(srcDir, { recursive: true });
        const testFile = path.join(srcDir, 'test.ts');
        fs.writeFileSync(
            testFile,
            `import { TestPkgClass } from 'test-pkg';
      
      export class MyClass {
        public useDeprecated(): void {
          const obj = new TestPkgClass();
          obj.oldExternalMethod();
        }
      }`
        );
        const results = await scanner.scanProject(workspaceFolder);
        const deprecatedUsage = results.find((r) => r.name === 'oldExternalMethod');
        expect(deprecatedUsage).toBeDefined();
        expect(deprecatedUsage?.deprecationReason).toContain('Use newExternalMethod() instead');
    });

    it('should handle property deprecation with reason', async () => {
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
        const testFile = path.join(srcDir, 'test.ts');
        fs.writeFileSync(
            testFile,
            `export class TestClass {
        /**
         * @deprecated Use newProp instead
         */
        public oldProp: string = 'old';
      }`
        );
        const results = await scanner.scanProject(workspaceFolder);
        const deprecatedProp = results.find((r) => r.name === 'oldProp');
        expect(deprecatedProp).toBeDefined();
        expect(deprecatedProp?.deprecationReason).toBe('Use newProp instead');
    });
});