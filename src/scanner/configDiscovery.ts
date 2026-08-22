import * as path from "path";
import { JSCONFIG_FILE, TSCONFIG_FILE } from "../constants";
import type { ScannerPlatform } from "../interfaces";

export function findAllConfigFiles(
  rootDir: string,
  platform: Pick<ScannerPlatform, "readDirectory">,
): string[] {
  const configs: string[] = [];
  const skippedDirs = new Set([
    "node_modules",
    "out",
    "dist",
    "build",
    "coverage",
    ".vscode-test",
  ]);
  const walk = (dir: string): void => {
    const entries = platform.readDirectory(dir);
    const fileNames = new Set(
      entries.filter((entry) => !entry.isDirectory).map((entry) => entry.name),
    );
    if (fileNames.has(TSCONFIG_FILE)) {
      configs.push(path.join(dir, TSCONFIG_FILE));
    } else if (fileNames.has(JSCONFIG_FILE)) {
      configs.push(path.join(dir, JSCONFIG_FILE));
    }
    for (const entry of entries) {
      if (
        !entry.isDirectory ||
        entry.name.startsWith(".") ||
        skippedDirs.has(entry.name)
      ) {
        continue;
      }
      walk(path.join(dir, entry.name));
    }
  };
  walk(path.normalize(rootDir));
  return configs;
}
