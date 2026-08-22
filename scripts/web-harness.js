#!/usr/bin/env node
/**
 * Drive the web engine against real repositories and check it against the CLI.
 *
 * The engine's whole claim is that it reports the same thing the CLI reports
 * over the same code. That is only believable if something compares them, so
 * this clones each repository at the exact commit the engine read, runs the CLI
 * over it with no `npm install`, and diffs the two item sets.
 *
 * Divergence is expected and is the point: the engine cannot see generated
 * bundles, vendored trees, the standard library or anything in `node_modules`.
 * What matters is that every difference has a reason, and this prints them so the
 * reasons can be read rather than assumed. `.d.ts` used to be on that list, and
 * the first run of this harness is what showed it should not be — see
 * `limits.ts`.
 *
 *   node scripts/build-web.js && node scripts/web-harness.js
 *   node scripts/web-harness.js vuejs/vue --no-cli
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { pathToFileURL } = require("url");

const repoRoot = path.resolve(__dirname, "..");
const bundle = path.join(repoRoot, "web", "dist", "scanner.js");
const cli = path.join(repoRoot, "bin", "deprecated-tracker.js");

/** Small, just under the cap, and far past it — the three cases that matter. */
const DEFAULT_TARGETS = ["vuejs/vue", "trpc/trpc", "microsoft/vscode"];

function parseArgs(argv) {
  const options = { targets: [], runCli: true, work: "" };
  for (const arg of argv) {
    if (arg === "--no-cli") {
      options.runCli = false;
    } else if (arg.startsWith("--work=")) {
      options.work = arg.slice("--work=".length);
    } else if (!arg.startsWith("--")) {
      options.targets.push(arg);
    }
  }
  if (options.targets.length === 0) {
    options.targets = DEFAULT_TARGETS;
  }
  if (options.work === "") {
    options.work = fs.mkdtempSync(path.join(os.tmpdir(), "dt-web-harness-"));
  }
  return options;
}

function run(file, args, cwd, timeoutMs) {
  return spawnSync(file, args, {
    cwd,
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 256 * 1024 * 1024,
    shell: false,
    windowsHide: true,
  });
}

/** Same identity the CLI reports, so the two item sets can be compared at all. */
function itemKey(file, line, name, kind) {
  return `${String(file).replace(/^\.?\//, "")}|${line}|${name}|${kind}`;
}

function cliScan(checkout) {
  const reportPath = path.join(checkout, "..", "cli-report.json");
  const result = run(
    process.execPath,
    [
      "--max-old-space-size=8192",
      cli,
      checkout,
      "--fail-on-any",
      "--quiet",
      "--format",
      "json",
      "--output",
      reportPath,
    ],
    checkout,
    20 * 60 * 1000,
  );

  // 0 and 1 are verdicts (clean / findings). Anything else is a failure.
  if (result.status !== 0 && result.status !== 1) {
    return {
      failed: true,
      detail: (result.stderr || result.stdout || "")
        .trim()
        .split("\n")
        .slice(-2)
        .join(" | "),
    };
  }

  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  fs.rmSync(reportPath, { force: true });
  return { failed: false, report };
}

function clone(target, branch, into) {
  const result = run(
    "git",
    [
      "clone",
      "--depth",
      "1",
      "--single-branch",
      "--branch",
      branch,
      `https://github.com/${target}.git`,
      into,
    ],
    path.dirname(into),
    15 * 60 * 1000,
  );
  if (result.status !== 0) {
    throw new Error(
      `clone failed: ${(result.stderr || "").trim().split("\n").pop()}`,
    );
  }
  const head = run("git", ["rev-parse", "HEAD"], into, 60 * 1000);
  return head.stdout.trim();
}

function compare(webItems, cliItems) {
  const webKeys = new Set(
    webItems.map((item) => itemKey(item.file, item.line, item.name, item.kind)),
  );
  const cliKeys = new Set(
    cliItems.map((item) => itemKey(item.file, item.line, item.name, item.kind)),
  );

  const onlyWeb = [...webKeys].filter((key) => !cliKeys.has(key));
  const onlyCli = [...cliKeys].filter((key) => !webKeys.has(key));
  const shared = [...webKeys].filter((key) => cliKeys.has(key));

  return { onlyWeb, onlyCli, shared };
}

/**
 * Why an item the CLI found is invisible to a browser scan. Every category here
 * is a deliberate exclusion in `limits.ts`; anything else is a bug, and is
 * reported as `unexplained` so it cannot be waved through.
 */
function reasonMissing(key) {
  const file = key.split("|")[0];
  if (
    /(^|\/)(node_modules|vendor|third_party|dist|build|out|coverage)\//i.test(
      file,
    )
  ) {
    return "excluded directory";
  }
  if (/\.(min|bundle|chunk)\.[cm]?jsx?$/i.test(file)) {
    return "generated bundle, excluded";
  }
  return "unexplained";
}

function scan(engine, target) {
  return engine.scanRepository({
    input: target,
    token: process.env.GITHUB_TOKEN,
    onProgress: (progress) => {
      if (progress.phase === "downloading" && progress.loaded % 250 === 0) {
        process.stdout.write(
          `  downloading ${progress.loaded}/${progress.total}\n`,
        );
      }
    },
  });
}

function summarise(label, counts) {
  const parts = Object.entries(counts).map(([key, value]) => `${key}=${value}`);
  process.stdout.write(`  ${label}: ${parts.join(" ")}\n`);
}

(async () => {
  const options = parseArgs(process.argv.slice(2));
  const engine = await import(pathToFileURL(bundle).href);
  let unexplained = 0;

  for (const target of options.targets) {
    process.stdout.write(`\n${target}\n`);

    let result;
    try {
      result = await scan(engine, target);
    } catch (error) {
      // One repository failing is a data point, not a reason to abandon the
      // rest -- and the likeliest failure is GitHub's hourly limit for
      // unauthenticated requests, which GITHUB_TOKEN lifts.
      process.stdout.write(`  FAILED: ${error.message}\n`);
      process.exitCode = 1;
      continue;
    }

    if (result.refusal) {
      process.stdout.write(
        `  REFUSED (${result.refusal.reason}) after ${result.scanned.seconds}s and 2 API calls\n` +
          `    ${result.refusal.message}\n`,
      );
      summarise("tree", {
        blobs: result.scanned.blobs,
        candidates: result.scanned.candidates,
        selected: result.scanned.selected,
      });
      if (result.scanned.downloaded !== 0) {
        process.stdout.write(
          "  BUG: files were downloaded despite a refusal\n",
        );
        process.exitCode = 1;
      }
      continue;
    }

    summarise("web", {
      files: result.scanned.downloaded,
      mb: (result.scanned.selectedBytes / 1048576).toFixed(1),
      seconds: result.scanned.seconds,
      total: result.total,
      documented: result.summary.documented,
      bare: result.summary.bare,
      unused: result.summary.unused,
    });

    if (!options.runCli) {
      continue;
    }

    const checkout = path.join(options.work, target.replace("/", "__"));
    fs.rmSync(checkout, { recursive: true, force: true });
    const head = clone(target, result.repository.ref, checkout);

    if (head !== result.repository.commit) {
      process.stdout.write(
        `  SKIP comparison: clone is ${head.slice(0, 7)}, engine read ${result.repository.commit.slice(0, 7)}\n`,
      );
      fs.rmSync(checkout, { recursive: true, force: true });
      continue;
    }

    const cliResult = cliScan(checkout);
    if (cliResult.failed) {
      process.stdout.write(`  cli: FAILED — ${cliResult.detail}\n`);
      fs.rmSync(checkout, { recursive: true, force: true });
      continue;
    }

    summarise("cli", {
      total: cliResult.report.total,
      documented: cliResult.report.summary.documented,
      bare: cliResult.report.summary.bare,
      unused: cliResult.report.summary.unused,
    });

    const diff = compare(result.items, cliResult.report.items);
    const reasons = new Map();
    for (const key of diff.onlyCli) {
      const reason = reasonMissing(key);
      reasons.set(reason, (reasons.get(reason) || 0) + 1);
    }

    summarise("diff", {
      shared: diff.shared.length,
      "only-web": diff.onlyWeb.length,
      "only-cli": diff.onlyCli.length,
    });
    for (const [reason, count] of [...reasons.entries()].sort(
      (a, b) => b[1] - a[1],
    )) {
      process.stdout.write(`    only-cli, ${reason}: ${count}\n`);
      if (reason === "unexplained") {
        unexplained += count;
        for (const key of diff.onlyCli
          .filter((entry) => reasonMissing(entry) === "unexplained")
          .slice(0, 8)) {
          process.stdout.write(`      ${key}\n`);
        }
      }
    }
    for (const key of diff.onlyWeb.slice(0, 8)) {
      process.stdout.write(`    only-web: ${key}\n`);
    }

    fs.rmSync(checkout, { recursive: true, force: true });
  }

  fs.rmSync(options.work, { recursive: true, force: true });
  process.stdout.write(`\nunexplained differences: ${unexplained}\n`);
})().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
});
