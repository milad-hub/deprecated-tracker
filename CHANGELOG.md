# Change Log

All notable changes to the "Deprecated Tracker" extension will be documented in this file.

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
