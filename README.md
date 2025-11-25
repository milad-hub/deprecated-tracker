# Deprecated Tracker

> Find and manage deprecated code in your TypeScript projects

[![VS Code](https://img.shields.io/badge/VS%20Code-1.74%2B-blue.svg)](https://code.visualstudio.com/) [![TypeScript](https://img.shields.io/badge/TypeScript-5.0%2B-blue.svg)](https://www.typescriptlang.org/) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Ever stared at a massive codebase wondering which methods are deprecated? I've been there. This extension helps you hunt down all those `@deprecated` JSDoc tags so you can finally tackle that technical debt that's been haunting your team.

## What it actually does

This isn't just another regex-based search tool. Deprecated Tracker uses the TypeScript Compiler API to properly parse your code and find methods, properties, classes, and functions marked with `@deprecated` JSDoc tags. It shows you exactly where they are, lets you filter through the mess, and helps you manage what to ignore (for now).

Perfect for those moments when you inherit a codebase and need to figure out what's safe to use and what's not.

## Features

✨ **Smart Scanning** - Actually understands your TypeScript code, not just text matching  
📊 **Interactive Results** - Clean table view with clickable navigation (no more `Ctrl+P` hunting)  
🔍 **Powerful Filtering** - Filter by name or file to find what you need quickly  
🚫 **Ignore Management** - Hide items you're not ready to deal with yet  
📍 **Quick Navigation** - Jump straight to deprecated code with one click  
📥 **Export Results** - Export to CSV, JSON, or Markdown for reports and documentation  
🔄 **Rescan Anytime** - Re-run scans as your codebase changes

## Quick Start

### Installation

1. Clone this repo
2. Open in VS Code
3. Press `F5` to launch the Extension Development Host
4. Open a TypeScript project in the new window
5. Run `Deprecated Tracker: Scan Project` from the command palette

### Usage

Once installed, just run the scan command and you'll see a panel with all deprecated items in your project. Click on any item to jump to its location in your code.

**Pro tip**: Use the filters to narrow down results when working on specific files or features. Way faster than scrolling through hundreds of results.

## How to Use

### Running a Scan

1. Open your TypeScript project in VS Code
2. Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
3. Type "Deprecated Tracker: Scan Project"
4. Review the results in the panel

### Filtering Results

- **By Name**: Type the deprecated item name to see only matching results
- **By File**: Filter by filename or path to focus on specific files

### Ignoring Items

Sometimes you know about deprecated code but aren't ready to fix it yet. You can:

- **Ignore a specific method/property**: Click "Ignore [kind]" next to any item
- **Ignore an entire file**: Click "Ignore File" to hide all deprecated items in that file

Ignored items won't show up in future scans, but you can always manage them later.

### Managing Ignores

Click "Manage Ignores" to see everything you've ignored. You can remove individual ignores or clear them all at once.

### Exporting Results

Need to share deprecated items with your team or track them over time? Export your scan results:

1. Click the **Export ▼** button in the results panel
2. Choose your format:
   - **CSV** - For spreadsheet analysis in Excel/Google Sheets
   - **JSON** - For CI/CD integration or programmatic processing
   - **Markdown** - For documentation and reports
3. Save to your desired location

**Alternative**: Use the Command Palette (`Ctrl+Shift+P`) and search for "Deprecated Tracker: Export Results"

## Requirements

- VS Code 1.74.0 or newer
- A TypeScript project with `tsconfig.json` in the workspace root

That's it! Works with any TypeScript project, regardless of framework.

## How It Works

Under the hood, this extension:

1. Reads your `tsconfig.json` to understand your project structure
2. Uses the TypeScript Compiler API to parse all your files
3. Walks through the AST looking for `@deprecated` JSDoc tags
4. Shows you what it finds in an easy-to-use interface

The scanning respects your TypeScript configuration, so it only looks at files that are actually part of your project.

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

- Requires `tsconfig.json` in the workspace root
- Only works with TypeScript projects
- Looks for `@deprecated` JSDoc tags (not TypeScript's built-in deprecation)

## Contributing

Found a bug? Have an idea? Pull requests are welcome!

1. Fork the repo
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - feel free to use this however you want.

## Changelog

### 1.0.0

Initial release:

- Scan projects for deprecated items
- Interactive results table
- Filtering and ignore management
- File navigation

---

Made with ❤️ for TypeScript developers who are tired of hunting for deprecated code manually
