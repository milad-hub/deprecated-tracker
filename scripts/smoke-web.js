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
  checkSizeCap(engine);

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
