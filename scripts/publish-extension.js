const release = require('./release');

if (!release.inCi && !process.env.VSCE_PAT) {
  release.fail('VSCE_PAT is not set. Set it for this shell: $env:VSCE_PAT = "<dev.azure.com PAT, Marketplace scope>"');
}
if (!release.inCi && !process.env.OVSX_PAT) {
  release.fail('OVSX_PAT is not set. Set it for this shell: $env:OVSX_PAT = "<open-vsx.org access token>"');
}

const { vsix } = release.prepare();

release.step('Publish to the VS Code Marketplace');
const marketplaceAuth = release.inCi ? ['--oidc'] : [];
release.npm(['exec', '--yes', '--', '@vscode/vsce@4.1.0', 'publish', '--packagePath', vsix, '--skip-duplicate', ...marketplaceAuth]);

release.step('Publish to Open VSX');
release.npm(['exec', '--yes', '--', 'ovsx@1.3.0', 'publish', vsix, '--skip-duplicate']);

release.tagRelease();
