import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { TagsManager } from '../../../src/config/tagsManager';
import { IgnoreManager } from '../../../src/scanner/ignoreManager';
import { Scanner } from '../../../src/scanner/scanner';

describe('Scanner.scanFolder', () => {
    let scanner: Scanner;
    let tagsManager: TagsManager;
    let mockContext: any;
    let ignoreManager: IgnoreManager;
    let tempDir: string;
    let workspaceFolder: vscode.WorkspaceFolder;

    beforeEach(() => {
        mockContext = {
            subscriptions: [],
            workspaceState: {
                get: jest.fn().mockReturnValue(undefined),
                update: jest.fn().mockResolvedValue(undefined),
            },
        };
        ignoreManager = new IgnoreManager(mockContext);
        tagsManager = new TagsManager(mockContext);
        scanner = new Scanner(ignoreManager, tagsManager);
        tempDir = path.join(__dirname, '..', '..', 'fixtures', 'test-workspace-scanfolder');
        workspaceFolder = {
            uri: vscode.Uri.file(tempDir),
            name: 'test-workspace',
            index: 0,
        };
    });

    afterEach(() => {
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    it('should be defined', () => {
        expect(scanner.scanFolder).toBeDefined();
    });

    describe('Path Normalization', () => {
        beforeEach(() => {
            fs.mkdirSync(tempDir, { recursive: true });
            const tsconfigPath = path.join(tempDir, 'tsconfig.json');
            fs.writeFileSync(
                tsconfigPath,
                JSON.stringify({
                    compilerOptions: {
                        target: 'ES2020',
                        module: 'commonjs',
                        strict: true,
                    },
                    include: ['**/*.ts'],
                })
            );
        });

        it('should handle Windows drive letter case differences (C:\\ vs c:\\\\)', async () => {
            const subFolder = path.join(tempDir, 'src');
            fs.mkdirSync(subFolder, { recursive: true });
            const testFile = path.join(subFolder, 'test.ts');
            fs.writeFileSync(
                testFile,
                `
export class MyClass {
  /**
   * @deprecated Use newMethod instead
   */
  oldMethod() {}
  
  useOld() {
    this.oldMethod();
  }
}
        `
            );
            let targetPath = subFolder;
            if (process.platform === 'win32' && targetPath[0] === targetPath[0].toLowerCase()) {
                targetPath = targetPath[0].toUpperCase() + targetPath.slice(1);
            }
            const results = await scanner.scanFolder(workspaceFolder, targetPath);
            expect(results.length).toBeGreaterThan(0);
            expect(results.some((r) => r.name === 'oldMethod')).toBe(true);
        });

        it('should handle mixed path separators (forward and backslashes)', async () => {
            const subFolder = path.join(tempDir, 'components');
            fs.mkdirSync(subFolder, { recursive: true });
            const testFile = path.join(subFolder, 'component.ts');
            fs.writeFileSync(
                testFile,
                `
export class Component {
  /**
   * @deprecated
   */
  deprecatedProp: string = '';
}
        `
            );
            const mixedPath = subFolder.replace(/\\\\/g, '/');
            const results = await scanner.scanFolder(workspaceFolder, mixedPath);
            expect(results).toBeDefined();
        });

        it('should only include files within the target folder', async () => {
            const srcFolder = path.join(tempDir, 'src');
            const libFolder = path.join(tempDir, 'lib');
            fs.mkdirSync(srcFolder, { recursive: true });
            fs.mkdirSync(libFolder, { recursive: true });
            fs.writeFileSync(
                path.join(srcFolder, 'src-file.ts'),
                `
export class SrcClass {
  /**
   * @deprecated
   */
  srcMethod() {}
  
  useSrc() {
    this.srcMethod();
  }
}
        `
            );
            fs.writeFileSync(
                path.join(libFolder, 'lib-file.ts'),
                `
export class LibClass {
  /**
   * @deprecated
   */
  libMethod() {}
  
  useLib() {
    this.libMethod();
  }
}
        `
            );
            const results = await scanner.scanFolder(workspaceFolder, srcFolder);
            expect(results.length).toBeGreaterThan(0);
            expect(results.every((r) => r.filePath.includes('src-file.ts'))).toBe(true);
            expect(results.some((r) => r.filePath.includes('lib-file.ts'))).toBe(false);
        });

        it('should scan nested folders correctly', async () => {
            const srcFolder = path.join(tempDir, 'src');
            const nestedFolder = path.join(srcFolder, 'nested', 'deep');
            fs.mkdirSync(nestedFolder, { recursive: true });
            fs.writeFileSync(
                path.join(nestedFolder, 'nested.ts'),
                `
export class NestedClass {
  /**
   * @deprecated
   */
  nestedMethod() {}
  
  useNested() {
    this.nestedMethod();
  }
}
        `
            );
            const results = await scanner.scanFolder(workspaceFolder, srcFolder);
            expect(results.length).toBeGreaterThan(0);
            expect(results.some((r) => r.name === 'nestedMethod')).toBe(true);
        });

        it('should throw error if target folder is not within workspace', async () => {
            const outsideFolder = path.join(__dirname, '..', '..', 'outside');
            await expect(scanner.scanFolder(workspaceFolder, outsideFolder)).rejects.toThrow(
                'Target folder must be within workspace'
            );
        });

        it('should throw error if target folder does not exist', async () => {
            const nonExistentFolder = path.join(tempDir, 'non-existent');
            await expect(scanner.scanFolder(workspaceFolder, nonExistentFolder)).rejects.toThrow(
                'Folder does not exist'
            );
        });
    });
});