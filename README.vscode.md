# Deprecated Tracker for VS Code

Find deprecated code — and everywhere you still use it — in your TypeScript and JavaScript projects.

## Overview

Powered by the TypeScript type checker, this extension doesn't just list `@deprecated` declarations: it finds every **usage** of a deprecated symbol across your project, including deprecated APIs you call from npm dependencies. Great for tracking technical debt and planning refactoring work.

## Key Features

- **Usage Tracking**: Find where deprecated symbols are actually used, not just where they're declared
- **Interactive Results**: Table view grouped by symbol, with filtering and click-to-jump navigation
- **Statistics Dashboard**: Most-used deprecated items, hotspot files, quick wins, and items missing a reason
- **Scan History**: Past scans are saved — re-open, compare, or export them anytime
- **Editor Diagnostics**: Deprecated usages get squiggles in the editor with the deprecation reason
- **Custom Tags**: Track `@obsolete`, `@legacy`, or your own tags beyond `@deprecated`
- **Ignore Management**: Hide items per method, per file, or by regex pattern until you're ready
- **Export**: CSV, JSON, or Markdown output
- **Configurable**: `.deprecatedtrackerrc` or `package.json` config, applied automatically on change

## Installation

1. Open VS Code
2. Go to Extensions (`Ctrl+Shift+X`)
3. Search for "Deprecated Tracker"
4. Click Install

## Usage

**Scan**

- Full project: `Ctrl+Shift+P` → "Deprecated Tracker: Scan Project", or the sidebar's **Scan Project** button
- Folder or file: right-click it in the Explorer → "Deprecated Tracker: Scan Folder…" / "Scan File…"
- Scans show progress and can be cancelled

**Review**

- Click any result to jump to the code; expand a row to see every usage
- Filter by name or file; ignore items you're not ready to fix
- Open the Statistics Dashboard for hotspots, most-used items, and quick wins

**Export**

- **Export ▼** in the results panel: CSV, JSON, or Markdown
- Historical scans can be exported from the history list

**Tips**:

- Scan a single folder for faster results on large projects
- Export to JSON to integrate with your CI/CD pipeline
- Create a `.deprecatedtrackerrc` file to trust packages or include/exclude files
- Define custom tags like `@obsolete` or `@legacy` to categorize deprecated code

## Requirements

- VS Code 1.74.0 or newer
- TypeScript project with `tsconfig.json` or JavaScript project with `jsconfig.json` in the workspace root

## License

MIT License - see the repository for full license details.
