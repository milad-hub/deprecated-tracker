# Deprecated Tracker for VS Code

Find and manage deprecated code in your TypeScript projects with ease.

## Overview

Deprecated Tracker helps you identify all `@deprecated` JSDoc tags in your TypeScript codebase, making it simple to track and manage technical debt. Whether you're maintaining legacy code or planning refactoring efforts, this extension gives you the visibility you need.

## Key Features

- **Smart Detection**: Uses TypeScript Compiler API for accurate parsing
- **Interactive Results**: Clean table view with filtering and navigation
- **Export Results**: Export to CSV, JSON, or Markdown formats
- **Configuration Support**: Customize scanner behavior via `.deprecatedtrackerrc` or `package.json`
- **Ignore Management**: Hide items you're not ready to address yet
- **Quick Navigation**: Jump directly to deprecated code with one click
- **Real-time Scanning**: Re-scan your project as code changes
- **Folder Scanning**: Right-click folders to scan specific areas of your project
- **State Persistence**: Your filters and settings survive VS Code reloads

## Installation

1. Open VS Code
2. Go to Extensions (`Ctrl+Shift+X`)
3. Search for "Deprecated Tracker"
4. Click Install

## Usage

1. Open a TypeScript project with `tsconfig.json`
2. **Full Project**: Press `Ctrl+Shift+P` and run "Deprecated Tracker: Scan Project"
3. **Specific Folder**: Right-click any folder in Explorer and select "Scan for Deprecated"
4. **Individual File**: Use Command Palette → "Deprecated Tracker: Scan File..."
5. Review results in the panel that opens
6. Click on any item to navigate to the deprecated code
7. Use filters to narrow down results by name or file
8. Export results using the **Export ▼** button (CSV, JSON, or Markdown)

**Pro Tips**:
- Use folder scanning for large projects - way faster than full scans!
- Export to JSON and integrate with your CI/CD pipeline
- Create a `.deprecatedtrackerrc` file to customize scanning behavior

## Requirements

- VS Code 1.74.0 or newer
- TypeScript project with `tsconfig.json`

## License

MIT License - see the repository for full license details.