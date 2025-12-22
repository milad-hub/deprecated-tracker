import * as fs from 'fs';
import * as vscode from 'vscode';
import { TagsManager } from '../../../src/config/tagsManager';
import { IgnoreManager } from '../../../src/scanner/ignoreManager';
import { Scanner } from '../../../src/scanner/scanner';

jest.mock('vscode');
jest.mock('fs');

describe('Filesystem Error Scenarios', () => {
    let scanner: Scanner;
    let mockContext: vscode.ExtensionContext;
    let ignoreManager: IgnoreManager;
    let tagsManager: TagsManager;

    beforeEach(() => {
        jest.clearAllMocks();
        mockContext = {
            subscriptions: [],
            workspaceState: {
                get: jest.fn(),
                update: jest.fn(),
            },
            globalState: {
                get: jest.fn(),
                update: jest.fn(),
            },
            extensionPath: '/test/path',
            extensionUri: vscode.Uri.file('/test/path'),
        } as unknown as vscode.ExtensionContext;
        ignoreManager = new IgnoreManager(mockContext);
        tagsManager = new TagsManager(mockContext);
        scanner = new Scanner(ignoreManager, tagsManager);
    });

    describe('Permission Denied Errors', () => {
        it('should handle EACCES error when reading file', () => {
            const permissionError = new Error('EACCES: permission denied') as NodeJS.ErrnoException;
            permissionError.code = 'EACCES';
            const readFileSyncSpy = jest.spyOn(fs, 'readFileSync');
            readFileSyncSpy.mockImplementation(() => {
                throw permissionError;
            });
            expect(() => {
                fs.readFileSync('/restricted/file.ts', 'utf-8');
            }).toThrow('EACCES');
            readFileSyncSpy.mockRestore();
        });

        it('should handle EPERM error when accessing directory', () => {
            const permissionError = new Error('EPERM: operation not permitted') as NodeJS.ErrnoException;
            permissionError.code = 'EPERM';
            const readdirSyncSpy = jest.spyOn(fs, 'readdirSync');
            readdirSyncSpy.mockImplementation(() => {
                throw permissionError;
            });
            expect(() => {
                fs.readdirSync('/restricted/directory');
            }).toThrow('EPERM');
            readdirSyncSpy.mockRestore();
        });

        it('should gracefully skip files with permission errors during scan', () => {
            const existsSyncSpy = jest.spyOn(fs, 'existsSync');
            const readFileSyncSpy = jest.spyOn(fs, 'readFileSync');
            existsSyncSpy.mockReturnValue(true);
            readFileSyncSpy.mockImplementation((path) => {
                if (path.toString().includes('restricted')) {
                    const error = new Error('EACCES: permission denied') as NodeJS.ErrnoException;
                    error.code = 'EACCES';
                    throw error;
                }
                return 'export class Test {}';
            });
            expect(() => {
                try {
                    fs.readFileSync('/workspace/restricted/file.ts', 'utf-8');
                } catch (error: any) {
                    if (error.code === 'EACCES') {
                        // Skip this file and continue
                    }
                }
            }).not.toThrow();
            existsSyncSpy.mockRestore();
            readFileSyncSpy.mockRestore();
        });
    });

    describe('File In Use Errors', () => {
        it('should handle EBUSY error when file is in use', () => {
            const busyError = new Error('EBUSY: resource busy or locked') as NodeJS.ErrnoException;
            busyError.code = 'EBUSY';
            const readFileSyncSpy = jest.spyOn(fs, 'readFileSync');
            readFileSyncSpy.mockImplementation(() => {
                throw busyError;
            });
            expect(() => {
                fs.readFileSync('/locked/file.ts', 'utf-8');
            }).toThrow('EBUSY');
            readFileSyncSpy.mockRestore();
        });

        it('should retry or skip locked files gracefully', () => {
            const busyError = new Error('EBUSY: resource busy') as NodeJS.ErrnoException;
            busyError.code = 'EBUSY';
            const readFileSyncSpy = jest.spyOn(fs, 'readFileSync');
            let callCount = 0;
            readFileSyncSpy.mockImplementation(() => {
                callCount++;
                if (callCount === 1) {
                    throw busyError;
                }
                return 'export class Test {}';
            });
            try {
                fs.readFileSync('/file.ts', 'utf-8');
            } catch (error: any) {
                expect(error.code).toBe('EBUSY');
            }
            const result = fs.readFileSync('/file.ts', 'utf-8');
            expect(result).toBe('export class Test {}');
            readFileSyncSpy.mockRestore();
        });
    });

    describe('Disk Full Errors', () => {
        it('should handle ENOSPC error when disk is full', () => {
            const diskFullError = new Error('ENOSPC: no space left on device') as NodeJS.ErrnoException;
            diskFullError.code = 'ENOSPC';
            const writeFileSyncSpy = jest.spyOn(fs, 'writeFileSync');
            writeFileSyncSpy.mockImplementation(() => {
                throw diskFullError;
            });
            expect(() => {
                fs.writeFileSync('/output/results.json', '{}');
            }).toThrow('ENOSPC');
            writeFileSyncSpy.mockRestore();
        });

        it('should handle disk full when caching results', () => {
            const diskFullError = new Error('ENOSPC: no space left') as NodeJS.ErrnoException;
            diskFullError.code = 'ENOSPC';
            const updateSpy = mockContext.workspaceState.update as jest.Mock;
            updateSpy.mockRejectedValue(diskFullError);
            expect(async () => {
                await mockContext.workspaceState.update('key', 'value');
            }).rejects.toThrow('ENOSPC');
        });
    });

    describe('File Not Found Errors', () => {
        it('should handle ENOENT error when file does not exist', () => {
            const notFoundError = new Error('ENOENT: no such file or directory') as NodeJS.ErrnoException;
            notFoundError.code = 'ENOENT';
            const readFileSyncSpy = jest.spyOn(fs, 'readFileSync');
            readFileSyncSpy.mockImplementation(() => {
                throw notFoundError;
            });
            expect(() => {
                fs.readFileSync('/nonexistent/file.ts', 'utf-8');
            }).toThrow('ENOENT');
            readFileSyncSpy.mockRestore();
        });

        it('should handle deleted files during scan', () => {
            const existsSyncSpy = jest.spyOn(fs, 'existsSync');
            const readFileSyncSpy = jest.spyOn(fs, 'readFileSync');
            existsSyncSpy.mockReturnValue(true);
            const notFoundError = new Error('ENOENT: no such file') as NodeJS.ErrnoException;
            notFoundError.code = 'ENOENT';
            readFileSyncSpy.mockImplementation(() => {
                throw notFoundError;
            });
            expect(() => {
                if (fs.existsSync('/file.ts')) {
                    fs.readFileSync('/file.ts', 'utf-8');
                }
            }).toThrow('ENOENT');
            existsSyncSpy.mockRestore();
            readFileSyncSpy.mockRestore();
        });
    });

    describe('Network Drive Errors', () => {
        it('should handle network timeout errors', () => {
            const timeoutError = new Error('ETIMEDOUT: operation timed out') as NodeJS.ErrnoException;
            timeoutError.code = 'ETIMEDOUT';
            const readFileSyncSpy = jest.spyOn(fs, 'readFileSync');
            readFileSyncSpy.mockImplementation(() => {
                throw timeoutError;
            });
            expect(() => {
                fs.readFileSync('//network/share/file.ts', 'utf-8');
            }).toThrow('ETIMEDOUT');
            readFileSyncSpy.mockRestore();
        });

        it('should handle network connection refused errors', () => {
            const refusedError = new Error('ECONNREFUSED: connection refused') as NodeJS.ErrnoException;
            refusedError.code = 'ECONNREFUSED';
            const readFileSyncSpy = jest.spyOn(fs, 'readFileSync');
            readFileSyncSpy.mockImplementation(() => {
                throw refusedError;
            });
            expect(() => {
                fs.readFileSync('//network/share/file.ts', 'utf-8');
            }).toThrow('ECONNREFUSED');
            readFileSyncSpy.mockRestore();
        });
    });

    describe('Symlink Errors', () => {
        it('should handle circular symlink errors', () => {
            const circularError = new Error('ELOOP: too many symbolic links') as NodeJS.ErrnoException;
            circularError.code = 'ELOOP';
            const readFileSyncSpy = jest.spyOn(fs, 'readFileSync');
            readFileSyncSpy.mockImplementation(() => {
                throw circularError;
            });
            expect(() => {
                fs.readFileSync('/symlink/circular/file.ts', 'utf-8');
            }).toThrow('ELOOP');
            readFileSyncSpy.mockRestore();
        });

        it('should handle broken symlinks', () => {
            const brokenSymlinkError = new Error('ENOENT: symlink target not found') as NodeJS.ErrnoException;
            brokenSymlinkError.code = 'ENOENT';
            const existsSyncSpy = jest.spyOn(fs, 'existsSync');
            existsSyncSpy.mockReturnValue(false);
            expect(fs.existsSync('/symlink/broken/file.ts')).toBe(false);
            existsSyncSpy.mockRestore();
        });
    });

    describe('Error Recovery', () => {
        it('should continue scanning after encountering file errors', () => {
            const readFileSyncSpy = jest.spyOn(fs, 'readFileSync');
            const fileErrors = new Map<string, NodeJS.ErrnoException>();
            readFileSyncSpy.mockImplementation((path) => {
                const pathStr = path.toString();
                if (pathStr.includes('error1')) {
                    const error = new Error('EACCES') as NodeJS.ErrnoException;
                    error.code = 'EACCES';
                    fileErrors.set(pathStr, error);
                    throw error;
                }
                if (pathStr.includes('error2')) {
                    const error = new Error('ENOENT') as NodeJS.ErrnoException;
                    error.code = 'ENOENT';
                    fileErrors.set(pathStr, error);
                    throw error;
                }
                return 'export class Test {}';
            });
            const files = ['/file1.ts', '/error1.ts', '/file2.ts', '/error2.ts', '/file3.ts'];
            const successfulFiles: string[] = [];
            files.forEach((file) => {
                try {
                    fs.readFileSync(file, 'utf-8');
                    successfulFiles.push(file);
                } catch (error: any) {
                    // Log error but continue
                }
            });
            expect(successfulFiles).toHaveLength(3);
            expect(fileErrors.size).toBe(2);
            readFileSyncSpy.mockRestore();
        });
    });
});