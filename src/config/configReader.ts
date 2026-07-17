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

    const trustedPackages = this.readStringArray(
      config.trustedPackages,
      "trustedPackages",
    );
    if (trustedPackages) {
      validatedConfig.trustedPackages = trustedPackages;
    }

    const excludePatterns = this.readStringArray(
      config.excludePatterns,
      "excludePatterns",
    );
    if (excludePatterns) {
      validatedConfig.excludePatterns = excludePatterns;
    }

    const includePatterns = this.readStringArray(
      config.includePatterns,
      "includePatterns",
    );
    if (includePatterns) {
      validatedConfig.includePatterns = includePatterns;
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

  private readStringArray(value: unknown, name: string): string[] | undefined {
    if (value === undefined) {
      return undefined;
    }
    if (
      Array.isArray(value) &&
      value.every((item) => typeof item === "string")
    ) {
      return [...value];
    }
    console.warn(`Invalid ${name} configuration. Expected array of strings.`);
    return undefined;
  }

  private isValidSeverity(value: string): value is ConfigSeverity {
    return value === "info" || value === "warning" || value === "error";
  }
}
