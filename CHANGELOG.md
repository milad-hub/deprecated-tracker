# Change Log

All notable changes to the "Deprecated Tracker" extension will be documented in this file.

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
