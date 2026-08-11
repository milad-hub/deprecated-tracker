const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const artifactsDir = path.join(rootDir, 'artifacts');

function run(command) {
  execSync(command, { cwd: rootDir, stdio: 'inherit' });
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

run('npm run build-package');

const tarball = latestTarball();
if (!tarball) {
  console.error(`ERROR: no .tgz found in ${artifactsDir}.`);
  process.exit(1);
}

console.log(`Publishing ${path.basename(tarball.file)}`);
run(`npm publish ${JSON.stringify(tarball.file)}`);
