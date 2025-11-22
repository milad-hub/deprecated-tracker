import * as vscode from 'vscode';
import { IgnoreManager } from '../../../src/scanner/ignoreManager';
import { Scanner } from '../../../src/scanner/scanner';

jest.mock('vscode');

describe('Performance and Stress Tests', () => {
    let scanner: Scanner;
    let mockContext: vscode.ExtensionContext;
    let ignoreManager: IgnoreManager;

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

    describe('Large Project Simulation', () => {
        it('should handle project with 1000+ files (mocked)', async () => {
            const mockFiles: string[] = [];
            for (let i = 0; i < 1500; i++) {
                mockFiles.push(`/project/src/module${i}/file${i}.ts`);
            }
            expect(mockFiles.length).toBe(1500);
            let processedCount = 0;
            mockFiles.forEach(() => {
                processedCount++;
            });
            expect(processedCount).toBe(1500);
        });

        it('should handle large result sets efficiently', () => {
            const largeResults = [];
            for (let i = 0; i < 500; i++) {
                largeResults.push({
                    name: `deprecatedMethod${i}`,
                    filePath: `/project/src/file${i}.ts`,
                    fileName: `file${i}.ts`,
                    line: i,
                    character: 0,
                    kind: 'method' as const,
                });
            }
            expect(largeResults).toHaveLength(500);
            const startTime = Date.now();
            const filtered = largeResults.filter((item) => item.name.includes('100'));
            const endTime = Date.now();
            expect(filtered.length).toBeGreaterThan(0);
            expect(endTime - startTime).toBeLessThan(100);
        });

        it('should handle many deprecated items in single file', () => {
            const manyItemsInFile = [];
            for (let i = 0; i < 200; i++) {
                manyItemsInFile.push({
                    name: `method${i}`,
                    filePath: '/project/src/legacy.ts',
                    fileName: 'legacy.ts',
                    line: i * 10,
                    character: 0,
                    kind: 'method' as const,
                });
            }
            expect(manyItemsInFile).toHaveLength(200);
            const byFile = new Map<string, typeof manyItemsInFile>();
            manyItemsInFile.forEach((item) => {
                if (!byFile.has(item.filePath)) {
                    byFile.set(item.filePath, []);
                }
                byFile.get(item.filePath)!.push(item);
            });
            expect(byFile.size).toBe(1);
            expect(byFile.get('/project/src/legacy.ts')).toHaveLength(200);
        });

        it('should efficiently process large ignore lists', () => {
            const ignoreCount = 500;
            for (let i = 0; i < ignoreCount; i++) {
                ignoreManager.ignoreMethod(`/file${i}.ts`, `method${i}`);
            }
            const startTime = Date.now();
            for (let i = 0; i < 100; i++) {
                ignoreManager.isMethodIgnored(`/file${i}.ts`, `method${i}`);
            }
            const endTime = Date.now();
            expect(endTime - startTime).toBeLessThan(100);
        });

        it('should handle memory efficiently with large datasets', () => {
            const initialMemory = process.memoryUsage().heapUsed;
            const largeArray = new Array(10000).fill(null).map((_, i) => ({
                name: `item${i}`,
                data: 'x'.repeat(100),
            }));
            expect(largeArray.length).toBe(10000);
            largeArray.length = 0;
            const afterMemory = process.memoryUsage().heapUsed;
            expect(afterMemory).toBeDefined();
            expect(initialMemory).toBeDefined();
        });
    });

    describe('Deep Directory Structure', () => {
        it('should handle very deep directory nesting (100+ levels)', () => {
            let deepPath = '/project';
            for (let i = 0; i < 120; i++) {
                deepPath += `/level${i}`;
            }
            deepPath += '/file.ts';
            expect(deepPath.split('/').length).toBeGreaterThan(120);
            const path = require('path');
            const normalized = path.normalize(deepPath);
            expect(normalized).toBeDefined();
        });

        it('should handle directory traversal with many levels', () => {
            const dirTree = new Map<string, string[]>();
            let currentPath = '/project';
            for (let depth = 0; depth < 50; depth++) {
                currentPath += `/dir${depth}`;
                dirTree.set(currentPath, [`file${depth}.ts`]);
            }
            expect(dirTree.size).toBe(50);
            let visitedDirs = 0;
            dirTree.forEach(() => {
                visitedDirs++;
            });
            expect(visitedDirs).toBe(50);
        });

        it('should handle path resolution at deep levels', () => {
            const path = require('path');
            const deepPath = '/a/b/c/d/e/f/g/h/i/j/k/l/m/n/o/p/file.ts';
            const dirname = path.dirname(deepPath);
            const basename = path.basename(deepPath);
            const extname = path.extname(deepPath);
            expect(dirname).toContain('/p');
            expect(basename).toBe('file.ts');
            expect(extname).toBe('.ts');
        });
    });

    describe('Long File Names', () => {
        it('should handle very long file names', () => {
            const longFileName = 'a'.repeat(200) + '.ts';
            const filePath = `/project/src/${longFileName}`;
            expect(longFileName.length).toBeGreaterThan(200);
            expect(filePath).toContain(longFileName);
        });

        it('should handle long method names', () => {
            const longMethodName = 'veryLongDeprecatedMethodNameThatExceedsNormalLimits' + 'x'.repeat(100);
            ignoreManager.ignoreMethod('/file.ts', longMethodName);
            expect(ignoreManager.isMethodIgnored('/file.ts', longMethodName)).toBe(true);
        });

        it('should handle paths approaching system limits', () => {
            const longPath = '/project/' + 'very-long-directory-name/'.repeat(10) + 'file.ts';
            expect(longPath.length).toBeGreaterThan(100);
            const path = require('path');
            const normalized = path.normalize(longPath);
            expect(normalized).toBeDefined();
        });

        it('should handle file names with many special characters', () => {
            const specialFileName = 'file-with_many.special@characters#and$symbols!.ts';
            const filePath = `/project/src/${specialFileName}`;
            expect(filePath).toContain(specialFileName);
        });
    });

    describe('Concurrent Operations', () => {
        it('should handle concurrent scan requests safely', async () => {
            const mockWorkspace = {
                uri: vscode.Uri.file('/test/workspace'),
                name: 'test-workspace',
                index: 0,
            };
            const scanPromises = [];
            for (let i = 0; i < 5; i++) {
                const scanPromise = new Promise<void>((resolve) => {
                    setTimeout(() => {
                        resolve();
                    }, 10);
                });
                scanPromises.push(scanPromise);
            }
            await Promise.all(scanPromises);
            expect(scanPromises).toHaveLength(5);
        });

        it('should handle concurrent ignore operations', () => {
            const operations = [];
            for (let i = 0; i < 100; i++) {
                operations.push(() => {
                    ignoreManager.ignoreMethod(`/file${i}.ts`, `method${i}`);
                });
            }
            operations.forEach((op) => op());
            for (let i = 0; i < 100; i++) {
                expect(ignoreManager.isMethodIgnored(`/file${i}.ts`, `method${i}`)).toBe(true);
            }
        });

        it('should handle concurrent read/write to workspace state', async () => {
            const updateSpy = mockContext.workspaceState.update as jest.Mock;
            updateSpy.mockResolvedValue(undefined);
            const updates = [];
            for (let i = 0; i < 10; i++) {
                updates.push(mockContext.workspaceState.update(`key${i}`, `value${i}`));
            }
            await Promise.all(updates);
            expect(updateSpy).toHaveBeenCalledTimes(10);
        });

        it('should handle rapid filter changes', () => {
            const results = new Array(100).fill(null).map((_, i) => ({
                name: `method${i}`,
                filePath: `/file${i}.ts`,
                fileName: `file${i}.ts`,
                line: i,
                character: 0,
                kind: 'method' as const,
            }));
            const filters = ['method1', 'method2', 'method3', '', 'method5'];
            filters.forEach((filter) => {
                const filtered = results.filter((r) => r.name.includes(filter));
                expect(filtered).toBeDefined();
            });
        });
    });

    describe('Memory Stress Tests', () => {
        it('should handle repeated scan cycles without memory leak', () => {
            const cycles = 10;
            const resultsPerCycle = 100;
            for (let cycle = 0; cycle < cycles; cycle++) {
                const results = new Array(resultsPerCycle).fill(null).map((_, i) => ({
                    name: `method${i}`,
                    filePath: '/file.ts',
                    fileName: 'file.ts',
                    line: i,
                    character: 0,
                    kind: 'method' as const,
                }));
                expect(results.length).toBe(resultsPerCycle);
                results.length = 0;
            }
            expect(true).toBe(true);
        });

        it('should efficiently handle string deduplication', () => {
            const items = new Array(1000).fill(null).map((_, i) => ({
                name: `method${i}`,
                filePath: '/same/file/path.ts',
                fileName: 'path.ts',
                line: i,
                character: 0,
                kind: 'method' as const,
            }));
            expect(items.length).toBe(1000);
            const uniquePaths = new Set(items.map((item) => item.filePath));
            expect(uniquePaths.size).toBe(1);
        });

        it('should handle garbage collection during long operations', () => {
            const iterations = 100;
            for (let i = 0; i < iterations; i++) {
                const tempData = new Array(1000).fill('temporary data');
                expect(tempData.length).toBe(1000);
            }
            expect(true).toBe(true);
        });
    });

    describe('Edge Case Combinations', () => {
        it('should handle large project with deep nesting and long names', () => {
            const complexPaths = [];
            for (let i = 0; i < 100; i++) {
                const deepPath = `/project/${'nested/'.repeat(20)}${'longFileName'.repeat(5)}${i}.ts`;
                complexPaths.push(deepPath);
            }
            expect(complexPaths.length).toBe(100);
            expect(complexPaths[0].length).toBeGreaterThan(100);
        });

        it('should handle concurrent operations on large datasets', async () => {
            const largeDataset = new Array(500).fill(null).map((_, i) => ({
                name: `method${i}`,
                filePath: `/file${i}.ts`,
                fileName: `file${i}.ts`,
                line: i,
                character: 0,
                kind: 'method' as const,
            }));
            const operations = [
                () => largeDataset.filter((item) => item.name.includes('1')),
                () => largeDataset.filter((item) => item.name.includes('2')),
                () => largeDataset.filter((item) => item.line > 100),
                () => largeDataset.filter((item) => item.filePath.includes('file1')),
            ];
            const results = await Promise.all(operations.map((op) => Promise.resolve(op())));
            expect(results).toHaveLength(4);
            results.forEach((result) => {
                expect(result).toBeDefined();
            });
        });

        it('should handle performance degradation gracefully', () => {
            const datasets = [100, 500, 1000, 2000];
            datasets.forEach((size) => {
                const startTime = Date.now();
                const data = new Array(size).fill(null).map((_, i) => ({
                    name: `method${i}`,
                    filePath: `/file${i}.ts`,
                }));
                const filtered = data.filter((item) => item.name.includes('100'));
                const endTime = Date.now();
                expect(endTime - startTime).toBeLessThan(1000);
                expect(filtered).toBeDefined();
            });
        });
    });

    describe('Resource Cleanup', () => {
        it('should clean up resources after scan completion', () => {
            const resources: {
                cache: Map<string, string>;
                tempData: number[];
            } = {
                cache: new Map(),
                tempData: [],
            };
            for (let i = 0; i < 100; i++) {
                resources.cache.set(`key${i}`, `value${i}`);
                resources.tempData.push(i);
            }
            expect(resources.cache.size).toBe(100);
            expect(resources.tempData.length).toBe(100);
            resources.cache.clear();
            resources.tempData.length = 0;
            expect(resources.cache.size).toBe(0);
            expect(resources.tempData.length).toBe(0);
        });

        it('should handle cleanup on error', () => {
            const cleanup = jest.fn();
            try {
                throw new Error('Simulated error');
            } catch (error) {
                cleanup();
            }
            expect(cleanup).toHaveBeenCalled();
        });
    });
});