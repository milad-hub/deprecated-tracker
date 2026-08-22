import * as ts from "typescript";
import type {
  PlatformDirectoryEntry,
  ScannerPlatform,
} from "../../src/interfaces";

/**
 * A `ScannerPlatform` over a file map held in memory — the platform a browser
 * scans on, once it has fetched a repository's source files.
 *
 * Lives outside `src/` on purpose. It is not part of the extension or the CLI,
 * and `src/**` is held at 100% coverage by the Jest gate, which this file has no
 * business being measured against.
 */
export interface VirtualPlatformOptions {
  /** Absolute virtual paths (always `/`-rooted, always forward slashes). */
  files: Map<string, string>;
  /**
   * `lib.d.ts` and friends, when the scan needs them. A repository scan without
   * them still resolves every symbol declared in the repository itself, which is
   * what the deprecation check reads — a missing lib costs type errors nobody
   * looks at, not missing findings.
   */
  libFiles?: Map<string, string>;
}

export function createVirtualPlatform(
  options: VirtualPlatformOptions,
): ScannerPlatform {
  const files = options.files;
  const libFiles = options.libFiles ?? new Map<string, string>();
  const sourceFileCache = new Map<string, ts.SourceFile>();

  const read = (filePath: string): string | undefined =>
    files.get(filePath) ?? libFiles.get(filePath);

  const directories = new Set<string>();
  for (const filePath of files.keys()) {
    let parent = filePath.slice(0, filePath.lastIndexOf("/"));
    while (parent !== "") {
      directories.add(parent);
      parent = parent.slice(0, parent.lastIndexOf("/"));
    }
    directories.add("/");
  }

  const platform: ScannerPlatform = {
    directoryExists(directoryPath: string): boolean {
      return directories.has(trimTrailingSlash(directoryPath));
    },

    readFile(filePath: string): string | undefined {
      return read(filePath);
    },

    modifiedMs(): number {
      // A fetched snapshot never changes under us, so every file reports the
      // same instant and the program cache is never invalidated mid-session.
      return 0;
    },

    readDirectory(directoryPath: string): PlatformDirectoryEntry[] {
      const prefix =
        trimTrailingSlash(directoryPath) === "/"
          ? "/"
          : `${trimTrailingSlash(directoryPath)}/`;
      const entries = new Map<string, PlatformDirectoryEntry>();

      for (const filePath of files.keys()) {
        if (!filePath.startsWith(prefix)) {
          continue;
        }
        const remainder = filePath.slice(prefix.length);
        const slash = remainder.indexOf("/");
        const name = slash === -1 ? remainder : remainder.slice(0, slash);
        if (name !== "") {
          entries.set(name, { name, isDirectory: slash !== -1 });
        }
      }

      return [...entries.values()];
    },

    createCompilerHost(compilerOptions: ts.CompilerOptions): ts.CompilerHost {
      return {
        fileExists: (filePath) => read(filePath) !== undefined,
        readFile: read,
        getSourceFile: (filePath, languageVersion) => {
          const cached = sourceFileCache.get(filePath);
          if (cached) {
            return cached;
          }
          const text = read(filePath);
          if (text === undefined) {
            return undefined;
          }
          const sourceFile = ts.createSourceFile(
            filePath,
            text,
            languageVersion,
            true,
          );
          sourceFileCache.set(filePath, sourceFile);
          return sourceFile;
        },
        getDefaultLibFileName: () => defaultLib(libFiles, compilerOptions),
        writeFile: () => {
          // A scan emits nothing.
        },
        getCurrentDirectory: () => "/",
        getCanonicalFileName: (filePath) => filePath,
        useCaseSensitiveFileNames: () => true,
        getNewLine: () => "\n",
        directoryExists: (directoryPath) =>
          platform.directoryExists(directoryPath),
        getDirectories: (directoryPath) =>
          platform
            .readDirectory(directoryPath)
            .filter((entry) => entry.isDirectory)
            .map((entry) => entry.name),
        realpath: (filePath) => filePath,
      };
    },

    parseConfigHost: {
      useCaseSensitiveFileNames: true,
      readDirectory: (rootDir, extensions) =>
        [...files.keys()].filter(
          (filePath) =>
            filePath.startsWith(trimTrailingSlash(rootDir)) &&
            (extensions.length === 0 ||
              extensions.some((extension) => filePath.endsWith(extension))),
        ),
      fileExists: (filePath) => read(filePath) !== undefined,
      readFile: read,
    },
  };

  return platform;
}

function trimTrailingSlash(directoryPath: string): string {
  if (directoryPath.length > 1 && directoryPath.endsWith("/")) {
    return directoryPath.slice(0, -1);
  }
  return directoryPath;
}

function defaultLib(
  libFiles: Map<string, string>,
  compilerOptions: ts.CompilerOptions,
): string {
  const name = ts.getDefaultLibFileName(compilerOptions);
  for (const candidate of [`/${name}`, name]) {
    if (libFiles.has(candidate)) {
      return candidate;
    }
  }
  // No lib supplied: point at a path that does not exist. TypeScript reports it
  // as a diagnostic, which a scan ignores, rather than throwing.
  return `/${name}`;
}
