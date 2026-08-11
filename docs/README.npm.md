# deprecated-tracker

Find deprecated code — and everywhere you still use it — in TypeScript and JavaScript projects, from the command line.

Most "find deprecated code" tools grep for `@deprecated` and show you the declarations. This one uses the TypeScript type checker, so it also finds every **usage** of a deprecated symbol, including calls into deprecated APIs from your dependencies. That's the part you need when planning a migration: not "what is deprecated", but "where am I still using it".

```bash
npm install --save-dev deprecated-tracker
```

No peer dependencies to install — the TypeScript compiler ships inside the bundle.

## The ratchet

Failing a build on *any* deprecated code is useless once a codebase already has hundreds. This records today's count as a **baseline** and fails only when the number **rises**, so debt becomes something a team ratchets down instead of a wall it can never clear.

```bash
npx deprecated-tracker --update-baseline   # commit .deprecated-tracker-baseline.json
npx deprecated-tracker                     # exits 1 only if the count went up
```

A first run with no baseline **passes** and tells you to record one. When the count falls it passes and prints how stale the baseline has become.

## Gate a commit

Works with every popular Git hooks manager. It scans only the staged files and, by default, reports only the lines that commit actually wrote — so touching a legacy file is free, and adding a deprecated call to it is not.

```json
// .lintstagedrc — lint-staged appends the staged paths
{ "src/**/*.{ts,tsx,js,jsx}": "deprecated-tracker --files" }
```

```sh
# simple-git-hooks, a bare .husky/pre-commit, or .git/hooks/pre-commit —
# managers that pass no paths, so the CLI asks git itself
npx deprecated-tracker --staged
```

Recipes for husky, lefthook and the `pre-commit` framework (which has a `.pre-commit-hooks.yaml` manifest here) are in the [full CLI reference](https://github.com/milad-hub/deprecated-tracker/blob/main/docs/CLI.md).

## For AI coding agents

Point `--files` at what an agent just wrote and read the JSON off stdout. Unstaged edits are covered: a file with no staged hunks is read as entirely changed, so nothing needs staging or committing first.

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

`items[].reason` carries the `@deprecated` text — usually the replacement instruction, and the field to act on.

## Options

| Option | Effect |
|---|---|
| `--files <file...>` | Scan only these files; everything after is a path |
| `--staged` | Ask git for the staged files, for hook managers that pass none |
| `--whole-files` | With `--files` / `--staged`, scan each whole file and ratchet it per-file instead of reporting only changed lines |
| `--root <dir>` | Project root, so paths can follow `--files` |
| `--baseline <file>` | Baseline location (default `.deprecated-tracker-baseline.json`) |
| `--update-baseline` | Record the current counts and exit 0 |
| `--max-new <n>` | Allow a deliberate increase of `n` |
| `--fail-on-any` | Ignore the baseline; fail if anything is found |
| `--format text\|json\|sarif` | Report shape (default `text`) |
| `--output <file>` | Write the report to a file instead of stdout |
| `--annotate github\|azure` | Emit inline CI annotations for files that rose |
| `--quiet`, `--help`, `--version` | — |

Exit codes: **0** at or below the baseline · **1** above it · **2** bad usage or unreadable baseline · **3** the scan failed. `1` is a verdict, not a crash.

## Requirements

Node 18+, and a `tsconfig.json` or `jsconfig.json` somewhere in the project. Scans `.ts`, `.tsx`, `.js` and `.jsx`.

Configuration comes from `.deprecatedtrackerrc` or a `deprecatedTracker` key in `package.json` — trusted packages, include/exclude globs, severity. See the [full reference](https://github.com/milad-hub/deprecated-tracker/blob/main/docs/CLI.md).

## Also available as a VS Code extension

The same scanner, with an interactive results table, a statistics dashboard, editor squiggles and scan history: [Deprecated Tracker on the Marketplace](https://marketplace.visualstudio.com/items?itemName=milad445.deprecated-tracker). Ignore rules and custom tags configured there live in VS Code's workspace storage, which this CLI cannot read — it uses the config files only.

## License

MIT
