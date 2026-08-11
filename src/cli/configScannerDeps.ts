import {
  CustomTagSource,
  DeprecatedTrackerConfig,
  IgnoreChecker,
  ScannerCustomTag,
} from "../interfaces";

/**
 * The scanner dependencies the editor supplies from workspace storage, built
 * from the config file instead. Without these the CLI matches `@deprecated`
 * only and can ignore nothing, which for a project that never installs the
 * extension means a gate that quietly passes.
 */
export function tagsFromConfig(
  config: DeprecatedTrackerConfig,
): CustomTagSource | undefined {
  const tags = config.customTags;
  if (!tags || tags.length === 0) {
    return undefined;
  }

  const enabled: ScannerCustomTag[] = tags.map((tag) => ({
    tag: tag.tag,
    description: tag.description ?? "",
  }));

  return { getEnabledTags: () => enabled };
}

export function ignoresFromConfig(
  config: DeprecatedTrackerConfig,
): IgnoreChecker {
  // Already validated by ConfigReader, so every pattern here compiles.
  const methodPatterns = (config.ignoreMethods ?? []).map(
    (pattern) => new RegExp(pattern),
  );

  return {
    // Files are excluded by `excludePatterns` globs, which the scanner applies
    // before anything reaches here. A second, regex-flavoured file mechanism
    // would be two ways to say one thing.
    isFileIgnored: () => false,
    isMethodIgnored: (_filePath: string, methodName: string) =>
      methodPatterns.some((pattern) => pattern.test(methodName)),
  };
}
