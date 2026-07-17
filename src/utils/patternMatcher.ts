const globRegexCache = new Map<string, RegExp>();

function globToRegex(pattern: string): RegExp {
  const cached = globRegexCache.get(pattern);
  if (cached) {
    return cached;
  }
  const normalizedPattern = pattern.replace(/\\/g, "/");
  let regexPattern = "";

  for (let index = 0; index < normalizedPattern.length; index++) {
    const character = normalizedPattern[index];
    if (character === "*" && normalizedPattern[index + 1] === "*") {
      if (normalizedPattern[index + 2] === "/") {
        regexPattern += "(?:.*/)?";
        index += 2;
      } else {
        regexPattern += ".*";
        index++;
      }
    } else if (character === "*") {
      regexPattern += "[^/]*";
    } else if (character === "?") {
      regexPattern += "[^/]";
    } else {
      regexPattern += /[\\^$+?.()|{}[\]]/.test(character)
        ? `\\${character}`
        : character;
    }
  }

  const isAbsolute =
    normalizedPattern.startsWith("/") || /^[A-Za-z]:\//.test(normalizedPattern);
  const regex = new RegExp(`${isAbsolute ? "^" : "(?:^|.*/)"}${regexPattern}$`);
  globRegexCache.set(pattern, regex);
  return regex;
}

export function matchesPattern(filePath: string, patterns: string[]): boolean {
  if (!patterns || patterns.length === 0) {
    return false;
  }
  const normalizedPath = filePath.replace(/\\/g, "/");
  return patterns.some((pattern) => globToRegex(pattern).test(normalizedPath));
}
