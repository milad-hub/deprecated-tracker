const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const artifactsDir = path.join(rootDir, 'artifacts');
const preparePackage = path.join(__dirname, 'pre-package.js');
const npmCli = process.env.npm_execpath;
const inCi = process.env.CI === 'true';
const { name, version } = JSON.parse(
  fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'),
);
const tag = `v${version}`;

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function node(args) {
  execFileSync(process.execPath, args, { cwd: rootDir, stdio: 'inherit' });
}

function npm(args) {
  node([npmCli, ...args]);
}

function git(args) {
  return execFileSync('git', args, { cwd: rootDir, encoding: 'utf8' }).trim();
}

function step(title) {
  console.log(`\n== ${title}`);
}

function checkRepository() {
  if (!npmCli) {
    fail('run this through npm (npm run publish-npm / publish-extension).');
  }
  if (inCi) {
    const ref = process.env.GITHUB_REF_NAME;
    if (ref && ref !== tag) {
      fail(`tag ${ref} does not match package.json version ${version}.`);
    }
    return;
  }
  if (git(['status', '--porcelain'])) {
    fail('the working tree has uncommitted changes. Commit or stash them first.');
  }
  git(['fetch', '--quiet', 'origin', 'main']);
  if (git(['rev-parse', 'HEAD']) !== git(['rev-parse', 'origin/main'])) {
    fail('HEAD is not origin/main. Release from an up-to-date main.');
  }
}

function packageWith(readme, args) {
  node([preparePackage, 'pre', readme]);
  try {
    npm(args);
  } finally {
    node([preparePackage, 'post']);
  }
}

function prepare() {
  checkRepository();
  step(`Releasing ${name} ${version}`);
  step('Clean install');
  npm(['ci']);
  step('Type-check');
  npm(['exec', '--', 'tsc', '-p', './', '--noEmit']);
  step('Tests with coverage');
  npm(['exec', '--', 'jest', '--coverage', '--config', 'config/jest.config.js']);
  step('Package');
  fs.rmSync(artifactsDir, { recursive: true, force: true });
  fs.mkdirSync(artifactsDir, { recursive: true });
  packageWith('docs/README.vscode.md', ['exec', '--yes', '--', '@vscode/vsce', 'package', '--out', artifactsDir]);
  packageWith('docs/README.npm.md', ['pack', '--pack-destination', artifactsDir]);
  return {
    vsix: artifact('.vsix'),
    tarball: artifact('.tgz'),
  };
}

function artifact(extension) {
  const file = fs.readdirSync(artifactsDir).find((entry) => entry.endsWith(extension));
  if (!file) {
    fail(`no ${extension} was produced in ${artifactsDir}.`);
  }
  return path.join(artifactsDir, file);
}

function tagRelease() {
  if (inCi) {
    return;
  }
  step(`Tag ${tag}`);
  const remote = git(['ls-remote', '--tags', 'origin', `refs/tags/${tag}`]);
  if (remote) {
    console.log(`${tag} is already on origin.`);
    return;
  }
  git(['tag', '-a', tag, '-m', `${name} ${version}`]);
  git(['push', 'origin', tag]);
  console.log(`Pushed ${tag}.`);
}

module.exports = { fail, npm, step, prepare, tagRelease, name, version, inCi };
