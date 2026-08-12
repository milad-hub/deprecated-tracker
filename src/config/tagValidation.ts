export const RESERVED_JSDOC_TAGS = [
  "@deprecated",
  "@param",
  "@returns",
  "@return",
  "@type",
  "@typedef",
  "@template",
  "@see",
  "@link",
  "@example",
  "@throws",
  "@private",
  "@public",
  "@protected",
  "@readonly",
  "@override",
  "@package",
  "@internal",
  "@alpha",
  "@beta",
  "@module",
  "@namespace",
  "@enum",
  "@class",
  "@interface",
  "@function",
  "@method",
  "@property",
  "@const",
  "@var",
  "@constructor",
  "@extends",
  "@implements",
  "@augments",
  "@memberof",
  "@description",
  "@summary",
  "@since",
  "@version",
  "@author",
  "@license",
  "@todo",
  "@callback",
];

const HEX_COLOR = /^#([0-9a-f]{6}|[0-9a-f]{3})$/i;

export function normalizeTag(tag: string): string {
  // Trim before stripping the @, not after: " @param " would otherwise
  // normalise to "@param", match nothing in the reserved list, and let a
  // reserved tag through on the strength of one leading space.
  return tag.trim().replace(/^@/, "").trim().toLowerCase();
}

/**
 * The tag-name rules, as a message rather than an exception.
 *
 * Both surfaces have to answer the same question and must answer it the same
 * way — a config that enables `@param` has to be refused exactly where the
 * settings page refuses it — but they differ in what to do next. The editor
 * shows the error to someone who is mid-edit; a config file is read inside a
 * commit hook, where throwing would take the commit down over a typo.
 */
export function describeTagProblem(tag: unknown): string | undefined {
  if (typeof tag !== "string" || !tag.trim()) {
    return "Tag name is required";
  }
  if (!tag.trim().startsWith("@")) {
    return "Tag must start with @";
  }

  const normalized = normalizeTag(tag);
  const reserved = RESERVED_JSDOC_TAGS.find(
    (candidate) => normalizeTag(candidate) === normalized,
  );
  if (reserved) {
    return `Tag "${tag}" conflicts with reserved JSDoc tag "${reserved}". Please choose a different name.`;
  }

  return undefined;
}

export function validateTagInput(
  tag: string,
  label?: string,
  color?: string,
): void {
  const problem = describeTagProblem(tag);
  if (problem) {
    throw new Error(problem);
  }
  if (!label || !label.trim()) {
    throw new Error("Label is required");
  }
  if (color && !HEX_COLOR.test(color.trim())) {
    throw new Error("Color must be a valid hex value");
  }
}

export function isValidRegex(pattern: string): boolean {
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}
