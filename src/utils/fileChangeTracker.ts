import * as vscode from 'vscode';

export class FileChangeTracker {
  private changedFiles: Set<string> = new Set();
  private watcher?: vscode.FileSystemWatcher;

  public startWatching(workspaceRoot: string): void {
    if (this.watcher) {
      this.watcher.dispose();
    }

    // Watch all TypeScript files
    const pattern = new vscode.RelativePattern(workspaceRoot, '**/*.ts');
    this.watcher = vscode.workspace.createFileSystemWatcher(pattern);

    // Track changed files
    this.watcher.onDidChange((uri) => {
      this.changedFiles.add(uri.fsPath);
    });

    // Track created files
    this.watcher.onDidCreate((uri) => {
      this.changedFiles.add(uri.fsPath);
    });

    // Note: We don't track deletions as deleted files no longer exist to scan
  }

  public getChangedFiles(): string[] {
    return Array.from(this.changedFiles);
  }

  public hasChanges(): boolean {
    return this.changedFiles.size > 0;
  }

  public clearChangedFiles(): void {
    this.changedFiles.clear();
  }

  public dispose(): void {
    if (this.watcher) {
      this.watcher.dispose();
      this.watcher = undefined;
    }
    this.changedFiles.clear();
  }
}
