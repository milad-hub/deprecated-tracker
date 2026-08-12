import * as path from 'path';
import * as vscode from 'vscode';
import {
  GitApi,
  GitChange,
  GitRepository,
  collectChangedFiles,
  collectChangedLineRanges,
  getGitApi,
  isWithinChangedLines,
  parseChangedLineRanges,
} from '../../../src/scanner/gitChanges';
import { ScanChangesScope } from '../../../src/interfaces';
import { pathKey } from '../../../src/utils';

/**
 * Every filter here exists because of a specific way a changed-files scan goes
 * wrong: a deleted path cannot be opened, a rename's originalUri no longer
 * exists, a changed README is not an error, and the scanner rejects paths
 * outside the workspace outright.
 */
describe('gitChanges', () => {
  const root = path.resolve('/repo');
  const outside = path.resolve('/elsewhere');

  const folders = [
    { uri: { fsPath: root } },
  ] as unknown as readonly vscode.WorkspaceFolder[];

  const bothSides: ScanChangesScope = {
    staged: true,
    unstaged: true,
    granularity: 'files',
  };

  const change = (relative: string, status = 5): GitChange =>
    ({
      uri: { fsPath: path.join(root, relative) },
      status,
    }) as GitChange;

  const absoluteChange = (fullPath: string, status = 5): GitChange =>
    ({ uri: { fsPath: fullPath }, status }) as GitChange;

  const repo = (
    indexChanges: GitChange[] = [],
    workingTreeChanges: GitChange[] = [],
    diffs: Record<string, string> = {}
  ): GitRepository =>
    ({
      rootUri: { fsPath: root },
      state: { indexChanges, workingTreeChanges },
      diffWithHEAD: jest.fn(async (filePath: string) => diffs[filePath] ?? ''),
      diffIndexWithHEAD: jest.fn(
        async (filePath: string) => diffs[filePath] ?? ''
      ),
    }) as unknown as GitRepository;

  const api = (...repositories: GitRepository[]): GitApi =>
    ({ repositories }) as GitApi;

  describe('getGitApi', () => {
    afterEach(() => {
      (vscode.extensions.getExtension as jest.Mock).mockReset();
    });

    it('returns undefined when the Git extension is not installed', async () => {
      (vscode.extensions.getExtension as jest.Mock).mockReturnValue(undefined);
      await expect(getGitApi()).resolves.toBeUndefined();
    });

    it('uses the exports directly when the extension is already active', async () => {
      const gitApi = { repositories: [] };
      const getAPI = jest.fn().mockReturnValue(gitApi);
      (vscode.extensions.getExtension as jest.Mock).mockReturnValue({
        isActive: true,
        exports: { getAPI },
        activate: jest.fn(),
      });

      await expect(getGitApi()).resolves.toBe(gitApi);
      expect(getAPI).toHaveBeenCalledWith(1);
    });

    it('activates the extension when it is not yet active', async () => {
      const gitApi = { repositories: [] };
      const activate = jest.fn().mockResolvedValue({
        getAPI: jest.fn().mockReturnValue(gitApi),
      });
      (vscode.extensions.getExtension as jest.Mock).mockReturnValue({
        isActive: false,
        exports: undefined,
        activate,
      });

      await expect(getGitApi()).resolves.toBe(gitApi);
      expect(activate).toHaveBeenCalled();
    });

    it('returns undefined when the extension exposes no getAPI', async () => {
      (vscode.extensions.getExtension as jest.Mock).mockReturnValue({
        isActive: true,
        exports: {},
        activate: jest.fn(),
      });
      await expect(getGitApi()).resolves.toBeUndefined();
    });

    it('returns undefined when activation throws', async () => {
      (vscode.extensions.getExtension as jest.Mock).mockImplementation(() => {
        throw new Error('disabled');
      });
      await expect(getGitApi()).resolves.toBeUndefined();
    });
  });

  describe('collectChangedFiles', () => {
    it('returns staged and unstaged files across every repository', () => {
      const first = repo([change('a.ts')], []);
      const second = repo([], [change('b.ts')]);

      expect(collectChangedFiles(api(first, second), bothSides, folders)).toEqual(
        [path.join(root, 'a.ts'), path.join(root, 'b.ts')]
      );
    });

    it('drops deleted files, which cannot be scanned', () => {
      const changes = [
        change('kept.ts'),
        change('gone.ts', 6),
        change('unstaged-gone.ts', 2),
      ];
      expect(
        collectChangedFiles(api(repo(changes)), bothSides, folders)
      ).toEqual([path.join(root, 'kept.ts')]);
    });

    it('uses uri rather than originalUri, so a rename scans the new path', () => {
      const renamed = {
        uri: { fsPath: path.join(root, 'after.ts') },
        originalUri: { fsPath: path.join(root, 'before.ts') },
        status: 3,
      } as GitChange;

      expect(
        collectChangedFiles(api(repo([renamed])), bothSides, folders)
      ).toEqual([path.join(root, 'after.ts')]);
    });

    it('keeps only extensions the scanner can parse', () => {
      const changes = [
        change('a.ts'),
        change('b.tsx'),
        change('c.js'),
        change('d.jsx'),
        change('README.md'),
        change('data.json'),
        change('noext'),
      ];
      expect(
        collectChangedFiles(api(repo(changes)), bothSides, folders)
      ).toEqual([
        path.join(root, 'a.ts'),
        path.join(root, 'b.tsx'),
        path.join(root, 'c.js'),
        path.join(root, 'd.jsx'),
      ]);
    });

    it('drops files outside every workspace folder', () => {
      const changes = [
        change('inside.ts'),
        absoluteChange(path.join(outside, 'outside.ts')),
      ];
      expect(
        collectChangedFiles(api(repo(changes)), bothSides, folders)
      ).toEqual([path.join(root, 'inside.ts')]);
    });

    it('deduplicates a file that is staged and then modified again', () => {
      const staged = change('same.ts');
      const unstaged = change('same.ts');
      expect(
        collectChangedFiles(api(repo([staged], [unstaged])), bothSides, folders)
      ).toEqual([path.join(root, 'same.ts')]);
    });

    it('honours a scope that excludes the staged side', () => {
      const repository = repo([change('staged.ts')], [change('unstaged.ts')]);
      expect(
        collectChangedFiles(
          api(repository),
          { staged: false, unstaged: true, granularity: 'files' },
          folders
        )
      ).toEqual([path.join(root, 'unstaged.ts')]);
    });

    it('honours a scope that excludes the unstaged side', () => {
      const repository = repo([change('staged.ts')], [change('unstaged.ts')]);
      expect(
        collectChangedFiles(
          api(repository),
          { staged: true, unstaged: false, granularity: 'files' },
          folders
        )
      ).toEqual([path.join(root, 'staged.ts')]);
    });

    it('returns nothing when there are no repositories', () => {
      expect(collectChangedFiles(api(), bothSides, folders)).toEqual([]);
    });

    it('tolerates a repository with no change arrays at all', () => {
      const bare = { rootUri: { fsPath: root }, state: {} } as GitRepository;
      expect(collectChangedFiles(api(bare), bothSides, folders)).toEqual([]);
    });

    it('tolerates an api with no repositories property', () => {
      expect(
        collectChangedFiles({} as GitApi, bothSides, folders)
      ).toEqual([]);
    });

    it('skips a change carrying no uri', () => {
      const broken = { status: 5 } as GitChange;
      expect(
        collectChangedFiles(api(repo([broken])), bothSides, folders)
      ).toEqual([]);
    });
  });

  describe('parseChangedLineRanges', () => {
    it('reads the new-file side of each hunk header', () => {
      const diff = [
        'diff --git a/x.ts b/x.ts',
        '@@ -1,3 +1,4 @@',
        ' context',
        '@@ -20,2 +24,6 @@',
        ' context',
      ].join('\n');

      expect(parseChangedLineRanges(diff)).toEqual([
        { start: 1, end: 4 },
        { start: 24, end: 29 },
      ]);
    });

    it('treats a hunk header with no count as a single line', () => {
      expect(parseChangedLineRanges('@@ -4 +4 @@')).toEqual([
        { start: 4, end: 4 },
      ]);
    });

    it('ignores a pure deletion, which leaves nothing to scan', () => {
      expect(parseChangedLineRanges('@@ -10,4 +9,0 @@')).toEqual([]);
    });

    it('returns nothing for a diff with no hunks', () => {
      expect(parseChangedLineRanges('diff --git a/x.ts b/x.ts\n')).toEqual([]);
    });

    it('handles an added file reported as a single whole-file hunk', () => {
      expect(parseChangedLineRanges('@@ -0,0 +1,12 @@')).toEqual([
        { start: 1, end: 12 },
      ]);
    });
  });

  describe('isWithinChangedLines', () => {
    const ranges = new Map([
      [pathKey(path.join(root, 'a.ts')), [{ start: 10, end: 14 }]],
    ]);

    it('keeps a row inside a changed hunk', () => {
      expect(
        isWithinChangedLines(path.join(root, 'a.ts'), 12, ranges)
      ).toBe(true);
    });

    it('keeps a row landing exactly on each hunk boundary', () => {
      expect(isWithinChangedLines(path.join(root, 'a.ts'), 10, ranges)).toBe(
        true
      );
      expect(isWithinChangedLines(path.join(root, 'a.ts'), 14, ranges)).toBe(
        true
      );
    });

    it('drops a row outside every hunk', () => {
      expect(isWithinChangedLines(path.join(root, 'a.ts'), 9, ranges)).toBe(
        false
      );
      expect(isWithinChangedLines(path.join(root, 'a.ts'), 15, ranges)).toBe(
        false
      );
    });

    it('keeps a file with no recorded ranges whole, which is the untracked case', () => {
      expect(isWithinChangedLines(path.join(root, 'new.ts'), 99, ranges)).toBe(
        true
      );
    });
  });

  describe('collectChangedLineRanges', () => {
    const target = path.join(root, 'a.ts');

    it('reads the unstaged diff for a working tree change', async () => {
      const repository = repo([], [change('a.ts')], {
        [target]: '@@ -1,2 +3,4 @@',
      });

      const ranges = await collectChangedLineRanges(
        api(repository),
        bothSides,
        [target]
      );

      expect(ranges.get(pathKey(target))).toEqual([{ start: 3, end: 6 }]);
      expect(repository.diffWithHEAD).toHaveBeenCalledWith(target);
      expect(repository.diffIndexWithHEAD).not.toHaveBeenCalled();
    });

    it('reads the staged diff for an index change', async () => {
      const repository = repo([change('a.ts')], [], {
        [target]: '@@ -1,2 +1,2 @@',
      });

      await collectChangedLineRanges(api(repository), bothSides, [target]);

      expect(repository.diffIndexWithHEAD).toHaveBeenCalledWith(target);
      expect(repository.diffWithHEAD).not.toHaveBeenCalled();
    });

    it('unions the ranges when a file is both staged and modified', async () => {
      const repository = repo([change('a.ts')], [change('a.ts')], {
        [target]: '@@ -1,1 +1,1 @@',
      });

      const ranges = await collectChangedLineRanges(
        api(repository),
        bothSides,
        [target]
      );

      expect(ranges.get(pathKey(target))).toEqual([
        { start: 1, end: 1 },
        { start: 1, end: 1 },
      ]);
    });

    it('records nothing for an untracked file, so it is kept whole', async () => {
      const repository = repo([], [change('a.ts', 7)], {
        [target]: '@@ -1,1 +1,1 @@',
      });

      const ranges = await collectChangedLineRanges(
        api(repository),
        bothSides,
        [target]
      );

      expect(ranges.has(pathKey(target))).toBe(false);
    });

    it('ignores changes for files that were not scanned', async () => {
      const repository = repo([], [change('other.ts')], {
        [path.join(root, 'other.ts')]: '@@ -1,1 +1,1 @@',
      });

      const ranges = await collectChangedLineRanges(
        api(repository),
        bothSides,
        [target]
      );

      expect(ranges.size).toBe(0);
    });

    it('skips a change carrying no uri', async () => {
      const bare = { status: 5 } as GitChange;
      const ranges = await collectChangedLineRanges(
        api(repo([], [bare])),
        bothSides,
        [target]
      );
      expect(ranges.size).toBe(0);
    });

    it('records nothing when the diff comes back empty', async () => {
      const repository = repo([], [change('a.ts')], {});
      const ranges = await collectChangedLineRanges(
        api(repository),
        bothSides,
        [target]
      );
      expect(ranges.has(pathKey(target))).toBe(false);
    });

    it('records nothing when the repository cannot produce a diff', async () => {
      const repository = {
        rootUri: { fsPath: root },
        state: { indexChanges: [], workingTreeChanges: [change('a.ts')] },
      } as unknown as GitRepository;

      const ranges = await collectChangedLineRanges(
        api(repository),
        bothSides,
        [target]
      );
      expect(ranges.has(pathKey(target))).toBe(false);
    });

    it('records nothing when the diff call throws', async () => {
      const repository = {
        rootUri: { fsPath: root },
        state: { indexChanges: [], workingTreeChanges: [change('a.ts')] },
        diffWithHEAD: jest.fn().mockRejectedValue(new Error('no HEAD')),
      } as unknown as GitRepository;

      const ranges = await collectChangedLineRanges(
        api(repository),
        bothSides,
        [target]
      );
      expect(ranges.has(pathKey(target))).toBe(false);
    });

    it('treats a repository with no index list as having nothing staged', async () => {
      const diffWithHEAD = jest.fn().mockResolvedValue('@@ -1,1 +7,2 @@');
      const repository = {
        rootUri: { fsPath: root },
        state: { workingTreeChanges: [change('a.ts')] },
        diffWithHEAD,
      } as unknown as GitRepository;

      const ranges = await collectChangedLineRanges(
        api(repository),
        bothSides,
        [target]
      );

      expect(diffWithHEAD).toHaveBeenCalledWith(target);
      expect(ranges.get(pathKey(target))).toEqual([{ start: 7, end: 8 }]);
    });

    it('tolerates an api with no repositories property', async () => {
      const ranges = await collectChangedLineRanges({} as GitApi, bothSides, [
        target,
      ]);
      expect(ranges.size).toBe(0);
    });
  });
});
