export type ConfigSeverity = "info" | "warning" | "error";

export interface DeprecatedTrackerConfig {
  trustedPackages?: string[];
  excludePatterns?: string[];
  includePatterns?: string[];
  ignoreDeprecatedInComments?: boolean;
  severity?: ConfigSeverity;
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
  ignoreDeprecatedInComments: false,
  severity: "warning",
};
