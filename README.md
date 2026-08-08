# Deprecated Tracker

> Find and manage deprecated code in your TypeScript and JavaScript projects

[![VS Code](https://img.shields.io/badge/VS%20Code-1.74%2B-blue.svg)](https://code.visualstudio.com/) [![TypeScript](https://img.shields.io/badge/TypeScript-5.0%2B-blue.svg)](https://www.typescriptlang.org/) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Most "find deprecated code" tools grep for `@deprecated` and show you the declarations. This extension uses the TypeScript type checker, so it also finds every **usage** of a deprecated symbol — including calls into deprecated APIs from your node_modules dependencies. That's the part you actually need when planning a migration: not "what is deprecated", but "where am I still using it".

Useful when working with large codebases or inherited projects where you need to get a handle on technical debt.

## Features

✨ **Usage tracking** - Type-checker-based detection finds usages of deprecated symbols, not just their declarations
⏳ **Deprecation urgency** - Reads `since` and `removed in` out of the deprecation text, so what disappears next major sorts above what merely has a high usage count
📊 **Interactive results** - Clean table view grouped by symbol, with click-to-jump navigation, sortable columns, and name/file/reason filters
📈 **Statistics dashboard** - Trend chart over scan history, plus top-most-used deprecated items, hotspot files, quick wins, and items missing a reason
🕒 **Scan history** - Every scan is saved; re-open or export past results and chart the count over time
🚨 **Editor diagnostics** - Deprecated usages get squiggles right in the editor, with the deprecation reason
🏷️ **Custom tags** - Track `@obsolete`, `@legacy`, or your own deprecation tags beyond `@deprecated`
🚫 **Ignore management** - Hide items (per method, per file, or by regex pattern) until you're ready for them
📥 **Export** - CSV, JSON, or Markdown for reports, spreadsheets, and CI — or a ready-to-paste prompt for a coding agent
🧩 **Requirements check** - Verifies on startup that everything the extension needs is in place, and tells you what to do about anything that is not

## Installation

**From the Marketplace**: search for "Deprecated Tracker" in the Extensions view (`Ctrl+Shift+X`), or install [`milad445.deprecated-tracker`](https://marketplace.visualstudio.com/items?itemName=milad445.deprecated-tracker) directly.

**For development**: clone this repo, `npm install`, open in VS Code, and press `F5` to launch the Extension Development Host.

## Usage

1. Open a TypeScript project (`tsconfig.json`) or JavaScript project (`jsconfig.json`) in VS Code
2. Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac) and run "Deprecated Tracker: Scan Project" — or click **Scan Project** in the Deprecated Tracker sidebar
3. Review the results panel: click any item to jump to its location, expand a row to see all usages
4. Use the name/file/reason filters to narrow down results when working on specific areas
5. Click any column header to sort. Results open most-urgent-first; click **Usages** to switch to the biggest cleanup jobs instead

**Or even faster**: Right-click any folder or file in the Explorer and pick "Deprecated Tracker: Scan Folder…" / "Scan File…" to scan just that part of the project.

Scans show a progress notification and can be cancelled mid-run.

### Deprecation Urgency

Deprecation notes often say when something goes away. That text is parsed instead of being kept as opaque prose:

```typescript
/** @deprecated since 2.0, removed in 3.0 */
export function oldApi() {}

/** @deprecated since 2023-01-15, removed 2024-06-30 */
export const oldConstant = 1;
```

Each item gets an urgency, shown in its own column and used as the default sort:

- **Removed** — the removal date has already passed
- **Scheduled** — there's a removal version, or a removal date still in the future
- **Announced** — a `since` marker only, no removal stated

This is what makes the list actionable: a symbol used twice that disappears in the next major outranks one used forty times with no removal date.

Urgency is derived from the deprecation text alone. A removal *version* isn't compared against the declaring package's installed version, so `removed in 3.0` stays **Scheduled** whether or not 3.0 has shipped — only a past ISO date promotes an item to **Removed**.

### Ignoring Items

Sometimes you're aware of deprecated code but not ready to address it. You can:

- **Ignore a specific method/property**: Click "Ignore" next to any item
- **Ignore an entire file**: Click "Ignore File" to hide all items in that file
- **Ignore by pattern**: Add regex patterns for file paths or method names under **Manage Ignores**

Ignored items won't appear in future scans. Click **Manage Ignores** in the results panel to review, remove individual rules, or clear everything at once — it opens in place, with a back button to return to your results.

### Statistics Dashboard

Click **Dashboard** in the sidebar (it appears once you have scan history), or run `Deprecated Tracker: Show Statistics Dashboard`. It reports on your most recent scan:

- **Trend** — deprecated usage count charted across your stored scans, with a dashed baseline at the oldest one and a badge showing the change since then. A drop is styled as a win, because that's the question the dashboard exists to answer: is the number going down?
- Counts by kind (methods, properties, classes, interfaces, functions)
- Top 10 most-used deprecated items and hotspot files
- **Quick wins** — deprecated items with ≤2 usages, easy to clean up first
- **Needs attention** — deprecated declarations with no reason/replacement documented

Rows are clickable and jump straight to the code.

Scan history keeps the last 10 scans, so the trend shows at most 10 points and the baseline is the oldest scan still kept. Once history rolls over, the baseline moves with it.

### Scan History

Every scan is saved automatically (with a cap on stored results per scan). From the sidebar or the results panel history section you can re-open a past scan, export it (CSV/JSON/Markdown), or clear the history. The dashboard's trend chart is built from this history.

### Editor Diagnostics

Deprecated usages are underlined directly in the editor, with the deprecation reason in the hover message. The squiggle level follows the `severity` config option (`info`, `warning`, or `error`).

### Custom Deprecation Tags

Beyond `@deprecated`, you can define custom tags:

1. Run `Deprecated Tracker: Open Settings` (or click ⚙️ **Settings** in the sidebar)
2. Add your tags:
   - **Tag Name**: e.g., `@obsolete`, `@legacy`, `@experimental` (must start with `@`)
   - **Label**: Display name
   - **Description**: What it means — also used as the fallback deprecation reason when the code comment doesn't provide one
   - **Color**: For visual distinction
3. Enable/disable as needed

**Pre-configured tags:**

- `@obsolete` - Outdated code that should be replaced
- `@legacy` - Old code kept for compatibility
- `@experimental` - Unstable features (disabled by default)

**Example usage in your code:**

```typescript
/**
 * @obsolete Use the new PaymentServiceV2 instead
 */
export class PaymentService {
  // ...
}

/**
 * @legacy Kept for backward compatibility only
 * @param oldFormat The legacy format
 */
function processLegacyData(oldFormat: string) {
  // ...
}
```

**Note:** Custom tags are validated — they can't conflict with reserved JSDoc tags like `@param`, `@returns`, or `@deprecated` itself.

### Exporting Results

Need to share deprecated items with your team or track them over time?

1. Click the **Export ▼** button in the results panel
2. Choose your format:
   - **CSV** - For spreadsheet analysis in Excel/Google Sheets, including `Urgency`, `Since` and `Removal` columns
   - **JSON** - For CI/CD integration or programmatic processing; carries the full parsed deprecation schedule
   - **Markdown** - For documentation and reports, with `Urgency` and `Removal` columns
   - **Copy prompt for AI fix** - Opens a modal with a ready-to-paste brief for a coding agent instead of a save dialog
3. Save to your desired location

### Copy prompt for AI fix

The extension already knows what an agent would otherwise have to rediscover: which symbols are deprecated, where each is declared, every call site, what the deprecation note says, and which ones are already past their removal date. **Copy prompt for AI fix** hands that over as a brief.

- Covers exactly the rows the panel is showing, so a filtered view produces a prompt for that subset.
- Usages are grouped under their file, paths are workspace-relative, and symbols are ordered by urgency — a compact prompt costs less to run.
- The work list is capped; when it truncates, the prompt says how many symbols it covers out of the total, so nothing is silently dropped.
- **Copy** puts it on the clipboard; **Save as .txt** writes it to a file if you'd rather hand the agent a path.
- No source snippets and no guessed replacements. The extension never edits code and never calls a model — the feature ends at text on your clipboard.

**Alternative**: Use the Command Palette and search for "Deprecated Tracker: Export Results". Historical scans have their own Export button in the history list.

## Configuration

You can customize scanner behavior by creating a `.deprecatedtrackerrc` file or adding a `deprecatedTracker` section to your `package.json`. Changes are picked up automatically — the extension watches both files, so the next scan uses the new config without reloading the window.

Create a `.deprecatedtrackerrc` file in your project root:

```json
{
  "trustedPackages": ["rxjs", "lodash", "@angular/core", "my-internal-lib"],
  "excludePatterns": ["**/*.spec.ts", "**/*.test.ts", "**/test/**"],
  "includePatterns": ["src/**/*.ts"],
  "severity": "warning"
}
```

Or add to your `package.json`:

```json
{
  "name": "my-project",
  "version": "1.0.0",
  "deprecatedTracker": {
    "trustedPackages": ["custom-lib"],
    "excludePatterns": ["**/*.test.ts"]
  }
}
```

### Available Options

- **trustedPackages**: npm packages whose deprecated APIs are not reported. When specified, it replaces the defaults; use an empty array to trust no packages. A scope entry like `@angular` trusts every `@angular/*` package.
- **excludePatterns**: Glob patterns for files to exclude from scanning (e.g., `**/*.test.ts`)
- **includePatterns**: Glob patterns for files to include (when specified, only these files are scanned)
- **severity**: `'info'`, `'warning'`, or `'error'` — sets the severity of reported items and the editor squiggle level

Deprecation tags are only ever read from real JSDoc (`/** ... */`) comments. A `@deprecated` written in a `//` or plain `/* */` comment is never reported.

### Configuration Priority

1. `.deprecatedtrackerrc` (if exists)
2. `package.json` with `deprecatedTracker` key (if exists)
3. Default configuration (if no config files)

In a multi-root workspace the folders are checked in order and the first one that defines a configuration applies to the whole workspace. Every folder's config files are watched, and folders added or removed after startup are picked up automatically.

## Requirements

- VS Code 1.74.0 or newer
- A trusted workspace (VS Code restricts the extension in an untrusted one)
- A TypeScript project with `tsconfig.json` **or** a JavaScript project with `jsconfig.json` anywhere in the workspace (nested projects are discovered automatically)

That's it! Nothing to install alongside it — the TypeScript compiler ships inside the extension. Works with any TypeScript or JavaScript project, regardless of framework.

The extension checks all of this itself. On startup, anything that would stop a scan from working opens a **Requirements** page listing every check, what is wrong, and how to fix it — including a button to create a starter `tsconfig.json`. Run `Deprecated Tracker: Check Requirements` any time to see the same list when everything is fine.

## How It Works

Under the hood, this extension:

1. Reads your `tsconfig.json` or `jsconfig.json` (following project references) to understand your project structure
2. Builds a TypeScript program and walks the AST of every project file
3. Detects deprecation markers: `@deprecated` JSDoc tags, your enabled custom tags, and `@deprecated()`-style decorators
4. Uses the type checker to resolve every identifier, call, and property access back to its declaration — so usages of deprecated symbols are found wherever they are, including in imported packages
5. Parses the deprecation text for `since` and `removed in` markers to rank each item by urgency
6. Shows the results in the panel, statistics dashboard, and editor diagnostics

The scanning respects your TypeScript/JavaScript configuration, so it only looks at files that are actually part of your project.

## Development

Want to contribute or customize it? Here's how to get started:

### Prerequisites

- Node.js 18+ and npm 9+
- VS Code 1.74+

### Setup

```bash
npm install
npm run compile
```

### Available Scripts

```bash
npm run dev           # tsc watch mode for development
npm run compile       # Type-check and compile with tsc
npm run build         # Compile (tsc) + bundle (esbuild) + copy webview assets
npm run build-package # Build and package the VSIX
npm run lint          # Check for linting issues
npm run lint:fix      # Auto-fix linting issues
npm run format        # Format code with Prettier
npm test              # Run tests
npm run test:watch    # Run tests in watch mode
npm run test:coverage # Generate coverage report (thresholds at 100%)
```

### Debugging

Press `F5` in VS Code to launch the extension in debug mode. A new window will open where you can test your changes.

## Known Limitations

- Supports TypeScript (`.ts`, `.tsx`) and JavaScript (`.js`, `.jsx`, `.mjs`) files

## Contributing

Found a bug? Have an idea? Pull requests are welcome!

1. Fork the repo
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - feel free to use this however you want.

---

Made with ❤️ for TypeScript developers who are tired of hunting for deprecated code manually
