import * as path from "path";

export class PathUtils {
  public static getFileName(filePath: string): string {
    return path.basename(filePath);
  }

  public static getRelativePath(filePath: string, basePath: string): string {
    return path.relative(basePath, filePath);
  }

  public static normalizePath(filePath: string): string {
    return path.normalize(filePath).replace(/\\/g, "/");
  }

  public static join(...paths: string[]): string {
    return path.join(...paths);
  }
}
