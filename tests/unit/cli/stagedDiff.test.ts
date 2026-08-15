import { execFileSync } from 'child_process';
import * as path from 'path';
import {
  collectStagedLineRanges,
  listStagedFiles,
  onlyScannable,
} from '../../../src/cli/stagedDiff';
import { pathKey } from '../../../src/utils/pathKey';

jest.mock('child_process', () => ({ execFileSync: jest.fn() }));

describe('collectStagedLineRanges', () => {
  const cwd = '/repo';

  it('asks git for a zero-context diff of each staged file', () => {
    const git = jest.fn().mockReturnValue('@@ -1,2 +3,4 @@');

    collectStagedLineRanges(['a.ts', 'b.ts'], cwd, git);

    expect(git).toHaveBeenCalledTimes(2);
    // Zero context matters: with the default three lines, an untouched
    // deprecated call near an edit would read as changed.
    expect(git).toHaveBeenNthCalledWith(
      1,
      ['diff', '--cached', '--unified=0', '--no-color', '--', 'a.ts'],
      cwd
    );
  });

  // Keyed through pathKey, which folds case only where the filesystem does.
  // pathKey.test.ts pins that behaviour per platform.
  it('maps each file to its changed ranges, keyed by pathKey', () => {
    const git = jest.fn().mockReturnValue('@@ -1,2 +3,4 @@\n@@ -20 +30,2 @@');

    const ranges = collectStagedLineRanges(['SRC/A.ts'], cwd, git);

    expect(ranges.get(pathKey('SRC/A.ts'))).toEqual([
      { start: 3, end: 6 },
      { start: 30, end: 31 },
    ]);
  });

  // No entry means "treat the whole file as changed", which is right for a
  // newly added file and wrong for one git simply failed on — but failing
  // open is the safer default in a commit hook.
  it('records nothing for a file with no hunks', () => {
    const git = jest.fn().mockReturnValue('');
    expect(collectStagedLineRanges(['a.ts'], cwd, git).size).toBe(0);
  });

  it('records nothing when git returns undefined output', () => {
    const git = jest.fn().mockReturnValue(undefined as unknown as string);
    expect(collectStagedLineRanges(['a.ts'], cwd, git).size).toBe(0);
  });

  it('skips a file git cannot diff rather than failing the commit', () => {
    const git = jest.fn().mockImplementation(() => {
      throw new Error('not a git repository');
    });
    expect(collectStagedLineRanges(['a.ts'], cwd, git).size).toBe(0);
  });

  it('returns an empty map for an empty file list', () => {
    const git = jest.fn();
    expect(collectStagedLineRanges([], cwd, git).size).toBe(0);
    expect(git).not.toHaveBeenCalled();
  });

  describe('listStagedFiles', () => {
    it('asks git for added, copied, modified and renamed paths only', () => {
      const git = jest.fn().mockReturnValue('');

      listStagedFiles(cwd, git);

      // A deletion cannot be scanned; a rename is reported at its new path.
      expect(git).toHaveBeenCalledWith(
        ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'],
        cwd,
      );
    });

    it('splits on NUL, so a path with a space survives', () => {
      const git = jest
        .fn()
        .mockReturnValue('src/a.ts\0src/has space/wéird.ts\0');

      expect(listStagedFiles(cwd, git)).toEqual([
        path.resolve(cwd, 'src/a.ts'),
        path.resolve(cwd, 'src/has space/wéird.ts'),
      ]);
    });

    it('returns nothing when the index is empty', () => {
      expect(listStagedFiles(cwd, jest.fn().mockReturnValue(''))).toEqual([]);
    });

    it('returns nothing when git output is undefined', () => {
      const git = jest.fn().mockReturnValue(undefined as unknown as string);
      expect(listStagedFiles(cwd, git)).toEqual([]);
    });

    it('returns nothing outside a git repository', () => {
      const git = jest.fn().mockImplementation(() => {
        throw new Error('not a git repository');
      });
      expect(listStagedFiles(cwd, git)).toEqual([]);
    });

    it('shells out to git by default', () => {
      (execFileSync as jest.Mock).mockReturnValue('src/a.ts\0');
      expect(listStagedFiles(cwd)).toEqual([path.resolve(cwd, 'src/a.ts')]);
    });
  });

  // A lint-staged config of "*" is common, and hands over stylesheets.
  describe('onlyScannable', () => {
    it('keeps what the scanner can parse and drops the rest', () => {
      expect(
        onlyScannable([
          'a.ts',
          'b.tsx',
          'c.js',
          'd.jsx',
          'e.md',
          'f.scss',
          'g.json',
          'no-extension',
        ]),
      ).toEqual(['a.ts', 'b.tsx', 'c.js', 'd.jsx']);
    });

    it('ignores extension casing', () => {
      expect(onlyScannable(['A.TS'])).toEqual(['A.TS']);
    });

    it('returns nothing for an empty list', () => {
      expect(onlyScannable([])).toEqual([]);
    });
  });

  // A hook has no editor to ask, so the default runner shells out to git.
  describe('the default git runner', () => {
    beforeEach(() => {
      (execFileSync as jest.Mock).mockReset();
    });

    it('shells out to git in the given directory', () => {
      (execFileSync as jest.Mock).mockReturnValue('@@ -1 +5,3 @@');

      const ranges = collectStagedLineRanges(['a.ts'], cwd);

      expect(execFileSync).toHaveBeenCalledWith(
        'git',
        ['diff', '--cached', '--unified=0', '--no-color', '--', 'a.ts'],
        expect.objectContaining({ cwd, encoding: 'utf8' }),
      );
      expect(ranges.get('a.ts')).toEqual([{ start: 5, end: 7 }]);
    });

    it('swallows a git that is missing or angry', () => {
      (execFileSync as jest.Mock).mockImplementation(() => {
        throw new Error('git: command not found');
      });

      expect(collectStagedLineRanges(['a.ts'], cwd).size).toBe(0);
    });
  });
});
