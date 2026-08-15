const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const artifactsDir = path.join(rootDir, 'artifacts');
const preparePackage = path.join(__dirname, 'pre-package.js');
const npmCli = process.env.npm_execpath;

if (!npmCli) {
  console.error('ERROR: run this through npm (npm run build-package).');
  process.exit(1);
}

function run(args) {
  execFileSync(process.execPath, args, { cwd: rootDir, stdio: 'inherit' });
}

function packageWith(readme, args) {
  run([preparePackage, 'pre', readme]);
  try {
    run(args);
  } finally {
    run([preparePackage, 'post']);
  }
}

run([npmCli, 'run', 'build']);

fs.mkdirSync(artifactsDir, { recursive: true });

packageWith('docs/README.vscode.md', [
  npmCli,
  'exec',
  '--',
  '@vscode/vsce',
  'package',
  '--out',
  artifactsDir,
]);

packageWith('docs/README.npm.md', [
  npmCli,
  'pack',
  '--pack-destination',
  artifactsDir,
]);
