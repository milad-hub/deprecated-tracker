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
  checkActionDefault();
  claimTag();
}

function checkActionDefault() {
  const action = fs.readFileSync(path.join(rootDir, 'action.yml'), 'utf8');
  const pinned = /version:[\s\S]*?default: "([^"]+)"/.exec(action);
  if (!pinned || pinned[1] !== version) {
    fail(`action.yml installs CLI ${pinned ? pinned[1] : '(none)'} by default; set it to ${version}.`);
  }
}

/**
 * Ties the version to this commit before anything is published, so a rerun
 * from a later commit cannot publish one registry from it and leave the other
 * on the old one.
 */
function claimTag() {
  const head = git(['rev-parse', 'HEAD']);
  const remote = git(['ls-remote', '--tags', 'origin', `refs/tags/${tag}^{}`]).split(/\s+/)[0];
  if (remote && remote !== head) {
    fail(`${tag} on origin points at ${remote.slice(0, 7)}, not HEAD ${head.slice(0, 7)}. Bump the version.`);
  }
  let local = '';
  try {
    local = git(['rev-parse', `${tag}^{commit}`]);
  } catch {
    local = '';
  }
  if (local && local !== head) {
    fail(`${tag} already exists locally at ${local.slice(0, 7)}, not HEAD ${head.slice(0, 7)}. Bump the version.`);
  }
  if (!local) {
    git(['tag', '-a', tag, '-m', `${name} ${version}`]);
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
  packageWith('docs/README.vscode.md', ['exec', '--yes', '--', '@vscode/vsce@4.1.0', 'package', '--out', artifactsDir]);
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
  git(['push', 'origin', tag]);
  console.log(`Pushed ${tag}.`);
}

module.exports = { fail, npm, step, prepare, tagRelease, name, version, inCi };
