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
const path = require('path');
const { pathToFileURL } = require('url');
const assert = require('assert');

const bundle = path.resolve(__dirname, '..', 'web', 'dist', 'scanner.js');

const files = new Map([
  [
    '/tsconfig.json',
    JSON.stringify({
      compilerOptions: { target: 'ES2020', module: 'commonjs', noLib: true },
      include: ['src'],
    }),
  ],
  [
    '/src/api.ts',
    [
      '/** @deprecated Use newApi instead */',
      'export function oldApi(): void {}',
      '/** @deprecated */',
      'export function bareApi(): void {}',
      '/** @deprecated Nothing calls this */',
      'export function orphanApi(): void {}',
      'export function newApi(): void {}',
      '',
    ].join('\n'),
  ],
  [
    '/src/app.ts',
    [
      'import { oldApi, bareApi } from "./api";',
      'oldApi();',
      'bareApi();',
      '',
    ].join('\n'),
  ],
]);

(async () => {
  const engine = await import(pathToFileURL(bundle).href);
  const items = await engine.scanVirtualProject({ files });

  const declarations = items.filter((item) => item.kind !== 'usage');
  const usages = items.filter((item) => item.kind === 'usage');
  const names = new Set(declarations.map((item) => item.name));

  process.stdout.write(
    `${items.length} item(s): ${declarations.length} declaration(s), ${usages.length} usage(s)\n`,
  );
  for (const item of items) {
    const from = item.deprecatedDeclaration
      ? ` -> ${item.deprecatedDeclaration.name}`
      : '';
    process.stdout.write(
      `  ${item.filePath}:${item.line} ${item.name} (${item.kind})${from}\n`,
    );
  }

  assert.ok(names.has('oldApi'), 'documented declaration missing');
  assert.ok(names.has('bareApi'), 'declaration with no reason missing');
  assert.ok(names.has('orphanApi'), 'uncalled declaration missing');
  assert.ok(usages.length >= 2, 'call sites in a second file were not resolved');
  assert.ok(
    usages.every((item) => item.deprecatedDeclaration),
    'a usage came back without the declaration it reached',
  );
  assert.ok(
    items.some((item) => item.deprecationReason === 'Use newApi instead'),
    'the deprecation reason was not read',
  );

  process.stdout.write('web bundle smoke test passed\n');
})().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
});
