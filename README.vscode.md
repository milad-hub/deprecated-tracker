# Deprecated Tracker for VS Code

Find deprecated code in your TypeScript and JavaScript projects.

## Overview

This extension helps you find all `@deprecated` JSDoc tags in your codebase. Great for tracking technical debt or planning refactoring work.

## Key Features

- **Smart Detection**: Uses TypeScript Compiler API for accurate parsing of TypeScript and JavaScript files
- **Interactive Results**: Clean table view with filtering and navigation
- **Custom Tags**: Define custom deprecation tags beyond `@deprecated` (e.g., `@obsolete`, `@legacy`)
- **Export Results**: Export to CSV, JSON, or Markdown formats
- **Configuration Support**: Customize scanner behavior via `.deprecatedtrackerrc` or `package.json`
- **Ignore Management**: Hide items you're not ready to address yet
- **Quick Navigation**: Jump directly to deprecated code with one click
- **Real-time Scanning**: Re-scan your project as code changes
- **Folder & File Scanning**: Right-click folders or files to scan specific areas of your project
- **State Persistence**: Your filters and settings survive VS Code reloads

## Installation

1. Open VS Code
2. Go to Extensions (`Ctrl+Shift+X`)
3. Search for "Deprecated Tracker"
4. Click Install

## Usage

1. Open a TypeScript project with `tsconfig.json` or a JavaScript project with `jsconfig.json`
2. **Full Project**: Press `Ctrl+Shift+P` and run "Deprecated Tracker: Scan Project"
3. **Specific Folder**: Right-click any folder in Explorer and select "Scan for Deprecated"
4. **Individual File**: Right-click any file in Explorer and select "Scan for Deprecated"
5. Review results in the panel that opens
6. Click on any item to navigate to the deprecated code
7. Use filters to narrow down results by name or file
8. Export results using the **Export ▼** button (CSV, JSON, or Markdown)

**Tips**:

- Use folder scanning for large projects for faster results
- Export to JSON to integrate with your CI/CD pipeline
- Create a `.deprecatedtrackerrc` file to customize scanning behavior
- Define custom tags like `@obsolete` or `@legacy` to categorize deprecated code

## Requirements

- VS Code 1.74.0 or newer
- TypeScript project with `tsconfig.json` or JavaScript project with `jsconfig.json`

## License

MIT License - see the repository for full license details.
