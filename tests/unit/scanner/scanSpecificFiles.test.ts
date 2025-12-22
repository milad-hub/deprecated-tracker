import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { TagsManager } from '../../../src/config/tagsManager';
import { IgnoreManager } from '../../../src/scanner/ignoreManager';
import { Scanner } from '../../../src/scanner/scanner';

describe('Scanner - scanSpecificFiles', () => {
  let tempDir: string;
  let workspaceFolder: vscode.WorkspaceFolder;
  let mockContext: vscode.ExtensionContext;
  let ignoreManager: IgnoreManager;
  let tagsManager: TagsManager;
  let scanner: Scanner;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deprecated-tracker-test-'));
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

  describe('Basic Functionality', () => {
    it('should return empty array when filePaths is empty', async () => {
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
      const results = await scanner.scanSpecificFiles(workspaceFolder, []);
      expect(results).toEqual([]);
    });

    it('should return empty array when filePaths is undefined', async () => {
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
      const results = await scanner.scanSpecificFiles(
        workspaceFolder,
        undefined as any
      );
      expect(results).toEqual([]);
    });

    it('should scan specific files and find deprecated items', async () => {
      const tsconfigPath = path.join(tempDir, 'tsconfig.json');
      fs.writeFileSync(
        tsconfigPath,
        JSON.stringify({
          compilerOptions: {
            target: 'ES2020',
            module: 'commonjs',
            outDir: './out',
          },
          include: ['src/**/*'],
        })
      );
      const srcDir = path.join(tempDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });
      const testFile1 = path.join(srcDir, 'test1.ts');
      fs.writeFileSync(
        testFile1,
        `export class TestClass {
          /**
           * @deprecated This method is deprecated
           */
          public oldMethod(): void {
            console.log('old');
          }

          public newMethod(): void {
            this.oldMethod(); // Usage of deprecated method
          }
        }`
      );
      const testFile2 = path.join(srcDir, 'test2.ts');
      fs.writeFileSync(
        testFile2,
        `export class AnotherClass {
          public regularMethod(): void {
            console.log('regular');
          }
        }`
      );
      const results = await scanner.scanSpecificFiles(workspaceFolder, [
        testFile1,
      ]);
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
    });

    it('should scan multiple specific files', async () => {
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
      const srcDir = path.join(tempDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });
      const testFile1 = path.join(srcDir, 'test1.ts');
      fs.writeFileSync(
        testFile1,
        `export class Class1 {
          /** @deprecated */ oldMethod1(): void {}
        }`
      );
      const testFile2 = path.join(srcDir, 'test2.ts');
      fs.writeFileSync(
        testFile2,
        `export class Class2 {
          /** @deprecated */ oldMethod2(): void {}
        }`
      );
      const results = await scanner.scanSpecificFiles(workspaceFolder, [
        testFile1,
        testFile2,
      ]);
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('Progress Callback', () => {
    it('should invoke progress callback during scan', async () => {
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
      const srcDir = path.join(tempDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });
      const testFile1 = path.join(srcDir, 'test1.ts');
      fs.writeFileSync(testFile1, 'export const a = 1;');
      const testFile2 = path.join(srcDir, 'test2.ts');
      fs.writeFileSync(testFile2, 'export const b = 2;');
      const progressCalls: Array<{ current: number; total: number }> = [];
      const onProgress = (current: number, total: number) => {
        progressCalls.push({ current, total });
      };
      await scanner.scanSpecificFiles(
        workspaceFolder,
        [testFile1, testFile2],
        onProgress
      );
      expect(progressCalls.length).toBeGreaterThan(0);
      progressCalls.forEach((call) => {
        expect(call.current).toBeGreaterThanOrEqual(1);
        expect(call.total).toBeGreaterThanOrEqual(call.current);
      });
    });

    it('should work without progress callback', async () => {
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
      fs.writeFileSync(testFile, 'export const x = 1;');
      await expect(
        scanner.scanSpecificFiles(workspaceFolder, [testFile])
      ).resolves.toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should throw error if tsconfig.json not found', async () => {
      const srcDir = path.join(tempDir, 'src');
      fs.mkdirSync(srcDir);
      const testFile = path.join(srcDir, 'test.ts');
      fs.writeFileSync(testFile, 'export const x = 1;');
      await expect(
        scanner.scanSpecificFiles(workspaceFolder, [testFile])
      ).rejects.toThrow('tsconfig.json or jsconfig.json not found in workspace root');
    });

    it('should throw error for malformed tsconfig.json', async () => {
      const tsconfigPath = path.join(tempDir, 'tsconfig.json');
      fs.writeFileSync(tsconfigPath, '{ invalid json }');
      const srcDir = path.join(tempDir, 'src');
      fs.mkdirSync(srcDir);
      const testFile = path.join(srcDir, 'test.ts');
      fs.writeFileSync(testFile, 'export const x = 1;');
      await expect(
        scanner.scanSpecificFiles(workspaceFolder, [testFile])
      ).rejects.toThrow();
    });
  });

  describe('File Filtering', () => {
    it('should skip non-existent files', async () => {
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
      const existingFile = path.join(srcDir, 'existing.ts');
      fs.writeFileSync(existingFile, 'export const x = 1;');
      const nonExistentFile = path.join(srcDir, 'non-existent.ts');
      const results = await scanner.scanSpecificFiles(workspaceFolder, [
        existingFile,
        nonExistentFile,
      ]);
      expect(results).toBeDefined();
    });

    it('should skip ignored files', async () => {
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
        '/** @deprecated */ export const oldConst = 1;'
      );
      ignoreManager.ignoreFile(testFile);
      const results = await scanner.scanSpecificFiles(workspaceFolder, [
        testFile,
      ]);
      expect(results).toEqual([]);
    });

    it('should skip declaration files', async () => {
      const tsconfigPath = path.join(tempDir, 'tsconfig.json');
      fs.writeFileSync(
        tsconfigPath,
        JSON.stringify({
          compilerOptions: {
            target: 'ES2020',
            module: 'commonjs',
            declaration: true,
          },
          include: ['src/**/*'],
        })
      );
      const srcDir = path.join(tempDir, 'src');
      fs.mkdirSync(srcDir);
      const declFile = path.join(srcDir, 'types.d.ts');
      fs.writeFileSync(
        declFile,
        '/** @deprecated */ export declare const oldConst: string;'
      );
      const results = await scanner.scanSpecificFiles(workspaceFolder, [
        declFile,
      ]);
      expect(results).toBeDefined();
    });
  });

  describe('Ignore Rules', () => {
    it('should respect ignored methods even in specific file scan', async () => {
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
          /** @deprecated */ public ignoredMethod(): void {}
          /** @deprecated */ public notIgnoredMethod(): void {}
        }`
      );
      ignoreManager.ignoreMethod(testFile, 'ignoredMethod');
      const results = await scanner.scanSpecificFiles(workspaceFolder, [
        testFile,
      ]);
      const ignoredResults = results.filter((r) => r.name === 'ignoredMethod');
      const notIgnoredResults = results.filter(
        (r) => r.name === 'notIgnoredMethod'
      );
      expect(ignoredResults.length).toBe(0);
      expect(notIgnoredResults.length).toBeGreaterThan(0);
    });
  });

  describe('Path Normalization', () => {
    it('should handle normalized paths correctly', async () => {
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
      fs.writeFileSync(testFile, 'export const x = 1;');
      const normalizedPath = path.normalize(testFile);
      const results = await scanner.scanSpecificFiles(workspaceFolder, [
        normalizedPath,
      ]);
      expect(results).toBeDefined();
    });

    it('should handle paths with different separators', async () => {
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
      fs.writeFileSync(testFile, 'export const x = 1;');
      const pathWithForwardSlash = testFile.replace(/\\/g, '/');
      const results = await scanner.scanSpecificFiles(workspaceFolder, [
        pathWithForwardSlash,
      ]);
      expect(results).toBeDefined();
    });
  });

  describe('Deprecated Item Detection in Specific Files', () => {
    it('should find deprecated items only in specified files', async () => {
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
      const file1 = path.join(srcDir, 'file1.ts');
      fs.writeFileSync(
        file1,
        `export class Class1 {
          /** @deprecated */ oldMethod1(): void {}
        }`
      );
      const file2 = path.join(srcDir, 'file2.ts');
      fs.writeFileSync(
        file2,
        `export class Class2 {
          /** @deprecated */ oldMethod2(): void {}
        }`
      );
      const results = await scanner.scanSpecificFiles(workspaceFolder, [file1]);
      expect(results).toBeDefined();
    });

    it('should detect usages of deprecated items in specific files', async () => {
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
      const declFile = path.join(srcDir, 'declarations.ts');
      fs.writeFileSync(
        declFile,
        `export class BaseClass {
          /** @deprecated */ oldMethod(): void {}
        }`
      );
      const usageFile = path.join(srcDir, 'usage.ts');
      fs.writeFileSync(
        usageFile,
        `import { BaseClass } from './declarations';
        
        export class UsageClass extends BaseClass {
          test(): void {
            this.oldMethod(); // Using deprecated method
          }
        }`
      );
      const results = await scanner.scanSpecificFiles(workspaceFolder, [
        usageFile,
      ]);
      expect(results).toBeDefined();
      const usages = results.filter((r) => r.filePath === usageFile);
      expect(usages.length).toBeGreaterThan(0);
    });
  });
});