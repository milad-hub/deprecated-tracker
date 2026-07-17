import * as path from "path";

export class PathUtils {
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
