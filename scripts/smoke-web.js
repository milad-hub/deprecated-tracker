#!/usr/bin/env node
/**
 * Run the browser bundle and assert it finds what it should.
 *
 * The bundle building is not evidence that it works: `fs` is aliased to a module
 * that throws, so anything still reaching for the filesystem fails here and only
 * here. Node is the host because it is the one available without a browser — what
 * is being tested is that the bundled code touches no Node builtin, not that
 * Node can run it.
 *
 *   node scripts/build-web.js && node scripts/smoke-web.js
 */
const path = require("path");
const { pathToFileURL } = require("url");
const assert = require("assert");

const bundle = path.resolve(__dirname, "..", "web", "dist", "scanner.js");

const files = new Map([
  [
    "/tsconfig.json",
    JSON.stringify({
      compilerOptions: { target: "ES2020", module: "commonjs", noLib: true },
      include: ["src"],
    }),
  ],
  [
    "/src/api.ts",
    [
      "/** @deprecated Use newApi instead */",
      "export function oldApi(): void {}",
      "/** @deprecated */",
      "export function bareApi(): void {}",
      "/** @deprecated Nothing calls this */",
      "export function orphanApi(): void {}",
      "export function newApi(): void {}",
      "",
    ].join("\n"),
  ],
  [
    "/src/app.ts",
    [
      'import { oldApi, bareApi } from "./api";',
      "oldApi();",
      "bareApi();",
      "",
    ].join("\n"),
  ],
]);

(async () => {
  const engine = await import(pathToFileURL(bundle).href);
  const items = await engine.scanVirtualProject({ files });

  const declarations = items.filter((item) => item.kind !== "usage");
  const usages = items.filter((item) => item.kind === "usage");
  const names = new Set(declarations.map((item) => item.name));

  process.stdout.write(
    `${items.length} item(s): ${declarations.length} declaration(s), ${usages.length} usage(s)\n`,
  );
  for (const item of items) {
    const from = item.deprecatedDeclaration
      ? ` -> ${item.deprecatedDeclaration.name}`
      : "";
    process.stdout.write(
      `  ${item.filePath}:${item.line} ${item.name} (${item.kind})${from}\n`,
    );
  }

  assert.ok(names.has("oldApi"), "documented declaration missing");
  assert.ok(names.has("bareApi"), "declaration with no reason missing");
  assert.ok(names.has("orphanApi"), "uncalled declaration missing");
  assert.ok(
    usages.length >= 2,
    "call sites in a second file were not resolved",
  );
  assert.ok(
    usages.every((item) => item.deprecatedDeclaration),
    "a usage came back without the declaration it reached",
  );
  assert.ok(
    items.some((item) => item.deprecationReason === "Use newApi instead"),
    "the deprecation reason was not read",
  );

  checkInputParsing(engine);
  checkIdentityValidation(engine);
  checkSizeCap(engine);
  checkLimitClamping(engine);

  process.stdout.write("web bundle smoke test passed\n");
})().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
});

/**
 * What a person pastes, and what the engine makes of it. Offline on purpose:
 * these are the cases that break silently, by scanning the wrong ref rather than
 * by failing.
 */
function checkInputParsing(engine) {
  const cases = [
    ["vuejs/vue", { owner: "vuejs", name: "vue", ref: "" }],
    ["https://github.com/vuejs/vue", { owner: "vuejs", name: "vue", ref: "" }],
    [
      "https://github.com/vuejs/vue.git",
      { owner: "vuejs", name: "vue", ref: "" },
    ],
    ["git@github.com:vuejs/vue.git", { owner: "vuejs", name: "vue", ref: "" }],
    ["github.com/vuejs/vue/", { owner: "vuejs", name: "vue", ref: "" }],
    ["vuejs/vue@2.7.16", { owner: "vuejs", name: "vue", ref: "2.7.16" }],
    [
      "https://github.com/vuejs/vue/tree/release/2.6",
      { owner: "vuejs", name: "vue", ref: "release/2.6" },
    ],
    [
      // A ref in the path wins over an @suffix: it is the more specific thing
      // the person was actually looking at.
      "https://github.com/vuejs/vue/tree/main@ignored",
      { owner: "vuejs", name: "vue", ref: "main" },
    ],
    ["  vuejs/vue  ", { owner: "vuejs", name: "vue", ref: "" }],
  ];

  for (const [input, expected] of cases) {
    assert.deepStrictEqual(
      engine.parseRepoInput(input),
      expected,
      `parseRepoInput(${JSON.stringify(input)})`,
    );
  }

  for (const bad of ["", "   ", "vuejs", "https://gitlab.com/a/b"]) {
    assert.throws(
      () => engine.parseRepoInput(bad),
      `parseRepoInput(${JSON.stringify(bad)}) should refuse`,
    );
  }

  process.stdout.write(
    `input parsing: ${cases.length} forms accepted, 4 refused\n`,
  );
}

/**
 * The cap is checked against the tree, before anything is downloaded, and every
 * exclusion is a category rather than a heuristic on file contents.
 */
function checkSizeCap(engine) {
  const blob = (filePath, size) => ({ path: filePath, size: size || 100 });

  const ordinary = engine.selectFiles([
    blob("tsconfig.json"),
    blob("src/a.ts"),
    blob("src/b.tsx"),
    blob("src/types.d.ts"),
    blob("node_modules/pkg/index.js"),
    blob("dist/app.js"),
    blob("web/app.min.js"),
    blob("README.md"),
    blob("src/huge.ts", 4 * 1024 * 1024),
  ]);
  assert.ok(!ordinary.refusal, "an ordinary repository was refused");
  assert.deepStrictEqual(
    ordinary.paths.sort(),
    // `src/types.d.ts` is in there on purpose: a declaration file is a
    // library's API surface and is where `@deprecated` lives.
    ["src/a.ts", "src/b.tsx", "src/types.d.ts", "tsconfig.json"],
    "the wrong files were selected",
  );
  assert.strictEqual(
    ordinary.counts.oversizeFiles,
    1,
    "the oversize file was not counted",
  );
  assert.strictEqual(
    ordinary.counts.configFiles,
    1,
    "the config file was not counted",
  );

  const tooMany = engine.selectFiles([
    blob("tsconfig.json"),
    ...Array.from(
      { length: engine.DEFAULT_LIMITS.maxFiles + 1 },
      (_unused, index) => blob(`src/file${index}.ts`),
    ),
  ]);
  assert.strictEqual(tooMany.refusal.reason, "too-many-files");
  assert.deepStrictEqual(
    tooMany.paths,
    [],
    "a refused repository still listed files",
  );
  assert.ok(
    tooMany.refusal.message.includes(
      engine.DEFAULT_LIMITS.maxFiles.toLocaleString("en-US"),
    ),
    "the refusal does not name the limit",
  );

  // Each file has to stay under the per-file ceiling, or it is excluded as
  // oversize and never reaches the total. Which is the correct order: an
  // excluded file is not part of what would be downloaded.
  const perFile = engine.DEFAULT_LIMITS.maxFileBytes - 1;
  const enoughFiles =
    Math.ceil(engine.DEFAULT_LIMITS.maxTotalBytes / perFile) + 1;
  const tooBig = engine.selectFiles([
    blob("tsconfig.json"),
    ...Array.from({ length: enoughFiles }, (_unused, index) =>
      blob(`src/big${index}.ts`, perFile),
    ),
  ]);
  assert.strictEqual(tooBig.refusal.reason, "too-many-bytes");
  assert.ok(
    tooBig.counts.selected <= engine.DEFAULT_LIMITS.maxFiles,
    "this case must be refused for its bytes, not its file count",
  );

  assert.strictEqual(
    engine.selectFiles([blob("src/a.ts")]).refusal.reason,
    "no-config",
    "a repository with no tsconfig was not refused",
  );
  assert.strictEqual(
    engine.selectFiles([blob("tsconfig.json"), blob("README.md")]).refusal
      .reason,
    "no-source",
    "a repository with no source was not refused",
  );

  process.stdout.write(
    "size cap: selection, three refusals and the oversize count hold\n",
  );
}

/**
 * The probe list from the sharp-edges audit. Each of these used to parse into
 * something that addressed a different URL than the one it looked like, and the
 * failure mode was a confusing 404 rather than an error.
 */
function checkIdentityValidation(engine) {
  const rejected = [
    "a/../../b",
    "a/..",
    "../../etc/passwd",
    "owner/name?per_page=1&x=2",
    "owner/name#fragment",
    "owner/na me",
    "owner/name@../../../",
    "owner/name@release/../..",
    "owner/name@feature branch",
    "owner/name@ref?x=1",
    "owner/name@ref#frag",
    "owner/name@-leading-dash",
    "owner/name@trailing/",
    "owner/name@double//slash",
    "owner/name@ref.lock",
    "own er/name",
    "-owner/name",
    "owner!/name",
    "owner/name@a@{0}",
  ];

  for (const input of rejected) {
    assert.throws(
      () => engine.parseRepoInput(input),
      `parseRepoInput(${JSON.stringify(input)}) should refuse`,
    );
  }

  // Legitimate shapes must survive the new grammar.
  const accepted = [
    ["vuejs/vue", { owner: "vuejs", name: "vue", ref: "" }],
    [
      "sindresorhus/type-fest",
      { owner: "sindresorhus", name: "type-fest", ref: "" },
    ],
    ["owner/name.js", { owner: "owner", name: "name.js", ref: "" }],
    ["owner/some_name", { owner: "owner", name: "some_name", ref: "" }],
    ["vuejs/vue@2.7.16", { owner: "vuejs", name: "vue", ref: "2.7.16" }],
    [
      "https://github.com/vuejs/vue/tree/release/2.6",
      { owner: "vuejs", name: "vue", ref: "release/2.6" },
    ],
    [
      "owner/name@0123456789abcdef0123456789abcdef01234567",
      {
        owner: "owner",
        name: "name",
        ref: "0123456789abcdef0123456789abcdef01234567",
      },
    ],
  ];

  for (const [input, expected] of accepted) {
    assert.deepStrictEqual(engine.parseRepoInput(input), expected, input);
  }

  // Every interpolated segment reaches the URL encoded, and the URL still points
  // at the host it should.
  const repo = { owner: "vuejs", name: "vue", commit: "abc1234", ref: "main" };
  const url = engine.rawUrl(repo, "src/a b/c#d.ts");
  assert.strictEqual(
    url,
    "https://raw.githubusercontent.com/vuejs/vue/abc1234/src/a%20b/c%23d.ts",
    "rawUrl left a path segment unencoded",
  );
  assert.ok(
    url.startsWith("https://raw.githubusercontent.com/vuejs/vue/"),
    "rawUrl escaped its own host path",
  );

  process.stdout.write(
    `identity: ${rejected.length} malformed refused, ${accepted.length} real forms accepted, URL encoded\n`,
  );
}

/**
 * The cap is the page's whole protection against a repository that would kill
 * the tab, and the worker takes limits straight off a `postMessage`. A caller
 * may lower a ceiling; nothing may raise or erase one.
 */
function checkLimitClamping(engine) {
  const defaults = engine.DEFAULT_LIMITS;

  const raised = engine.resolveLimits({
    maxFiles: 1e9,
    maxTotalBytes: 1e12,
    maxFileBytes: 1e9,
  });
  assert.deepStrictEqual(
    raised.limits,
    defaults,
    "a caller raised the ceiling",
  );

  const lowered = engine.resolveLimits({ maxFiles: 10 });
  assert.strictEqual(
    lowered.limits.maxFiles,
    10,
    "a caller could not lower the ceiling",
  );
  assert.strictEqual(
    lowered.limits.maxTotalBytes,
    defaults.maxTotalBytes,
    "an unstated field did not fall back to the default",
  );

  // Every one of these used to disable the comparison rather than fail it.
  for (const unusable of [
    {},
    { maxFiles: NaN },
    { maxFiles: Infinity },
    { maxFiles: "900" },
    undefined,
  ]) {
    assert.deepStrictEqual(
      engine.resolveLimits(unusable).limits,
      defaults,
      `unusable limits ${JSON.stringify(unusable)} did not fall back to the defaults`,
    );
  }

  const blob = (filePath, size) => ({ path: filePath, size: size || 100 });
  const overCap = [
    blob("tsconfig.json"),
    ...Array.from({ length: defaults.maxFiles + 1 }, (_unused, index) =>
      blob(`src/file${index}.ts`),
    ),
  ];

  // The headline of this whole change: a partial object must refuse exactly as
  // the default does.
  assert.strictEqual(
    engine.selectFiles(overCap, {}).refusal.reason,
    "too-many-files",
    "an empty limits object removed the cap",
  );
  assert.strictEqual(
    engine.selectFiles(overCap, { maxFiles: 1e9 }).refusal.reason,
    "too-many-files",
    "a raised limit removed the cap",
  );
  assert.strictEqual(
    engine.selectFiles(overCap, { maxFiles: NaN }).refusal.reason,
    "too-many-files",
    "NaN removed the cap",
  );

  // A nonsensical number is refused by name, not by excluding every file and
  // reporting whatever symptom falls out downstream.
  const zeroed = engine.selectFiles(overCap, { maxFileBytes: 0 });
  assert.strictEqual(
    zeroed.refusal.reason,
    "invalid-limits",
    "a zero limit was not refused",
  );
  assert.ok(
    zeroed.refusal.message.includes("maxFileBytes=0"),
    "the refusal does not name the field",
  );
  assert.deepStrictEqual(
    zeroed.paths,
    [],
    "a refused selection still listed files",
  );
  assert.strictEqual(
    engine.selectFiles(overCap, { maxFiles: -1 }).refusal.reason,
    "invalid-limits",
    "a negative limit was not refused",
  );

  process.stdout.write(
    "limits: clamped down-only, unusable values ignored, zero and negative refused\n",
  );
}
