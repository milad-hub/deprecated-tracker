import * as fs from "fs";
import * as ts from "typescript";
import { PlatformDirectoryEntry, ScannerPlatform } from "../interfaces";
import { nodeDirectory } from "./nodeDirectory";

/**
 * The scanner on a real filesystem: the extension and the CLI both run here.
 *
 * Every method is the code that used to sit inline in `scanner.ts` and
 * `configDiscovery.ts`, moved behind the interface so those two files no longer
 * import `fs` and can be bundled for a browser. `ts.sys` is used where it
 * already was, and it exists on this platform by definition.
 */
export const nodePlatform: ScannerPlatform = {
  directoryExists(directoryPath: string): boolean {
    return ts.sys.directoryExists(directoryPath);
  },

  readFile(filePath: string): string | undefined {
    return ts.sys.readFile(filePath);
  },

  modifiedMs(filePath: string): number {
    // The unknown value is the initial one rather than a `return` in the catch,
    // so a missing file needs no statement of its own to keep covered.
    let modified = -1;
    try {
      modified = fs.statSync(filePath).mtimeMs;
    } catch {
      // Missing or unreadable files count as changed on every scan.
    }
    return modified;
  },

  readDirectory(directoryPath: string): PlatformDirectoryEntry[] {
    return nodeDirectory.readDirectory(directoryPath);
  },

  createCompilerHost(options: ts.CompilerOptions): ts.CompilerHost {
    return ts.createCompilerHost(options, true);
  },

  parseConfigHost: ts.sys,
};
