# Change Log

All notable changes to the "Deprecated Tracker" extension will be documented in this file.

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
