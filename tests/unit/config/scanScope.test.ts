import * as vscode from 'vscode';
import { STORAGE_KEY_SCAN_CHANGES_SCOPE } from '../../../src/constants';
import {
  DEFAULT_SCAN_CHANGES_SCOPE,
  ScanScopeManager,
} from '../../../src/config/scanScope';

describe('ScanScopeManager', () => {
  let stored: unknown;
  let update: jest.Mock;
  let manager: ScanScopeManager;

  beforeEach(() => {
    stored = undefined;
    update = jest.fn().mockResolvedValue(undefined);
    const context = {
      workspaceState: {
        get: jest.fn(() => stored),
        update,
      },
    } as unknown as vscode.ExtensionContext;
    manager = new ScanScopeManager(context);
  });

  describe('getScope', () => {
    it('defaults to both sides and whole files', () => {
      expect(manager.getScope()).toEqual({
        staged: true,
        unstaged: true,
        granularity: 'files',
      });
    });

    it('returns a copy, so the default cannot be mutated through it', () => {
      const scope = manager.getScope();
      scope.staged = false;
      expect(DEFAULT_SCAN_CHANGES_SCOPE.staged).toBe(true);
    });

    it('reads a stored scope back', () => {
      stored = { staged: false, unstaged: true, granularity: 'lines' };
      expect(manager.getScope()).toEqual({
        staged: false,
        unstaged: true,
        granularity: 'lines',
      });
    });

    it('falls back to the defaults for non-boolean sides', () => {
      stored = { staged: 'yes', unstaged: null, granularity: 'files' };
      expect(manager.getScope()).toEqual({
        staged: true,
        unstaged: true,
        granularity: 'files',
      });
    });

    it('treats any unrecognised granularity as whole files', () => {
      stored = { staged: true, unstaged: true, granularity: 'nonsense' };
      expect(manager.getScope().granularity).toBe('files');
    });
  });

  describe('setScope', () => {
    it('stores a merged scope under the workspace key', async () => {
      stored = { staged: true, unstaged: true, granularity: 'files' };
      await manager.setScope({ granularity: 'lines' });

      expect(update).toHaveBeenCalledWith(STORAGE_KEY_SCAN_CHANGES_SCOPE, {
        staged: true,
        unstaged: true,
        granularity: 'lines',
      });
    });

    it('leaves the untouched side alone', async () => {
      stored = { staged: true, unstaged: true, granularity: 'files' };
      await manager.setScope({ staged: false });

      expect(update).toHaveBeenCalledWith(STORAGE_KEY_SCAN_CHANGES_SCOPE, {
        staged: false,
        unstaged: true,
        granularity: 'files',
      });
    });

    it('normalises an unrecognised granularity before storing', async () => {
      await manager.setScope({
        granularity: 'sideways' as never,
      });

      expect(update).toHaveBeenCalledWith(STORAGE_KEY_SCAN_CHANGES_SCOPE, {
        staged: true,
        unstaged: true,
        granularity: 'files',
      });
    });

    // A setting that silently disables its own feature is a support ticket.
    it('refuses a scope with neither side selected, and stores nothing', async () => {
      stored = { staged: true, unstaged: false, granularity: 'files' };

      await expect(manager.setScope({ staged: false })).rejects.toThrow(
        'Select at least one of Staged or Unstaged'
      );
      expect(update).not.toHaveBeenCalled();
    });

    it('allows clearing one side while the other stays on', async () => {
      stored = { staged: true, unstaged: true, granularity: 'files' };
      await expect(manager.setScope({ unstaged: false })).resolves.toBeUndefined();
      expect(update).toHaveBeenCalledWith(STORAGE_KEY_SCAN_CHANGES_SCOPE, {
        staged: true,
        unstaged: false,
        granularity: 'files',
      });
    });
  });
});
