const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const artifactsDir = path.join(rootDir, 'artifacts');
const preparePackage = JSON.stringify(path.join(__dirname, 'pre-package.js'));

function run(command) {
  execSync(command, { cwd: rootDir, stdio: 'inherit' });
}

function packageWith(readme, command) {
  run(`node ${preparePackage} pre ${readme}`);
  try {
    run(command);
  } finally {
    run(`node ${preparePackage} post`);
  }
}

run('npm run build');

fs.mkdirSync(artifactsDir, { recursive: true });

packageWith(
  'docs/README.vscode.md',
  `npx @vscode/vsce package --out ${JSON.stringify(artifactsDir)}`,
);

packageWith(
  'docs/README.npm.md',
  `npm pack --pack-destination ${JSON.stringify(artifactsDir)}`,
);
