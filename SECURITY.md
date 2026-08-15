# Security Policy

## Supported versions

Fixes land on the latest released version only. There are no maintenance
branches for older releases.

| Version | Supported |
| ------- | --------- |
| 2.4.x   | Yes       |
| < 2.4   | No        |

## Reporting a vulnerability

Report privately through GitHub, not in a public issue:

1. Go to the [Security tab](https://github.com/milad-hub/deprecated-tracker/security)
2. Choose **Report a vulnerability**

That opens a private advisory visible only to you and the maintainer. Please
include the version, the platform, and the smallest reproduction you can manage.

Expect an acknowledgement within a week. If a report is confirmed, the fix and
the advisory are published together.

## Scope

The published npm package declares no runtime dependencies, but that is a
statement about `package.json`, not about what executes on your machine.
esbuild inlines whatever the sources import, so the TypeScript compiler ships
inside `out/cli.js`. Anything bundled into a released artifact is in scope no
matter which dependency block it was declared in.

Reports that are in scope include:

- Code execution or file access outside the scanned project, whether from the
  CLI, the MCP server, or a configuration file
- Cross-site scripting in the extension's webview panels, which render names,
  file paths, and reasons taken from the scanned code
- The `mcp install` / `mcp uninstall` commands writing outside their declared
  target when given hostile input
- Vulnerabilities in third-party code bundled into the published `.tgz` or
  `.vsix`, including the TypeScript compiler

Out of scope:

- Vulnerabilities in build and test tooling that never leaves the development
  machine — jest, eslint, prettier, esbuild and their dependency trees. These
  are tracked through Dependabot instead.
- Denial of service caused by pointing the scanner at a deliberately
  pathological project. The scanner is a developer tool run against code you
  already have on disk.
