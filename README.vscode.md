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

## Installation

1. Open VS Code
2. Go to Extensions (`Ctrl+Shift+X`)
3. Search for "Deprecated Tracker"
4. Click Install

## Usage

1. Open a TypeScript project with `tsconfig.json`
2. Press `Ctrl+Shift+P` and run "Deprecated Tracker: Scan Project"
3. Review results in the panel that opens
4. Click on any item to navigate to the deprecated code
5. Use filters to narrow down results by name or file
6. Export results using the **Export ▼** button (CSV, JSON, or Markdown)

## Requirements

- VS Code 1.74.0 or newer
- TypeScript project with `tsconfig.json`

## License

MIT License - see the repository for full license details.
