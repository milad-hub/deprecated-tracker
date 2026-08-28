#!/usr/bin/env node
/**
 * Bundle the scanner for a browser.
 *
 * Two aliases carry the whole thing:
 *
 * - `path` becomes `web/engine/pathShim.ts`, so `src/` keeps importing `path`
 *   and never learns it might not be running on Node.
 * - `fs` becomes a module whose every export throws. Nothing in the browser path
 *   reaches it — the filesystem is behind `ScannerPlatform` — but `nodePlatform`
 *   is still reachable through the module graph, and a stub that throws is the
 *   honest outcome if that ever changes. A silent no-op would report an empty
 *   scan as though the repository were clean.
 *
 * Two more browser gaps are closed here rather than in `src/`:
 *
 * - `process.platform` is replaced with a literal. Both readers of it decide
 *   whether paths are case-insensitive, and a repository path from the GitHub
 *   tree API is case-sensitive — which is what any value other than `win32`
 *   selects.
 * - `setImmediate` is injected. The scan awaits it between files to stay
 *   cancellable; a browser has no such global, so it becomes a `setTimeout`.
 *
 * Type-checks `web/` first, because esbuild does not.
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const esbuild = require("esbuild");

const repoRoot = path.resolve(__dirname, "..");
const outDir = path.join(repoRoot, "web", "dist");
const fsStub = path.join(repoRoot, "web", "engine", "fsUnavailable.ts");

/**
 * Two bundles from one graph. The engine is importable anywhere, including Node,
 * which is what lets `scripts/web-harness.js` drive it against real repositories
 * without a browser. The worker is the same engine with a message loop around it
 * and is only loadable as a worker.
 *
 * The worker is emitted as an IIFE rather than a module. A module worker needs
 * Firefox 114 or Safari 15, and there is nothing to gain by requiring them: the
 * worker imports nothing at runtime, so `format: "iife"` costs a byte or two and
 * makes `new Worker(url)` — the form every browser with workers at all
 * understands — the one the page uses.
 */
const ENTRIES = [
  { entry: "index.ts", out: "scanner.js", format: "esm" },
  { entry: "worker.ts", out: "worker.js", format: "iife" },
];

function typeCheck() {
  const result = spawnSync(
    process.execPath,
    [
      path.join(repoRoot, "node_modules", "typescript", "bin", "tsc"),
      "-p",
      path.join(repoRoot, "web"),
      "--noEmit",
    ],
    { cwd: repoRoot, encoding: "utf8", shell: false },
  );
  process.stdout.write(result.stdout || "");
  process.stderr.write(result.stderr || "");
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

async function bundle(entry, out, format) {
  const outFile = path.join(outDir, out);
  fs.mkdirSync(outDir, { recursive: true });

  const result = await esbuild.build({
    entryPoints: [path.join(repoRoot, "web", "engine", entry)],
    outfile: outFile,
    bundle: true,
    format,
    platform: "browser",
    target: "es2020",
    minify: true,
    sourcemap: false,
    metafile: true,
    define: {
      "process.platform": '"browser"',
      // TypeScript decides it is on Node with
      //   typeof process !== "undefined" && process.nextTick && !process.browser
      //     && typeof require !== "undefined"
      // and esbuild synthesises a `require`, so without this the compiler builds
      // `ts.sys` out of stubbed Node builtins and dies on `os.platform()`. A real
      // browser has no `require` and skips that path by itself.
      "process.browser": "true",
    },
    inject: [path.join(repoRoot, "web", "engine", "browserGlobals.ts")],
    alias: {
      path: path.join(repoRoot, "web", "engine", "pathShim.ts"),
      fs: fsStub,
    },
    logLevel: "warning",
  });

  const bytes = fs.statSync(outFile).size;
  const inputs = Object.keys(result.metafile.outputs[relative(outFile)].inputs);
  const nodeBuiltins = inputs.filter((input) =>
    /(^|\/)node:|node_modules\/(fs|os|child_process)\//.test(input),
  );

  process.stdout.write(
    `${out}: ${Math.round(bytes / 1024)} KB from ${inputs.length} modules\n`,
  );
  if (nodeBuiltins.length > 0) {
    process.stderr.write(
      `a Node builtin reached the browser bundle: ${nodeBuiltins.join(", ")}\n`,
    );
    process.exit(1);
  }
}

function relative(target) {
  return path.relative(repoRoot, target).split(path.sep).join("/");
}

async function main() {
  typeCheck();
  for (const target of ENTRIES) {
    await bundle(target.entry, target.out, target.format);
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
});
