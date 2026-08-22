const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const artifactsDir = path.join(rootDir, 'artifacts');
const npmCli = process.env.npm_execpath;

if (!npmCli) {
  console.error('ERROR: run this through npm (npm run publish-extension).');
  process.exit(1);
}

// Both registries are checked before either is written to. Publishing to one
// and not the other is what produced the version drift this script exists to
// stop: Open VSX is missing 2.0.x-2.2.x and all of 2.4.x purely because it was
// a separate manual step that got skipped.
const MARKETPLACE_TOKEN = 'VSCE_PAT';
const OPEN_VSX_TOKEN = 'OVSX_PAT';

const missing = [MARKETPLACE_TOKEN, OPEN_VSX_TOKEN].filter(
  (name) => !process.env[name]
);

if (missing.length) {
  console.error(`ERROR: missing ${missing.join(' and ')} in the environment.`);
  console.error('');
  console.error('Both are required before anything is published, so a half-');
  console.error('finished release cannot leave the two registries on different');
  console.error('versions. Set them for this shell only — do not commit them:');
  console.error('');
  console.error(`  $env:${MARKETPLACE_TOKEN} = "<token>"   # dev.azure.com PAT, Marketplace scope`);
  console.error(`  $env:${OPEN_VSX_TOKEN} = "<token>"   # open-vsx.org access token`);
  process.exit(1);
}

// execFileSync with an argv array, never a composed shell string: rootDir is
// interpolated into none of this, and there is no shell to reinterpret it.
function run(args) {
  execFileSync(process.execPath, args, { cwd: rootDir, stdio: 'inherit' });
}

function newestArtifact(extension) {
  if (!fs.existsSync(artifactsDir)) {
    return undefined;
  }
  return fs
    .readdirSync(artifactsDir)
    .filter((entry) => entry.endsWith(extension))
    .map((entry) => {
      const file = path.join(artifactsDir, entry);
      return { file, modified: fs.statSync(file).mtimeMs };
    })
    .sort((left, right) => right.modified - left.modified)[0];
}

run([npmCli, 'run', 'build-package']);

const vsix = newestArtifact('.vsix');
if (!vsix) {
  console.error(`ERROR: no .vsix found in ${artifactsDir}.`);
  process.exit(1);
}

const name = path.basename(vsix.file);

// The same file goes to both registries. Rebuilding per registry would let the
// two carry different bytes under one version number.
console.log(`Publishing ${name} to the VS Code Marketplace`);
run([npmCli, 'exec', '--', '@vscode/vsce', 'publish', '--packagePath', vsix.file]);

console.log(`Publishing ${name} to Open VSX`);
run([npmCli, 'exec', '--', 'ovsx', 'publish', vsix.file]);

console.log('');
console.log(`Published ${name} to both registries.`);
console.log('The CLI is a separate artifact: run `npm run publish-npm` only if');
console.log('this release changed anything under src/cli.');
