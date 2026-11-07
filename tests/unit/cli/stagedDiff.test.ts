import { execFileSync } from 'child_process';
import * as path from 'path';
import {
  collectStagedLineRanges,
  collectUnstagedLineRanges,
  listStagedFiles,
  parseDiffByFile,
  onlyScannable,
} from '../../../src/cli/stagedDiff';
import { pathKey } from '../../../src/utils/pathKey';

jest.mock('child_process', () => ({ execFileSync: jest.fn() }));

describe('collectStagedLineRanges', () => {
  const cwd = '/repo';

  const diffArgs = (extra: string[]) => [
    '-c',
    'core.quotePath=false',
    'diff',
    ...extra,
    '--unified=0',
    '--no-color',
    '-M',
    '--relative',
  ];
  const section = (file: string, body: string) =>
    `diff --git a/${file} b/${file}\nindex 1..2 100644\n--- a/${file}\n+++ b/${file}\n${body}\n`;
  const runner = (staged: string, unstaged = '') =>
    jest.fn((args: string[]) => (args.includes('--cached') ? staged : unstaged));

  it('asks git once for a zero-context, rename-aware diff of the index and of the working tree', () => {
    const git = runner('');

    collectStagedLineRanges([path.join(cwd, 'a.ts')], cwd, git);

    expect(git).toHaveBeenCalledWith(diffArgs(['--cached']), cwd);
    expect(git).toHaveBeenCalledWith(diffArgs([]), cwd);
  });

  it('maps each file to its added ranges, keyed by pathKey', () => {
    const git = runner(section('SRC/A.ts', '@@ -1,2 +3,4 @@\n@@ -20 +30,2 @@'));

    const ranges = collectStagedLineRanges([path.join(cwd, 'SRC/A.ts')], cwd, git);

    expect(ranges.get(pathKey(path.resolve(cwd, 'SRC/A.ts')))).toEqual([
      { start: 3, end: 6 },
      { start: 30, end: 31 },
    ]);
  });

  it('records an empty list for a deletion, so nothing on the file counts as new', () => {
    const git = runner(section('a.ts', '@@ -3 +2,0 @@'));
    expect(
      collectStagedLineRanges([path.join(cwd, 'a.ts')], cwd, git).get(
        pathKey(path.resolve(cwd, 'a.ts')),
      ),
    ).toEqual([]);
  });

  it('records an empty list for a pure rename', () => {
    const git = runner(
      'diff --git a/old.ts b/new.ts\nsimilarity index 100%\nrename from old.ts\nrename to new.ts\n',
    );
    expect(
      collectStagedLineRanges([path.join(cwd, 'new.ts')], cwd, git).get(
        pathKey(path.resolve(cwd, 'new.ts')),
      ),
    ).toEqual([]);
  });

  it('records an empty list for a mode-only change', () => {
    const git = runner('diff --git a/a.ts b/a.ts\nold mode 100644\nnew mode 100755\n');
    expect(
      collectStagedLineRanges([path.join(cwd, 'a.ts')], cwd, git).get(
        pathKey(path.resolve(cwd, 'a.ts')),
      ),
    ).toEqual([]);
  });

  it('ignores a deleted file', () => {
    const git = runner(
      'diff --git a/gone.ts b/gone.ts\ndeleted file mode 100644\n--- a/gone.ts\n+++ /dev/null\n@@ -1 +0,0 @@\n',
    );
    expect(collectStagedLineRanges([path.join(cwd, 'gone.ts')], cwd, git).size).toBe(0);
  });

  it('moves staged lines by the unstaged edits made after staging', () => {
    const git = runner(
      section('a.ts', '@@ -3,0 +4 @@'),
      section('a.ts', '@@ -0,0 +1,5 @@'),
    );
    expect(
      collectStagedLineRanges([path.join(cwd, 'a.ts')], cwd, git).get(
        pathKey(path.resolve(cwd, 'a.ts')),
      ),
    ).toEqual([{ start: 9, end: 9 }]);
  });

  it('leaves a file with no staged diff out, so it is read as entirely new', () => {
    const git = runner('');
    expect(collectStagedLineRanges([path.join(cwd, 'a.ts')], cwd, git).size).toBe(0);
  });

  it('records nothing when git fails rather than failing the commit', () => {
    const git = jest.fn().mockImplementation(() => {
      throw new Error('not a git repository');
    });
    expect(collectStagedLineRanges([path.join(cwd, 'a.ts')], cwd, git).size).toBe(0);
  });

  it('falls back to diffing only the requested files when the full diff fails', () => {
    const git = jest.fn((args: string[]) => {
      if (!args.includes('--')) {
        throw new Error('maxBuffer exceeded');
      }
      return args.includes('--cached') ? section('a.ts', '@@ -1 +4,2 @@') : '';
    });
    const files = Array.from({ length: 101 }, (_, index) =>
      path.resolve(cwd, index === 0 ? 'a.ts' : `f${index}.ts`),
    );

    const ranges = collectStagedLineRanges(files, cwd, git);

    expect(ranges.get(pathKey(path.resolve(cwd, 'a.ts')))).toEqual([{ start: 4, end: 5 }]);
    expect(git.mock.calls.filter(([args]) => args.includes('--')).length).toBe(4);
  });

  it('returns an empty map for an empty file list', () => {
    expect(collectStagedLineRanges([], cwd, runner('')).size).toBe(0);
  });

  describe('collectUnstagedLineRanges', () => {
    it('reads the working tree against the index', () => {
      const git = runner('', section('a.ts', '@@ -1 +1,2 @@'));
      const ranges = collectUnstagedLineRanges(
        [path.join(cwd, 'a.ts'), path.join(cwd, 'b.ts')],
        cwd,
        git,
      );
      expect(ranges.get(pathKey(path.resolve(cwd, 'a.ts')))).toEqual([
        { start: 1, end: 2 },
      ]);
      expect(ranges.has(pathKey(path.resolve(cwd, 'b.ts')))).toBe(false);
    });

    it('shells out to git by default', () => {
      (execFileSync as jest.Mock).mockReturnValue('');
      expect(collectUnstagedLineRanges([path.join(cwd, 'a.ts')], cwd).size).toBe(0);
    });
  });

  describe('parseDiffByFile', () => {
    it('skips a section it cannot name', () => {
      expect(parseDiffByFile('diff --git garbage\n', cwd).size).toBe(0);
    });
  });

  describe('listStagedFiles', () => {
    it('asks git for added, copied, modified and renamed paths only', () => {
      const git = jest.fn().mockReturnValue('');

      listStagedFiles(cwd, git);

      // A deletion cannot be scanned; a rename is reported at its new path.
      expect(git).toHaveBeenCalledWith(
        ['diff', '--cached', '--name-only', '--relative', '--diff-filter=ACMR', '-z'],
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
          'h.mts',
          'i.cts',
          'j.mjs',
          'k.cjs',
          'l.svelte',
          'e.md',
          'f.scss',
          'g.json',
          'no-extension',
        ]),
      ).toEqual([
        'a.ts',
        'b.tsx',
        'c.js',
        'd.jsx',
        'h.mts',
        'i.cts',
        'j.mjs',
        'k.cjs',
        'l.svelte',
      ]);
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
      (execFileSync as jest.Mock).mockImplementation((_git: string, args: string[]) =>
        args.includes('--cached')
          ? section('a.ts', '@@ -1 +5,3 @@')
          : '',
      );

      const ranges = collectStagedLineRanges([path.resolve(cwd, 'a.ts')], cwd);

      expect(execFileSync).toHaveBeenCalledWith(
        'git',
        expect.arrayContaining(['diff', '--cached', '--unified=0', '--relative']),
        expect.objectContaining({ cwd, encoding: 'utf8' }),
      );
      expect(ranges.get(pathKey(path.resolve(cwd, 'a.ts')))).toEqual([{ start: 5, end: 7 }]);
    });

    it('swallows a git that is missing or angry', () => {
      (execFileSync as jest.Mock).mockImplementation(() => {
        throw new Error('git: command not found');
      });

      expect(collectStagedLineRanges(['a.ts'], cwd).size).toBe(0);
    });
  });
});
