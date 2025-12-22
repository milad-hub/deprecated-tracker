import * as fs from "fs";
import * as path from "path";
import {
  DeprecatedTrackerConfig,
  ConfigSeverity,
  DEFAULT_CONFIG,
} from "../interfaces/config.interface";

const CONFIG_FILE_NAME = ".deprecatedtrackerrc";
const PACKAGE_JSON_CONFIG_KEY = "deprecatedTracker";

export class ConfigReader {
  public async loadConfiguration(
    workspaceRoot: string,
  ): Promise<DeprecatedTrackerConfig> {
    const rcConfig = await this.tryLoadDeprecatedTrackerRC(workspaceRoot);
    if (rcConfig) {
      return this.validateAndMergeConfiguration(rcConfig);
    }

    const packageJsonConfig = await this.tryLoadFromPackageJson(workspaceRoot);
    if (packageJsonConfig) {
      return this.validateAndMergeConfiguration(packageJsonConfig);
    }

    return { ...DEFAULT_CONFIG };
  }

  private async tryLoadDeprecatedTrackerRC(
    workspaceRoot: string,
  ): Promise<Partial<DeprecatedTrackerConfig> | null> {
    const configPath = path.join(workspaceRoot, CONFIG_FILE_NAME);

    if (!fs.existsSync(configPath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(configPath, "utf-8");
      const config = JSON.parse(content);
      return config;
    } catch (error) {
      console.warn(
        `Failed to load configuration from ${CONFIG_FILE_NAME}:`,
        error,
      );
      return null;
    }
  }

  private async tryLoadFromPackageJson(
    workspaceRoot: string,
  ): Promise<Partial<DeprecatedTrackerConfig> | null> {
    const packageJsonPath = path.join(workspaceRoot, "package.json");

    if (!fs.existsSync(packageJsonPath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(packageJsonPath, "utf-8");
      const packageJson = JSON.parse(content);

      if (
        packageJson[PACKAGE_JSON_CONFIG_KEY] &&
        typeof packageJson[PACKAGE_JSON_CONFIG_KEY] === "object"
      ) {
        return packageJson[PACKAGE_JSON_CONFIG_KEY];
      }

      return null;
    } catch (error) {
      console.warn("Failed to load configuration from package.json:", error);
      return null;
    }
  }

  private validateAndMergeConfiguration(
    config: Partial<DeprecatedTrackerConfig>,
  ): DeprecatedTrackerConfig {
    const validatedConfig: DeprecatedTrackerConfig = {
      ...DEFAULT_CONFIG,
    };

    if (config.trustedPackages !== undefined) {
      if (
        Array.isArray(config.trustedPackages) &&
        config.trustedPackages.every((pkg) => typeof pkg === "string")
      ) {
        validatedConfig.trustedPackages = [
          ...(DEFAULT_CONFIG.trustedPackages || []),
          ...config.trustedPackages,
        ];
      } else {
        console.warn(
          "Invalid trustedPackages configuration. Expected array of strings.",
        );
      }
    }

    if (config.excludePatterns !== undefined) {
      if (
        Array.isArray(config.excludePatterns) &&
        config.excludePatterns.every((pattern) => typeof pattern === "string")
      ) {
        validatedConfig.excludePatterns = config.excludePatterns;
      } else {
        console.warn(
          "Invalid excludePatterns configuration. Expected array of strings.",
        );
      }
    }

    if (config.includePatterns !== undefined) {
      if (
        Array.isArray(config.includePatterns) &&
        config.includePatterns.every((pattern) => typeof pattern === "string")
      ) {
        validatedConfig.includePatterns = config.includePatterns;
      } else {
        console.warn(
          "Invalid includePatterns configuration. Expected array of strings.",
        );
      }
    }

    if (config.ignoreDeprecatedInComments !== undefined) {
      if (typeof config.ignoreDeprecatedInComments === "boolean") {
        validatedConfig.ignoreDeprecatedInComments =
          config.ignoreDeprecatedInComments;
      } else {
        console.warn(
          "Invalid ignoreDeprecatedInComments configuration. Expected boolean.",
        );
      }
    }

    if (config.severity !== undefined) {
      if (this.isValidSeverity(config.severity)) {
        validatedConfig.severity = config.severity;
      } else {
        console.warn(
          'Invalid severity configuration. Expected "info", "warning", or "error".',
        );
      }
    }

    return validatedConfig;
  }

  private isValidSeverity(value: string): value is ConfigSeverity {
    return value === "info" || value === "warning" || value === "error";
  }
}
