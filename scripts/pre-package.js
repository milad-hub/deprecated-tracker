const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const githubReadmePath = path.join(rootDir, 'README.md');

const tempReadmePath = path.join(__dirname, '.readme-backup.tmp');
const DEFAULT_SOURCE = 'docs/README.vscode.md';

function prePackage(sourceName) {
  const sourcePath = path.join(rootDir, sourceName);
  try {
    if (fs.existsSync(githubReadmePath)) {
      fs.copyFileSync(githubReadmePath, tempReadmePath);
      console.log('Backed up original README.md.');
    } else {
      console.warn('No README.md found to back up.');
    }

    if (fs.existsSync(sourcePath)) {
      fs.copyFileSync(sourcePath, githubReadmePath);
      console.log(`Copied ${sourceName} to README.md for packaging.`);
    } else {
      console.error(`ERROR: ${sourceName} not found!`);
      process.exit(1);
    }
  } catch (error) {
    console.error('Error during pre-package script:', error);
    process.exit(1);
  }
}

function postPackage() {
  try {
    if (fs.existsSync(tempReadmePath)) {
      fs.copyFileSync(tempReadmePath, githubReadmePath);
      fs.unlinkSync(tempReadmePath);
      console.log('Restored original README.md and cleaned up temporary file.');
    } else {
      console.warn('No temporary README.md found to restore.');
    }
  } catch (error) {
    console.error('Error during post-package script:', error);
    process.exit(1);
  }
}

const args = process.argv.slice(2);

if (args[0] === 'pre') {
  prePackage(args[1] || DEFAULT_SOURCE);
} else if (args[0] === 'post') {
  postPackage();
} else {
  console.error('Usage: node pre-package.js [pre [source.md]|post]');
  process.exit(1);
}