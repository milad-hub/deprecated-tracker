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
npm test              # jest, via config/jest.config.js
npm run test:coverage # the same suite with the coverage gate applied
npm run compile       # tsc -p ./ (also runs automatically before npm test)
npm run build         # compile, then bundle the extension and the CLI
npm run build-package # produce the .vsix and the .tgz into artifacts/
```

`npm run build-package` and `npm run publish-npm` must be run through npm. They
invoke npm's own CLI through `process.env.npm_execpath`, which npm sets only
when it is the one starting the script, so `node scripts/package.js` exits
with an error by design.

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
pre-existing formatting drift, so `npm run format` and `eslint --fix` will
rewrite files you never touched — format the files you actually edited instead.

Conventional commit prefixes (`feat:`, `fix:`, `ci:`, `docs:`, `chore:`) are
used throughout the history; please match them.

## Reporting bugs

Include the version, the platform, and enough of a project structure to
reproduce. For anything security-related, follow [SECURITY.md](SECURITY.md)
instead of opening an issue.
