const { execFileSync } = require('child_process');
const release = require('./release');

function alreadyOnNpm() {
  try {
    const published = execFileSync(
      process.execPath,
      [process.env.npm_execpath, 'view', `${release.name}@${release.version}`, 'version'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
    return published === release.version;
  } catch {
    return false;
  }
}

const { tarball } = release.prepare();

release.step('Publish to npm');
if (alreadyOnNpm()) {
  console.log(`${release.name}@${release.version} is already on npm; skipping.`);
} else {
  release.npm(['publish', tarball]);
}

release.tagRelease();
