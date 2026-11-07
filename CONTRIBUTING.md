# Contributing

## Getting set up

Node 18 or newer, as declared in `engines`. The repository is a single npm
package that builds two artifacts: a VS Code extension and a CLI.

```bash
git clone https://github.com/milad-hub/deprecated-tracker.git
cd deprecated-tracker
npm ci
```

## The commands that matter

```bash
npm test                                          # jest, via config/jest.config.js
npx jest --coverage --config config/jest.config.js # the same suite with the 100% coverage gate
npx tsc -p ./ --noEmit                            # type-check
node scripts/bundle.js                            # bundle the extension and the CLI into out/
```

## Releasing

Bump the version (`package.json`, both fields in `package-lock.json`, the
placeholder in `.github/ISSUE_TEMPLATE/bug_report.yml`, the changelog heading),
merge to `main`, then from a clean, up-to-date `main`:

```bash
npm run publish-npm        # npm, asks for your 2FA code
npm run publish-extension  # VS Code Marketplace + Open VSX (needs VSCE_PAT and OVSX_PAT)
```

npm is published only from a local machine. The extension also publishes
itself from `.github/workflows/release.yml` whenever a `vX.Y.Z` tag is pushed,
so after `npm run publish-npm` pushes the tag, running `publish-extension`
locally is optional.

Each one starts from nothing: clean install, type-check, tests with coverage,
package, publish, then push the `vX.Y.Z` tag if it is missing. A version that is
already on a registry is skipped, so running a command twice, or the tag
workflow after a local release, is safe. Both must be started through npm: they call npm's own
CLI through `process.env.npm_execpath`, which npm sets only for scripts it runs.

## What CI requires

Every pull request runs the full suite on Ubuntu, macOS, and Windows against
Node 20, plus Node 18 on Ubuntu, and separately installs the packed tarball
globally and exercises the CLI end to end. All of it must be green before a
branch can merge.

Two things catch people out:

- **Coverage thresholds are 100%**, and the gate runs on Ubuntu only. A branch
  on `process.platform` has an arm that no single platform can reach, so put
  platform-conditional logic behind `src/utils/pathKey.ts` or a shared helper
  rather than writing the ternary inline. An inline copy passes locally on
  Windows and fails the gate on CI.
- **Tests must not assume Windows.** Path comparisons go through `pathKey`,
  which folds case on win32 and nowhere else; `path.isAbsolute('C:\\...')` is
  false under POSIX. Use `path.win32` explicitly when you mean Windows
  semantics.

## Pull requests

Branch from `main`. `main` is protected: it takes no direct pushes, no force
pushes, and requires the full check set to pass.

Keep the diff scoped to the change you are describing. The working tree has
pre-existing formatting drift, so `prettier --write` and `eslint --fix` will
rewrite files you never touched — format the files you actually edited instead.

Conventional commit prefixes (`feat:`, `fix:`, `ci:`, `docs:`, `chore:`) are
used throughout the history; please match them.

## Reporting bugs

Include the version, the platform, and enough of a project structure to
reproduce. For anything security-related, follow [SECURITY.md](SECURITY.md)
instead of opening an issue.
