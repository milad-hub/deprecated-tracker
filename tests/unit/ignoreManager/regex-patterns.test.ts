import * as vscode from 'vscode';
import { IgnoreRules } from '../../../src/interfaces';
import { IgnoreManager } from '../../../src/scanner/ignoreManager';

describe('IgnoreManager - Regex Patterns', () => {
    let mockContext: vscode.ExtensionContext;
    let ignoreManager: IgnoreManager;
    let storedRules: IgnoreRules | undefined;

    beforeEach(() => {
        storedRules = undefined;
        const extensionPath = '/test/path';
        const extensionUri = vscode.Uri.file(extensionPath);
        mockContext = {
            subscriptions: [],
            workspaceState: {
                get: jest.fn().mockImplementation(() => storedRules),
                update: jest.fn().mockImplementation((key, value) => {
                    storedRules = value;
                    return Promise.resolve();
                }),
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
    });

    describe('addFilePattern', () => {
        it('should add valid file pattern', () => {
            const result = ignoreManager.addFilePattern('.*\\.test\\.ts$');
            expect(result).toBe(true);
            const rules = ignoreManager.getAllRules();
            expect(rules.filePatterns).toContain('.*\\.test\\.ts$');
        });

        it('should reject invalid regex pattern', () => {
            const result = ignoreManager.addFilePattern('([invalid');
            expect(result).toBe(false);
            const rules = ignoreManager.getAllRules();
            expect(rules.filePatterns).not.toContain('([invalid');
        });

        it('should not add duplicate patterns', () => {
            ignoreManager.addFilePattern('.*\\.test\\.ts$');
            ignoreManager.addFilePattern('.*\\.test\\.ts$');
            const rules = ignoreManager.getAllRules();
            const count = rules.filePatterns?.filter((p) => p === '.*\\.test\\.ts$').length;
            expect(count).toBe(1);
        });

        it('should add multiple different patterns', () => {
            ignoreManager.addFilePattern('.*\\.test\\.ts$');
            ignoreManager.addFilePattern('.*\\.spec\\.ts$');
            const rules = ignoreManager.getAllRules();
            expect(rules.filePatterns).toHaveLength(2);
            expect(rules.filePatterns).toContain('.*\\.test\\.ts$');
            expect(rules.filePatterns).toContain('.*\\.spec\\.ts$');
        });
    });

    describe('addMethodPattern', () => {
        it('should add valid method pattern', () => {
            const result = ignoreManager.addMethodPattern('^_private.*');
            expect(result).toBe(true);
            const rules = ignoreManager.getAllRules();
            expect(rules.methodPatterns).toContain('^_private.*');
        });

        it('should reject invalid regex pattern', () => {
            const result = ignoreManager.addMethodPattern('[unclosed');
            expect(result).toBe(false);
            const rules = ignoreManager.getAllRules();
            expect(rules.methodPatterns).not.toContain('[unclosed');
        });

        it('should not add duplicate patterns', () => {
            ignoreManager.addMethodPattern('^_private.*');
            ignoreManager.addMethodPattern('^_private.*');
            const rules = ignoreManager.getAllRules();
            const count = rules.methodPatterns?.filter((p) => p === '^_private.*').length;
            expect(count).toBe(1);
        });
    });

    describe('isFileIgnored with patterns', () => {
        it('should match file using regex pattern', () => {
            ignoreManager.addFilePattern('.*\\.test\\.ts$');
            expect(ignoreManager.isFileIgnored('/project/foo.test.ts')).toBe(true);
            expect(ignoreManager.isFileIgnored('/project/bar.test.ts')).toBe(true);
        });

        it('should not match file that does not match pattern', () => {
            ignoreManager.addFilePattern('.*\\.test\\.ts$');
            expect(ignoreManager.isFileIgnored('/project/foo.ts')).toBe(false);
            expect(ignoreManager.isFileIgnored('/project/foo.test.js')).toBe(false);
        });

        it('should match complex path patterns', () => {
            ignoreManager.addFilePattern('.*/test/.*');
            expect(ignoreManager.isFileIgnored('/project/test/foo.ts')).toBe(true);
            expect(ignoreManager.isFileIgnored('/project/test/nested/bar.ts')).toBe(true);
            expect(ignoreManager.isFileIgnored('/project/src/foo.ts')).toBe(false);
        });

        it('should work with exact matches and patterns together', () => {
            ignoreManager.ignoreFile('/project/exact.ts');
            ignoreManager.addFilePattern('.*\\.test\\.ts$');
            expect(ignoreManager.isFileIgnored('/project/exact.ts')).toBe(true);
            expect(ignoreManager.isFileIgnored('/project/foo.test.ts')).toBe(true);
            expect(ignoreManager.isFileIgnored('/project/other.ts')).toBe(false);
        });

        it('should handle invalid regex patterns gracefully', () => {
            ignoreManager.addFilePattern('.*\\.test\\.ts$');
            const rules = ignoreManager.getAllRules();
            rules.filePatterns?.push('([invalid');
            expect(ignoreManager.isFileIgnored('/project/foo.test.ts')).toBe(true);
        });
    });

    describe('isMethodIgnored with patterns', () => {
        it('should match method using regex pattern', () => {
            ignoreManager.addMethodPattern('^_private.*');
            expect(ignoreManager.isMethodIgnored('/project/file.ts', '_privateMethod')).toBe(true);
            expect(ignoreManager.isMethodIgnored('/project/file.ts', '_privateHelper')).toBe(true);
        });

        it('should not match method that does not match pattern', () => {
            ignoreManager.addMethodPattern('^_private.*');
            expect(ignoreManager.isMethodIgnored('/project/file.ts', 'publicMethod')).toBe(false);
            expect(ignoreManager.isMethodIgnored('/project/file.ts', 'private_method')).toBe(false);
        });

        it('should match methods with multiple patterns', () => {
            ignoreManager.addMethodPattern('^_.*');
            ignoreManager.addMethodPattern('.*Test$');
            expect(ignoreManager.isMethodIgnored('/project/file.ts', '_private')).toBe(true);
            expect(ignoreManager.isMethodIgnored('/project/file.ts', 'runTest')).toBe(true);
            expect(ignoreManager.isMethodIgnored('/project/file.ts', 'normalMethod')).toBe(false);
        });

        it('should work with exact matches and patterns together', () => {
            ignoreManager.ignoreMethod('/project/file.ts', 'exactMethod');
            ignoreManager.addMethodPattern('^_.*');
            expect(ignoreManager.isMethodIgnored('/project/file.ts', 'exactMethod')).toBe(true);
            expect(ignoreManager.isMethodIgnored('/project/file.ts', '_privateMethod')).toBe(true);
            expect(ignoreManager.isMethodIgnored('/project/file.ts', 'other')).toBe(false);
        });
    });

    describe('removeFilePattern', () => {
        it('should remove file pattern', () => {
            ignoreManager.addFilePattern('.*\\.test\\.ts$');
            ignoreManager.removeFilePattern('.*\\.test\\.ts$');
            const rules = ignoreManager.getAllRules();
            expect(rules.filePatterns).not.toContain('.*\\.test\\.ts$');
        });

        it('should not affect other patterns when removing one', () => {
            ignoreManager.addFilePattern('.*\\.test\\.ts$');
            ignoreManager.addFilePattern('.*\\.spec\\.ts$');
            ignoreManager.removeFilePattern('.*\\.test\\.ts$');
            const rules = ignoreManager.getAllRules();
            expect(rules.filePatterns).not.toContain('.*\\.test\\.ts$');
            expect(rules.filePatterns).toContain('.*\\.spec\\.ts$');
        });
    });

    describe('removeMethodPattern', () => {
        it('should remove method pattern', () => {
            ignoreManager.addMethodPattern('^_.*');
            ignoreManager.removeMethodPattern('^_.*');
            const rules = ignoreManager.getAllRules();
            expect(rules.methodPatterns).not.toContain('^_.*');
        });

        it('should not affect other patterns when removing one', () => {
            ignoreManager.addMethodPattern('^_.*');
            ignoreManager.addMethodPattern('.*Test$');
            ignoreManager.removeMethodPattern('^_.*');
            const rules = ignoreManager.getAllRules();
            expect(rules.methodPatterns).not.toContain('^_.*');
            expect(rules.methodPatterns).toContain('.*Test$');
        });
    });

    describe('clearAll', () => {
        it('should clear all patterns along with exact matches', () => {
            ignoreManager.ignoreFile('/project/file.ts');
            ignoreManager.ignoreMethod('/project/file.ts', 'method');
            ignoreManager.addFilePattern('.*\\.test\\.ts$');
            ignoreManager.addMethodPattern('^_.*');
            ignoreManager.clearAll();
            const rules = ignoreManager.getAllRules();
            expect(rules.files).toHaveLength(0);
            expect(Object.keys(rules.methods)).toHaveLength(0);
            expect(rules.filePatterns).toHaveLength(0);
            expect(rules.methodPatterns).toHaveLength(0);
        });
    });

    describe('common use cases', () => {
        it('should ignore all test files', () => {
            ignoreManager.addFilePattern('.*\\.test\\.ts$');
            ignoreManager.addFilePattern('.*\\.spec\\.ts$');
            expect(ignoreManager.isFileIgnored('/project/foo.test.ts')).toBe(true);
            expect(ignoreManager.isFileIgnored('/project/bar.spec.ts')).toBe(true);
            expect(ignoreManager.isFileIgnored('/project/src/main.ts')).toBe(false);
        });

        it('should ignore all private methods', () => {
            ignoreManager.addMethodPattern('^_.*');
            ignoreManager.addMethodPattern('^#.*');
            expect(ignoreManager.isMethodIgnored('/project/file.ts', '_privateMethod')).toBe(true);
            expect(ignoreManager.isMethodIgnored('/project/file.ts', '#privateField')).toBe(true);
            expect(ignoreManager.isMethodIgnored('/project/file.ts', 'publicMethod')).toBe(false);
        });

        it('should ignore all methods ending with "Internal"', () => {
            ignoreManager.addMethodPattern('.*Internal$');
            expect(ignoreManager.isMethodIgnored('/project/file.ts', 'doSomethingInternal')).toBe(true);
            expect(ignoreManager.isMethodIgnored('/project/file.ts', 'helperInternal')).toBe(true);
            expect(ignoreManager.isMethodIgnored('/project/file.ts', 'publicApi')).toBe(false);
        });

        it('should ignore files in specific directories', () => {
            ignoreManager.addFilePattern('.*/node_modules/.*');
            ignoreManager.addFilePattern('.*/dist/.*');
            expect(ignoreManager.isFileIgnored('/project/node_modules/package/index.ts')).toBe(true);
            expect(ignoreManager.isFileIgnored('/project/dist/bundle.js')).toBe(true);
            expect(ignoreManager.isFileIgnored('/project/src/main.ts')).toBe(false);
        });
    });

    describe('backward compatibility', () => {
        it('should work with old rules without patterns', () => {
            storedRules = {
                files: ['/project/old.ts'],
                methods: { '/project/old.ts': ['oldMethod'] },
                methodsGlobal: ['globalOld'],
            };
            const manager = new IgnoreManager(mockContext);
            expect(manager.isFileIgnored('/project/old.ts')).toBe(true);
            expect(manager.isMethodIgnored('/project/old.ts', 'oldMethod')).toBe(true);
            expect(manager.isMethodIgnored('/project/any.ts', 'globalOld')).toBe(true);
            const result = manager.addFilePattern('.*\\.test\\.ts$');
            expect(result).toBe(true);
        });
    });
});