import * as path from 'path';
import {
    collectWorkingTreeLineRanges,
    listWorkingTreeFiles,
} from '../../../src/cli/stagedDiff';
import { pathKey } from '../../../src/utils';

const cwd = path.resolve('/repo');
const at = (relative: string): string => path.resolve(cwd, relative);

describe('listWorkingTreeFiles', () => {
    it('asks git for the index, the working tree and untracked files', () => {
        const git = jest.fn().mockReturnValue('');

        listWorkingTreeFiles(cwd, git);

        expect(git).toHaveBeenNthCalledWith(
            1,
            ['diff', '--cached', '--name-only', '--relative', '--diff-filter=ACMR', '-z'],
            cwd
        );
        expect(git).toHaveBeenNthCalledWith(
            2,
            ['diff', '--name-only', '--relative', '--diff-filter=ACMR', '-z'],
            cwd
        );
        expect(git).toHaveBeenNthCalledWith(
            3,
            ['ls-files', '-z', '--others', '--exclude-standard'],
            cwd
        );
    });

    it('returns the union of all three lists', () => {
        const git = jest
            .fn()
            .mockReturnValueOnce('src/staged.ts\0')
            .mockReturnValueOnce('src/unstaged.ts\0')
            .mockReturnValueOnce('src/untracked.ts\0');

        expect(listWorkingTreeFiles(cwd, git)).toEqual([
            at('src/staged.ts'),
            at('src/unstaged.ts'),
            at('src/untracked.ts'),
        ]);
    });

    // A file staged and then edited again appears in two of the three lists.
    it('reports a file appearing twice only once', () => {
        const git = jest
            .fn()
            .mockReturnValueOnce('src/a.ts\0')
            .mockReturnValueOnce('src/a.ts\0')
            .mockReturnValueOnce('');

        expect(listWorkingTreeFiles(cwd, git)).toEqual([at('src/a.ts')]);
    });

    // One file on Windows, two on Linux — merging them there would drop a
    // changed file from the scan.
    it('dedupes by case only where the filesystem does', () => {
        const git = jest
            .fn()
            .mockReturnValueOnce('src/A.ts\0')
            .mockReturnValueOnce('src/a.ts\0')
            .mockReturnValueOnce('');

        expect(listWorkingTreeFiles(cwd, git)).toHaveLength(
            process.platform === 'win32' ? 1 : 2
        );
    });

    it('survives a git that is missing or angry', () => {
        const git = jest.fn().mockImplementation(() => {
            throw new Error('not a git repository');
        });

        expect(listWorkingTreeFiles(cwd, git)).toEqual([]);
    });

    it('tolerates undefined output', () => {
        const git = jest.fn().mockReturnValue(undefined as unknown as string);

        expect(listWorkingTreeFiles(cwd, git)).toEqual([]);
    });
});

describe('collectWorkingTreeLineRanges', () => {
    it('asks git once for the working tree against HEAD', () => {
        const git = jest.fn().mockReturnValue('');

        collectWorkingTreeLineRanges([at('a.ts')], cwd, git);

        expect(git).toHaveBeenCalledTimes(1);
        expect(git).toHaveBeenCalledWith(
            ['-c', 'core.quotePath=false', 'diff', 'HEAD', '--unified=0', '--no-color', '-M', '--relative'],
            cwd
        );
    });

    // One numbering, the one on disk, for everything not yet committed.
    it('reads the added ranges in working-tree numbering', () => {
        const git = jest
            .fn()
            .mockReturnValue('diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1,0 +5,2 @@\n@@ -9,0 +20,1 @@\n');

        expect(collectWorkingTreeLineRanges([at('a.ts')], cwd, git)).toEqual(
            new Map([
                [
                    pathKey(at('a.ts')),
                    [
                        { start: 5, end: 6 },
                        { start: 20, end: 20 },
                    ],
                ],
            ])
        );
    });

    // No entry means "entirely changed", which is the right reading of a file
    // git has never seen. An empty array would mean the opposite.
    it('leaves an untracked file out of the map entirely', () => {
        const git = jest.fn().mockReturnValue('');

        const ranges = collectWorkingTreeLineRanges([at('new.ts')], cwd, git);

        expect(ranges.has(pathKey(at('new.ts')))).toBe(false);
        expect(ranges.size).toBe(0);
    });

    it('skips a file git cannot diff rather than failing the run', () => {
        const git = jest.fn().mockImplementation(() => {
            throw new Error('bad revision');
        });

        expect(collectWorkingTreeLineRanges([at('a.ts')], cwd, git).size).toBe(
            0
        );
    });

    it('tolerates undefined output from the unstaged diff', () => {
        const git = jest
            .fn()
            .mockReturnValueOnce('')
            .mockReturnValueOnce(undefined as unknown as string);

        expect(collectWorkingTreeLineRanges([at('a.ts')], cwd, git).size).toBe(
            0
        );
    });
});
