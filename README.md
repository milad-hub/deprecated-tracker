# Deprecated Tracker

> Find and manage deprecated code in your TypeScript and JavaScript projects

[![VS Code](https://img.shields.io/badge/VS%20Code-1.74%2B-blue.svg)](https://code.visualstudio.com/) [![TypeScript](https://img.shields.io/badge/TypeScript-5.0%2B-blue.svg)](https://www.typescriptlang.org/) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Ever wondered which methods in your codebase are deprecated? This extension helps you find all `@deprecated` tags in your TypeScript and JavaScript projects, making it easier to manage technical debt.

## What it does

This extension uses the TypeScript Compiler API to properly parse your code and identify deprecated items. It finds methods, properties, classes, and functions marked with `@deprecated` JSDoc tags and presents them in an easy-to-navigate interface.

Useful when working with large codebases or inherited projects where you need to identify deprecated code.

## Features

✨ **Smart Scanning** - Actually understands your TypeScript and JavaScript code, not just text matching  
📊 **Interactive Results** - Clean table view with clickable navigation (no more `Ctrl+P` hunting)  
🔍 **Powerful Filtering** - Filter by name or file to find what you need quickly  
🏷️ **Custom Tags** - Define your own deprecation tags beyond `@deprecated` (e.g., `@obsolete`, `@legacy`)  
⚙️ **Configuration Support** - Customize scanner behavior via `.deprecatedtrackerrc` or `package.json`  
🚫 **Ignore Management** - Hide items you're not ready to deal with yet  
📍 **Quick Navigation** - Jump straight to deprecated code with one click  
📥 **Export Results** - Export to CSV, JSON, or Markdown for reports and documentation  
🔄 **Rescan Anytime** - Re-run scans as your codebase changes  
📁 **Folder Scanning** - Scan specific folders or files instead of entire project  
💾 **State Persistence** - Your filters and settings survive VS Code reloads

## Quick Start

### Installation

1. Clone this repo
2. Open in VS Code
3. Press `F5` to launch the Extension Development Host
4. Open a TypeScript project in the new window
5. Run `Deprecated Tracker: Scan Project` from the command palette

### Usage

Once installed, run the scan command and you'll see a panel with all deprecated items in your project. Click any item to jump to its location in your code.

**Tip**: Use the filters to narrow down results when working on specific files or features.

**Or even faster**: Right-click any folder in the Explorer and select "Scan for Deprecated" to scan just that folder!

## How to Use

### Running a Scan

1. Open your TypeScript or JavaScript project in VS Code
2. Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
3. Type "Deprecated Tracker: Scan Project", "Scan Folder", or "Scan File"
4. Review the results in the panel that opens

**Or even faster**: Right-click any folder or file in the Explorer and select "Scan for Deprecated"!

### Filtering Results

- **By Name**: Type the item name to see only matching results
- **By File**: Filter by filename or path

### Ignoring Items

Sometimes you're aware of deprecated code but not ready to address it. You can:

- **Ignore a specific method/property**: Click "Ignore [kind]" next to any item
- **Ignore an entire file**: Click "Ignore File" to hide all items in that file

Ignored items won't appear in future scans. You can manage them later through the ignore manager.

### Managing Ignores

Click "Manage Ignores" to see what you've ignored. Remove individual items or clear everything at once.

### Custom Deprecation Tags

Beyond `@deprecated`, you can define custom tags:

1. Click **"Manage Custom Tags"** in settings
2. Add your tags:
   - **Tag Name**: e.g., `@obsolete`, `@legacy`, `@experimental`
   - **Label**: Display name
   - **Description**: What it means
   - **Color**: For visual distinction
3. Enable/disable as needed

**Pre-configured tags:**

- `@obsolete` - Outdated code that should be replaced
- `@legacy` - Old code kept for compatibility
- `@experimental` - Unstable features

**Why use them:**

- Categorize different types of deprecated code
- Track various kinds of technical debt
- Custom workflows for deprecation levels

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

**Note:** The scanner validates custom tags to prevent conflicts with standard JSDoc tags like `@param`, `@returns`, etc.

### Exporting Results

Need to share deprecated items with your team or track them over time? Export your scan results:

1. Click the **Export ▼** button in the results panel
2. Choose your format:
   - **CSV** - For spreadsheet analysis in Excel/Google Sheets
   - **JSON** - For CI/CD integration or programmatic processing
   - **Markdown** - For documentation and reports
3. Save to your desired location

**Alternative**: Use the Command Palette (`Ctrl+Shift+P`) and search for "Deprecated Tracker: Export Results"

## Configuration

You can customize scanner behavior by creating a `.deprecatedtrackerrc` file or adding a `deprecatedTracker` section to your `package.json`.

### Configuration Options

Create a `.deprecatedtrackerrc` file in your project root:

```json
{
  "trustedPackages": ["rxjs", "lodash", "@angular/core", "my-internal-lib"],
  "excludePatterns": ["**/*.spec.ts", "**/*.test.ts", "**/test/**"],
  "includePatterns": ["src/**/*.ts"],
  "ignoreDeprecatedInComments": false,
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

- **trustedPackages**: Additional npm packages to whitelist (merged with defaults: rxjs, lodash, etc.)
- **excludePatterns**: Glob patterns for files to exclude from scanning (e.g., `**/*.test.ts`)
- **includePatterns**: Glob patterns for files to include (when specified, only these files are scanned)
- **ignoreDeprecatedInComments**: Whether to ignore @deprecated tags in comments (future use)
- **severity**: Severity level - `'info'`, `'warning'`, or `'error'` (future use for diagnostics)

### Configuration Priority

1. `.deprecatedtrackerrc` (if exists)
2. `package.json` with `deprecatedTracker` key (if exists)
3. Default configuration (if no config files)

## Requirements

- VS Code 1.74.0 or newer
- A TypeScript project with `tsconfig.json` **or** a JavaScript project with `jsconfig.json` in the workspace root

That's it! Works with any TypeScript or JavaScript project, regardless of framework.

## How It Works

Under the hood, this extension:

1. Reads your `tsconfig.json` or `jsconfig.json` to understand your project structure
2. Uses the TypeScript Compiler API to parse all your TypeScript and JavaScript files
3. Walks through the AST looking for `@deprecated` JSDoc tags
4. Shows you what it finds in an easy-to-use interface

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
npm run dev          # Watch mode for development
npm run build        # Lint, format, and compile
npm run lint         # Check for linting issues
npm run lint:fix     # Auto-fix linting issues
npm run format       # Format code with Prettier
npm test             # Run tests
npm run test:watch   # Run tests in watch mode
npm run test:coverage # Generate coverage report
```

### Debugging

Press `F5` in VS Code to launch the extension in debug mode. A new window will open where you can test your changes.

## Known Limitations

- Requires `tsconfig.json` or `jsconfig.json` in the workspace root
- Supports TypeScript (`.ts`, `.tsx`) and JavaScript (`.js`, `.jsx`, `.mjs`) files
- Scans for `@deprecated` JSDoc tags (standard deprecation mechanism)

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
