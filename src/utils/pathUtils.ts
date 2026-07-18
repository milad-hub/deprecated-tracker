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
