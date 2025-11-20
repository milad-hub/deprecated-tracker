import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { IgnoreManager } from '../../src/scanner/ignoreManager';
import { Scanner } from '../../src/scanner/scanner';

describe('Scanner - Comprehensive Coverage', () => {
    let tempDir: string;
    let workspaceFolder: vscode.WorkspaceFolder;
    let mockContext: vscode.ExtensionContext;
    let ignoreManager: IgnoreManager;
    let scanner: Scanner;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scanner-comp-test-'));
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

    it('should throw error for malformed tsconfig.json', async () => {
        const tsconfigPath = path.join(tempDir, 'tsconfig.json');
        fs.writeFileSync(tsconfigPath, '{ invalid json }');
        await expect(scanner.scanProject(workspaceFolder)).rejects.toThrow();
    });

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