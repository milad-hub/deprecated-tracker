import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import * as vscode from 'vscode';
import { ERROR_MESSAGES, TSCONFIG_FILE } from '../constants';
import { DeprecatedItemKind } from '../types';
import { IgnoreManager } from './ignoreManager';

export interface DeprecatedItem {
  name: string;
  fileName: string;
  filePath: string;
  line: number;
  character: number;
  kind: DeprecatedItemKind;
  deprecatedDeclaration?: {
    name: string;
    filePath: string;
    fileName: string;
  };
}

export class Scanner {
  private readonly ignoreManager: IgnoreManager;

  private readonly trustedExternalPackages = new Set([
    'rxjs',
    'lodash',
    'underscore',
    'moment',
    'axios',
    'react',
    'vue',
    '@angular',
    '@types',
  ]);

  constructor(ignoreManager: IgnoreManager) {
    this.ignoreManager = ignoreManager;
  }

  public async scanProject(
    workspaceFolder: vscode.WorkspaceFolder,
    onFileScanning?: (filePath: string) => void
  ): Promise<DeprecatedItem[]> {
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

    for (const sourceFile of program.getSourceFiles()) {
      const filePath = path.normalize(sourceFile.fileName);

      if (this.ignoreManager.isFileIgnored(filePath)) {
        continue;
      }

      const isProjectFile = !sourceFile.isDeclarationFile;
      const isExternalDeclarationFile =
        sourceFile.isDeclarationFile && filePath.includes('node_modules');

      if (!isProjectFile && !isExternalDeclarationFile) {
        continue;
      }

      if (isProjectFile && onFileScanning) {
        onFileScanning(filePath);
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

    for (const sourceFile of program.getSourceFiles()) {
      const filePath = path.normalize(sourceFile.fileName);
      const fileName = path.basename(filePath);

      if (this.ignoreManager.isFileIgnored(filePath)) {
        continue;
      }

      if (sourceFile.isDeclarationFile) {
        continue;
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
      isDeprecated = true;
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
    const nodeModulesIndex = filePath.indexOf('node_modules');
    if (nodeModulesIndex === -1) {
      return '';
    }

    const afterNodeModules = filePath.substring(nodeModulesIndex + 'node_modules'.length + 1);

    if (afterNodeModules.startsWith('@')) {
      const parts = afterNodeModules.split(path.sep);
      if (parts.length >= 2) {
        return `${parts[0]}/${parts[1]}`;
      }
    }

    const parts = afterNodeModules.split(path.sep);
    return parts[0] || '';
  }
}
