import * as ts from "typescript";

/**
 * Everything the scanner needs from the machine underneath it.
 *
 * The detection logic is pure TypeScript-compiler work and runs anywhere the
 * compiler runs — including a browser, which has no `fs` and where `ts.sys` is
 * undefined. Routing the four filesystem reads and both TypeScript hosts through
 * one interface is what lets the same scanner serve the extension, the CLI and a
 * web page without a second implementation of the part that matters.
 *
 * The Node implementation in `nodePlatform.ts` is the behaviour every existing
 * caller already had; nothing about a normal scan changes.
 */
export interface ScannerPlatform {
  /** Does this directory exist? */
  directoryExists(directoryPath: string): boolean;

  /** File contents, or `undefined` when the file cannot be read. */
  readFile(filePath: string): string | undefined;

  /**
   * Last-modified time in milliseconds, or `-1` when unknown. Unknown counts as
   * changed, so a file the platform cannot stat invalidates the program cache
   * instead of pinning it to a stale program.
   */
  modifiedMs(filePath: string): number;

  /** Directory entries, or an empty list when the directory cannot be read. */
  readDirectory(directoryPath: string): PlatformDirectoryEntry[];

  /** The host `ts.createProgram` builds against. */
  createCompilerHost(options: ts.CompilerOptions): ts.CompilerHost;

  /** The host `tsconfig.json` is parsed against. */
  parseConfigHost: ts.ParseConfigHost;
}

export interface PlatformDirectoryEntry {
  name: string;
  isDirectory: boolean;
}
