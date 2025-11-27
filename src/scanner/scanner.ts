import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import * as vscode from 'vscode';
import { ERROR_MESSAGES, TSCONFIG_FILE } from '../constants';
import { DeprecatedItem, DeprecatedItemKind, DeprecatedTrackerConfig } from '../interfaces';
import { IgnoreManager } from './ignoreManager';

export class Scanner {
  private readonly ignoreManager: IgnoreManager;
  private readonly config: DeprecatedTrackerConfig;

  private readonly trustedExternalPackages: Set<string>;

  constructor(ignoreManager: IgnoreManager, config?: DeprecatedTrackerConfig) {
    this.ignoreManager = ignoreManager;
    this.config = config || {
      trustedPackages: [
        'rxjs',
        'lodash',
        'underscore',
        'moment',
        'axios',
        'react',
        'vue',
        '@angular',
        '@types',
      ],
      excludePatterns: [],
      includePatterns: [],
      ignoreDeprecatedInComments: false,
      severity: 'warning',
    };

    this.trustedExternalPackages = new Set(this.config.trustedPackages || []);
  }

  public async scanProject(
    workspaceFolder: vscode.WorkspaceFolder,
    onFileScanning?: (filePath: string, current: number, total: number) => void,
    cancellationToken?: vscode.CancellationToken
  ): Promise<DeprecatedItem[]> {
    const tsconfigPath = path.join(workspaceFolder.uri.fsPath, TSCONFIG_FILE);

    if (!fs.existsSync(tsconfigPath)) {
      throw new Error(ERROR_MESSAGES.NO_TSCONFIG);
    }

    if (cancellationToken?.isCancellationRequested) {
      throw new Error('Scan cancelled by user');
    }

    const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
    if (configFile.error) {
      throw new Error(`Error reading tsconfig.json: ${configFile.error.messageText}`);
    }

    const parsedConfig = ts.parseJsonConfigFileContent(
      configFile.config,
      ts.sys,
      workspaceFolder.uri.fsPath
    );

    const program = ts.createProgram(parsedConfig.fileNames, parsedConfig.options);
    const checker = program.getTypeChecker();
    const deprecatedItems: DeprecatedItem[] = [];

    const deprecatedDeclarations = new Map<string, Set<string>>();

    const allSourceFiles = program.getSourceFiles();
    const projectFiles = allSourceFiles.filter((sf) => {
      const filePath = path.normalize(sf.fileName);
      if (this.ignoreManager.isFileIgnored(filePath)) {
        return false;
      }

      if (!this.shouldIncludeFile(filePath)) {
        return false;
      }

      const isProjectFile = !sf.isDeclarationFile;
      const isExternalDeclarationFile = sf.isDeclarationFile && filePath.includes('node_modules');
      return isProjectFile || isExternalDeclarationFile;
    });

    const totalFiles = projectFiles.length;
    let currentFileIndex = 0;

    for (const sourceFile of projectFiles) {
      if (cancellationToken?.isCancellationRequested) {
        throw new Error('Scan cancelled by user');
      }

      const filePath = path.normalize(sourceFile.fileName);
      const isProjectFile = !sourceFile.isDeclarationFile;

      currentFileIndex++;
      if (isProjectFile && onFileScanning) {
        onFileScanning(filePath, currentFileIndex, totalFiles);
      }

      ts.forEachChild(sourceFile, (node) => {
        this.collectDeprecatedDeclarations(
          node,
          sourceFile,
          filePath,
          deprecatedDeclarations,
          checker
        );
      });
    }

    if (cancellationToken?.isCancellationRequested) {
      throw new Error('Scan cancelled by user');
    }

    currentFileIndex = 0;
    for (const sourceFile of program.getSourceFiles()) {
      if (cancellationToken?.isCancellationRequested) {
        throw new Error('Scan cancelled by user');
      }

      const filePath = path.normalize(sourceFile.fileName);
      const fileName = path.basename(filePath);

      if (this.ignoreManager.isFileIgnored(filePath)) {
        continue;
      }

      if (sourceFile.isDeclarationFile) {
        continue;
      }

      currentFileIndex++;
      if (onFileScanning) {
        onFileScanning(filePath, currentFileIndex, totalFiles);
      }

      ts.forEachChild(sourceFile, (node) => {
        this.findDeprecatedUsages(
          node,
          sourceFile,
          filePath,
          fileName,
          deprecatedItems,
          checker,
          deprecatedDeclarations
        );
      });
    }

    return deprecatedItems;
  }

  public async scanSpecificFiles(
    workspaceFolder: vscode.WorkspaceFolder,
    filePaths: string[],
    onProgress?: (current: number, total: number) => void
  ): Promise<DeprecatedItem[]> {
    if (!filePaths || filePaths.length === 0) {
      return [];
    }

    const tsconfigPath = path.join(workspaceFolder.uri.fsPath, TSCONFIG_FILE);

    if (!fs.existsSync(tsconfigPath)) {
      throw new Error(ERROR_MESSAGES.NO_TSCONFIG);
    }

    const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
    if (configFile.error) {
      throw new Error(`Error reading tsconfig.json: ${configFile.error.messageText}`);
    }

    const parsedConfig = ts.parseJsonConfigFileContent(
      configFile.config,
      ts.sys,
      workspaceFolder.uri.fsPath
    );

    const program = ts.createProgram(parsedConfig.fileNames, parsedConfig.options);
    const checker = program.getTypeChecker();
    const deprecatedItems: DeprecatedItem[] = [];

    const deprecatedDeclarations = new Map<string, Set<string>>();

    const normalizedFilePaths = filePaths.map((fp) => path.normalize(fp));
    const filePathSet = new Set(normalizedFilePaths);

    const allSourceFiles = program.getSourceFiles();
    const projectFiles = allSourceFiles.filter((sf) => {
      const filePath = path.normalize(sf.fileName);
      if (this.ignoreManager.isFileIgnored(filePath)) {
        return false;
      }

      if (!this.shouldIncludeFile(filePath)) {
        return false;
      }

      const isProjectFile = !sf.isDeclarationFile;
      const isExternalDeclarationFile = sf.isDeclarationFile && filePath.includes('node_modules');
      return isProjectFile || isExternalDeclarationFile;
    });

    for (const sourceFile of projectFiles) {
      const filePath = path.normalize(sourceFile.fileName);

      ts.forEachChild(sourceFile, (node) => {
        this.collectDeprecatedDeclarations(
          node,
          sourceFile,
          filePath,
          deprecatedDeclarations,
          checker
        );
      });
    }

    const specificSourceFiles = program.getSourceFiles().filter((sf) => {
      const filePath = path.normalize(sf.fileName);
      return filePathSet.has(filePath) && !sf.isDeclarationFile;
    });

    const totalFiles = specificSourceFiles.length;
    let currentFileIndex = 0;

    for (const sourceFile of specificSourceFiles) {
      const filePath = path.normalize(sourceFile.fileName);
      const fileName = path.basename(filePath);

      if (!fs.existsSync(filePath)) {
        continue;
      }

      if (this.ignoreManager.isFileIgnored(filePath)) {
        continue;
      }

      currentFileIndex++;
      if (onProgress) {
        onProgress(currentFileIndex, totalFiles);
      }

      ts.forEachChild(sourceFile, (node) => {
        this.findDeprecatedUsages(
          node,
          sourceFile,
          filePath,
          fileName,
          deprecatedItems,
          checker,
          deprecatedDeclarations
        );
      });
    }

    return deprecatedItems;
  }

  public async scanFolder(
    workspaceFolder: vscode.WorkspaceFolder,
    targetFolderPath: string,
    onFileScanning?: (filePath: string, current: number, total: number) => void,
    cancellationToken?: vscode.CancellationToken
  ): Promise<DeprecatedItem[]> {
    const normalizedTargetFolder = this.normalizePathForComparison(targetFolderPath);
    const workspacePath = this.normalizePathForComparison(workspaceFolder.uri.fsPath);

    if (!normalizedTargetFolder.startsWith(workspacePath)) {
      throw new Error('Target folder must be within workspace');
    }

    if (!fs.existsSync(normalizedTargetFolder)) {
      throw new Error(`Folder does not exist: ${targetFolderPath}`);
    }

    const folderTsconfigPath = path.join(normalizedTargetFolder, TSCONFIG_FILE);
    const workspaceTsconfigPath = path.join(workspaceFolder.uri.fsPath, TSCONFIG_FILE);
    const tsconfigPath = fs.existsSync(folderTsconfigPath)
      ? folderTsconfigPath
      : workspaceTsconfigPath;

    if (!fs.existsSync(tsconfigPath)) {
      throw new Error(ERROR_MESSAGES.NO_TSCONFIG);
    }

    if (cancellationToken?.isCancellationRequested) {
      throw new Error('Scan cancelled by user');
    }

    const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
    if (configFile.error) {
      throw new Error(`Error reading tsconfig.json: ${configFile.error.messageText}`);
    }

    const configBasePath = fs.existsSync(folderTsconfigPath)
      ? normalizedTargetFolder
      : workspaceFolder.uri.fsPath;

    const parsedConfig = ts.parseJsonConfigFileContent(configFile.config, ts.sys, configBasePath);

    const program = ts.createProgram(parsedConfig.fileNames, parsedConfig.options);
    const checker = program.getTypeChecker();
    const deprecatedItems: DeprecatedItem[] = [];

    const deprecatedDeclarations = new Map<string, Set<string>>();

    const allSourceFiles = program.getSourceFiles();
    const projectFiles = allSourceFiles.filter((sf) => {
      const filePath = this.normalizePathForComparison(sf.fileName);

      if (!filePath.startsWith(normalizedTargetFolder)) {
        return false;
      }

      if (this.ignoreManager.isFileIgnored(filePath)) {
        return false;
      }

      if (!this.shouldIncludeFile(filePath)) {
        return false;
      }

      const isProjectFile = !sf.isDeclarationFile;
      const isExternalDeclarationFile = sf.isDeclarationFile && filePath.includes('node_modules');
      return isProjectFile || isExternalDeclarationFile;
    });

    const totalFiles = projectFiles.length;
    let currentFileIndex = 0;

    for (const sourceFile of projectFiles) {
      if (cancellationToken?.isCancellationRequested) {
        throw new Error('Scan cancelled by user');
      }

      const filePath = path.normalize(sourceFile.fileName);
      const isProjectFile = !sourceFile.isDeclarationFile;

      currentFileIndex++;
      if (isProjectFile && onFileScanning) {
        onFileScanning(filePath, currentFileIndex, totalFiles);
      }

      ts.forEachChild(sourceFile, (node) => {
        this.collectDeprecatedDeclarations(
          node,
          sourceFile,
          filePath,
          deprecatedDeclarations,
          checker
        );
      });
    }

    if (cancellationToken?.isCancellationRequested) {
      throw new Error('Scan cancelled by user');
    }

    currentFileIndex = 0;
    for (const sourceFile of projectFiles) {
      if (cancellationToken?.isCancellationRequested) {
        throw new Error('Scan cancelled by user');
      }

      const filePath = path.normalize(sourceFile.fileName);
      const fileName = path.basename(filePath);

      if (this.ignoreManager.isFileIgnored(filePath)) {
        continue;
      }

      if (sourceFile.isDeclarationFile) {
        continue;
      }

      currentFileIndex++;
      if (onFileScanning) {
        onFileScanning(filePath, currentFileIndex, totalFiles);
      }

      ts.forEachChild(sourceFile, (node) => {
        this.findDeprecatedUsages(
          node,
          sourceFile,
          filePath,
          fileName,
          deprecatedItems,
          checker,
          deprecatedDeclarations
        );
      });
    }

    return deprecatedItems;
  }

  private collectDeprecatedDeclarations(
    node: ts.Node,
    sourceFile: ts.SourceFile,
    filePath: string,
    deprecatedDeclarations: Map<string, Set<string>>,
    checker: ts.TypeChecker
  ): void {
    if (filePath.includes('node_modules')) {
      return;
    }

    const name = this.getNodeName(node);
    if (!name) {
      ts.forEachChild(node, (child) => {
        this.collectDeprecatedDeclarations(
          child,
          sourceFile,
          filePath,
          deprecatedDeclarations,
          checker
        );
      });
      return;
    }

    let isDeprecated = false;

    const jsDocTags = ts.getJSDocTags(node);
    const hasJSDocDeprecated = jsDocTags.some((tag) => {
      const tagName = ts.isIdentifier(tag.tagName)
        ? tag.tagName.text
        : (tag.tagName as ts.Identifier & { escapedText?: string }).escapedText?.toString() || '';
      return tagName === 'deprecated';
    });

    if (hasJSDocDeprecated) {
      // Check if we should ignore non-JSDoc comments
      if (this.config.ignoreDeprecatedInComments && !this.isJSDocComment(node, sourceFile)) {
        isDeprecated = false;
      } else {
        isDeprecated = true;
      }
    }

    if (!isDeprecated) {
      const symbol = checker.getSymbolAtLocation(node);
      if (symbol) {
        const declarations = symbol.getDeclarations();
        if (declarations && declarations.length > 0) {
          for (const declaration of declarations) {
            const declarationFilePath = path.normalize(declaration.getSourceFile().fileName);

            if (declarationFilePath === filePath) {
              continue;
            }

            if (declarationFilePath.includes('node_modules')) {
              const _declarationName = this.getNodeName(declaration);
              const declarationJSDocTags = ts.getJSDocTags(declaration);
              const hasExternalDeprecatedTag = declarationJSDocTags.some((tag) => {
                const tagName = ts.isIdentifier(tag.tagName)
                  ? tag.tagName.text
                  : (
                    tag.tagName as ts.Identifier & { escapedText?: string }
                  ).escapedText?.toString() || '';
                return tagName === 'deprecated';
              });

              if (hasExternalDeprecatedTag) {
                isDeprecated = true;
                break;
              }
            }
          }
        }
      }
    }

    if (isDeprecated) {
      const kind = this.getNodeKind(node);
      if (kind !== 'method' && kind !== 'property') {
        return;
      }
      if (!this.ignoreManager.isMethodIgnored(filePath, name)) {
        if (!deprecatedDeclarations.has(filePath)) {
          deprecatedDeclarations.set(filePath, new Set());
        }
        deprecatedDeclarations.get(filePath)!.add(name);
      }
    }

    ts.forEachChild(node, (child) => {
      this.collectDeprecatedDeclarations(
        child,
        sourceFile,
        filePath,
        deprecatedDeclarations,
        checker
      );
    });
  }

  private findDeprecatedUsages(
    node: ts.Node,
    sourceFile: ts.SourceFile,
    filePath: string,
    fileName: string,
    deprecatedItems: DeprecatedItem[],
    checker: ts.TypeChecker,
    deprecatedDeclarations: Map<string, Set<string>>
  ): void {
    if (ts.isIdentifier(node)) {
      const symbol = checker.getSymbolAtLocation(node);
      if (symbol) {
        const declarations = symbol.getDeclarations();
        if (declarations && declarations.length > 0) {
          for (const declaration of declarations) {
            const declarationFilePath = path.normalize(declaration.getSourceFile().fileName);
            const declarationName = this.getNodeName(declaration);

            if (declarationName) {
              let isDeprecated = false;
              let _deprecatedSource = 'project';

              if (deprecatedDeclarations.has(declarationFilePath)) {
                const deprecatedNames = deprecatedDeclarations.get(declarationFilePath)!;
                if (deprecatedNames.has(declarationName)) {
                  isDeprecated = true;
                  _deprecatedSource = 'project';
                }
              }

              if (!isDeprecated && declarationFilePath.includes('node_modules')) {
                const packageName = this.getPackageNameFromPath(declarationFilePath);
                const isTrustedPackage =
                  this.trustedExternalPackages.has(packageName) ||
                  Array.from(this.trustedExternalPackages).some((trusted) =>
                    packageName.startsWith(trusted)
                  );

                if (isTrustedPackage) {
                  continue;
                }

                const declarationJSDocTags = ts.getJSDocTags(declaration);
                const hasExternalDeprecatedTag = declarationJSDocTags.some((tag) => {
                  const tagName = ts.isIdentifier(tag.tagName)
                    ? tag.tagName.text
                    : (
                      tag.tagName as ts.Identifier & {
                        escapedText?: string;
                      }
                    ).escapedText?.toString() || '';
                  return tagName === 'deprecated';
                });

                if (hasExternalDeprecatedTag) {
                  // Check if we should ignore non-JSDoc comments
                  if (
                    this.config.ignoreDeprecatedInComments &&
                    !this.isJSDocComment(declaration, declaration.getSourceFile())
                  ) {
                    continue;
                  }

                  isDeprecated = true;
                  _deprecatedSource = 'external';
                }
              }

              if (isDeprecated) {
                const declIsMethodOrProperty =
                  ts.isMethodDeclaration(declaration) ||
                  ts.isMethodSignature(declaration) ||
                  ts.isPropertyDeclaration(declaration) ||
                  ts.isPropertySignature(declaration);
                if (!declIsMethodOrProperty) {
                  continue;
                }
                const declMethodIgnored = this.ignoreManager.isMethodIgnored(
                  declarationFilePath,
                  declarationName
                );
                if (declMethodIgnored) {
                  break;
                }

                const { line, character } = sourceFile.getLineAndCharacterOfPosition(
                  node.getStart()
                );
                const _kind = this.getNodeKind(node);

                deprecatedItems.push({
                  name: node.text,
                  fileName,
                  filePath,
                  line: line + 1,
                  character: character + 1,
                  kind: 'usage',
                  severity: this.config.severity || 'warning',
                  deprecatedDeclaration: {
                    name: declarationName,
                    filePath: declarationFilePath,
                    fileName: path.basename(declarationFilePath),
                  },
                });
                break;
              }
            }
          }
        }
      }
    }

    ts.forEachChild(node, (child) => {
      this.findDeprecatedUsages(
        child,
        sourceFile,
        filePath,
        fileName,
        deprecatedItems,
        checker,
        deprecatedDeclarations
      );
    });
  }

  private visitNode(
    node: ts.Node,
    sourceFile: ts.SourceFile,
    filePath: string,
    fileName: string,
    deprecatedItems: DeprecatedItem[],
    checker: ts.TypeChecker
  ): void {
    const name = this.getNodeName(node);
    if (!name) {
      ts.forEachChild(node, (child) => {
        this.visitNode(child, sourceFile, filePath, fileName, deprecatedItems, checker);
      });
      return;
    }

    let isDeprecated = false;

    const jsDocTags = ts.getJSDocTags(node);
    const hasJSDocDeprecated = jsDocTags.some((tag) => {
      const tagName = ts.isIdentifier(tag.tagName)
        ? tag.tagName.text
        : (tag.tagName as ts.Identifier & { escapedText?: string }).escapedText?.toString() || '';
      return tagName === 'deprecated';
    });

    if (hasJSDocDeprecated) {
      isDeprecated = true;
    } else {
      const symbol = checker.getSymbolAtLocation(node);
      if (symbol) {
        const declarations = symbol.getDeclarations();
        if (declarations && declarations.length > 0) {
          for (const declaration of declarations) {
            const declarationFilePath = path.normalize(declaration.getSourceFile().fileName);
            if (declarationFilePath === filePath) {
              continue;
            }

            const declarationJSDocTags = ts.getJSDocTags(declaration);
            const hasDeprecatedTag = declarationJSDocTags.some((tag) => {
              const tagName = ts.isIdentifier(tag.tagName)
                ? tag.tagName.text
                : (
                  tag.tagName as ts.Identifier & { escapedText?: string }
                ).escapedText?.toString() || '';
              return tagName === 'deprecated';
            });

            if (hasDeprecatedTag) {
              isDeprecated = true;
              break;
            }
          }
        }
      }
    }

    if (isDeprecated) {
      const kind = this.getNodeKind(node);
      if (kind !== 'method' && kind !== 'property') {
        return;
      }

      const methodIgnored = this.ignoreManager.isMethodIgnored(filePath, name);
      if (!methodIgnored) {
        const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart());

        deprecatedItems.push({
          name,
          fileName,
          filePath,
          line: line + 1,
          character: character + 1,
          kind,
        });
      }
    }

    ts.forEachChild(node, (child) => {
      this.visitNode(child, sourceFile, filePath, fileName, deprecatedItems, checker);
    });
  }

  private getNodeName(node: ts.Node): string | null {
    return this.getNodeNameInternal(node);
  }

  private getNodeNameInternal(node: ts.Node): string | null {
    if (ts.isMethodDeclaration(node) || ts.isMethodSignature(node)) {
      return node.name && ts.isIdentifier(node.name) ? node.name.text : null;
    }
    if (ts.isPropertyDeclaration(node) || ts.isPropertySignature(node)) {
      return node.name && ts.isIdentifier(node.name) ? node.name.text : null;
    }
    if (ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node)) {
      return node.name ? node.name.text : null;
    }
    if (ts.isFunctionDeclaration(node)) {
      return node.name ? node.name.text : null;
    }
    return null;
  }

  private getNodeKind(node: ts.Node): DeprecatedItemKind {
    if (ts.isMethodDeclaration(node) || ts.isMethodSignature(node)) {
      return 'method';
    }
    if (ts.isPropertyDeclaration(node) || ts.isPropertySignature(node)) {
      return 'property';
    }
    if (ts.isClassDeclaration(node)) {
      return 'class';
    }
    if (ts.isInterfaceDeclaration(node)) {
      return 'interface';
    }
    if (ts.isFunctionDeclaration(node)) {
      return 'function';
    }
    return 'method';
  }

  private getPackageNameFromPath(filePath: string): string {
    const normalizedPath = filePath.replace(/\\/g, '/');

    const lastNodeModulesIndex = normalizedPath.lastIndexOf('node_modules/');
    if (lastNodeModulesIndex === -1) {
      return '';
    }

    const afterNodeModules = normalizedPath.substring(
      lastNodeModulesIndex + 'node_modules/'.length
    );

    if (afterNodeModules.startsWith('@')) {
      const parts = afterNodeModules.split('/');
      if (parts.length >= 2 && parts[0] && parts[1]) {
        return `${parts[0]}/${parts[1]}`;
      }
      return '';
    }

    const parts = afterNodeModules.split('/');
    return parts[0] || '';
  }

  private shouldIncludeFile(filePath: string): boolean {
    const normalizedPath = filePath.replace(/\\/g, '/');

    if (this.config.excludePatterns && this.config.excludePatterns.length > 0) {
      if (this.matchesAnyPattern(normalizedPath, this.config.excludePatterns)) {
        return false;
      }
    }

    if (this.config.includePatterns && this.config.includePatterns.length > 0) {
      return this.matchesAnyPattern(normalizedPath, this.config.includePatterns);
    }

    return true;
  }

  private matchesAnyPattern(filePath: string, patterns: string[]): boolean {
    return patterns.some((pattern) => {
      try {
        const regex = this.globToRegex(pattern);
        return regex.test(filePath);
      } catch (error) {
        console.warn(`Invalid pattern: ${pattern}`, error);
        return false;
      }
    });
  }

  private globToRegex(pattern: string): RegExp {
    const regexPattern = pattern
      .replace(/\\/g, '/')
      .replace(/\./g, '\\.')
      .replace(/\*\*/g, '___DOUBLE_STAR___')
      .replace(/\*/g, '[^/]*')
      .replace(/___DOUBLE_STAR___/g, '.*')
      .replace(/\?/g, '[^/]');

    return new RegExp(`^${regexPattern}$`);
  }

  private isJSDocComment(node: ts.Node, sourceFile: ts.SourceFile): boolean {
    const fullText = sourceFile.getFullText();
    const commentRanges = ts.getLeadingCommentRanges(fullText, node.getFullStart());

    if (!commentRanges || commentRanges.length === 0) {
      return false;
    }

    // Check if any comment is JSDoc format (starts with /**)
    return commentRanges.some((range) => {
      const commentText = fullText.substring(range.pos, range.end);
      return commentText.trim().startsWith('/**');
    });
  }

  private normalizePathForComparison(filePath: string): string {
    let normalized = filePath.replace(/\\/g, '/');

    if (process.platform === 'win32') {
      normalized = normalized.toLowerCase();
    }

    return normalized;
  }
}
