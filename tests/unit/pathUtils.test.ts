import * as path from 'path';
import { PathUtils } from '../../src/utils/pathUtils';

describe('PathUtils', () => {
  describe('normalizePath', () => {
    it('should normalize path with forward slashes', () => {
      const input = path.join('path', 'to', '..', 'file.ts');
      const result = PathUtils.normalizePath(input);
      expect(result).toBe('path/file.ts');
      expect(result).not.toContain('\\');
    });

    it('should handle multiple parent references with forward slashes', () => {
      const input = path.join('a', 'b', 'c', '..', '..', 'd', 'file.ts');
      const result = PathUtils.normalizePath(input);
      expect(result).toBe('a/d/file.ts');
      expect(result).not.toContain('\\');
    });

    it('should convert Windows backslashes to forward slashes', () => {
      const input = 'C:\\path\\to\\file.ts';
      const result = PathUtils.normalizePath(input);
      expect(result).toBe('C:/path/to/file.ts');
      expect(result).not.toContain('\\');
    });

    it('should handle mixed separators and normalize to forward slashes', () => {
      const input = 'path/to\\file.ts';
      const result = PathUtils.normalizePath(input);
      expect(result).toBe('path/to/file.ts');
      expect(result).not.toContain('\\');
    });

    it('should handle empty path', () => {
      const result = PathUtils.normalizePath('');
      expect(result).toBe('.');
    });

    it('should handle trailing slashes', () => {
      const result = PathUtils.normalizePath('path/to/dir/');
      expect(result.replace(/\/$/, '')).toBe('path/to/dir');
      expect(result).not.toContain('\\');
    });

    it('should handle Windows UNC paths', () => {
      const input = '\\\\server\\share\\path\\file.ts';
      const result = PathUtils.normalizePath(input);
      expect(result).not.toContain('\\');
      expect(result).toContain('/');
    });

    it('should handle relative paths with forward slashes', () => {
      const input = './path/../other/file.ts';
      const result = PathUtils.normalizePath(input);
      expect(result).toBe('other/file.ts');
      expect(result).not.toContain('\\');
    });

    it('should ensure consistent path comparison across platforms', () => {
      const windowsPath = 'C:\\Users\\project\\src\\file.ts';
      const unixPath = 'C:/Users/project/src/file.ts';
      const normalizedWindows = PathUtils.normalizePath(windowsPath);
      const normalizedUnix = PathUtils.normalizePath(unixPath);
      expect(normalizedWindows).toBe(normalizedUnix);
      expect(normalizedWindows).toBe('C:/Users/project/src/file.ts');
    });
  });


  describe('relativeTo', () => {
    it('returns a forward-slashed path for a file inside the base', () => {
      const basePath = path.resolve('workspace');
      const target = path.join(basePath, 'src', 'api', 'user.ts');
      expect(PathUtils.relativeTo(basePath, target)).toBe('src/api/user.ts');
    });

    it('returns an empty string for the base itself', () => {
      const basePath = path.resolve('workspace');
      expect(PathUtils.relativeTo(basePath, basePath)).toBe('');
    });

    it('falls back to the normalized absolute path when outside the base', () => {
      const basePath = path.resolve('workspace');
      const outside = path.resolve('elsewhere', 'file.ts');
      const result = PathUtils.relativeTo(basePath, outside);
      expect(result).toBe(PathUtils.normalizePath(outside));
      expect(result).not.toContain('\\');
      expect(result).not.toContain('..');
    });
  });

  describe('isWithin', () => {
    it('accepts the base path and nested paths', () => {
      const basePath = path.resolve('workspace', 'src');
      expect(PathUtils.isWithin(basePath, basePath)).toBe(true);
      expect(PathUtils.isWithin(basePath, path.join(basePath, 'file.ts'))).toBe(true);
    });

    it('rejects parents and sibling paths with the same prefix', () => {
      const workspacePath = path.resolve('workspace');
      const basePath = path.join(workspacePath, 'src');
      expect(PathUtils.isWithin(basePath, workspacePath)).toBe(false);
      expect(PathUtils.isWithin(basePath, path.join(workspacePath, 'src2'))).toBe(false);
    });

    it('uses case-insensitive native path handling on Windows', () => {
      if (process.platform === 'win32') {
        expect(PathUtils.isWithin('C:\\Workspace', 'c:\\workspace\\src')).toBe(true);
      }
    });
  });
});
