const release = require('./release');

if (!process.env.VSCE_PAT) {
  release.fail('VSCE_PAT is not set. Set it for this shell: $env:VSCE_PAT = "<dev.azure.com PAT, Marketplace scope>"');
}
if (!release.inCi && !process.env.OVSX_PAT) {
  release.fail('OVSX_PAT is not set. Set it for this shell: $env:OVSX_PAT = "<open-vsx.org access token>"');
}

const { vsix } = release.prepare();

release.step('Publish to the VS Code Marketplace');
release.npm(['exec', '--yes', '--', '@vscode/vsce', 'publish', '--packagePath', vsix, '--skip-duplicate']);

release.step('Publish to Open VSX');
release.npm(['exec', '--yes', '--', 'ovsx', 'publish', vsix, '--skip-duplicate']);

release.tagRelease();
