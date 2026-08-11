import * as fs from "fs";
import * as path from "path";
import {
  ConfigCustomTag,
  DeprecatedTrackerConfig,
  ConfigSeverity,
  DEFAULT_CONFIG,
} from "../interfaces/config.interface";
import {
  describeTagProblem,
  isValidRegex,
  normalizeTag,
} from "./tagValidation";

const CONFIG_FILE_NAME = ".deprecatedtrackerrc";
const PACKAGE_JSON_CONFIG_KEY = "deprecatedTracker";

export type ConfigWarning = (message: string) => void;

export class ConfigReader {
  /**
   * Where rejected keys are reported. The CLI passes its own stderr channel:
   * a config typo that only reached `console.warn` would be invisible inside a
   * hook, and the run would look like a clean scan.
   */
  constructor(
    private readonly warn: ConfigWarning = (message) => console.warn(message),
  ) {}

  public async loadConfiguration(
    workspaceRoot: string,
  ): Promise<DeprecatedTrackerConfig> {
    return (
      (await this.tryLoadConfiguration(workspaceRoot)) ?? { ...DEFAULT_CONFIG }
    );
  }

  /**
   * Same as {@link loadConfiguration} but returns null when the folder does not
   * define any configuration, so callers can tell "no config here" apart from
   * "config that happens to match the defaults".
   */
  public async tryLoadConfiguration(
    workspaceRoot: string,
  ): Promise<DeprecatedTrackerConfig | null> {
    const rcConfig = await this.tryLoadDeprecatedTrackerRC(workspaceRoot);
    if (rcConfig) {
      return this.validateAndMergeConfiguration(rcConfig);
    }

    const packageJsonConfig = await this.tryLoadFromPackageJson(workspaceRoot);
    if (packageJsonConfig) {
      return this.validateAndMergeConfiguration(packageJsonConfig);
    }

    return null;
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
      this.warn(
        `Failed to load configuration from ${CONFIG_FILE_NAME}: ${error}`,
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
      this.warn(`Failed to load configuration from package.json: ${error}`);
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

    if (config.severity !== undefined) {
      if (this.isValidSeverity(config.severity)) {
        validatedConfig.severity = config.severity;
      } else {
        this.warn(
          'Invalid severity configuration. Expected "info", "warning", or "error".',
        );
      }
    }

    const customTags = this.readCustomTags(config.customTags);
    if (customTags) {
      validatedConfig.customTags = customTags;
    }

    const ignoreMethods = this.readRegexArray(
      config.ignoreMethods,
      "ignoreMethods",
    );
    if (ignoreMethods) {
      validatedConfig.ignoreMethods = ignoreMethods;
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
    this.warn(`Invalid ${name} configuration. Expected array of strings.`);
    return undefined;
  }

  /**
   * Drops the offending entry and keeps the rest. Rejecting the whole array —
   * or throwing — over one bad tag would fail a commit hook for a typo, and the
   * warning already says which entry went.
   */
  private readCustomTags(value: unknown): ConfigCustomTag[] | undefined {
    if (value === undefined) {
      return undefined;
    }
    if (!Array.isArray(value)) {
      this.warn("Invalid customTags configuration. Expected an array.");
      return undefined;
    }

    const tags: ConfigCustomTag[] = [];
    const seen = new Set<string>();

    for (const entry of value) {
      const candidate = entry as Partial<ConfigCustomTag> | null;
      if (!candidate || typeof candidate !== "object") {
        this.warn(
          'Invalid customTags entry. Expected { "tag": "@name", "description": "…" }.',
        );
        continue;
      }

      const problem = describeTagProblem(candidate.tag);
      if (problem) {
        this.warn(`Ignoring custom tag: ${problem}`);
        continue;
      }

      const tag = (candidate.tag as string).trim();
      const normalized = normalizeTag(tag);
      if (seen.has(normalized)) {
        this.warn(`Ignoring duplicate custom tag "${tag}".`);
        continue;
      }

      if (
        candidate.description !== undefined &&
        typeof candidate.description !== "string"
      ) {
        this.warn(
          `Ignoring custom tag "${tag}": description must be a string.`,
        );
        continue;
      }

      seen.add(normalized);
      tags.push({ tag, description: candidate.description ?? "" });
    }

    return tags;
  }

  private readRegexArray(value: unknown, name: string): string[] | undefined {
    const patterns = this.readStringArray(value, name);
    if (!patterns) {
      return undefined;
    }

    return patterns.filter((pattern) => {
      if (isValidRegex(pattern)) {
        return true;
      }
      this.warn(`Ignoring invalid ${name} pattern: ${pattern}`);
      return false;
    });
  }

  private isValidSeverity(value: string): value is ConfigSeverity {
    return value === "info" || value === "warning" || value === "error";
  }
}
