import * as fs from "fs";
import { PlatformDirectoryEntry } from "../interfaces";

/**
 * Directory listing on a real filesystem, and nothing else.
 *
 * Deliberately separate from `nodePlatform`: this is the only capability
 * `findAllConfigFiles` needs, and the requirements check needs it without
 * dragging in the TypeScript compiler. Importing `typescript` evaluates `ts.sys`
 * at module load, which reads `fs.realpath.native` — so a caller whose tests mock
 * `fs` cannot load it at all.
 */
export const nodeDirectory = {
  readDirectory(directoryPath: string): PlatformDirectoryEntry[] {
    try {
      return fs
        .readdirSync(directoryPath, { withFileTypes: true })
        .map((entry) => ({
          name: entry.name,
          isDirectory: entry.isDirectory(),
        }));
    } catch {
      return [];
    }
  },
};
