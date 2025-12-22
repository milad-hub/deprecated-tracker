import * as vscode from 'vscode';
import { TagsManager } from '../../../src/config/tagsManager';
import { IgnoreManager } from '../../../src/scanner/ignoreManager';
import { Scanner } from '../../../src/scanner/scanner';

jest.mock('vscode');

describe('Scanner - Package Detection', () => {
    let scanner: Scanner;
    let mockIgnoreManager: IgnoreManager;
    let tagsManager: TagsManager;

    beforeEach(() => {
        const mockContext = {
            workspaceState: {
                get: jest.fn(),
                update: jest.fn(),
                keys: jest.fn(() => []),
            },
        } as unknown as vscode.ExtensionContext;

        mockIgnoreManager = new IgnoreManager(mockContext);
        tagsManager = new TagsManager(mockContext);
        scanner = new Scanner(mockIgnoreManager, tagsManager);
    });

    describe('getPackageNameFromPath', () => {
        const getPackageName = (filePath: string): string => {
            return (scanner as any).getPackageNameFromPath(filePath);
        };

        describe('Regular Packages', () => {
            it('should extract package name from simple node_modules path', () => {
                const filePath = '/project/node_modules/lodash/index.js';
                expect(getPackageName(filePath)).toBe('lodash');
            });

            it('should extract package name from deep path', () => {
                const filePath = '/project/node_modules/rxjs/operators/map.js';
                expect(getPackageName(filePath)).toBe('rxjs');
            });

            it('should handle Windows paths', () => {
                const filePath = 'C:\\project\\node_modules\\moment\\index.js';
                expect(getPackageName(filePath)).toBe('moment');
            });

            it('should handle mixed path separators', () => {
                const filePath = 'C:/project\\node_modules/axios/index.js';
                expect(getPackageName(filePath)).toBe('axios');
            });
        });

        describe('Scoped Packages', () => {
            it('should extract scoped package name (@angular/core)', () => {
                const filePath = '/project/node_modules/@angular/core/index.js';
                expect(getPackageName(filePath)).toBe('@angular/core');
            });

            it('should extract scoped package name (@types/node)', () => {
                const filePath = '/project/node_modules/@types/node/index.d.ts';
                expect(getPackageName(filePath)).toBe('@types/node');
            });

            it('should handle scoped packages with deep paths', () => {
                const filePath = '/project/node_modules/@angular/common/http/index.js';
                expect(getPackageName(filePath)).toBe('@angular/common');
            });

            it('should handle scoped packages on Windows', () => {
                const filePath = 'C:\\project\\node_modules\\@types\\express\\index.d.ts';
                expect(getPackageName(filePath)).toBe('@types/express');
            });

            it('should return empty string for malformed scoped package (only @scope)', () => {
                const filePath = '/project/node_modules/@angular';
                expect(getPackageName(filePath)).toBe('');
            });

            it('should return empty string for malformed scoped package (@ only)', () => {
                const filePath = '/project/node_modules/@';
                expect(getPackageName(filePath)).toBe('');
            });
        });

        describe('Nested node_modules', () => {
            it('should extract from last node_modules in nested structure', () => {
                const filePath = '/project/node_modules/pkg1/node_modules/pkg2/index.js';
                expect(getPackageName(filePath)).toBe('pkg2');
            });

            it('should extract scoped package from nested node_modules', () => {
                const filePath = '/project/node_modules/@angular/common/node_modules/@angular/core/index.js';
                expect(getPackageName(filePath)).toBe('@angular/core');
            });

            it('should handle deeply nested node_modules', () => {
                const filePath =
                    '/project/node_modules/a/node_modules/b/node_modules/c/index.js';
                expect(getPackageName(filePath)).toBe('c');
            });

            it('should handle nested node_modules on Windows', () => {
                const filePath = 'C:\\project\\node_modules\\pkg1\\node_modules\\pkg2\\index.js';
                expect(getPackageName(filePath)).toBe('pkg2');
            });
        });

        describe('Edge Cases', () => {
            it('should return empty string when no node_modules in path', () => {
                const filePath = '/project/src/index.ts';
                expect(getPackageName(filePath)).toBe('');
            });

            it('should return empty string for empty path', () => {
                const filePath = '';
                expect(getPackageName(filePath)).toBe('');
            });

            it('should return empty string when path ends with node_modules/', () => {
                const filePath = '/project/node_modules/';
                expect(getPackageName(filePath)).toBe('');
            });

            it('should handle path with only node_modules/', () => {
                const filePath = 'node_modules/';
                expect(getPackageName(filePath)).toBe('');
            });

            it('should handle relative paths with node_modules', () => {
                const filePath = './node_modules/lodash/index.js';
                expect(getPackageName(filePath)).toBe('lodash');
            });
        });
    });
});