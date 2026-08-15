const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const artifactsDir = path.join(rootDir, 'artifacts');
const npmCli = process.env.npm_execpath;

if (!npmCli) {
  console.error('ERROR: run this through npm (npm run publish-npm).');
  process.exit(1);
}

function run(args) {
  execFileSync(process.execPath, args, { cwd: rootDir, stdio: 'inherit' });
}

function latestTarball() {
  if (!fs.existsSync(artifactsDir)) {
    return undefined;
  }
  return fs
    .readdirSync(artifactsDir)
    .filter((entry) => entry.endsWith('.tgz'))
    .map((entry) => {
      const file = path.join(artifactsDir, entry);
      return { file, modified: fs.statSync(file).mtimeMs };
    })
    .sort((left, right) => right.modified - left.modified)[0];
}

run([npmCli, 'run', 'build-package']);

const tarball = latestTarball();
if (!tarball) {
  console.error(`ERROR: no .tgz found in ${artifactsDir}.`);
  process.exit(1);
}

console.log(`Publishing ${path.basename(tarball.file)}`);
run([npmCli, 'publish', tarball.file]);
