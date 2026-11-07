const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

const targets = {
  extension() {
    const srcDir = path.join(rootDir, 'src', 'webview', 'assets');
    const destDir = path.join(rootDir, 'out', 'src', 'webview', 'assets');
    fs.rmSync(destDir, { recursive: true, force: true });
    fs.mkdirSync(destDir, { recursive: true });
    for (const file of fs.readdirSync(srcDir)) {
      fs.copyFileSync(path.join(srcDir, file), path.join(destDir, file));
    }
    esbuild.buildSync({
      entryPoints: [path.join(rootDir, 'src', 'extension.ts')],
      outfile: path.join(rootDir, 'out', 'extension.js'),
      bundle: true,
      external: ['vscode'],
      format: 'cjs',
      platform: 'node',
      minify: true,
    });
  },
  cli() {
    esbuild.buildSync({
      entryPoints: [path.join(rootDir, 'src', 'cli', 'index.ts')],
      outfile: path.join(rootDir, 'out', 'cli.js'),
      bundle: true,
      format: 'cjs',
      platform: 'node',
      minify: true,
    });
  },
};

const requested = process.argv.slice(2);
const names = requested.length > 0 ? requested : Object.keys(targets);
for (const name of names) {
  if (!targets[name]) {
    console.error(`Unknown bundle "${name}". Use: ${Object.keys(targets).join(', ')}`);
    process.exit(1);
  }
  targets[name]();
  console.log(`Bundled ${name}.`);
}
