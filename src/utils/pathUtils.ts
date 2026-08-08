import * as path from "path";

export class PathUtils {
  /** Returns the folder whose root contains targetPath, if any. */
  public static folderContaining<T extends { uri: { fsPath: string } }>(
    folders: readonly T[] | undefined,
    targetPath: string,
  ): T | undefined {
    return folders?.find((folder) =>
      PathUtils.isWithin(folder.uri.fsPath, targetPath),
    );
  }

  public static normalizePath(filePath: string): string {
    return path.normalize(filePath).replace(/\\/g, "/");
  }

  /**
   * Path of targetPath relative to basePath, always forward-slashed so a
   * baseline written on Windows still matches the same file on CI.
   * Falls back to the normalized absolute path when the target sits outside.
   */
  public static relativeTo(basePath: string, targetPath: string): string {
    if (!PathUtils.isWithin(basePath, targetPath)) {
      return PathUtils.normalizePath(targetPath);
    }
    const relativePath = path.relative(
      path.resolve(basePath),
      path.resolve(targetPath),
    );
    return relativePath.replace(/\\/g, "/");
  }

  public static isWithin(basePath: string, targetPath: string): boolean {
    const relativePath = path.relative(
      path.resolve(basePath),
      path.resolve(targetPath),
    );
    return (
      relativePath === "" ||
      (relativePath !== ".." &&
        !relativePath.startsWith(`..${path.sep}`) &&
        !path.isAbsolute(relativePath))
    );
  }
}
