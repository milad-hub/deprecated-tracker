import * as path from 'path';
import { PathUtils } from '../../src/utils/pathUtils';

describe('PathUtils', () => {
  describe('getFileName', () => {
    it('should return file name from full path', () => {
      expect(PathUtils.getFileName('/path/to/file.ts')).toBe('file.ts');
      expect(PathUtils.getFileName('file.ts')).toBe('file.ts');
    });
  });

  describe('getRelativePath', () => {
    it('should return relative path', () => {
      const basePath = path.join('base', 'path');
      const filePath = path.join('base', 'path', 'sub', 'file.ts');
      const result = PathUtils.getRelativePath(filePath, basePath);
      expect(result).toBe(path.join('sub', 'file.ts'));
    });
  });

  describe('normalizePath', () => {
    it('should normalize path', () => {
      const input = path.join('path', 'to', '..', 'file.ts');
      const expected = path.normalize(path.join('path', 'file.ts'));
      expect(PathUtils.normalizePath(input)).toBe(expected);
    });
  });

  describe('join', () => {
    it('should join paths', () => {
      expect(PathUtils.join('path', 'to', 'file.ts')).toBe(path.join('path', 'to', 'file.ts'));
    });
  });
});
