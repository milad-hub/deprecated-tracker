function globToRegex(pattern: string): RegExp {
  const regexPattern = pattern
    .replace(/\\/g, '/')
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '___DOUBLE_STAR___')
    .replace(/\*/g, '[^/]*')
    .replace(/___DOUBLE_STAR___/g, '.*')
    .replace(/\?/g, '[^/]');
  return new RegExp(`^${regexPattern}$`);
}

export function matchesPattern(filePath: string, patterns: string[]): boolean {
  if (!patterns || patterns.length === 0) {
    return false;
  }
  const normalizedPath = filePath.replace(/\\/g, '/');
  return patterns.some((pattern) => {
    try {
      const regex = globToRegex(pattern);
      return regex.test(normalizedPath);
    } catch (error) {
      console.warn(`Invalid pattern: ${pattern}`, error);
      return false;
    }
  });
}
