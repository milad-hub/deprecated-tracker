# Roadmap

Legend: **Planned** = scoped fix, ready to branch. **Proposed** = idea, needs a decision before scoping. **Done** = shipped.
Cross-refs point to [ISSUES.md](ISSUES.md).

## Done (2026-07) — scanner/webview refactor

All of the original Track 1 (bug fixes), Track 3 (test coverage), and several
Track 2/4 items shipped on `refactor/scanner-webviews-and-test-coverage`:

- **Scanner correctness** — declaration items emitted for every kind
  (method/property/class/interface/function), order-independent usage detection,
  per-file method ignores, glob matching with proper escaping/anchoring,
  separator- and case-aware path containment (`PathUtils.isWithin`), unified
  `scanSourceFiles` core shared by all three scan entry points.
- **Webview/UI** — Export button wired, `webviewReady` handshake in every panel,
  ignored-files rendering + un-ignore, history pagination honoring `limit`,
  diagnostic column fixed (reason included in message), sidebar CSP, escaped
  history HTML, scan-failure UI reset, View Results button, concurrent-scan
  guard, historical-view sidebar sync.
- **Build/packaging** — F5 runs the esbuild bundle, `typescript` moved to
  devDependencies (bundle inlines it), `.vscodeignore` ships only
  `out/extension.js` + webview assets (~40 MB VSIX reduction), dead code/menu
  contributions removed, fixture `node_modules` untracked.
- **Performance** — precompiled ignore regexes + O(1) normalized lookups, glob
  regex cache, node_modules/declaration-file AST walks skipped, per-declaration
  deprecation-info memoization, event-loop yield per scanned file, history
  capped per scan (`MAX_HISTORY_RESULTS_PER_SCAN`).
- **Config** — hot-reload via FileSystemWatcher on
  `.deprecatedtrackerrc`/`package.json`, config injected into every Scanner,
  single trusted-package source with exact/`scope/` matching, custom-tag
  reasons, description clearing + color validation on tag edit.
- **Test coverage** — jest `coverageThreshold` at 100/100/100/100
  (statements/branches/functions/lines).

## Done (2026-07) — workspace-wide scanning

Shipped on `refactor/shared-manager-instances` / `feat/workspace-wide-scanning`;
closed three former roadmap rows (`perf/program-reuse`, `feat/multi-root`,
`feat/nested-tsconfig`):

- **Nested/monorepo config discovery** — every `tsconfig.json`/`jsconfig.json`
  in the workspace tree is discovered (single-readdir walk skipping
  node_modules/build dirs/dot-dirs); Scan Folder discovers configs under the
  target folder first. Root-only discovery limitation removed.
- **Multi-root workspaces** — `Scanner.scanWorkspace` scans every workspace
  folder with a single skip/cancel policy (configless folders skipped in
  multi-root, cancellation always surfaces); folder/file scans resolve the
  containing workspace folder via `PathUtils.folderContaining`.
- **Program reuse between scans** — per-config `ts.Program` cache invalidated
  by config + root-file mtimes, seeding TypeScript structural reuse on rebuild
  (measured: ~3.2 s → ~0.6 s warm rescan on this repo). `scanSpecificFiles`
  builds only the configs relevant to the requested files.
- **Cancellation** — checked between program builds as well as between files.
- **Shared services** — one `IgnoreManager`/`TagsManager` instance injected
  from activation into sidebar and all panels (removed the 5×/3× duplicate
  construction and its cross-instance sync hazard).
- **Results panel polish** — zero-usage groups show a "No usages" label instead
  of an empty expander; missing reasons render "No reason provided".
- **Showcase fixture** — `tests/fixtures/test-project` now exercises custom
  JSDoc tags, decorator variants, unicode/quoted names, overloads, external
  packages (trusted skip + reported usage), and hostile deprecation reasons;
  dead fixtures deleted. 796 tests, coverage still 100/100/100/100.

## Track 2 — Performance (remaining)

| Title | Status | Branch | Description |
|---|---|---|---|
| Incremental scanning | Proposed | `perf/incremental-scan` | Program-level reuse shipped; remaining win: skip re-walking unchanged files' ASTs and merge per-file results into cached output instead of rescanning every file each run. |
| Program cache eviction | Proposed | `perf/cache-eviction` | Cached programs live for the Scanner's lifetime; add an eviction/size policy for very large monorepos (ceiling documented in `scanner.ts`). |

## Track 4 — Suggested features

| Title | Status | Branch | Description |
|---|---|---|---|
| Quick-fix code actions | Proposed | `feat/code-actions` | CodeActionProvider on diagnostics: jump to declaration, apply suggested replacement parsed from `@deprecated Use X instead` (replacement extraction already exists in main.js — promote it to shared TS). |
| CLI / CI mode | Proposed | `feat/cli-ci-mode` | Headless scan entrypoint with exit codes + SARIF/JSON output for pipelines; optional GitHub/ADO annotations. |
| Trend dashboard | Proposed | `feat/trend-charts` | Statistics panel chart of deprecated-usage count over scan history (metadata already stored); baseline + delta badge. |
| Status bar indicator | Proposed | `feat/status-bar` | Live count of deprecated usages, click → results panel; auto-rescan on save (debounced, builds on incremental scan). |
| Per-folder configuration | Proposed | `feat/per-folder-config` | Multi-root scanning shipped, but `.deprecatedtrackerrc`/`package.json` config still loads from the first workspace folder only; read and apply config per folder. |
