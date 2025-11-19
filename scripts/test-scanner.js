import * as path from 'path';
import * as vscode from 'vscode';
import { IgnoreManager } from './src/scanner/ignoreManager';
import { Scanner } from './src/scanner/scanner';

const mockContext = {
  subscriptions: [],
  workspaceState: {
    get: (key) => undefined,
    update: (key, value) => Promise.resolve(),
    keys: () => []
  },
  globalState: {
    get: (key) => undefined,
    update: (key, value) => Promise.resolve(),
    keys: () => []
  },
  extensionPath: __dirname,
  extensionUri: vscode.Uri.file(__dirname),
  storagePath: path.join(__dirname, 'test-storage'),
  globalStoragePath: path.join(__dirname, 'test-global-storage'),
  logPath: path.join(__dirname, 'test-logs'),
  extensionMode: vscode.ExtensionMode.Test,
  secrets: {},
  environmentVariableCollection: {},
  asAbsolutePath: (relativePath) => path.join(__dirname, relativePath),
  storageUri: vscode.Uri.file(path.join(__dirname, 'test-storage')),
  globalStorageUri: vscode.Uri.file(path.join(__dirname, 'test-global-storage')),
  logUri: vscode.Uri.file(path.join(__dirname, 'test-logs')),
  extension: undefined,
  languageModelAccessInformation: undefined,
};

async function testScanner() {
  console.log('=== Starting Scanner Test ===');

  const testProjectPath = path.join(__dirname, '..', 'tests', 'fixtures', 'test-project');
  console.log('Test project path:', testProjectPath);

  const workspaceFolder = {
    uri: vscode.Uri.file(testProjectPath),
    name: 'test-project',
    index: 0
  };

  const ignoreManager = new IgnoreManager(mockContext);
  const scanner = new Scanner(ignoreManager);

  try {
    console.log('Running scan...');
    const results = await scanner.scanProject(workspaceFolder);

    console.log('\n=== Scan Results ===');
    console.log('Total deprecated items found:', results.length);

    if (results.length > 0) {
      console.log('\nDeprecated items:');
      results.forEach((item, index) => {
        console.log(`${index + 1}. ${item.name} in ${item.fileName}:${item.line}`);
        console.log(`   File: ${item.filePath}`);
        console.log(`   Kind: ${item.kind}`);
        if (item.deprecatedDeclaration) {
          console.log(`   Declaration: ${item.deprecatedDeclaration.name} (${item.deprecatedDeclaration.source})`);
        }
        console.log('');
      });
    } else {
      console.log('No deprecated items found.');
    }

  } catch (error) {
    console.error('Scan failed:', error);
  }

  console.log('\n=== Test Complete ===');
}

testScanner().catch(console.error);