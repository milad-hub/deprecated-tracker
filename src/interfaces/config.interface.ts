export type ConfigSeverity = "info" | "warning" | "error";

export interface ConfigCustomTag {
  tag: string;
  description?: string;
}

export interface DeprecatedTrackerConfig {
  trustedPackages?: string[];
  excludePatterns?: string[];
  includePatterns?: string[];
  severity?: ConfigSeverity;
  /**
   * Tags beyond `@deprecated` to treat as deprecation markers. The editor keeps
   * its own list in workspace storage, which nothing headless can read, so this
   * is the only way a CLI-only project gets `@legacy` counted.
   */
  customTags?: ConfigCustomTag[];
  /** Regex sources. A matching method name is not reported, in any file. */
  ignoreMethods?: string[];
}

export const DEFAULT_CONFIG: DeprecatedTrackerConfig = {
  trustedPackages: [
    "rxjs",
    "lodash",
    "@angular/core",
    "@angular/common",
    "moment",
    "underscore",
  ],
  excludePatterns: [],
  includePatterns: [],
  severity: "warning",
};
