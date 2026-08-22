# Deprecated Tracker for VS Code

Find deprecated code — and everywhere you still use it — in your TypeScript and JavaScript projects.

![The results panel: every deprecated symbol grouped with its call sites, split into documented, no-reason and unused](https://raw.githubusercontent.com/milad-hub/deprecated-tracker/main/docs/images/panel-demo.gif)

## Overview

Powered by the TypeScript type checker, this extension doesn't just list `@deprecated` declarations: it finds every **usage** of a deprecated symbol across your project, including deprecated APIs you call from npm dependencies. Great for tracking technical debt and planning refactoring work.

## Key Features

- **Usage Tracking**: Find where deprecated symbols are actually used, not just where they're declared
- **Deprecation Urgency**: Reads `since` and `removed in` out of the deprecation text and sorts what disappears soonest to the top
- **Interactive Results**: Table view grouped by symbol, with sortable columns, name/file/reason filters, and click-to-jump navigation
- **Statistics Dashboard**: Usage count charted over scan history with a baseline and change badge, plus most-used items, hotspot files, quick wins, and items missing a reason
- **Scan History**: Past scans are saved — re-open, compare, or export them anytime
- **Editor Diagnostics**: Deprecated usages get squiggles in the editor with the deprecation reason, plus a **Go to declaration** quick fix that jumps from the usage to the symbol it came from
- **Custom Tags**: Track `@obsolete`, `@legacy`, or your own tags beyond `@deprecated`
- **Ignore Management**: Hide items per method, per file, or by regex pattern until you're ready
- **Export**: CSV, JSON, or Markdown output — or **Copy prompt for AI fix**, a ready-to-paste brief for a coding agent
- **Configurable**: `.deprecatedtrackerrc` or `package.json` config, applied automatically on change
- **CI ratchet**: a headless `deprecated-tracker` CLI, published separately on npm (`npm i -D deprecated-tracker`), that fails a build only when the deprecation count rises above a committed baseline — SARIF output, GitHub and Azure annotations, and pre-commit hooks
- **Requirements Check**: Checks everything the extension needs the first time you open the view or run a scan, with a fix for anything missing — run `Deprecated Tracker: Check Requirements` to see it any time

## Installation

1. Open VS Code
2. Go to Extensions (`Ctrl+Shift+X`)
3. Search for "Deprecated Tracker"
4. Click Install

## Usage

**Scan**

- Full project: `Ctrl+Shift+P` → "Deprecated Tracker: Scan Project", or the sidebar's **Scan Project** button
- Folder or file: right-click it in the Explorer → "Deprecated Tracker: Scan Folder…" / "Scan File…"
- Just what you changed: the **Scan Changes** button in the status bar, or "Deprecated Tracker: Scan Changes". Pick staged, unstaged, or both in Settings
- Scans show progress and can be cancelled

**Review**

- Click any result to jump to the code; expand a row to see every usage
- Results open most-urgent-first; click any column header to re-sort
- Filter by name, file, or reason; ignore items you're not ready to fix
- Click **Dashboard** in the sidebar for the trend chart, hotspots, most-used items, and quick wins

**Export**

- **Export ▼** in the results panel: CSV, JSON, or Markdown — always the rows currently shown, so column filters apply. For the whole workspace use the palette's **Export Results** or the CLI.
- **Copy prompt for AI fix** opens a modal with a brief covering the rows you are looking at — symbols, declarations, deprecation notes, and every call site grouped by file. Copy it, paste it into your coding agent, or **Save as .txt**. The extension never edits code and never calls a model.
- Historical scans can be exported from the history list

**Tips**:

- Write `@deprecated since 2.0, removed in 3.0` — the removal marker is parsed and drives the urgency ranking
- Scan a single folder for faster results on large projects
- Export to JSON to integrate with your CI/CD pipeline
- Create a `.deprecatedtrackerrc` file to trust packages or include/exclude files
- Define custom tags like `@obsolete` or `@legacy` to categorize deprecated code

## Also available as a CLI

The same scanner ships as an npm package, [`deprecated-tracker`](https://www.npmjs.com/package/deprecated-tracker), for everywhere the editor is not — CI, Git hooks, and coding agents:

```bash
npm install --save-dev deprecated-tracker
```

It records today's deprecation count as a baseline and fails a build only when the number *rises*, and it registers itself with Claude Code or Codex as an MCP server so an agent can scan your changes on its own. It is installed and configured separately from this extension; the [CLI reference](https://github.com/milad-hub/deprecated-tracker/blob/main/docs/CLI.md) covers the options, hook recipes and agent setup.

## Requirements

- VS Code 1.74.0 or newer
- A trusted workspace
- TypeScript project with `tsconfig.json` or JavaScript project with `jsconfig.json` anywhere in the workspace

Nothing else to install — the TypeScript compiler ships inside the extension. It verifies all of this the first time you open the view or run a scan, and shows you what to fix if something is missing.

## License

MIT License - see the repository for full license details.
