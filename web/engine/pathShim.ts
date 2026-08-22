/**
 * The subset of Node's `path` the scanner actually uses, POSIX-only.
 *
 * A browser has no `path`, and the eight functions below are the whole surface
 * the bundled scanner touches: `resolve`, `normalize`, `join`, `relative`,
 * `dirname`, `basename`, `isAbsolute` and `sep`. The web build aliases `path` to
 * this file, so no source file in `src/` has to know it might run in a browser.
 *
 * POSIX-only is correct here rather than a shortcut: every path in a web scan is
 * a repository path from the GitHub tree API, which is always forward-slashed and
 * always relative to one virtual root.
 */
export const sep = "/";
export const delimiter = ":";

export function isAbsolute(target: string): boolean {
  return target.startsWith("/");
}

/** Collapses `.` and `..`, keeping a leading slash and dropping trailing ones. */
export function normalize(target: string): string {
  const absolute = isAbsolute(target);
  const parts: string[] = [];

  for (const part of target.split(/[/\\]+/)) {
    if (part === "" || part === ".") {
      continue;
    }
    if (part === "..") {
      const last = parts[parts.length - 1];
      if (parts.length > 0 && last !== "..") {
        parts.pop();
      } else if (!absolute) {
        parts.push("..");
      }
      continue;
    }
    parts.push(part);
  }

  const joined = parts.join("/");
  if (absolute) {
    return `/${joined}`;
  }
  return joined === "" ? "." : joined;
}

export function join(...targets: string[]): string {
  const joined = targets.filter((target) => target !== "").join("/");
  return joined === "" ? "." : normalize(joined);
}

/** Right-to-left resolution against `/`, the virtual root of a web scan. */
export function resolve(...targets: string[]): string {
  let resolved = "";
  for (let index = targets.length - 1; index >= 0; index -= 1) {
    const target = targets[index];
    if (target === "") {
      continue;
    }
    resolved = resolved === "" ? target : `${target}/${resolved}`;
    if (isAbsolute(target)) {
      return normalize(resolved);
    }
  }
  return normalize(`/${resolved}`);
}

export function dirname(target: string): string {
  const normalized = normalize(target);
  const index = normalized.lastIndexOf("/");
  if (index === -1) {
    return ".";
  }
  return index === 0 ? "/" : normalized.slice(0, index);
}

export function basename(target: string, extension?: string): string {
  const name = normalize(target).split("/").pop() || "";
  if (extension && name !== extension && name.endsWith(extension)) {
    return name.slice(0, -extension.length);
  }
  return name;
}

export function extname(target: string): string {
  const name = basename(target);
  const index = name.lastIndexOf(".");
  return index <= 0 ? "" : name.slice(index);
}

export function relative(from: string, to: string): string {
  const fromParts = resolve(from).split("/").filter(Boolean);
  const toParts = resolve(to).split("/").filter(Boolean);

  let shared = 0;
  while (
    shared < fromParts.length &&
    shared < toParts.length &&
    fromParts[shared] === toParts[shared]
  ) {
    shared += 1;
  }

  const up = new Array(fromParts.length - shared).fill("..");
  return [...up, ...toParts.slice(shared)].join("/");
}

export const posix = {
  sep,
  delimiter,
  isAbsolute,
  normalize,
  join,
  resolve,
  dirname,
  basename,
  extname,
  relative,
};

export default posix;
