import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { IgnoreManager } from '../../../src/scanner/ignoreManager';
import { Scanner } from '../../../src/scanner/scanner';

describe('Scanner.scanSpecificFiles (scanFile)', () => {
  let scanner: Scanner;
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
    scanner = new Scanner(ignoreManager);
    tempDir = path.join(__dirname, '..', '..', 'fixtures', 'test-workspace-scanfile');
    workspaceFolder = {
      uri: vscode.Uri.file(tempDir),
      name: 'test-workspace',
      index: 0,
    };
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

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should scan a single file with deprecated items', async () => {
    const testFile = path.join(tempDir, 'test.ts');
    fs.writeFileSync(
      testFile,
      `
export class TestClass {
  /**
   * @deprecated Use newMethod instead
   */
  oldMethod() {
    return 'old';
  }

  newMethod() {
    return 'new';
  }

  useOldMethod() {
    this.oldMethod();
  }
}
      `
    );
    const results = await scanner.scanSpecificFiles(workspaceFolder, [testFile]);
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.name === 'oldMethod')).toBe(true);
  });

  it('should return empty array for file without deprecated items', async () => {
    const testFile = path.join(tempDir, 'clean.ts');
    fs.writeFileSync(
      testFile,
      `
export class CleanClass {
  method() {
    return 'clean';
  }
}
      `
    );
    const results = await scanner.scanSpecificFiles(workspaceFolder, [testFile]);
    expect(results).toEqual([]);
  });

  it('should only return results from the specified file', async () => {
    const file1 = path.join(tempDir, 'file1.ts');
    const file2 = path.join(tempDir, 'file2.ts');
    fs.writeFileSync(
      file1,
      `
export class File1Class {
  /**
   * @deprecated
   */
  file1Method() {}

  useFile1() {
    this.file1Method();
  }
}
      `
    );

    fs.writeFileSync(
      file2,
      `
export class File2Class {
  /**
   * @deprecated
   */
  file2Method() {}

  useFile2() {
    this.file2Method();
  }
}
      `
    );
    const results = await scanner.scanSpecificFiles(workspaceFolder, [file1]);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.filePath.includes('file1.ts'))).toBe(true);
    expect(results.some((r) => r.filePath.includes('file2.ts'))).toBe(false);
  });

  it('should handle multiple deprecated items in a single file', async () => {
    const testFile = path.join(tempDir, 'multiple.ts');
    fs.writeFileSync(
      testFile,
      `
export class MultipleClass {
  /**
   * @deprecated
   */
  oldMethod1() {}

  /**
   * @deprecated
   */
  oldMethod2() {}

  /**
   * @deprecated
   */
  oldProp: string = '';

  useOld() {
    this.oldMethod1();
    this.oldMethod2();
  }
}
      `
    );
    const results = await scanner.scanSpecificFiles(workspaceFolder, [testFile]);
    expect(results.length).toBeGreaterThan(2);
    expect(results.some((r) => r.name === 'oldMethod1')).toBe(true);
    expect(results.some((r) => r.name === 'oldMethod2')).toBe(true);
  });

  it('should respect ignore rules', async () => {
    const testFile = path.join(tempDir, 'ignored.ts');
    fs.writeFileSync(
      testFile,
      `
export class IgnoredClass {
  /**
   * @deprecated
   */
  ignoredMethod() {}

  useIgnored() {
    this.ignoredMethod();
  }
}
      `
    );
    ignoreManager.ignoreMethod(testFile, 'ignoredMethod');
    const results = await scanner.scanSpecificFiles(workspaceFolder, [testFile]);
    expect(results.length).toBe(0);
  });

  it('should return empty array when given empty file list', async () => {
    const results = await scanner.scanSpecificFiles(workspaceFolder, []);
    expect(results).toEqual([]);
  });

  it('should handle file paths with different separators', async () => {
    const testFile = path.join(tempDir, 'separators.ts');
    fs.writeFileSync(
      testFile,
      `
export class SeparatorClass {
  /**
   * @deprecated
   */
  method() {}

  useMethod() {
    this.method();
  }
}
      `
    );
    const normalizedPath = testFile.replace(/\\\\/g, '/');
    const results = await scanner.scanSpecificFiles(workspaceFolder, [normalizedPath]);
    expect(results.length).toBeGreaterThan(0);
  });

  it('should handle nested file paths', async () => {
    const nestedDir = path.join(tempDir, 'nested', 'deep', 'folder');
    fs.mkdirSync(nestedDir, { recursive: true });
    const testFile = path.join(nestedDir, 'nested.ts');
    fs.writeFileSync(
      testFile,
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
    const results = await scanner.scanSpecificFiles(workspaceFolder, [testFile]);
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.name === 'nestedMethod')).toBe(true);
  });
});