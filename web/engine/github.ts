/**
 * Reading a public repository's source from a browser.
 *
 * Two hosts, both of which send `access-control-allow-origin: *`, which is the
 * whole reason this is possible without a server:
 *
 * - `api.github.com` — one request for the repository (to learn its default
 *   branch and the commit it points at) and one for the tree. The tree comes
 *   back complete, with every blob's path and size: 22,476 entries for
 *   `microsoft/vscode`, untruncated. That is what lets the size cap be decided
 *   before a single file is downloaded.
 * - `raw.githubusercontent.com` — file contents. It is **not** part of the API,
 *   so per-file fetches do not count against the API rate limit.
 *
 * The unauthenticated API limit of 60 requests an hour is *per visitor IP*, not
 * per site, because these requests come from the visitor's own browser. At two
 * calls per scan it is not a constraint. A token may still be supplied, which is
 * what raises the ceiling for someone scanning repeatedly.
 *
 * jsDelivr was the first choice and is not usable: it caps a package at 50 MB and
 * answers `403` for a large repository rather than a partial listing.
 */
const API = "https://api.github.com";
const RAW = "https://raw.githubusercontent.com";

/**
 * GitHub's own grammar, and the reason every one of these is checked before a
 * URL is built: the owner, name and ref are interpolated into two hostnames'
 * paths, and an unchecked one does not fail — it silently addresses something
 * else. `a/../../b` parses to owner `a`, name `..`, which walks out of `/repos`
 * entirely; `owner/name?x=1` keeps the query string inside the name and turns
 * the rest of the URL into its parameters.
 */
const OWNER_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const NAME_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;
/** A commit, once resolved, must look like one before it reaches a raw URL. */
const COMMIT_PATTERN = /^[0-9a-f]{7,40}$/i;

export interface RepoRef {
  owner: string;
  name: string;
  /** Branch, tag or commit. Empty means "whatever the repository defaults to". */
  ref: string;
}

export interface RepoIdentity extends RepoRef {
  /** The exact commit the scan reads, so a result can be reproduced. */
  commit: string;
  defaultBranch: string;
  htmlUrl: string;
}

export interface TreeBlob {
  path: string;
  size: number;
}

export interface FetchOptions {
  token?: string;
  signal?: AbortSignal;
}

export class GitHubError extends Error {
  public readonly status: number;
  public readonly rateLimited: boolean;

  constructor(message: string, status: number, rateLimited = false) {
    super(message);
    this.name = "GitHubError";
    this.status = status;
    this.rateLimited = rateLimited;
  }
}

/**
 * Accepts what a person actually pastes: a full URL, a URL with a branch in it,
 * an `owner/repo`, or an `owner/repo@ref`. A `tree/<ref>` in a URL wins over an
 * `@ref` suffix, because it is the more specific thing they were looking at.
 */
export function parseRepoInput(input: string): RepoRef {
  const trimmed = input.trim();
  if (trimmed === "") {
    throw new Error("Enter a repository, for example vuejs/vue");
  }

  const withoutScheme = trimmed
    .replace(/^git\+/, "")
    .replace(/^https?:\/\/(www\.)?github\.com\//i, "")
    .replace(/^git@github\.com:/i, "")
    .replace(/^github\.com\//i, "")
    .replace(/\.git$/, "")
    .replace(/^\/+/, "");

  // Anything still carrying a scheme was not a github.com URL, and a browser
  // scan reads github.com only. Left alone, "https://gitlab.com/a/b" parses as
  // the repository "https:/gitlab.com" and comes back as a confusing 404.
  if (withoutScheme.includes("://")) {
    throw new Error(
      `Only public repositories on github.com can be scanned here — "${trimmed}" is somewhere else`,
    );
  }

  const [pathPart, refSuffix] = splitOnce(withoutScheme, "@");
  const segments = pathPart.split("/").filter((segment) => segment !== "");

  // A host-shaped first segment is the same mistake without the scheme:
  // "gitlab.com/a/b" would otherwise scan the repository "gitlab.com/a".
  if (segments.length > 2 && segments[0].includes(".")) {
    throw new Error(
      `Only public repositories on github.com can be scanned here — "${trimmed}" looks like another host`,
    );
  }

  if (segments.length < 2) {
    throw new Error(
      `"${trimmed}" is not a repository — expected owner/name, or a github.com URL`,
    );
  }

  const [owner, name, ...rest] = segments;
  let ref = refSuffix ?? "";

  // .../tree/<ref>/optional/path -- the ref can itself contain slashes, and
  // there is no way to tell a branch called `release/1.x` from a directory
  // inside it, so the whole remainder is offered to the API and it decides.
  if (rest[0] === "tree" && rest.length > 1) {
    ref = rest.slice(1).join("/");
  }

  return {
    owner: checkOwner(owner),
    name: checkName(name),
    ref: checkRef(ref),
  };
}

function checkOwner(owner: string): string {
  if (!OWNER_PATTERN.test(owner)) {
    throw new Error(
      `"${owner}" is not a GitHub account name — letters, digits and hyphens only`,
    );
  }
  return owner;
}

function checkName(name: string): string {
  if (name === "." || name === ".." || !NAME_PATTERN.test(name)) {
    throw new Error(
      `"${name}" is not a repository name — letters, digits, and . _ - only`,
    );
  }
  return name;
}

/**
 * A subset of git's own ref rules, kept to what actually protects a URL: no
 * traversal, no query or fragment, no whitespace, and none of the characters
 * git itself forbids in a ref name.
 */
function checkRef(ref: string): string {
  if (ref === "") {
    return ref;
  }
  const forbidden = /[\s?#~^:\\[\]*]|\.\.|@\{|^[-/]|\/$|\/\/|\.lock$/;
  if (forbidden.test(ref) || ref.length > 255) {
    throw new Error(
      `"${ref}" is not a branch, tag or commit — it cannot contain .. ? # or whitespace`,
    );
  }
  return ref;
}

/** Every interpolated segment, encoded. A ref may legitimately carry a slash. */
function encodeSegment(value: string): string {
  return encodeURIComponent(value);
}

function encodeRef(ref: string): string {
  return ref.split("/").map(encodeSegment).join("/");
}

function splitOnce(value: string, separator: string): [string, string?] {
  const index = value.indexOf(separator);
  if (index === -1) {
    return [value];
  }
  return [value.slice(0, index), value.slice(index + separator.length)];
}

async function getJson(
  url: string,
  options: FetchOptions,
): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
  };
  if (options.token) {
    headers.authorization = `Bearer ${options.token}`;
  }

  const response = await fetch(url, { headers, signal: options.signal });

  if (!response.ok) {
    const remaining = response.headers.get("x-ratelimit-remaining");
    const rateLimited = response.status === 403 && remaining === "0";
    throw new GitHubError(
      describeFailure(response.status, rateLimited),
      response.status,
      rateLimited,
    );
  }

  return (await response.json()) as Record<string, unknown>;
}

function describeFailure(status: number, rateLimited: boolean): string {
  if (rateLimited) {
    return "GitHub's hourly limit for unauthenticated requests is used up. It resets within the hour, or a personal access token lifts it.";
  }
  if (status === 404) {
    return "No such repository, branch or commit — or it is private, which a browser scan cannot read.";
  }
  if (status === 451) {
    return "GitHub is withholding this repository for legal reasons.";
  }
  return `GitHub answered ${status}.`;
}

/** One API call: the default branch, the resolved commit and the canonical URL. */
export async function resolveRepo(
  target: RepoRef,
  options: FetchOptions = {},
): Promise<RepoIdentity> {
  const owner = checkOwner(target.owner);
  const name = checkName(target.name);
  const slug = `${encodeSegment(owner)}/${encodeSegment(name)}`;

  const repo = await getJson(`${API}/repos/${slug}`, options);
  // The default branch comes from GitHub, but it reaches a URL like anything
  // else, so it is checked on the same terms as a ref the caller typed.
  const defaultBranch = checkRef(String(repo.default_branch || "HEAD"));
  const ref = checkRef(target.ref) || defaultBranch;

  const commitData = await getJson(
    `${API}/repos/${slug}/commits/${encodeRef(ref)}`,
    options,
  );

  // `sha` is what every later URL is built from. When the response carries none
  // the ref stands in, and it is only safe to do that because `checkRef` has
  // already been past it.
  const sha = String(commitData.sha || "");
  const commit = COMMIT_PATTERN.test(sha) ? sha : ref;

  return {
    owner,
    name,
    ref,
    commit,
    defaultBranch,
    htmlUrl: `https://github.com/${slug}`,
  };
}

export interface TreeResult {
  blobs: TreeBlob[];
  /**
   * GitHub's own truncation flag. It means the repository has more entries than
   * one tree response can carry, so the listing below is incomplete — a fact
   * that has to reach the result rather than be quietly ignored.
   */
  truncated: boolean;
}

/** One API call: every blob in the commit, with its path and byte size. */
export async function fetchTree(
  repo: RepoIdentity,
  options: FetchOptions = {},
): Promise<TreeResult> {
  const tree = await getJson(
    `${API}/repos/${encodeSegment(repo.owner)}/${encodeSegment(repo.name)}` +
      `/git/trees/${encodeRef(repo.commit)}?recursive=1`,
    options,
  );

  const entries = Array.isArray(tree.tree) ? tree.tree : [];
  const blobs: TreeBlob[] = [];

  for (const entry of entries as Array<Record<string, unknown>>) {
    if (entry.type !== "blob" || typeof entry.path !== "string") {
      continue;
    }
    blobs.push({
      path: entry.path,
      size: typeof entry.size === "number" ? entry.size : 0,
    });
  }

  return { blobs, truncated: tree.truncated === true };
}

export interface DownloadProgress {
  loaded: number;
  total: number;
  path: string;
}

/**
 * Downloads the given paths into a map keyed by absolute virtual path.
 *
 * Concurrency is bounded because a repository near the cap is over a thousand
 * requests and an unbounded burst is both slower and rude. A file that fails to
 * download is recorded in `failed` rather than aborting the scan: one unreadable
 * file out of a thousand is a footnote, not a reason to report nothing.
 */
export async function downloadFiles(
  repo: RepoIdentity,
  paths: string[],
  options: FetchOptions & {
    concurrency?: number;
    onProgress?: (progress: DownloadProgress) => void;
  } = {},
): Promise<{ files: Map<string, string>; failed: string[] }> {
  const files = new Map<string, string>();
  const failed: string[] = [];
  const concurrency = Math.max(1, Math.min(options.concurrency ?? 10, 24));
  let next = 0;
  let loaded = 0;

  const worker = async (): Promise<void> => {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= paths.length) {
        return;
      }
      if (options.signal?.aborted) {
        throw abortError();
      }

      const filePath = paths[index];
      try {
        const response = await fetch(rawUrl(repo, filePath), {
          signal: options.signal,
        });
        if (response.ok) {
          files.set(`/${filePath}`, await response.text());
        } else {
          failed.push(filePath);
        }
      } catch (error) {
        if (isAbort(error)) {
          throw error;
        }
        failed.push(filePath);
      }

      loaded += 1;
      options.onProgress?.({ loaded, total: paths.length, path: filePath });
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, paths.length) }, worker),
  );

  return { files, failed };
}

export function rawUrl(repo: RepoIdentity, filePath: string): string {
  const encoded = filePath.split("/").map(encodeSegment).join("/");
  return (
    `${RAW}/${encodeSegment(repo.owner)}/${encodeSegment(repo.name)}` +
    `/${encodeRef(repo.commit)}/${encoded}`
  );
}

function abortError(): Error {
  const error = new Error("Scan cancelled");
  error.name = "AbortError";
  return error;
}

export function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
