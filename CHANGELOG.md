# Change Log

All notable changes to the "Deprecated Tracker" extension will be documented in this file.

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
