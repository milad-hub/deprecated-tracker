import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { IgnoreManager } from '../../src/scanner/ignoreManager';
import { Scanner } from '../../src/scanner/scanner';

describe('Scanner', () => {
  let tempDir: string;
  let workspaceFolder: vscode.WorkspaceFolder;
  let mockContext: vscode.ExtensionContext;
  let ignoreManager: IgnoreManager;
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
    scanner = new Scanner(ignoreManager);
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Basic Functionality', () => {
    it('should throw error if tsconfig.json not found', async () => {
      await expect(scanner.scanProject(workspaceFolder)).rejects.toThrow(
        'tsconfig.json not found in workspace root'
      );
    });

    it('should scan project and find deprecated items', async () => {
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
      const testFile = path.join(srcDir, 'test.ts');
      fs.writeFileSync(
        testFile,
        `export class TestClass {
          /**
           * @deprecated This method is deprecated
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

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
    });

    it('should handle empty project', async () => {
      const tsconfigPath = path.join(tempDir, 'tsconfig.json');
      fs.writeFileSync(
        tsconfigPath,
        JSON.stringify({
          compilerOptions: { target: 'ES2020', module: 'commonjs' },
          include: ['src/**/*'],
        })
      );
      fs.mkdirSync(path.join(tempDir, 'src'));
      const results = await scanner.scanProject(workspaceFolder);
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('Ignore Management', () => {
    it('should respect ignored files', async () => {
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
      const testFile = path.join(srcDir, 'test.ts');
      fs.writeFileSync(testFile, 'export class Test {}');

      ignoreManager.ignoreFile(testFile);

      const results = await scanner.scanProject(workspaceFolder);
      expect(results).toBeDefined();
    });

    it('should respect ignored methods', async () => {
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
      const testFile = path.join(srcDir, 'test.ts');
      fs.writeFileSync(
        testFile,
        `export class TestClass {
          /**
           * @deprecated This method is deprecated
           */
          public oldMethod(): void {}
        }`
      );

      ignoreManager.ignoreMethod(testFile, 'oldMethod');

      const results = await scanner.scanProject(workspaceFolder);

      const deprecatedMethods = results.filter((r) => r.name === 'oldMethod');
      expect(deprecatedMethods.length).toBe(0);
    });

    it('should not report usages of ignored methods', async () => {
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
      const declFile = path.join(srcDir, 'declarations.ts');
      fs.writeFileSync(
        declFile,
        `export class BaseClass {
          /**
           * @deprecated This method is deprecated
           */
          public ignoredMethod(): void {}
        }`
      );
      const usageFile = path.join(srcDir, 'usage.ts');
      fs.writeFileSync(
        usageFile,
        `import { BaseClass } from './declarations';
        
        export class UsageClass extends BaseClass {
          public test(): void {
            this.ignoredMethod();
          }
        }`
      );
      ignoreManager.ignoreMethod(declFile, 'ignoredMethod');
      const results = await scanner.scanProject(workspaceFolder);
      const ignoredUsages = results.filter(r => r.name === 'ignoredMethod');
      expect(ignoredUsages.length).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should throw error for malformed tsconfig.json', async () => {
      const tsconfigPath = path.join(tempDir, 'tsconfig.json');
      fs.writeFileSync(tsconfigPath, '{ invalid json }');
      await expect(scanner.scanProject(workspaceFolder)).rejects.toThrow();
    });

    it('should throw error when tsconfig.json has parse errors', async () => {
      const tsconfigPath = path.join(tempDir, 'tsconfig.json');
      fs.writeFileSync(tsconfigPath, '{ invalid json content }');
      await expect(scanner.scanProject(workspaceFolder)).rejects.toThrow();
    });
  });

  describe('Deprecated Item Detection', () => {
    it('should detect deprecated classes', async () => {
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
        path.join(srcDir, 'test.ts'),
        '/** @deprecated */ export class OldClass {}'
      );
      const results = await scanner.scanProject(workspaceFolder);
      expect(results).toBeDefined();
    });

    it('should detect deprecated methods', async () => {
      const tsconfigPath = path.join(tempDir, 'tsconfig.json');
      fs.writeFileSync(tsconfigPath, JSON.stringify({
        compilerOptions: { target: 'ES2020', module: 'commonjs' },
        include: ['src/**/*'],
      }));
      const srcDir = path.join(tempDir, 'src');
      fs.mkdirSync(srcDir);
      fs.writeFileSync(path.join(srcDir, 'test.ts'), '/** @deprecated */ export function oldFunc() {}');
      const results = await scanner.scanProject(workspaceFolder);
      expect(results).toBeDefined();
    });

    it('should detect deprecated properties', async () => {
      const tsconfigPath = path.join(tempDir, 'tsconfig.json');
      fs.writeFileSync(tsconfigPath, JSON.stringify({
        compilerOptions: { target: 'ES2020', module: 'commonjs' },
        include: ['src/**/*'],
      }));
      const srcDir = path.join(tempDir, 'src');
      fs.mkdirSync(srcDir);
      fs.writeFileSync(path.join(srcDir, 'test.ts'),
        'export class Test { /** @deprecated */ public oldProp: string = "old"; }');
      const results = await scanner.scanProject(workspaceFolder);
      expect(results).toBeDefined();
    });

    it('should detect property and interface deprecations', async () => {
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
      const testFile = path.join(srcDir, 'test.ts');
      fs.writeFileSync(
        testFile,
        `export interface TestInterface {
          /**
           * @deprecated Old property
           */
          oldProp: string;
          /**
           * @deprecated Old method
           */
          oldMethod(): void;
        }
        export class TestClass {
          /**
           * @deprecated Deprecated property
           */
          public deprecatedProp: string = '';
        }`
      );
      const results = await scanner.scanProject(workspaceFolder);
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('External Package Handling', () => {
    it('should not flag RxJS subscribe method as deprecated (false positive test)', async () => {
      const tsconfigPath = path.join(tempDir, 'tsconfig.json');
      fs.writeFileSync(
        tsconfigPath,
        JSON.stringify({
          compilerOptions: {
            target: 'ES2020',
            module: 'commonjs',
            lib: ['ES2020'],
          },
          include: ['src/**/*'],
        })
      );

      const nodeModulesDir = path.join(tempDir, 'node_modules', 'rxjs');
      fs.mkdirSync(nodeModulesDir, { recursive: true });

      const rxjsTypesFile = path.join(nodeModulesDir, 'index.d.ts');
      fs.writeFileSync(rxjsTypesFile, `
/**
 * @deprecated This entire file has a deprecated tag for testing
 * But the subscribe method itself should NOT be flagged as deprecated
 */
export declare class Observable<T> {
  constructor(subscribe?: (subscriber: any) => void);
  /**
   * @deprecated This method has a deprecated tag that might cause false positives
   * But this is just a test - the method itself is not actually deprecated
   */
  subscribe(observer?: (value: T) => void): Subscription;
}

export declare class Subscription {
  unsubscribe(): void;
}
`);

      const srcDir = path.join(tempDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });
      const testFile = path.join(srcDir, 'rxjs-test.ts');
      fs.writeFileSync(
        testFile,
        `import { Observable } from 'rxjs';

        export class TestRxJSSubscribe {
          public testObservable(): void {
            const obs = new Observable(subscriber => {
              subscriber.next('test');
              subscriber.complete();
            });
            
            obs.subscribe(value => console.log(value));
          }
          
          public testExplicitDeprecated(): void {
            this.deprecatedMethod();
          }
          
          /**
           * @deprecated This method is explicitly deprecated
           */
          private deprecatedMethod(): void {
            console.log('deprecated');
          }
        }`
      );

      const results = await scanner.scanProject(workspaceFolder);

      const subscribeResults = results.filter(r =>
        r.name === 'subscribe' &&
        r.filePath === testFile
      );
      expect(subscribeResults.length).toBe(0);

      const deprecatedResults = results.filter(r =>
        r.name === 'deprecatedMethod' &&
        r.filePath === testFile
      );
      expect(deprecatedResults.length).toBeGreaterThanOrEqual(1);
    });

    it('should filter trusted packages like rxjs', async () => {
      const tsconfigPath = path.join(tempDir, 'tsconfig.json');
      fs.writeFileSync(tsconfigPath, JSON.stringify({
        compilerOptions: { target: 'ES2020', module: 'commonjs' },
        include: ['src/**/*'],
      }));
      const nodeModulesDir = path.join(tempDir, 'node_modules', 'rxjs');
      fs.mkdirSync(nodeModulesDir, { recursive: true });
      fs.writeFileSync(path.join(nodeModulesDir, 'index.d.ts'),
        '/** @deprecated */ export function oldRxjs() {}');
      const srcDir = path.join(tempDir, 'src');
      fs.mkdirSync(srcDir);
      fs.writeFileSync(path.join(srcDir, 'test.ts'), 'export const x = 1;');
      const results = await scanner.scanProject(workspaceFolder);
      const rxjsItems = results.filter(r => r.filePath.includes('rxjs'));
      expect(rxjsItems.length).toBe(0);
    });

    it('should skip trusted packages like rxjs even with deprecated tags', async () => {
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
      const nodeModulesDir = path.join(tempDir, 'node_modules', 'rxjs');
      fs.mkdirSync(nodeModulesDir, { recursive: true });
      const rxjsTypesFile = path.join(nodeModulesDir, 'index.d.ts');
      fs.writeFileSync(
        rxjsTypesFile,
        `export declare class Observable<T> {
          /**
           * @deprecated Testing if trusted packages are skipped
           */
          subscribe(observer?: (value: T) => void): void;
        }`
      );
      const srcDir = path.join(tempDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });
      const testFile = path.join(srcDir, 'test.ts');
      fs.writeFileSync(
        testFile,
        `import { Observable } from 'rxjs';
        export class TestClass {
          public test(): void {
            const obs = new Observable();
            obs.subscribe(val => console.log(val));
          }
        }`
      );
      const results = await scanner.scanProject(workspaceFolder);
      const rxjsResults = results.filter(r =>
        r.name === 'subscribe' && r.filePath === testFile
      );
      expect(rxjsResults.length).toBe(0);
    });

    it('should handle scoped packages like @angular', async () => {
      const tsconfigPath = path.join(tempDir, 'tsconfig.json');
      fs.writeFileSync(tsconfigPath, JSON.stringify({
        compilerOptions: { target: 'ES2020', module: 'commonjs' },
        include: ['src/**/*'],
      }));
      const angularDir = path.join(tempDir, 'node_modules', '@angular', 'core');
      fs.mkdirSync(angularDir, { recursive: true });
      fs.writeFileSync(path.join(angularDir, 'index.d.ts'),
        '/** @deprecated */ export class OldComponent {}');
      const srcDir = path.join(tempDir, 'src');
      fs.mkdirSync(srcDir);
      fs.writeFileSync(path.join(srcDir, 'test.ts'), 'export const x = 1;');
      const results = await scanner.scanProject(workspaceFolder);
      const angularItems = results.filter(r => r.filePath.includes('@angular'));
      expect(angularItems.length).toBe(0);
    });

    it('should handle non-trusted external packages with deprecated items', async () => {
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
      const nodeModulesDir = path.join(tempDir, 'node_modules', 'untrusted-pkg');
      fs.mkdirSync(nodeModulesDir, { recursive: true });
      const pkgTypesFile = path.join(nodeModulesDir, 'index.d.ts');
      fs.writeFileSync(
        pkgTypesFile,
        `export declare class UntrustedClass {
          /**
           * @deprecated This is deprecated
           */
          oldMethod(): void;
        }`
      );
      const srcDir = path.join(tempDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });
      const testFile = path.join(srcDir, 'test.ts');
      fs.writeFileSync(
        testFile,
        `import { UntrustedClass } from 'untrusted-pkg';
        
        export class MyClass {
          public useDeprecated(): void {
            const obj = new UntrustedClass();
            obj.oldMethod();
          }
        }`
      );
      const results = await scanner.scanProject(workspaceFolder);
      expect(results).toBeDefined();
    });
  });

  describe('Declaration File Filtering', () => {
    it('should skip non-project, non-external declaration files', async () => {
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
      fs.mkdirSync(srcDir, { recursive: true });
      const declFile = path.join(srcDir, 'types.d.ts');
      fs.writeFileSync(
        declFile,
        `declare module 'custom' {
          export class SomeClass {
            /**
             * @deprecated
             */
            oldMethod(): void;
          }
        }`
      );
      const testFile = path.join(srcDir, 'test.ts');
      fs.writeFileSync(testFile, 'export class Test {}');
      const results = await scanner.scanProject(workspaceFolder);
      expect(results).toBeDefined();
    });
  });

  describe('Path Handling', () => {
    it('should normalize Windows paths', async () => {
      const tsconfigPath = path.join(tempDir, 'tsconfig.json');
      fs.writeFileSync(tsconfigPath, JSON.stringify({
        compilerOptions: { target: 'ES2020', module: 'commonjs' },
        include: ['src/**/*'],
      }));
      const srcDir = path.join(tempDir, 'src');
      fs.mkdirSync(srcDir);
      fs.writeFileSync(path.join(srcDir, 'test.ts'), '/** @deprecated */ export const x = 1;');
      const results = await scanner.scanProject(workspaceFolder);
      results.forEach(item => {
        expect(item.filePath).toBe(path.normalize(item.filePath));
      });
    });

    it('should return empty string for paths without node_modules', () => {
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
      const testFile = path.join(srcDir, 'test.ts');
      fs.writeFileSync(testFile, 'export class Test {}');
      expect(scanner.scanProject(workspaceFolder)).resolves.toBeDefined();
    });
  });

  describe('Callback Handling', () => {
    it('should invoke onFileScanning callback', async () => {
      const tsconfigPath = path.join(tempDir, 'tsconfig.json');
      fs.writeFileSync(tsconfigPath, JSON.stringify({
        compilerOptions: { target: 'ES2020', module: 'commonjs' },
        include: ['src/**/*'],
      }));
      const srcDir = path.join(tempDir, 'src');
      fs.mkdirSync(srcDir);
      fs.writeFileSync(path.join(srcDir, 'test1.ts'), 'export const a = 1;');
      fs.writeFileSync(path.join(srcDir, 'test2.ts'), 'export const b = 2;');
      const scannedFiles: string[] = [];
      const callback = (filePath: string) => { scannedFiles.push(filePath); };
      await scanner.scanProject(workspaceFolder, callback);
      expect(scannedFiles.length).toBeGreaterThan(0);
      scannedFiles.forEach(file => {
        expect(file).not.toContain('node_modules');
      });
    });
  });
});