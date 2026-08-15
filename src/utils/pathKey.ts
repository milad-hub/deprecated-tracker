/**
 * A path as a lookup key, case-folded only where the filesystem is.
 *
 * Windows and the default macOS volume are case-insensitive, so `Src/A.ts` and
 * `src/a.ts` are one file and must share a key. Linux is case-sensitive, where
 * they are two files — folding there would merge them, and a changed file
 * would silently go unscanned.
 *
 * `Scanner.getPathKey` resolves the path and then defers to this; matches
 * `IgnoreManager.canonicalize`.
 */
export function pathKey(filePath: string): string {
  return process.platform === "win32" ? filePath.toLowerCase() : filePath;
}
