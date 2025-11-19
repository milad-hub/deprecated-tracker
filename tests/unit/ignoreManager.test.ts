import * as path from 'path';
import * as vscode from 'vscode';
import { IgnoreManager } from '../../src/scanner/ignoreManager';

describe('IgnoreManager', () => {
  let mockContext: vscode.ExtensionContext;
  let ignoreManager: IgnoreManager;

  beforeEach(() => {
    const workspaceState: { [key: string]: unknown } = {};

    mockContext = {
      workspaceState: {
        get: jest.fn((key: string) => workspaceState[key]),
        update: jest.fn((key: string, value: unknown) => {
          workspaceState[key] = value;
          return Promise.resolve();
        }),
        keys: jest.fn(() => Object.keys(workspaceState)),
      },
    } as unknown as vscode.ExtensionContext;

    ignoreManager = new IgnoreManager(mockContext);
  });

  describe('isFileIgnored', () => {
    it('should return false for non-ignored file', () => {
      expect(ignoreManager.isFileIgnored('/path/to/file.ts')).toBe(false);
    });

    it('should return true for ignored file', () => {
      ignoreManager.ignoreFile('/path/to/file.ts');
      expect(ignoreManager.isFileIgnored('/path/to/file.ts')).toBe(true);
    });
  });

  describe('isMethodIgnored', () => {
    it('should return false for non-ignored method', () => {
      expect(ignoreManager.isMethodIgnored('/path/to/file.ts', 'methodName')).toBe(false);
    });

    it('should return true for ignored method', () => {
      ignoreManager.ignoreMethod('/path/to/file.ts', 'methodName');
      expect(ignoreManager.isMethodIgnored('/path/to/file.ts', 'methodName')).toBe(true);
    });
  });

  describe('ignoreFile', () => {
    it('should add file to ignore list', () => {
      ignoreManager.ignoreFile('/path/to/file.ts');
      expect(ignoreManager.isFileIgnored('/path/to/file.ts')).toBe(true);
    });

    it('should not add duplicate files', () => {
      const testPath = path.normalize('/path/to/file.ts');
      ignoreManager.ignoreFile('/path/to/file.ts');
      ignoreManager.ignoreFile('/path/to/file.ts');
      const rules = ignoreManager.getAllRules();
      expect(rules.files.filter((f) => path.normalize(f) === testPath).length).toBe(1);
    });
  });

  describe('ignoreMethod', () => {
    it('should add method to ignore list', () => {
      ignoreManager.ignoreMethod('/path/to/file.ts', 'methodName');
      expect(ignoreManager.isMethodIgnored('/path/to/file.ts', 'methodName')).toBe(true);
    });

    it('should not add duplicate methods', () => {
      const testPath = path.normalize('/path/to/file.ts');
      ignoreManager.ignoreMethod('/path/to/file.ts', 'methodName');
      ignoreManager.ignoreMethod('/path/to/file.ts', 'methodName');
      const rules = ignoreManager.getAllRules();
      const matchingKey = Object.keys(rules.methods).find((f) => path.normalize(f) === testPath);
      expect(rules.methods[matchingKey!]?.filter((m) => m === 'methodName').length).toBe(1);
    });
  });

  describe('removeFileIgnore', () => {
    it('should remove file from ignore list', () => {
      ignoreManager.ignoreFile('/path/to/file.ts');
      ignoreManager.removeFileIgnore('/path/to/file.ts');
      expect(ignoreManager.isFileIgnored('/path/to/file.ts')).toBe(false);
    });
  });

  describe('removeMethodIgnore', () => {
    it('should remove method from ignore list', () => {
      ignoreManager.ignoreMethod('/path/to/file.ts', 'methodName');
      ignoreManager.removeMethodIgnore('/path/to/file.ts', 'methodName');
      expect(ignoreManager.isMethodIgnored('/path/to/file.ts', 'methodName')).toBe(false);
    });

    it('should clean up empty method arrays', () => {
      ignoreManager.ignoreMethod('/path/to/file.ts', 'methodName');
      ignoreManager.removeMethodIgnore('/path/to/file.ts', 'methodName');
      const rules = ignoreManager.getAllRules();
      expect(rules.methods['/path/to/file.ts']).toBeUndefined();
    });
  });

  describe('clearAll', () => {
    it('should clear all ignore rules', () => {
      ignoreManager.ignoreFile('/path/to/file.ts');
      ignoreManager.ignoreMethod('/path/to/file2.ts', 'methodName');
      ignoreManager.clearAll();

      const rules = ignoreManager.getAllRules();
      expect(rules.files.length).toBe(0);
      expect(Object.keys(rules.methods).length).toBe(0);
    });
  });

  describe('getAllRules', () => {
    it('should return copy of rules', () => {
      ignoreManager.ignoreFile('/path/to/file.ts');
      const rules1 = ignoreManager.getAllRules();
      const rules2 = ignoreManager.getAllRules();

      expect(rules1).toEqual(rules2);
      expect(rules1).not.toBe(rules2); // Should be different objects
    });
  });
});
