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

/**
 * Every key the schema defines. Typed against the interface so a new option
 * cannot be added without appearing here, which is the only thing keeping the
 * unknown-key warning from turning into a false alarm on a valid config.
 */
const KNOWN_KEYS: Record<keyof DeprecatedTrackerConfig, true> = {
  trustedPackages: true,
  suppressPackages: true,
  excludePatterns: true,
  includePatterns: true,
  severity: true,
  customTags: true,
  ignoreMethods: true,
};

/** Where a run's rules came from, so a report can say it out loud. */
export interface ConfigSource {
  kind: "explicit" | "rc" | "package.json" | "defaults";
  /** Absolute path, or null when nothing on disk was read. */
  path: string | null;
}

export interface ResolvedConfig {
  config: DeprecatedTrackerConfig;
  source: ConfigSource;
}

export interface ConfigResolveOptions {
  /** A file outside the scanned tree, which wins over anything inside it. */
  explicitPath?: string;
  /** False makes the scanned repository's own configuration inert. */
  useProjectConfig?: boolean;
}

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
   * The same load, plus where the rules came from and the two switches a CI
   * operator needs.
   *
   * A repository being scanned currently supplies the rules that decide whether
   * it passes, which for a fork's pull request means the thing under test wrote
   * the test. `explicitPath` pins the rules outside the tree; `useProjectConfig:
   * false` drops them entirely.
   *
   * An explicit path that cannot be read throws rather than falling back: a CI
   * operator who named a file and silently got the defaults would be running
   * the fail-open case they used the flag to avoid.
   */
  public async resolveConfiguration(
    workspaceRoot: string,
    options: ConfigResolveOptions = {},
  ): Promise<ResolvedConfig> {
    if (options.explicitPath) {
      const resolved = path.resolve(options.explicitPath);
      return {
        config: this.validateAndMergeConfiguration(this.readFile(resolved)),
        source: { kind: "explicit", path: resolved },
      };
    }

    if (options.useProjectConfig === false) {
      return {
        config: { ...DEFAULT_CONFIG },
        source: { kind: "defaults", path: null },
      };
    }

    const rcPath = path.join(workspaceRoot, CONFIG_FILE_NAME);
    const rcConfig = await this.tryLoadDeprecatedTrackerRC(workspaceRoot);
    if (rcConfig) {
      return {
        config: this.validateAndMergeConfiguration(rcConfig),
        source: { kind: "rc", path: rcPath },
      };
    }

    const packageJsonPath = path.join(workspaceRoot, "package.json");
    const packageJsonConfig = await this.tryLoadFromPackageJson(workspaceRoot);
    if (packageJsonConfig) {
      return {
        config: this.validateAndMergeConfiguration(packageJsonConfig),
        source: { kind: "package.json", path: packageJsonPath },
      };
    }

    return {
      config: { ...DEFAULT_CONFIG },
      source: { kind: "defaults", path: null },
    };
  }

  private readFile(configPath: string): Partial<DeprecatedTrackerConfig> {
    let content: string;
    try {
      content = fs.readFileSync(configPath, "utf-8");
    } catch {
      throw new Error(`Could not read config file: ${configPath}`);
    }
    try {
      return JSON.parse(content);
    } catch (error) {
      throw new Error(`Invalid JSON in ${configPath}: ${error}`);
    }
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

    this.warnUnknownKeys(config);

    const suppressed = this.readSuppressedPackages(config);
    if (suppressed) {
      validatedConfig.trustedPackages = suppressed;
      validatedConfig.suppressPackages = suppressed;
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

  /**
   * An invalid value is reported but an unknown key was not, so `trustedPackage`
   * for `trustedPackages` read as applied and did nothing at all. A silently
   * ignored key is worse than a rejected one: the run still passes.
   */
  private warnUnknownKeys(config: Partial<DeprecatedTrackerConfig>): void {
    for (const key of Object.keys(config)) {
      if (!(key in KNOWN_KEYS)) {
        this.warn(
          `Unknown configuration key "${key}". Expected one of: ${Object.keys(KNOWN_KEYS).join(", ")}.`,
        );
      }
    }
  }

  /**
   * `suppressPackages` is the same list under a clearer name, so a config
   * carrying both gets the union rather than one silently winning. Either key
   * replaces the built-in default, which is what the old key already did.
   */
  private readSuppressedPackages(
    config: Partial<DeprecatedTrackerConfig>,
  ): string[] | undefined {
    const trusted = this.readStringArray(
      config.trustedPackages,
      "trustedPackages",
    );
    const suppress = this.readStringArray(
      config.suppressPackages,
      "suppressPackages",
    );
    if (!trusted && !suppress) {
      return undefined;
    }
    return [...new Set([...(trusted ?? []), ...(suppress ?? [])])];
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
