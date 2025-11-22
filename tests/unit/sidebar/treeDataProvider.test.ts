import * as vscode from 'vscode';
import { DeprecatedItem } from '../../../src/scanner';
import { IgnoreManager } from '../../../src/scanner/ignoreManager';
import {
    DeprecatedItemTreeItem,
    DeprecatedTrackerTreeDataProvider,
    FileGroupTreeItem,
} from '../../../src/sidebar/treeDataProvider';

describe('TreeDataProvider', () => {
    let mockContext: vscode.ExtensionContext;
    let ignoreManager: IgnoreManager;
    let treeDataProvider: DeprecatedTrackerTreeDataProvider;

    beforeEach(() => {
        const extensionPath = '/test/path';
        const extensionUri = vscode.Uri.file(extensionPath);
        mockContext = {
            subscriptions: [],
            workspaceState: {
                get: jest.fn().mockReturnValue({}),
                update: jest.fn().mockResolvedValue(undefined),
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
        treeDataProvider = new DeprecatedTrackerTreeDataProvider(ignoreManager);
    });

    describe('DeprecatedItemTreeItem', () => {
        it('should create tree item for method', () => {
            const item: DeprecatedItem = {
                name: 'testMethod',
                kind: 'method',
                filePath: '/test/file.ts',
                fileName: 'file.ts',
                line: 10,
                character: 5,
            };
            const treeItem = new DeprecatedItemTreeItem(
                item,
                vscode.TreeItemCollapsibleState.None
            );
            expect(treeItem.label).toBe('testMethod');
            expect(treeItem.description).toBe('file.ts:10');
            expect(treeItem.contextValue).toBe('deprecatedItem');
            expect(treeItem.command).toBeDefined();
            expect(treeItem.command?.command).toBe('deprecatedTracker.openResults');
        });

        it('should create tree item for property', () => {
            const item: DeprecatedItem = {
                name: 'oldProp',
                kind: 'property',
                filePath: '/test/file.ts',
                fileName: 'file.ts',
                line: 20,
                character: 0,
            };
            const treeItem = new DeprecatedItemTreeItem(
                item,
                vscode.TreeItemCollapsibleState.None
            );
            expect(treeItem.label).toBe('oldProp');
            expect(treeItem.iconPath).toBeInstanceOf(vscode.ThemeIcon);
        });

        it('should create tree item for class', () => {
            const item: DeprecatedItem = {
                name: 'OldClass',
                kind: 'class',
                filePath: '/test/file.ts',
                fileName: 'file.ts',
                line: 1,
                character: 0,
            };
            const treeItem = new DeprecatedItemTreeItem(
                item,
                vscode.TreeItemCollapsibleState.None
            );
            expect(treeItem.label).toBe('OldClass');
        });

        it('should create tree item for interface', () => {
            const item: DeprecatedItem = {
                name: 'OldInterface',
                kind: 'interface',
                filePath: '/test/file.ts',
                fileName: 'file.ts',
                line: 5,
                character: 0,
            };
            const treeItem = new DeprecatedItemTreeItem(
                item,
                vscode.TreeItemCollapsibleState.None
            );
            expect(treeItem.label).toBe('OldInterface');
        });

        it('should create tree item for function', () => {
            const item: DeprecatedItem = {
                name: 'oldFunc',
                kind: 'function',
                filePath: '/test/file.ts',
                fileName: 'file.ts',
                line: 15,
                character: 0,
            };
            const treeItem = new DeprecatedItemTreeItem(
                item,
                vscode.TreeItemCollapsibleState.None
            );
            expect(treeItem.label).toBe('oldFunc');
        });
    });

    describe('FileGroupTreeItem', () => {
        it('should create file group with items count', () => {
            const items: DeprecatedItem[] = [
                {
                    name: 'method1',
                    kind: 'method',
                    filePath: '/test/file.ts',
                    fileName: 'file.ts',
                    line: 10,
                    character: 0,
                },
                {
                    name: 'method2',
                    kind: 'method',
                    filePath: '/test/file.ts',
                    fileName: 'file.ts',
                    line: 20,
                    character: 0,
                },
            ];
            const fileGroup = new FileGroupTreeItem(
                '/test/file.ts',
                items,
                vscode.TreeItemCollapsibleState.Collapsed
            );
            expect(fileGroup.label).toBe('file.ts');
            expect(fileGroup.description).toBe('2 item(s)');
            expect(fileGroup.contextValue).toBe('fileGroup');
        });
    });

    describe('DeprecatedTrackerTreeDataProvider', () => {
        describe('setDeprecatedItems and refresh', () => {
            it('should set items and trigger refresh', () => {
                const items: DeprecatedItem[] = [
                    {
                        name: 'oldMethod',
                        kind: 'method',
                        filePath: '/test/file.ts',
                        fileName: 'file.ts',
                        line: 10,
                        character: 0,
                    },
                ];
                const refreshSpy = jest.spyOn(treeDataProvider, 'refresh');
                treeDataProvider.setDeprecatedItems(items);
                expect(refreshSpy).toHaveBeenCalled();
            });
        });

        describe('setGroupByFile', () => {
            it('should toggle grouping mode and refresh', () => {
                const refreshSpy = jest.spyOn(treeDataProvider, 'refresh');
                treeDataProvider.setGroupByFile(false);
                expect(refreshSpy).toHaveBeenCalled();
                treeDataProvider.setGroupByFile(true);
                expect(refreshSpy).toHaveBeenCalledTimes(2);
            });
        });

        describe('getTreeItem', () => {
            it('should return the same tree item', () => {
                const item: DeprecatedItem = {
                    name: 'test',
                    kind: 'method',
                    filePath: '/test/file.ts',
                    fileName: 'file.ts',
                    line: 10,
                    character: 0,
                };
                const treeItem = new DeprecatedItemTreeItem(
                    item,
                    vscode.TreeItemCollapsibleState.None
                );
                const result = treeDataProvider.getTreeItem(treeItem);
                expect(result).toBe(treeItem);
            });
        });

        describe('getChildren', () => {
            it('should return empty array when no items', async () => {
                const children = await treeDataProvider.getChildren();
                expect(children).toEqual([]);
            });

            it('should return file groups when grouping by file', async () => {
                const items: DeprecatedItem[] = [
                    {
                        name: 'method1',
                        kind: 'method',
                        filePath: '/test/file1.ts',
                        fileName: 'file1.ts',
                        line: 10,
                        character: 0,
                    },
                    {
                        name: 'method2',
                        kind: 'method',
                        filePath: '/test/file2.ts',
                        fileName: 'file2.ts',
                        line: 20,
                        character: 0,
                    },
                ];
                treeDataProvider.setDeprecatedItems(items);
                const children = await treeDataProvider.getChildren();
                expect(children).toHaveLength(2);
                expect(children[0]).toBeInstanceOf(FileGroupTreeItem);
                expect(children[1]).toBeInstanceOf(FileGroupTreeItem);
            });

            it('should return deprecated items when not grouping by file', async () => {
                const items: DeprecatedItem[] = [
                    {
                        name: 'method1',
                        kind: 'method',
                        filePath: '/test/file.ts',
                        fileName: 'file.ts',
                        line: 10,
                        character: 0,
                    },
                ];
                treeDataProvider.setGroupByFile(false);
                treeDataProvider.setDeprecatedItems(items);
                const children = await treeDataProvider.getChildren();
                expect(children).toHaveLength(1);
                expect(children[0]).toBeInstanceOf(DeprecatedItemTreeItem);
            });

            it('should return children for file group', async () => {
                const items: DeprecatedItem[] = [
                    {
                        name: 'method1',
                        kind: 'method',
                        filePath: '/test/file.ts',
                        fileName: 'file.ts',
                        line: 10,
                        character: 0,
                    },
                    {
                        name: 'method2',
                        kind: 'method',
                        filePath: '/test/file.ts',
                        fileName: 'file.ts',
                        line: 20,
                        character: 0,
                    },
                ];
                const fileGroup = new FileGroupTreeItem(
                    '/test/file.ts',
                    items,
                    vscode.TreeItemCollapsibleState.Collapsed
                );
                const children = await treeDataProvider.getChildren(fileGroup);
                expect(children).toHaveLength(2);
                expect(children[0]).toBeInstanceOf(DeprecatedItemTreeItem);
                expect(children[1]).toBeInstanceOf(DeprecatedItemTreeItem);
            });

            it('should group multiple items from same file', async () => {
                const items: DeprecatedItem[] = [
                    {
                        name: 'method1',
                        kind: 'method',
                        filePath: '/test/file.ts',
                        fileName: 'file.ts',
                        line: 10,
                        character: 0,
                    },
                    {
                        name: 'method2',
                        kind: 'method',
                        filePath: '/test/file.ts',
                        fileName: 'file.ts',
                        line: 20,
                        character: 0,
                    },
                    {
                        name: 'method3',
                        kind: 'method',
                        filePath: '/test/other.ts',
                        fileName: 'other.ts',
                        line: 5,
                        character: 0,
                    },
                ];
                treeDataProvider.setDeprecatedItems(items);
                const children = await treeDataProvider.getChildren();
                expect(children).toHaveLength(2);
            });

            it('should return empty array for DeprecatedItemTreeItem element', async () => {
                const item: DeprecatedItem = {
                    name: 'method1',
                    kind: 'method',
                    filePath: '/test/file.ts',
                    fileName: 'file.ts',
                    line: 10,
                    character: 0,
                };
                const deprecatedItemTreeItem = new DeprecatedItemTreeItem(
                    item,
                    vscode.TreeItemCollapsibleState.None
                );
                const children = await treeDataProvider.getChildren(deprecatedItemTreeItem);
                expect(children).toEqual([]);
            });
        });

        describe('getParent', () => {
            it('should return file group parent when grouping by file', () => {
                const items: DeprecatedItem[] = [
                    {
                        name: 'method1',
                        kind: 'method',
                        filePath: '/test/file.ts',
                        fileName: 'file.ts',
                        line: 10,
                        character: 0,
                    },
                ];
                treeDataProvider.setDeprecatedItems(items);
                const treeItem = new DeprecatedItemTreeItem(
                    items[0],
                    vscode.TreeItemCollapsibleState.None
                );
                const parent = treeDataProvider.getParent?.(treeItem);
                expect(parent).toBeInstanceOf(FileGroupTreeItem);
            });

            it('should return undefined when not grouping by file', () => {
                const item: DeprecatedItem = {
                    name: 'method1',
                    kind: 'method',
                    filePath: '/test/file.ts',
                    fileName: 'file.ts',
                    line: 10,
                    character: 0,
                };
                treeDataProvider.setGroupByFile(false);
                treeDataProvider.setDeprecatedItems([item]);
                const treeItem = new DeprecatedItemTreeItem(
                    item,
                    vscode.TreeItemCollapsibleState.None
                );
                const parent = treeDataProvider.getParent?.(treeItem);
                expect(parent).toBeUndefined();
            });

            it('should return undefined for file group element', () => {
                const items: DeprecatedItem[] = [
                    {
                        name: 'method1',
                        kind: 'method',
                        filePath: '/test/file.ts',
                        fileName: 'file.ts',
                        line: 10,
                        character: 0,
                    },
                ];
                const fileGroup = new FileGroupTreeItem(
                    '/test/file.ts',
                    items,
                    vscode.TreeItemCollapsibleState.Collapsed
                );
                const parent = treeDataProvider.getParent?.(fileGroup);
                expect(parent).toBeUndefined();
            });
            it('should return undefined for item not in current items list', () => {
                const items: DeprecatedItem[] = [
                    {
                        name: 'method1',
                        kind: 'method',
                        filePath: '/test/file.ts',
                        fileName: 'file.ts',
                        line: 10,
                        character: 0,
                    },
                ];
                treeDataProvider.setDeprecatedItems(items);
                const differentItem: DeprecatedItem = {
                    name: 'nonExistentMethod',
                    kind: 'method',
                    filePath: '/test/different.ts',
                    fileName: 'different.ts',
                    line: 20,
                    character: 0,
                };
                const treeItem = new DeprecatedItemTreeItem(
                    differentItem,
                    vscode.TreeItemCollapsibleState.None
                );
                const parent = treeDataProvider.getParent?.(treeItem);
                expect(parent).toBeUndefined();
            });
        });
    });
});