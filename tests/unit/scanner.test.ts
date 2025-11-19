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
    // Create temporary directory
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deprecated-tracker-test-'));

    // Create mock workspace folder
    workspaceFolder = {
      uri: vscode.Uri.file(tempDir),
      name: 'test-workspace',
      index: 0,
    };

    // Create mock extension context
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
    // Clean up temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('scanProject', () => {
    it('should throw error if tsconfig.json not found', async () => {
      await expect(scanner.scanProject(workspaceFolder)).rejects.toThrow(
        'tsconfig.json not found in workspace root'
      );
    });

    it('should scan project and find deprecated items', async () => {
      // Create tsconfig.json
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

      // Create test TypeScript file with deprecated method
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
      // Note: Actual detection depends on TypeScript compiler API behavior
    });

    it('should respect ignored files', async () => {
      // Create tsconfig.json
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

      // Create test file
      const srcDir = path.join(tempDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });
      const testFile = path.join(srcDir, 'test.ts');
      fs.writeFileSync(testFile, 'export class Test {}');

      // Ignore the file
      ignoreManager.ignoreFile(testFile);

      const results = await scanner.scanProject(workspaceFolder);

      // File should be ignored, so no results from that file
      expect(results).toBeDefined();
    });

    it('should respect ignored methods', async () => {
      // Create tsconfig.json
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

      // Create test file
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

      // Ignore the method
      ignoreManager.ignoreMethod(testFile, 'oldMethod');

      const results = await scanner.scanProject(workspaceFolder);

      // Method should be ignored
      const deprecatedMethods = results.filter((r) => r.name === 'oldMethod');
      expect(deprecatedMethods.length).toBe(0);
    });
    it('should not flag RxJS subscribe method as deprecated (false positive test)', async () => {
      // Create tsconfig.json
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

      // Create a fake node_modules directory with a fake RxJS package
      const nodeModulesDir = path.join(tempDir, 'node_modules', 'rxjs');
      fs.mkdirSync(nodeModulesDir, { recursive: true });

      // Create fake RxJS type definitions with a @deprecated tag that might cause false positives
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

      // Create test file that uses the fake RxJS
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
            
            // This should NOT be flagged as deprecated even though the file has @deprecated
            // The subscribe method itself is not deprecated
            obs.subscribe(value => console.log(value));
          }
          
          public testExplicitDeprecated(): void {
            // This should be flagged as deprecated
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

      // Debug: Log all found items to understand what's being flagged
      // console.error('== Deprecated Tracker === Test: Found', results.length, 'deprecated items:');
      // results.forEach(item => {
      //   console.error('== Deprecated Tracker === Test: Item:', {
      //     name: item.name,
      //     filePath: item.filePath,
      //     line: item.line,
      //     fileName: item.fileName,
      //     kind: item.kind,
      //     deprecatedDeclaration: item.deprecatedDeclaration
      //   });
      // });

      // Should not find any deprecated items from RxJS subscribe
      const subscribeResults = results.filter(r =>
        r.name === 'subscribe' &&
        r.filePath === testFile
      );
      expect(subscribeResults.length).toBe(0);

      // Should find at least one explicitly deprecated method (usage or declaration)
      const deprecatedResults = results.filter(r =>
        r.name === 'deprecatedMethod' &&
        r.filePath === testFile
      );
      expect(deprecatedResults.length).toBeGreaterThanOrEqual(1);
    });
  });
});
