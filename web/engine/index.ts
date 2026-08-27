import { Scanner } from "../../src/scanner/scanner";
import type { DeprecatedItem } from "../../src/interfaces";
import { createVirtualPlatform } from "./virtualPlatform";

export { createVirtualPlatform } from "./virtualPlatform";
export type { VirtualPlatformOptions } from "./virtualPlatform";

export { scanRepository } from "./scan";
export type {
  ScanCoverage,
  ScanPhase,
  ScanProgress,
  WebScanItem,
  WebScanRequest,
  WebScanResult,
} from "./scan";

export {
  GitHubError,
  downloadFiles,
  fetchTree,
  parseRepoInput,
  rawUrl,
  resolveRepo,
} from "./github";
export type { RepoIdentity, RepoRef, TreeBlob, TreeResult } from "./github";

export { DEFAULT_LIMITS, resolveLimits, selectFiles } from "./limits";
export type { Refusal, ScanLimits, Selection, SelectionCounts } from "./limits";

export interface VirtualScanRequest {
  /** Absolute virtual paths to file contents, `/`-rooted and forward-slashed. */
  files: Map<string, string>;
  libFiles?: Map<string, string>;
}

/**
 * Scan a set of files held in memory — no disk, no `ts.sys`, no `fs`.
 *
 * The portable entry point underneath everything else here: the same `Scanner`
 * the extension and the CLI use, handed a platform backed by a `Map`. Fetching,
 * capping and progress belong to `scanRepository`.
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
