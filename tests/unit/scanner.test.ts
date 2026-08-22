import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as ts from 'typescript';
import * as vscode from 'vscode';
import { TagsManager } from '../../src/config/tagsManager';
import { IgnoreManager } from '../../src/scanner/ignoreManager';
import { ScannerPlatform } from '../../src/interfaces';
import { Scanner } from '../../src/scanner/scanner';

describe('Scanner', () => {
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
    it('should throw error if tsconfig.json not found', async () => {
      await expect(scanner.scanProject(workspaceFolder.uri.fsPath)).rejects.toThrow(
        'No tsconfig.json or jsconfig.json found anywhere in the workspace'
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

      const results = await scanner.scanProject(workspaceFolder.uri.fsPath);

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
      const results = await scanner.scanProject(workspaceFolder.uri.fsPath);
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

      const results = await scanner.scanProject(workspaceFolder.uri.fsPath);
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

      const results = await scanner.scanProject(workspaceFolder.uri.fsPath);

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
      const results = await scanner.scanProject(workspaceFolder.uri.fsPath);
      const ignoredUsages = results.filter(r => r.name === 'ignoredMethod');
      expect(ignoredUsages.length).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should throw error for malformed tsconfig.json', async () => {
      const tsconfigPath = path.join(tempDir, 'tsconfig.json');
      fs.writeFileSync(tsconfigPath, '{ invalid json }');
      await expect(scanner.scanProject(workspaceFolder.uri.fsPath)).rejects.toThrow();
    });

    it('should throw error when tsconfig.json has parse errors', async () => {
      const tsconfigPath = path.join(tempDir, 'tsconfig.json');
      fs.writeFileSync(tsconfigPath, '{ invalid json content }');
      await expect(scanner.scanProject(workspaceFolder.uri.fsPath)).rejects.toThrow();
    });
  });

  describe('Deprecated Item Detection', () => {
    it('should track deprecated classes, interfaces, and functions', async () => {
      fs.writeFileSync(path.join(tempDir, 'tsconfig.json'), JSON.stringify({
        compilerOptions: { target: 'ES2020', module: 'commonjs' },
        include: ['src/**/*'],
      }));
      const srcDir = path.join(tempDir, 'src');
      fs.mkdirSync(srcDir);
      const declarationFile = path.join(srcDir, 'z-declarations.ts');
      const usageFile = path.join(srcDir, 'a-usage.ts');
      fs.writeFileSync(declarationFile, `
        /** @deprecated */ export class OldClass {}
        /** @deprecated */ export interface OldInterface {}
        /** @deprecated */ export function oldFunction(): void {}
      `);
      fs.writeFileSync(usageFile, `
        import { OldClass, OldInterface, oldFunction } from './z-declarations';
        const value: OldInterface = {};
        new OldClass();
        oldFunction();
      `);

      const results = await scanner.scanProject(workspaceFolder.uri.fsPath);

      expect(results).toEqual(expect.arrayContaining([
        expect.objectContaining({ name: 'OldClass', filePath: declarationFile, kind: 'class' }),
        expect.objectContaining({ name: 'OldInterface', filePath: declarationFile, kind: 'interface' }),
        expect.objectContaining({ name: 'oldFunction', filePath: declarationFile, kind: 'function' }),
        expect.objectContaining({ name: 'OldClass', filePath: usageFile, kind: 'usage' }),
        expect.objectContaining({ name: 'OldInterface', filePath: usageFile, kind: 'usage' }),
        expect.objectContaining({ name: 'oldFunction', filePath: usageFile, kind: 'usage' }),
      ]));
      expect(results).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ filePath: declarationFile, kind: 'usage' }),
      ]));

      ignoreManager.ignoreMethod(declarationFile, 'OldClass');
      const ignoredResults = await scanner.scanProject(workspaceFolder.uri.fsPath);
      expect(ignoredResults.some((item) =>
        item.name === 'OldClass' || item.deprecatedDeclaration?.name === 'OldClass'
      )).toBe(false);
    });

    it('should find usages before their deprecated declarations', async () => {
      fs.writeFileSync(path.join(tempDir, 'tsconfig.json'), JSON.stringify({
        compilerOptions: { target: 'ES2020', module: 'commonjs' },
        include: ['src/**/*'],
      }));
      const srcDir = path.join(tempDir, 'src');
      fs.mkdirSync(srcDir);
      const usageFile = path.join(srcDir, 'a-usage.ts');
      fs.writeFileSync(usageFile, `import { Api } from './z-declaration';
        new Api().oldMethod();`);
      fs.writeFileSync(path.join(srcDir, 'z-declaration.ts'), `export class Api {
        /** @deprecated */
        public oldMethod(): void {}
      }`);

      const results = await scanner.scanProject(workspaceFolder.uri.fsPath);

      expect(results).toContainEqual(expect.objectContaining({
        name: 'oldMethod',
        filePath: usageFile,
        kind: 'usage',
      }));

      const folderResults = await scanner.scanFolder(workspaceFolder.uri.fsPath, srcDir);

      expect(folderResults).toContainEqual(expect.objectContaining({
        name: 'oldMethod',
        filePath: usageFile,
        kind: 'usage',
      }));
    });

    it('should scan referenced projects without duplicate results', async () => {
      const libDir = path.join(tempDir, 'packages', 'lib');
      const appDir = path.join(tempDir, 'packages', 'app');
      const libSrcDir = path.join(libDir, 'src');
      const appSrcDir = path.join(appDir, 'src');
      fs.mkdirSync(libSrcDir, { recursive: true });
      fs.mkdirSync(appSrcDir, { recursive: true });
      fs.writeFileSync(path.join(tempDir, 'tsconfig.json'), JSON.stringify({
        files: [],
        references: [{ path: './packages/lib' }, { path: './packages/app' }],
      }));
      fs.writeFileSync(path.join(libDir, 'tsconfig.json'), JSON.stringify({
        compilerOptions: {
          composite: true,
          target: 'ES2020',
          module: 'commonjs',
        },
        include: ['src/**/*'],
      }));
      fs.writeFileSync(path.join(appDir, 'tsconfig.json'), JSON.stringify({
        compilerOptions: {
          composite: true,
          target: 'ES2020',
          module: 'commonjs',
        },
        references: [{ path: '../lib' }],
        include: ['src/**/*'],
      }));
      const declarationFile = path.join(libSrcDir, 'api.ts');
      const usageFile = path.join(appSrcDir, 'component.ts');
      fs.writeFileSync(declarationFile, `export class Api {
        /** @deprecated Use newMethod instead */
        public oldMethod(): void {}
      }`);
      fs.writeFileSync(usageFile, `import { Api } from '../../lib/src/api';
        const instance = new Api();
        instance.oldMethod();`);

      const results = await scanner.scanProject(workspaceFolder.uri.fsPath);
      const usages = results.filter(
        (item) =>
          item.kind === 'usage' &&
          item.filePath === usageFile &&
          item.name === 'oldMethod',
      );
      const declarations = results.filter(
        (item) =>
          item.kind === 'method' &&
          item.filePath === declarationFile &&
          item.name === 'oldMethod',
      );

      expect(usages).toHaveLength(1);
      expect(declarations).toHaveLength(1);
    });

    it('should report deprecated declarations as items', async () => {
      fs.writeFileSync(path.join(tempDir, 'tsconfig.json'), JSON.stringify({
        compilerOptions: { target: 'ES2020', module: 'commonjs' },
        include: ['src/**/*'],
      }));
      const srcDir = path.join(tempDir, 'src');
      fs.mkdirSync(srcDir);
      const filePath = path.join(srcDir, 'test.ts');
      fs.writeFileSync(filePath, `export class TestClass {
        /** @deprecated Use newMethod instead */
        public oldMethod(): void {}
      }`);

      const results = await scanner.scanProject(workspaceFolder.uri.fsPath);

      expect(results).toContainEqual(expect.objectContaining({
        name: 'oldMethod',
        filePath,
        kind: 'method',
        deprecationReason: 'Use newMethod instead',
      }));
    });

    it('should detect static member access, destructuring, accessors, and decorators', async () => {
      fs.writeFileSync(path.join(tempDir, 'tsconfig.json'), JSON.stringify({
        compilerOptions: {
          target: 'ES2020',
          module: 'commonjs',
          experimentalDecorators: true,
        },
        include: ['src/**/*'],
      }));
      const srcDir = path.join(tempDir, 'src');
      fs.mkdirSync(srcDir);
      const declarationFile = path.join(srcDir, 'api.ts');
      const usageFile = path.join(srcDir, 'usage.ts');
      fs.writeFileSync(declarationFile, `
        function Deprecated(_reason?: string): any { return () => undefined; }
        function obsolete(_reason?: string): any { return () => undefined; }
        function Other(): any { return () => undefined; }
        export class Api {
          @Deprecated('Use value instead')
          public get oldValue(): string { return ''; }

          @Deprecated()
          public set oldSetting(_value: string) {}

          @obsolete()
          public oldCustom(): void {}

          @Other()
          public currentMethod(): void {}

          /** @deprecated Use currentMethod instead */
          public ['oldMethod'](): void {}
        }
      `);
      fs.writeFileSync(usageFile, `
        import { Api } from './api';
        const api = new Api();
        api.oldValue;
        api.oldSetting = '';
        api.oldCustom();
        api.currentMethod();
        api['oldMethod']();
        const { oldMethod: alias } = api;
        alias();
        const object = {
          /** @deprecated */ oldObjectMethod(): void {}
        };
        object.oldObjectMethod();
      `);

      const results = await scanner.scanProject(workspaceFolder.uri.fsPath);
      const usages = results.filter((item) => item.filePath === usageFile && item.kind === 'usage');

      expect(usages).toEqual(expect.arrayContaining([
        expect.objectContaining({ name: 'oldValue', deprecationReason: 'Use value instead' }),
        expect.objectContaining({ name: 'oldSetting' }),
        expect.objectContaining({ name: 'oldCustom', deprecationReason: 'Code no longer in use' }),
        expect.objectContaining({ name: 'oldMethod' }),
        expect.objectContaining({ name: 'alias' }),
        expect.objectContaining({ name: 'oldObjectMethod' }),
      ]));
      expect(usages).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ name: 'currentMethod' }),
      ]));
    });

    it('should detect deprecated TypeScript declarations and signatures', async () => {
      fs.writeFileSync(path.join(tempDir, 'tsconfig.json'), JSON.stringify({
        compilerOptions: { target: 'ES2020', module: 'commonjs' },
        include: ['src/**/*'],
      }));
      const srcDir = path.join(tempDir, 'src');
      fs.mkdirSync(srcDir);
      const declarationsFile = path.join(srcDir, 'declarations.ts');
      const usageFile = path.join(srcDir, 'usage.ts');
      fs.writeFileSync(declarationsFile, `
        /** @deprecated */ export type OldType = string;
        /** @deprecated */ export enum OldEnum { Value }
        export enum CurrentEnum {
          /** @deprecated */
          OldValue,
        }
        /** @deprecated */ export namespace OldNamespace { export const value = 1; }
        /** @deprecated */ export const oldArrow = (): void => {};
        /** @deprecated */ export const oldValue = 1;
        export function parameterUsage(/** @deprecated */ oldParameter: string): string {
          return oldParameter;
        }
        export class Legacy {
          /** @deprecated Use Legacy.create instead */
          public constructor() {}
        }
        export interface Callable {
          /** @deprecated */ (): void;
        }
        export interface Factory {
          /** @deprecated */ new(): Legacy;
        }
        export interface Dictionary {
          /** @deprecated */ [key: string]: string;
        }
      `);
      fs.writeFileSync(usageFile, `
        import { Callable, CurrentEnum, Dictionary, Factory, Legacy, OldEnum, OldNamespace, OldType, oldArrow, oldValue } from './declarations';
        let value: OldType = '';
        OldEnum.Value;
        CurrentEnum.OldValue;
        OldNamespace.value;
        oldArrow();
        void oldValue;
        new Legacy();
        (null as unknown as Callable)();
        new (null as unknown as Factory)();
        (null as unknown as Dictionary)['key'];
        void value;
      `);

      const results = await scanner.scanProject(workspaceFolder.uri.fsPath);
      const usageNames = results
        .filter((item) => item.filePath === usageFile && item.kind === 'usage')
        .map((item) => item.name);

      expect(usageNames).toEqual(expect.arrayContaining([
        'OldType',
        'OldEnum',
        'OldValue',
        'OldNamespace',
        'oldArrow',
        'oldValue',
        'Legacy',
        'key',
      ]));
      expect(results).toEqual(expect.arrayContaining([
        expect.objectContaining({ name: 'OldType', kind: 'interface' }),
        expect.objectContaining({ name: 'OldEnum', kind: 'class' }),
        expect.objectContaining({ name: 'OldValue', kind: 'property' }),
        expect.objectContaining({ name: 'OldNamespace', kind: 'class' }),
        expect.objectContaining({ name: 'oldArrow', kind: 'function' }),
        expect.objectContaining({ name: 'oldValue', kind: 'property' }),
        expect.objectContaining({ name: 'oldParameter', kind: 'property' }),
        expect.objectContaining({ name: 'constructor', kind: 'method' }),
        expect.objectContaining({ name: 'call', kind: 'method' }),
        expect.objectContaining({ name: 'new', kind: 'method' }),
        expect.objectContaining({ name: '[index]', kind: 'property' }),
      ]));
    });

    it('should follow deprecated base and interface members without duplicates', async () => {
      fs.writeFileSync(path.join(tempDir, 'tsconfig.json'), JSON.stringify({
        compilerOptions: { target: 'ES2020', module: 'commonjs' },
        include: ['src/**/*'],
      }));
      const srcDir = path.join(tempDir, 'src');
      fs.mkdirSync(srcDir);
      const filePath = path.join(srcDir, 'inheritance.ts');
      fs.writeFileSync(filePath, `
        interface Contract {
          /** @deprecated */ oldInterfaceMethod(): void;
        }
        class Implementation implements Contract {
          public oldInterfaceMethod(): void {}
        }
        class Base {
          /** @deprecated */ public oldBaseMethod(): void {}
        }
        class Child extends Base {
          public override oldBaseMethod(): void {}
        }
        new Implementation().oldInterfaceMethod();
        new Child().oldBaseMethod();
      `);

      const scans = await Promise.all([
        scanner.scanProject(workspaceFolder.uri.fsPath),
        scanner.scanFolder(workspaceFolder.uri.fsPath, srcDir),
        scanner.scanSpecificFiles(workspaceFolder.uri.fsPath, [filePath]),
      ]);

      for (const results of scans) {
        const usages = results.filter(
          (item) => item.filePath === filePath && item.kind === 'usage' &&
            (item.name === 'oldInterfaceMethod' || item.name === 'oldBaseMethod'),
        );
        expect(usages).toHaveLength(2);
        expect(new Set(usages.map((item) => `${item.line}:${item.character}`)).size).toBe(2);
      }
    });

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
      const results = await scanner.scanProject(workspaceFolder.uri.fsPath);
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
      const results = await scanner.scanProject(workspaceFolder.uri.fsPath);
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
      const results = await scanner.scanProject(workspaceFolder.uri.fsPath);
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
      const results = await scanner.scanProject(workspaceFolder.uri.fsPath);
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

      const results = await scanner.scanProject(workspaceFolder.uri.fsPath);

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
      const results = await scanner.scanProject(workspaceFolder.uri.fsPath);
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
      const results = await scanner.scanProject(workspaceFolder.uri.fsPath);
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
      const results = await scanner.scanProject(workspaceFolder.uri.fsPath);
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
      const results = await scanner.scanProject(workspaceFolder.uri.fsPath);
      expect(results).toBeDefined();
    });
  });

  describe('Declaration File Filtering', () => {
    it('should detect usages resolved through project declaration files', async () => {
      fs.writeFileSync(path.join(tempDir, 'tsconfig.json'), JSON.stringify({
        compilerOptions: { target: 'ES2020', module: 'commonjs' },
        include: ['src/**/*'],
      }));
      const srcDir = path.join(tempDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(path.join(srcDir, 'api.d.ts'), `export declare class Api {
        /** @deprecated Use newMethod instead */
        oldMethod(): void;
      }`);
      const usageFile = path.join(srcDir, 'component.ts');
      fs.writeFileSync(usageFile, `import { Api } from './api';
        declare const instance: Api;
        instance.oldMethod();`);

      const results = await scanner.scanProject(workspaceFolder.uri.fsPath);

      expect(results).toContainEqual(expect.objectContaining({
        name: 'oldMethod',
        filePath: usageFile,
        kind: 'usage',
      }));
    });

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
      const results = await scanner.scanProject(workspaceFolder.uri.fsPath);
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
      const results = await scanner.scanProject(workspaceFolder.uri.fsPath);
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
      expect(scanner.scanProject(workspaceFolder.uri.fsPath)).resolves.toBeDefined();
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
      await scanner.scanProject(workspaceFolder.uri.fsPath, callback);
      expect(scannedFiles.length).toBeGreaterThan(0);
      scannedFiles.forEach(file => {
        expect(file).not.toContain('node_modules');
      });
    });
  });
  describe('Portable platform', () => {
    // The scanner reaches the filesystem only through ScannerPlatform, which is
    // what lets the same code run in a browser over files fetched from an API.
    // This scans a file map with no disk behind it at all: every path below is
    // virtual, and nothing is written to tempDir.
    const virtualFiles = new Map<string, string>([
      [
        '/tsconfig.json',
        JSON.stringify({
          compilerOptions: { target: 'ES2020', module: 'commonjs', noLib: true },
          include: ['src'],
        }),
      ],
      [
        '/src/api.ts',
        [
          '/** @deprecated Use newApi instead */',
          'export function oldApi(): void {}',
          '/** @deprecated */',
          'export function bareApi(): void {}',
          'export function newApi(): void {}',
        ].join('\n'),
      ],
      ['/src/app.ts', ['import { oldApi } from "./api";', 'oldApi();'].join('\n')],
    ]);

    const virtualPlatform = (): ScannerPlatform => {
      const directories = new Set(['/', '/src']);
      // A Node host hands the scanner whatever `path.resolve` produced, which on
      // Windows is a backslashed path on the current drive. The virtual keys are
      // posix, so every lookup is folded to that form -- in a browser the two are
      // already the same and this is a no-op.
      const key = (filePath: string) =>
        filePath.replace(/\\/g, '/').replace(/^[A-Za-z]:/, '');
      const read = (filePath: string) => virtualFiles.get(key(filePath));
      return {
        directoryExists: (directoryPath) => directories.has(key(directoryPath)),
        readFile: read,
        modifiedMs: () => 0,
        readDirectory: (directoryPath) => {
          const folder = key(directoryPath);
          const prefix = folder === '/' || folder === '' ? '/' : `${folder}/`;
          const entries = new Map<string, { name: string; isDirectory: boolean }>();
          for (const filePath of virtualFiles.keys()) {
            if (!filePath.startsWith(prefix)) {
              continue;
            }
            const remainder = filePath.slice(prefix.length);
            const slash = remainder.indexOf('/');
            const name = slash === -1 ? remainder : remainder.slice(0, slash);
            entries.set(name, { name, isDirectory: slash !== -1 });
          }
          return [...entries.values()];
        },
        createCompilerHost: () => ({
          fileExists: (filePath: string) => read(filePath) !== undefined,
          readFile: read,
          getSourceFile: (filePath: string, languageVersion: ts.ScriptTarget) => {
            const contents = read(filePath);
            return contents === undefined
              ? undefined
              : ts.createSourceFile(key(filePath), contents, languageVersion, true);
          },
          getDefaultLibFileName: () => '/lib.d.ts',
          writeFile: () => undefined,
          getCurrentDirectory: () => '/',
          getCanonicalFileName: (filePath: string) => filePath,
          useCaseSensitiveFileNames: () => true,
          getNewLine: () => '\n',
        }),
        parseConfigHost: {
          useCaseSensitiveFileNames: true,
          readDirectory: () => [...virtualFiles.keys()],
          fileExists: (filePath: string) => read(filePath) !== undefined,
          readFile: read,
        },
      };
    };

    it('scans a file map with no filesystem behind it', async () => {
      const portable = new Scanner(ignoreManager, tagsManager, undefined, virtualPlatform());

      const items = await portable.scanProject('/');

      const declarations = items.filter((item) => item.kind !== 'usage');
      const usages = items.filter((item) => item.kind === 'usage');
      expect(declarations.map((item) => item.name).sort()).toEqual(['bareApi', 'oldApi']);
      expect(usages.length).toBeGreaterThan(0);
      expect(usages.every((item) => item.deprecatedDeclaration?.name === 'oldApi')).toBe(true);
      expect(items.some((item) => item.deprecationReason === 'Use newApi instead')).toBe(true);
    });

    it('reports a virtual folder that does not exist rather than reading the disk', async () => {
      const portable = new Scanner(ignoreManager, tagsManager, undefined, virtualPlatform());

      await expect(portable.scanFolder('/', '/nope')).rejects.toThrow('Folder does not exist');
    });
  });
});
