import { Scanner } from "../../src/scanner/scanner";
import type { DeprecatedItem } from "../../src/interfaces";
import { createVirtualPlatform } from "./virtualPlatform";

export { createVirtualPlatform } from "./virtualPlatform";
export type { VirtualPlatformOptions } from "./virtualPlatform";

export interface VirtualScanRequest {
  /** Absolute virtual paths to file contents, `/`-rooted and forward-slashed. */
  files: Map<string, string>;
  /** Config the scan runs from; defaults to every tsconfig/jsconfig found. */
  configPaths?: string[];
  libFiles?: Map<string, string>;
}

/**
 * Scan a set of files held in memory — no disk, no `ts.sys`, no `fs`.
 *
 * This is the whole of the portable entry point: the same `Scanner` the
 * extension and the CLI use, handed a platform backed by a `Map`. Fetching the
 * files, capping the size and reporting progress belong to the web engine and
 * are not this function's job.
 */
export async function scanVirtualProject(
  request: VirtualScanRequest,
): Promise<DeprecatedItem[]> {
  const platform = createVirtualPlatform({
    files: request.files,
    libFiles: request.libFiles,
  });

  const scanner = new Scanner(
    { isFileIgnored: () => false, isMethodIgnored: () => false },
    undefined,
    undefined,
    platform,
  );

  return scanner.scanProject("/");
}
