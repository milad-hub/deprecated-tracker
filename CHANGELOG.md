# Change Log

All notable changes to the "Deprecated Tracker" extension will be documented in this file.

## [2.0.0]

### Breaking

- **A results panel export now matches the results panel.** CSV, JSON and Markdown chosen from the panel's **Export ▼** menu previously wrote the entire workspace regardless of the column filters on screen; they now export exactly the rows shown, the way *Copy prompt for AI fix* already did. Filter to one folder and the file covers that folder. To export everything unconditionally, use the CLI — `deprecated-tracker --format json` — or the **Deprecated Tracker: Export Results** palette command, which is unfiltered by design.

### Added

- **Ignore File in the Explorer context menu.** Right-click a file → *Ignore File*, beside *Scan File…*. The command also accepts the clicked file rather than always acting on the active editor.

### Changed

- The results panel's rescan control moved out of the table header into the panel controls beside **Export ▼**, and is now labelled **Rescan** — the sidebar's **Refresh** redraws the tree, this one rescans changed files, and they no longer share a word.
- `deprecatedTracker.ignoreFile` is now titled *Deprecated Tracker: Ignore File* in the command palette, matching every other user-facing command.
- The history row's **Export ▼** menu says why it offers no AI prompt: a stored scan's line numbers may be stale.
- *Save as .txt* in the AI prompt dialog is a secondary button; **Copy** is the primary action.

### Fixed

- **`--fail-on-any` no longer reads the baseline.** The option is documented as ignoring the baseline, but the run loaded it anyway, so a corrupt or out-of-date `.deprecated-tracker-baseline.json` sitting in the checkout exited `2` (bad usage) before the strict gate ever ran. It now skips the file entirely, and the report drops the baseline lines rather than claiming none was found.
- **Exporting while viewing a stored scan.** Opening a history entry with **View** replaced the table with that scan's rows but left the extension holding the live scan, so the header's **Export ▼** worked against the wrong set — it would refuse to export, or write a coincidental subset of the latest scan. The panel now tracks the result set it actually put on screen, and exports read that.
- **The `#` tooltip on the Export ▼ menu.** Both dropdowns built their entries as `<a href="#">`, so hovering one showed the browser's link target instead of nothing. They are `<button type="button" class="dropdown-item">` now — they were never links, and as buttons they are also reachable by keyboard.
- **The published npm package now contains the CLI bundle.** `out/` is git-ignored, so `npm pack` shipped `bin/deprecated-tracker.js` without the `out/cli.js` it requires — an `npm i -g` or `npx` install failed with `Cannot find module '../out/cli.js'` before the CLI started. A `files` allowlist ships both, and `prepack` builds the bundle so a publish cannot ship a stale one. The `.vsix` is unchanged: it carries the extension, not the CLI.

### Removed

- The unused `$(gear)` icon on `deprecatedTracker.openSettings`, which appears in no menu, and the `.refresh-header` / `.btn-icon` styles left behind by the rescan move.

## [1.6.0]

### Added

- **`deprecated-tracker` CLI** — a headless entrypoint that runs the same scanner the extension uses, with no editor and no `vscode` dependency. `deprecated-tracker [path]` scans a project, reports what it finds, and sets an exit code.
- **Baseline ratcheting.** `--update-baseline` records the current count into `.deprecated-tracker-baseline.json`; later runs fail **only when the count rises above it**. `--max-new <n>` allows a deliberate increase, and `--fail-on-any` opts into the stricter "no deprecated code at all" gate.
- **Machine-readable output.** `--format json` for scripting and `--format sarif` for GitHub code scanning and any SARIF-consuming viewer; `--output <file>` writes to disk instead of stdout.
- **CI annotations.** `--annotate github` emits `::warning file=…` workflow commands, `--annotate azure` emits `##vso[task.logissue …]`. Only files whose count rose above the baseline are annotated, so a two-line regression is not buried under the whole backlog.
- Exit codes: `0` at or below the baseline, `1` above it, `2` bad usage or an unreadable baseline, `3` the scan itself failed.

### Changed

- `Scanner` now depends on two small interfaces (`IgnoreChecker`, `CustomTagSource`) instead of the concrete `IgnoreManager` and `TagsManager`. Both classes satisfy them unchanged; the point is that the CLI can supply its own without pulling `vscode` into a Node process.

### Notes

- **A first run with no baseline passes.** Failing a repository over debt it already had is the "any deprecated code is an error" behaviour that linters already provide; the report says no baseline was found and how to record one. Use `--fail-on-any` if that is genuinely what you want.
- **When the count falls, the run still passes** and prints how stale the baseline is, so the gain can be locked in with `--update-baseline` on a merge to the default branch.
- **The gate is the total, not per-file.** Removing five items in one file and adding five in another passes. Per-file counts are still recorded and drive both the "risen above baseline" report and which files get annotated.
- **Ignore rules and custom tags set in the editor do not apply.** They live in VS Code's workspace storage, which a CI process cannot read. The CLI honours `.deprecatedtrackerrc` / `package.json` config — `includePatterns`, `excludePatterns`, `trustedPackages`, `severity` — and nothing else.
- A corrupt or wrong-version baseline exits `2` rather than being treated as zero, which would silently fail every build afterwards.
- The CLI is not in the VSIX. It bundles its own copy of the TypeScript compiler (~3.5 MB) and belongs to the repository, not to the editor install.

## [1.5.0]

### Added

- **Copy prompt for AI fix** — a fourth entry in the results panel's Export menu. Instead of a save dialog it opens a modal holding a ready-to-paste brief for a coding agent: every deprecated symbol the panel is currently showing, where it is declared, what its deprecation note says, when it is due for removal, and every call site grouped under its file. **Copy** puts it on the clipboard, **Save as .txt** writes it to a file, **Close** dismisses it (as do the backdrop and `Escape`). The same entry is available from `Deprecated Tracker: Export Results`.
- `ai-prompt` is a real export format on `ResultExporter`, so the same text can be written to a file later without a second code path.

### Notes

- The prompt covers exactly the rows the panel is showing. Filtering happens in the webview, so the panel sends the identity of its visible rows and the prompt is built from that subset — a filtered view never produces a prompt covering the whole workspace.
- Token cost was the design constraint. Usages are grouped under their file rather than repeated per line, paths are workspace-relative, urgency is a section heading rather than a field on every row, absent fields emit nothing, and each deprecation note is collapsed to one line and capped at 200 characters. The work list is capped at 8,000 characters of whole symbols, highest urgency first; when it truncates, the prompt says so and gives the real counts rather than implying a clean sweep.
- No source snippets and no guessed replacement text. The agent has the repo and reads it better than an excerpt would, and the replacement hint in the results table is regexes over English prose — fine as a hint, dishonest as an instruction.
- The extension still never edits code and never calls a model. The feature ends at text on the clipboard.

## [1.4.0]

### Added

- **Startup requirements check** — on activation the extension evaluates everything it needs, one requirement at a time. If something that would stop a scan is missing, a **Requirements** page opens listing every check with its state, what to do about it, and whether a window reload is needed. `Deprecated Tracker: Check Requirements` opens the same page on demand, so a healthy setup can be confirmed rather than only ever seen when broken.
- Remedy buttons on the page: **Open Folder**, **Reload Window**, and **Create tsconfig.json**, which writes a starter config into the first workspace folder. It refuses to overwrite a `tsconfig.json` that already exists.

### Fixed

- The "no tsconfig" scan error said the file was not found in the workspace **root**. Config discovery has walked the whole tree for several releases, so a monorepo with configs only under `packages/*` was told to look in the one directory the file does not need to be in.

### Notes

- The page opens by itself only for a requirement that actually blocks scanning — an untrusted workspace, a missing `tsconfig.json`/`jsconfig.json`, a non-Node extension host, or an editor older than 1.74.0. Having no folder open is listed as unmet but never opens the page on its own; there is nothing to scan and nothing broken.
- There is deliberately no "TypeScript installed" check. The compiler is bundled into the extension, so such a check could only ever print OK — and a list with a line that cannot fail teaches you to trust the whole list less.

## [1.3.1]

### Internal

- **The scanner no longer depends on `vscode`.** Every scan entry point now takes plain filesystem paths instead of `vscode.WorkspaceFolder`, and an `AbortSignal` instead of `vscode.CancellationToken`. `Scanner` and the `src/scanner` barrel import nothing from the extension host, so the scanning core loads and runs in plain Node — verified by loading the compiled scanner with `vscode` blocked at the module resolver and scanning a fixture project end to end.
- The sidebar now owns an `AbortController` rather than a `CancellationTokenSource`, and bridges VS Code's progress-notification cancellation to it. Cancelling a scan behaves exactly as before.
- `IgnoreManager` is no longer re-exported from `src/scanner`; import it from `src/scanner/ignoreManager`. It was the last thing pulling `vscode` into that barrel, and nothing imported it from there.

### Notes

- No user-visible change. This is groundwork for a headless CLI: the scanning core can now be driven outside the extension host, which is what a CI entry point needs.

## [1.3.0]

### Added

- **Trend chart in the statistics dashboard** — deprecated *usage* count is now plotted across stored scan history, so the dashboard answers "is the number going up or down?" rather than only "what does it look like right now".
- A **baseline** marker on the chart, drawn at the oldest scan still in history, and a **delta badge** giving the change from that baseline to the latest scan. A decrease reads as an improvement.

### Notes

- The series is read from the per-scan metadata that history already stores, not recomputed from each scan's saved results. This matters: stored results are capped at 500 items per scan, so a derived series would have silently undercounted any larger scan.
- Scan history retains the last 10 scans, so the chart shows at most 10 points and the baseline is the oldest *kept* scan. Once history rolls over, the baseline moves and the delta is measured from the new oldest scan — the badge is worded to say so.
- The dashboard is still reached from the sidebar's Dashboard button, which appears only when scan history is non-empty. Because opening it requires a latest scan with at least one result, a project that has driven deprecated usages to zero cannot currently view the chart proving it.

## [1.2.0]

### Added

- **Deprecation urgency** — the `@deprecated since 2.0, removed in 3.0` convention is now parsed instead of being kept only as opaque prose. Each item carries a `deprecationSchedule` with the parsed `since` and removal version or ISO date, and an urgency of `removed` (removal date already passed), `scheduled` (a removal version or a future removal date) or `announced` (a `since` marker only).
- The results panel gained an **Urgency** column and now orders items most-urgent first, so what disappears in the next major sorts above what merely has a high usage count.
- CSV export gained `Urgency`, `Since` and `Removal` columns; Markdown export gained `Urgency` and `Removal`. JSON export carries the whole `deprecationSchedule` object.

### Notes

- Urgency is derived from the reason text alone. A removal *version* is not compared against the declaring package's installed version, so `removed in 3.0` ranks as `scheduled` whether or not 3.0 has shipped; only an ISO removal date can promote an item to `removed`.

## [1.1.2]

### Fixed

- **Cached TypeScript programs no longer accumulate for the whole session** — the scanner kept one `ts.Program` per discovered `tsconfig.json` with no bound, so repeated Scan Folder / Scan File runs over different parts of a monorepo grew memory until the window closed. Programs are now trimmed to a least-recently-used bound between scans. Note this bounds *retention across scans*, not peak memory *within* a single scan: one scan still holds every program it discovers, by design.

### Internal

- Added regression tests for overlapping workspace roots — a root nested inside another root — covering the duplicate results, restarting progress counter and dropped refresh results fixed in 1.1.1. Verified against the pre-1.1.1 scanner: the new tests fail there and pass here.
- Added tests pinning program reuse (same `ts.Program` when nothing changed on disk) and mtime-based invalidation, which nothing previously covered.
- Removed `tests/unit/edge-cases/performance.test.ts`. It imported the scanner, never invoked it, and timed `Array.prototype.filter` over synthetic arrays.
- Raised the Jest timeout to 30s. Scanner tests build real `ts.Program` instances and several legitimately take 6-8s; under coverage instrumentation they intermittently exceeded the old 10s budget.

## [1.1.1]

### Fixed

- **Multi-root workspaces no longer report the same file twice** — all folders are now scanned in a single pass, so a file reachable from two overlapping roots appears once and scan progress counts up monotonically instead of restarting at each folder
- **Configuration is found outside the first workspace folder** — every folder is consulted in order and the first that defines a config wins; all folders' config files are watched
- **Configuration loads for folders added after startup** — the extension now reacts to workspace folder changes instead of binding to the folder set present at activation
- **Refreshing results keeps items from every root** — the refresh previously dropped results outside the first workspace folder, and no longer rebuilds the TypeScript programs of roots that hold none of the refreshed files
- **Viewing a historical scan updates editor diagnostics** to match the scan being shown
- Diagnostic squiggles use the span measured at the usage site rather than the declaration's name length
- Exclude/include glob patterns are matched case-insensitively on Windows
- CSV export quotes values containing a carriage return
- The custom-tag dialog stays open when the tag is rejected, instead of discarding what was typed
- Sidebar webview listeners and the settings panel are disposed with the extension

### Changed

- **Removed the `ignoreDeprecatedInComments` option.** It never had any effect: deprecation tags are read via TypeScript's JSDoc parser, which only ever sees `/** ... */` comments, so tags in `//` and `/* */` comments were already ignored regardless of the setting. Leaving the key in your config is harmless.
- The results panel and the sidebar now share one `Scanner`, halving the memory held by cached TypeScript programs

## [1.1.0]

### Added

- **View Results button** in the sidebar to reopen the results panel after a scan
- **Editor diagnostics follow every results update** — ignoring an item now clears its squiggles immediately
- Historical scans refresh the sidebar state when viewed

### Fixed

- Sidebar no longer gets stuck in the scanning state when a scan fails — every error path resets the UI
- Internal commands (Refresh, Open Results, Update Tree View) hidden from the Command Palette; invoking Update Tree View without arguments no longer breaks the sidebar
- Results panel Refresh reloads ignore rules first and syncs the refreshed results back to the sidebar and diagnostics
- Concurrent scans are refused ("A scan is already in progress") instead of racing each other's cancellation
- View Results button stays hidden after a scan that found nothing
- Webview templates no longer corrupt when saved filter text contains dollar-sign patterns
- Custom-tag descriptions can be cleared, and colors are validated when editing a tag
- Explorer context-menu entries show their proper command titles

### Changed
- Project scans now discover every tsconfig/jsconfig in the workspace (nested projects included) and cover all folders of multi-root workspaces
- TypeScript programs are cached between scans and rebuilt only when the config or its files change, making rescans much faster
- Scans can now be cancelled between program builds in multi-project workspaces

- **~40 MB smaller VSIX**: TypeScript moved to devDependencies (already bundled) and packaging trimmed to the bundle + webview assets
- Scans yield to the event loop per file — the editor stays responsive and cancellation takes effect mid-scan
- Deprecation info is cached per declaration during a scan, speeding up projects with heavily-used deprecated symbols
- Export format handling consolidated into a single code path for the command, panel, and historical exports
- README and Marketplace description rewritten: usage-tracking positioning, and documentation for the Statistics Dashboard, Scan History, Editor Diagnostics, and configuration options

## [1.0.0]

### Initial Release

First release of Deprecated Tracker for VS Code.

#### Features

- **Smart Scanning**: Scan TypeScript and JavaScript projects for deprecated code using TypeScript Compiler API
- **Multiple Scan Modes**:
  - Scan entire project
  - Scan specific folders
  - Scan individual files
  - Right-click context menu integration
- **Custom Deprecation Tags**: Define custom tags beyond `@deprecated` (e.g., `@obsolete`, `@legacy`, `@experimental`)
- **Interactive Results Panel**: Clean table view with filtering and navigation
- **Filtering**: Filter results by name or file path
- **Ignore Management**:
  - Ignore specific methods, properties, or classes
  - Ignore entire files
  - Manage ignored items through dedicated panel
- **Export Results**: Export scan results to CSV, JSON, or Markdown formats
- **Configuration Support**: Customize behavior via `.deprecatedtrackerrc` or `package.json`
- **Scan History**:
  - View past scans
  - Compare results over time
  - Export historical scan data
- **State Persistence**: Filters and settings persist across VS Code sessions
- **Quick Navigation**: Jump directly to deprecated code locations with one click
- **Sidebar Integration**: Dedicated sidebar view for quick access

#### Configuration Options

- Custom trusted packages whitelist
- File exclude/include patterns
- Severity levels
- Custom deprecation tags

#### Supported Files

- TypeScript (`.ts`, `.tsx`)
- JavaScript (`.js`, `.jsx`, `.mjs`)

#### Requirements

- VS Code 1.74.0 or newer
- TypeScript project with `tsconfig.json` or JavaScript project with `jsconfig.json`
