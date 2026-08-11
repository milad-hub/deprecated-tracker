# Deprecated Tracker CLI

A headless `deprecated-tracker` binary for CI, Git hooks and coding agents.
It ships with the npm package, not with the VS Code extension.

## CI: the ratchet

Detecting deprecated code in CI is a solved problem — `@typescript-eslint` already fails a build when it finds any. That is rarely useful on a codebase that already has hundreds of them, because the only way to go green is to fix everything at once.

The `deprecated-tracker` CLI does the other thing: it records today's count as a **baseline** and fails only when the number **rises**. Debt becomes something a team ratchets down instead of a wall it can never clear.

```bash
npm run build                              # produces out/cli.js
node bin/deprecated-tracker.js --update-baseline   # commit the baseline file
node bin/deprecated-tracker.js             # exits 1 only if the count went up
```

| Option | Effect |
|---|---|
| `--files <file...>` | Scan only these files; everything after is a path |
| `--staged` | Ask git for the staged files, for hook managers that pass none |
| `--changed` | Everything uncommitted: staged, unstaged and untracked. For pre-push hooks and coding agents — `--staged` is the one for pre-commit |
| `--whole-files` | With `--files`, `--staged` or `--changed`, scan the whole file and ratchet it per-file instead of reporting only changed lines |
| `--root <dir>` | Project root, so paths can follow `--files` |
| `--baseline <file>` | Baseline location (default `.deprecated-tracker-baseline.json`) |
| `--update-baseline` | Record the current counts and exit 0 |
| `--max-new <n>` | Allow a deliberate increase of `n` |
| `--fail-on-any` | Ignore the baseline; fail if anything is found |
| `--format text\|json\|sarif\|markdown` | Report shape (default `text`). `markdown` is a table to paste into a PR comment |
| `--output <file>` | Write the report to a file instead of stdout |
| `--annotate github\|azure` | Emit inline CI annotations for files that rose |
| `--quiet`, `--help`, `--version` | — |

Exit codes: **0** at or below the baseline · **1** above it · **2** bad usage or unreadable baseline · **3** the scan failed.

## GitHub Actions

```yaml
- run: npm ci && npm run build
- run: node bin/deprecated-tracker.js --annotate github --format sarif --output deprecated.sarif
- uses: github/codeql-action/upload-sarif@v3
  if: always()
  with:
    sarif_file: deprecated.sarif
```

## Azure Pipelines

```yaml
- script: npm ci && npm run build
- script: node bin/deprecated-tracker.js --annotate azure
  displayName: Deprecation ratchet
```

## Pre-commit hooks

The same binary gates a commit, and works with every popular Git hooks manager. It scans only the staged files and, by default, reports only the lines that commit actually wrote — so touching a legacy file is free, and adding a deprecated call to it is not.

Hook managers split into two kinds, and there is a flag for each:

- **They pass the staged paths** — lint-staged, lefthook's `{staged_files}`, the `pre-commit` framework. Use **`--files`**; everything after it is read as a path.
- **They just run a command** — simple-git-hooks, a bare `.husky/pre-commit`, a raw `.git/hooks/pre-commit`. Use **`--staged`** and the CLI asks git itself.

**husky + lint-staged**

```sh
# .husky/pre-commit
npx lint-staged
```

```json
// .lintstagedrc
{ "src/**/*.{ts,tsx,js,jsx}": "deprecated-tracker --files" }
```

**lefthook**

```yaml
# lefthook.yml
pre-commit:
  commands:
    deprecated-tracker:
      glob: "*.{ts,tsx,js,jsx}"
      run: npx deprecated-tracker --files {staged_files}
```

**simple-git-hooks**

```json
// package.json
{ "simple-git-hooks": { "pre-commit": "npx deprecated-tracker --staged" } }
```

**pre-commit (pre-commit.com)**

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/milad-hub/deprecated-tracker
    rev: v2.1.0
    hooks:
      - id: deprecated-tracker
```

**A plain hook, no manager**

```sh
# .git/hooks/pre-commit
npx deprecated-tracker --staged
```

A non-zero exit stops the commit:

```
src/orders/cart.ts
  31:4  Uses deprecated getCart — use useCart() instead

FAIL — 1 deprecated item(s) on the lines you changed
```

**Two rules to choose between:**

- **Changed lines (default).** Fails only when a deprecated item sits on a line this commit wrote. No baseline file, nothing to maintain. It will not notice that adding `@deprecated` to a function has stranded call sites on unchanged lines — that is what the full scan and the CI ratchet are for.
- **`--whole-files`.** Scans each staged file completely and fails only when a file holds **more** than the baseline records for it. Catches the stranded-call-site case within the staged files, at the cost of keeping `.deprecated-tracker-baseline.json` committed and refreshed. With no baseline present it passes, for the same reason a first CI run does.

`--update-baseline` is refused alongside `--files` / `--staged`: writing a baseline from a handful of staged files would record zero for every file the run never looked at and quietly wipe the project's history.

**Two details that make it safe to drop into any of the above:**

- **Non-scannable paths are ignored.** A broad glob — `"*"` is a common lint-staged setting — hands over stylesheets, JSON and markdown. Only `.ts`, `.tsx`, `.js` and `.jsx` reach the scanner.
- **An empty staged set passes without scanning.** If nothing scannable is staged, the run prints `No staged files to scan.` and exits 0. It never falls back to scanning the whole project, which inside a hook would be both slow and the wrong verdict. Under `--format json` / `--format sarif` it emits an empty document instead of that sentence, so a parser is never handed prose.

**Worth knowing before you wire it up:**

- **A first run with no baseline passes** and tells you to record one. Failing a repo over debt it already had is the behaviour this tool exists to avoid.
- **When the count falls the run passes** and prints how stale the baseline is. Re-run with `--update-baseline` on a merge to your default branch to lock the gain in.
- **The gate is the total, not per-file.** Removing five in one file and adding five in another passes. Per-file counts still decide which files get annotated.
- **Custom tags and method ignores come from the config file, not the editor.** The editor's live in VS Code workspace storage, which nothing headless can read. Put `customTags` and `ignoreMethods` in `.deprecatedtrackerrc` (or the `deprecatedTracker` key in `package.json`) and the CLI honours them — that is the only route for a project that never installs the extension. `excludePatterns` is how you ignore whole files.
- **A rejected config key warns on stderr and the run continues.** A typo must not fail a commit, but it must not be invisible either.

## For AI coding agents

Claude Code, Codex, Cursor and anything else that can run a command can use the same CLI to check its own edits. Point `--files` at what it just wrote and read the JSON off stdout:

```bash
npx deprecated-tracker --files src/a.ts src/b.ts --format json
```

```json
{
  "passed": false,
  "total": 1,
  "items": [
    { "name": "oldApi", "kind": "usage", "file": "src/a.ts",
      "line": 12, "character": 10, "reason": "Use newApi instead" }
  ]
}
```

- **Unstaged edits are covered.** A file with no staged hunks is read as entirely changed, so everything in it is reported — nothing needs staging or committing first.
- **`items[].reason`** carries the `@deprecated` text, usually the replacement instruction. That is the field to act on.
- **Exit code is the verdict, not an error:** `1` means findings. An agent that treats any non-zero exit as a crash will misread it.
- Drop `--files` and pass a path to scan the whole project; add `--fail-on-any` to ignore the baseline.

## As an MCP server

Shelling out works, but registering the scanner as an MCP server gives the agent
the verbs by name, a schema for each, structured results instead of parsed
stdout, and calls that do not each trip a shell-command approval.

```bash
npx deprecated-tracker mcp install               # every agent found, project scope
npx deprecated-tracker mcp install --agent codex --scope user
npx deprecated-tracker mcp uninstall             # same flags, same targets
```

| Tool | What it does |
|---|---|
| `scan_project` | Scan a whole project. Optional `root`. |
| `scan_changes` | Scan staged, unstaged and untracked work. Optional `whole_files`. |
| `scan_files` | Scan an explicit `files` list — use it straight after editing. |

Each returns the same shape as `--format json`, plus `passed` and the baseline
comparison, so there is one machine contract to learn rather than two. A failed
scan comes back as a tool error, never as a dead server.

**Where the registration goes:**

| Agent | `--scope project` | `--scope user` |
|---|---|---|
| `claude-code` | `.mcp.json` at the repo root | `mcpServers` in `~/.claude.json` |
| `codex` | `.codex/config.toml` in the repo | `~/.codex/config.toml` |

Project scope is the default: it gets committed, so the whole team has the tool
after a clone. `uninstall` removes only from the scope you name — cleaning up a
project never touches a user-level registration.

The agent's own CLI (`claude mcp add`, `codex mcp add`) is used when it is on
PATH; otherwise the config file is edited directly, merging rather than
replacing. Two things to expect afterwards:

- **Restart the agent** before it sees the server.
- **Claude Code asks you to approve a project-scoped server** the first time,
  deliberately — a cloned repo should not be able to launch processes on your
  machine. Run `/mcp` if you miss the prompt.

To run the server by hand, `deprecated-tracker mcp` speaks JSON-RPC over stdio.
stdout carries protocol frames only; warnings and diagnostics go to stderr.
