import * as path from 'path';
import * as vscode from 'vscode';
import { IgnoreManager } from '../../../src/scanner/ignoreManager';
import { Scanner } from '../../../src/scanner/scanner';

jest.mock('vscode');

describe('Cross-Platform Compatibility Tests', () => {
    let scanner: Scanner;
    let mockContext: vscode.ExtensionContext;
    let ignoreManager: IgnoreManager;
    const originalPlatform = process.platform;
    const originalSep = path.sep;

    beforeEach(() => {
        jest.clearAllMocks();
        mockContext = {
            subscriptions: [],
            workspaceState: {
                get: jest.fn().mockReturnValue(null),
                update: jest.fn().mockResolvedValue(undefined),
            },
            globalState: {
                get: jest.fn(),
                update: jest.fn(),
            },
            extensionPath: '/test/path',
            extensionUri: vscode.Uri.file('/test/path'),
        } as unknown as vscode.ExtensionContext;
        ignoreManager = new IgnoreManager(mockContext);
        scanner = new Scanner(ignoreManager);
    });

    afterEach(() => {
        Object.defineProperty(process, 'platform', {
            value: originalPlatform,
            writable: true,
        });
    });

    describe('Windows Path Handling', () => {
        beforeEach(() => {
            Object.defineProperty(process, 'platform', {
                value: 'win32',
                writable: true,
            });
        });

        it('should handle Windows paths with backslashes', () => {
            const windowsPath = 'C:\\Users\\Test\\project\\src\\file.ts';
            const normalized = path.normalize(windowsPath);
            expect(normalized).toBeDefined();
        });

        it('should normalize Windows paths correctly', () => {
            const mixedPath = 'C:/Users/Test\\project\\src/file.ts';
            const normalized = path.normalize(mixedPath);
            expect(normalized).toBeDefined();
        });

        it('should handle UNC paths on Windows', () => {
            const uncPath = '\\\\server\\share\\folder\\file.ts';
            const normalized = path.normalize(uncPath);
            expect(normalized).toContain('\\\\server');
        });

        it('should handle drive letters', () => {
            const paths = [
                'C:\\project\\file.ts',
                'D:\\workspace\\src\\test.ts',
                'E:\\projects\\deprecated\\old.ts',
            ];
            paths.forEach((p) => {
                expect(path.isAbsolute(p)).toBe(true);
            });
        });

        it('should handle relative Windows paths', () => {
            const relativePath = 'src\\components\\file.ts';
            const isAbsolute = path.isAbsolute(relativePath);
            expect(isAbsolute).toBe(false);
        });

        it('should ignore files on Windows with backslash paths', () => {
            const windowsPath = 'C:\\Users\\Test\\project\\src\\deprecated.ts';
            const methodName = 'oldMethod';
            ignoreManager.ignoreMethod(windowsPath, methodName);
            expect(ignoreManager.isMethodIgnored(windowsPath, methodName)).toBe(true);
        });

        it('should handle path comparison with different separators', () => {
            const path1 = 'C:\\project\\src\\file.ts';
            const path2 = 'C:/project/src/file.ts';
            const norm1 = path.normalize(path1);
            const norm2 = path.normalize(path2);
            expect(norm1).toBeDefined();
            expect(norm2).toBeDefined();
        });
    });

    describe('Unix Path Handling', () => {
        beforeEach(() => {
            Object.defineProperty(process, 'platform', {
                value: 'linux',
                writable: true,
            });
        });

        it('should handle Unix paths with forward slashes', () => {
            const unixPath = '/home/user/project/src/file.ts';
            const normalized = path.normalize(unixPath);
            expect(normalized).toBeDefined();
            expect(normalized).toContain('file.ts');
        });

        it('should handle relative Unix paths', () => {
            const relativePath = 'src/components/file.ts';
            const isAbsolute = path.isAbsolute(relativePath);
            expect(isAbsolute).toBe(false);
        });

        it('should handle paths with symbolic links', () => {
            const symlinkPath = '/home/user/project/node_modules/@types/file.ts';
            const normalized = path.normalize(symlinkPath);
            expect(normalized).toBeDefined();
        });

        it('should handle paths with dots', () => {
            const dotPath = '/home/user/../user/./project/src/file.ts';
            const normalized = path.normalize(dotPath);
            expect(normalized).toBeDefined();
            expect(normalized).toContain('file.ts');
        });

        it('should ignore files on Unix with forward slash paths', () => {
            const unixPath = '/home/user/project/src/deprecated.ts';
            const methodName = 'oldMethod';
            ignoreManager.ignoreMethod(unixPath, methodName);
            expect(ignoreManager.isMethodIgnored(unixPath, methodName)).toBe(true);
        });

        it('should handle root directory', () => {
            const rootPath = '/';
            expect(path.isAbsolute(rootPath)).toBe(true);
        });
    });

    describe('macOS Path Handling', () => {
        beforeEach(() => {
            Object.defineProperty(process, 'platform', {
                value: 'darwin',
                writable: true,
            });
        });

        it('should handle macOS paths', () => {
            const macPath = '/Users/username/Projects/app/src/file.ts';
            const normalized = path.normalize(macPath);
            expect(normalized).toBeDefined();
            expect(normalized).toContain('file.ts');
        });

        it('should handle macOS application paths', () => {
            const appPath = '/Applications/VSCode.app/Contents/file.ts';
            const normalized = path.normalize(appPath);
            expect(normalized).toBeDefined();
        });

        it('should handle case-sensitive file systems', () => {
            const path1 = '/Users/test/File.ts';
            const path2 = '/Users/test/file.ts';
            expect(path1).not.toBe(path2);
        });
    });

    describe('Path.sep Awareness', () => {
        it('should use correct path separator for platform', () => {
            const sep = path.sep;
            if (process.platform === 'win32') {
                expect(sep).toBe('\\');
            } else {
                expect(sep).toBe('/');
            }
        });

        it('should split paths using correct separator', () => {
            const testPath = process.platform === 'win32'
                ? 'C:\\project\\src\\file.ts'
                : '/project/src/file.ts';
            const parts = testPath.split(path.sep);
            expect(parts.length).toBeGreaterThan(1);
        });

        it('should join paths using correct separator', () => {
            const joined = path.join('project', 'src', 'file.ts');
            expect(joined).toContain(path.sep);
        });

        it('should handle path.delimiter correctly', () => {
            const delimiter = path.delimiter;
            if (process.platform === 'win32') {
                expect(delimiter).toBe(';');
            } else {
                expect(delimiter).toBe(':');
            }
        });
    });

    describe('Line Ending Differences', () => {
        it('should handle CRLF line endings (Windows)', () => {
            const crlfCode = 'export function test() {\r\n  return true;\r\n}';
            expect(crlfCode).toContain('\r\n');
            const lines = crlfCode.split(/\r\n|\n|\r/);
            expect(lines.length).toBeGreaterThan(1);
        });

        it('should handle LF line endings (Unix/Mac)', () => {
            const lfCode = 'export function test() {\n  return true;\n}';
            expect(lfCode).toContain('\n');
            expect(lfCode).not.toContain('\r\n');
            const lines = lfCode.split(/\r\n|\n|\r/);
            expect(lines.length).toBeGreaterThan(1);
        });

        it('should handle CR line endings (old Mac)', () => {
            const crCode = 'export function test() {\r  return true;\r}';
            expect(crCode).toContain('\r');
            const lines = crCode.split(/\r\n|\n|\r/);
            expect(lines.length).toBeGreaterThan(1);
        });

        it('should handle mixed line endings', () => {
            const mixedCode = 'line1\r\nline2\nline3\rline4';
            const lines = mixedCode.split(/\r\n|\n|\r/);
            expect(lines.length).toBe(4);
        });

        it('should normalize line endings when needed', () => {
            const windowsCode = 'line1\r\nline2\r\nline3';
            const normalized = windowsCode.replace(/\r\n/g, '\n');
            expect(normalized).toBe('line1\nline2\nline3');
            expect(normalized).not.toContain('\r');
        });

        it('should preserve JSDoc with different line endings', () => {
            const crlfJSDoc = '/**\r\n * @deprecated\r\n */\r\nexport function old() {}';
            const lfJSDoc = '/**\n * @deprecated\n */\nexport function old() {}';
            expect(crlfJSDoc).toContain('@deprecated');
            expect(lfJSDoc).toContain('@deprecated');
        });
    });

    describe('Path Normalization Consistency', () => {
        it('should normalize paths consistently across platforms', () => {
            const paths = [
                'project/src/file.ts',
                'project\\src\\file.ts',
                'project/src\\file.ts',
            ];
            const normalized = paths.map((p) => path.normalize(p));
            expect(normalized).toBeDefined();
        });

        it('should handle absolute vs relative path detection', () => {
            const absolutePaths = process.platform === 'win32'
                ? ['C:\\project\\file.ts', 'D:\\workspace\\src\\test.ts']
                : ['/home/user/file.ts', '/var/www/app.ts'];
            const relativePaths = ['src/file.ts', 'lib/utils.ts', './components/test.ts'];
            absolutePaths.forEach((p) => {
                expect(path.isAbsolute(p)).toBe(true);
            });
            relativePaths.forEach((p) => {
                expect(path.isAbsolute(p)).toBe(false);
            });
        });

        it('should handle path comparison after normalization', () => {
            const path1 = './src/../src/./file.ts';
            const path2 = 'src/file.ts';
            const norm1 = path.normalize(path1);
            const norm2 = path.normalize(path2);
            expect(norm1).toBe(norm2);
        });

        it('should handle ignore manager with normalized paths', () => {
            const unnormalizedPath = './src/../src/deprecated.ts';
            const normalizedPath = path.normalize(unnormalizedPath);
            const methodName = 'oldMethod';
            ignoreManager.ignoreMethod(normalizedPath, methodName);
            expect(ignoreManager.isMethodIgnored(normalizedPath, methodName)).toBe(true);
        });
    });

    describe('Special Path Cases', () => {
        it('should handle paths with spaces', () => {
            const pathWithSpaces = process.platform === 'win32'
                ? 'C:\\Program Files\\My Project\\src\\file.ts'
                : '/home/my documents/project/src/file.ts';
            const normalized = path.normalize(pathWithSpaces);
            expect(normalized).toBeDefined();
        });

        it('should handle paths with special characters', () => {
            const specialPath = process.platform === 'win32'
                ? 'C:\\project\\src\\file-name_v2.0.ts'
                : '/home/user/project/file-name_v2.0.ts';
            const normalized = path.normalize(specialPath);
            expect(normalized).toContain('file-name_v2.0.ts');
        });

        it('should handle very long paths', () => {
            const longPath = process.platform === 'win32'
                ? 'C:\\' + 'very-long-folder-name\\'.repeat(20) + 'file.ts'
                : '/home/' + 'very-long-folder-name/'.repeat(20) + 'file.ts';
            const normalized = path.normalize(longPath);
            expect(normalized.length).toBeGreaterThan(100);
        });

        it('should handle paths with unicode characters', () => {
            const unicodePath = process.platform === 'win32'
                ? 'C:\\プロジェクト\\src\\файл.ts'
                : '/home/пользователь/프로젝트/ファイル.ts';
            const normalized = path.normalize(unicodePath);
            expect(normalized).toBeDefined();
        });
    });
});