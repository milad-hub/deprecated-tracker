import * as path from 'path';
import { PathUtils } from '../../src/utils/pathUtils';

describe('PathUtils', () => {
  describe('getFileName', () => {
    it('should return file name from full path', () => {
      expect(PathUtils.getFileName('/path/to/file.ts')).toBe('file.ts');
      expect(PathUtils.getFileName('file.ts')).toBe('file.ts');
    });

    it('should handle Windows paths', () => {
      expect(PathUtils.getFileName('C:\\path\\to\\file.ts')).toBe('file.ts');
    });

    it('should handle empty string', () => {
      expect(PathUtils.getFileName('')).toBe('');
    });

    it('should handle paths with spaces', () => {
      expect(PathUtils.getFileName('/path/to/my file.ts')).toBe('my file.ts');
    });

    it('should handle paths with special characters', () => {
      expect(PathUtils.getFileName('/path/to/file@#$.ts')).toBe('file@#$.ts');
    });
  });

  describe('getRelativePath', () => {
    it('should return relative path', () => {
      const basePath = path.join('base', 'path');
      const filePath = path.join('base', 'path', 'sub', 'file.ts');
      const result = PathUtils.getRelativePath(filePath, basePath);
      expect(result).toBe(path.join('sub', 'file.ts'));
    });

    it('should handle same path', () => {
      const samePath = path.join('base', 'path');
      expect(PathUtils.getRelativePath(samePath, samePath)).toBe('');
    });

    it('should handle parent directory', () => {
      const basePath = path.join('base', 'path', 'sub');
      const filePath = path.join('base', 'path', 'file.ts');
      const result = PathUtils.getRelativePath(filePath, basePath);
      expect(result).toBe(path.join('..', 'file.ts'));
    });

    it('should handle completely different paths', () => {
      const basePath = path.join('base', 'path');
      const filePath = path.join('other', 'path', 'file.ts');
      const result = PathUtils.getRelativePath(filePath, basePath);
      expect(result).toContain('file.ts');
    });
  });

  describe('normalizePath', () => {
    it('should normalize path', () => {
      const input = path.join('path', 'to', '..', 'file.ts');
      const expected = path.normalize(path.join('path', 'file.ts'));
      expect(PathUtils.normalizePath(input)).toBe(expected);
    });

    it('should handle multiple parent references', () => {
      const input = path.join('a', 'b', 'c', '..', '..', 'd', 'file.ts');
      const expected = path.normalize(path.join('a', 'd', 'file.ts'));
      expect(PathUtils.normalizePath(input)).toBe(expected);
    });

    it('should handle Windows backslashes', () => {
      const input = 'path\\to\\file.ts';
      const result = PathUtils.normalizePath(input);
      expect(result).toBe(path.normalize(input));
    });

    it('should handle mixed separators', () => {
      const input = 'path/to\\file.ts';
      const result = PathUtils.normalizePath(input);
      expect(result).toBe(path.normalize(input));
    });

    it('should handle empty path', () => {
      expect(PathUtils.normalizePath('')).toBe('.');
    });

    it('should handle trailing slashes', () => {
      const input = path.join('path', 'to', 'dir') + path.sep;
      const result = PathUtils.normalizePath(input);
      expect(result).toBeTruthy();
    });
  });

  describe('join', () => {
    it('should join paths', () => {
      expect(PathUtils.join('path', 'to', 'file.ts')).toBe(path.join('path', 'to', 'file.ts'));
    });

    it('should handle empty segments', () => {
      expect(PathUtils.join('path', '', 'file.ts')).toBe(path.join('path', 'file.ts'));
    });

    it('should handle single segment', () => {
      expect(PathUtils.join('file.ts')).toBe('file.ts');
    });

    it('should handle no segments', () => {
      expect(PathUtils.join()).toBe('.');
    });

    it('should handle absolute and relative mix', () => {
      const result = PathUtils.join('path', '..', 'other', 'file.ts');
      expect(result).toBe(path.join('path', '..', 'other', 'file.ts'));
    });

    it('should handle paths with spaces', () => {
      expect(PathUtils.join('my folder', 'sub folder', 'file.ts')).toBe(
        path.join('my folder', 'sub folder', 'file.ts')
      );
    });

    it('should handle paths with special characters', () => {
      expect(PathUtils.join('path@#$', 'file!.ts')).toBe(path.join('path@#$', 'file!.ts'));
    });
  });
});