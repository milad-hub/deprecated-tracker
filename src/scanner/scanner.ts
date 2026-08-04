import * as fs from "fs";
import * as path from "path";
import * as ts from "typescript";
import * as vscode from "vscode";
import { TagsManager } from "../config/tagsManager";
import {
  ERROR_MESSAGES,
  JSCONFIG_FILE,
  MAX_CACHED_PROGRAMS,
  TSCONFIG_FILE,
} from "../constants";
import {
  DEFAULT_CONFIG,
  DeprecatedItem,
  DeprecatedItemKind,
  DeprecatedTrackerConfig,
  DeprecationSchedule,
} from "../interfaces";
import { PathUtils } from "../utils/pathUtils";
import { parseDeprecationSchedule } from "../utils/urgencyParser";
import { matchesPattern } from "../utils/patternMatcher";
import { IgnoreManager } from "./ignoreManager";

type ProgramContext = {
  program: ts.Program;
  checker: ts.TypeChecker;
};

type SourceFileContext = {
  sourceFile: ts.SourceFile;
  checker: ts.TypeChecker;
};

type DeclarationInfo = {
  name: string;
  kind: DeprecatedItemKind;
};

type DeprecationInfo = {
  reason?: string;
  schedule?: DeprecationSchedule;
};

export class Scanner {
  private readonly ignoreManager: IgnoreManager;
  private readonly config: DeprecatedTrackerConfig;
  private readonly tagsManager?: TagsManager;

  private readonly trustedExternalPackages: Set<string>;
  private enabledCustomTags = new Map<string, string>();
  private readonly deprecationInfoCache = new Map<
    ts.Node,
    DeprecationInfo | null
  >();
  // Bounded by MAX_CACHED_PROGRAMS, trimmed between scans (see beginScan).
  // Invalidation is mtime-based over config + root files, so edits to
  // node_modules typings alone do not invalidate until a project file changes.
  private readonly programCache = new Map<
    string,
    { program: ts.Program; fileMtimes: Map<string, number> }
  >();

  constructor(
    ignoreManager: IgnoreManager,
    tagsManager?: TagsManager,
    config?: DeprecatedTrackerConfig,
  ) {
    this.ignoreManager = ignoreManager;
    this.tagsManager = tagsManager;
    this.config = config || DEFAULT_CONFIG;

    this.trustedExternalPackages = new Set(this.config.trustedPackages || []);
  }

  public async scanProject(
    workspaceFolder: vscode.WorkspaceFolder,
    onFileScanning?: (filePath: string, current: number, total: number) => void,
    cancellationToken?: vscode.CancellationToken,
  ): Promise<DeprecatedItem[]> {
    this.beginScan();
    const programContexts = this.collectProgramContexts(
      workspaceFolder,
      cancellationToken,
    );
    const projectFiles = this.getScannableSourceFiles(programContexts);
    return this.scanSourceFiles(
      projectFiles,
      onFileScanning,
      cancellationToken,
    );
  }

  /**
   * Scans every workspace folder as a single pass: programs from all folders
   * are collected first, then deduplicated and scanned together, so a file
   * reachable from two overlapping roots is reported once and progress counts
   * run monotonically across the whole workspace.
   *
   * In multi-root workspaces, folders that fail to contribute (typically: no
   * ts/jsconfig) are skipped; cancellation and single-root failures always
   * surface.
   */
  public async scanWorkspace(
    workspaceFolders: readonly vscode.WorkspaceFolder[],
    onFileScanning?: (filePath: string, current: number, total: number) => void,
    cancellationToken?: vscode.CancellationToken,
  ): Promise<DeprecatedItem[]> {
    this.beginScan();
    const programContexts: ProgramContext[] = [];

    for (const workspaceFolder of workspaceFolders) {
      try {
        programContexts.push(
          ...this.collectProgramContexts(workspaceFolder, cancellationToken),
        );
      } catch (error) {
        const cancelled =
          error instanceof Error &&
          error.message === ERROR_MESSAGES.SCAN_CANCELLED;
        if (workspaceFolders.length === 1 || cancelled) {
          throw error;
        }
      }
    }

    const workspaceFiles = this.getScannableSourceFiles(programContexts);
    return this.scanSourceFiles(
      workspaceFiles,
      onFileScanning,
      cancellationToken,
    );
  }

  private collectProgramContexts(
    workspaceFolder: vscode.WorkspaceFolder,
    cancellationToken?: vscode.CancellationToken,
  ): ProgramContext[] {
    const configPaths = this.findAllConfigFiles(workspaceFolder.uri.fsPath);

    if (configPaths.length === 0) {
      throw new Error(ERROR_MESSAGES.NO_TSCONFIG);
    }

    if (cancellationToken?.isCancellationRequested) {
      throw new Error(ERROR_MESSAGES.SCAN_CANCELLED);
    }

    return this.createProgramContexts(configPaths, cancellationToken);
  }

  public async scanSpecificFiles(
    workspaceFolder: vscode.WorkspaceFolder,
    filePaths: string[],
    onProgress?: (current: number, total: number) => void,
    cancellationToken?: vscode.CancellationToken,
  ): Promise<DeprecatedItem[]> {
    return this.scanWorkspaceFiles(
      [workspaceFolder],
      filePaths,
      onProgress,
      cancellationToken,
    );
  }

  /**
   * Rescans a known set of files across every workspace folder. Each folder
   * contributes only the configs that actually own one of the target files, so
   * a multi-root refresh keeps results from every root instead of silently
   * dropping the ones outside the first folder.
   */
  public async scanWorkspaceFiles(
    workspaceFolders: readonly vscode.WorkspaceFolder[],
    filePaths: string[],
    onProgress?: (current: number, total: number) => void,
    cancellationToken?: vscode.CancellationToken,
  ): Promise<DeprecatedItem[]> {
    this.beginScan();
    if (!filePaths || filePaths.length === 0) {
      return [];
    }

    const discoveredConfigPaths: string[] = [];
    for (const workspaceFolder of workspaceFolders) {
      const configPaths = this.findAllConfigFiles(workspaceFolder.uri.fsPath);
      if (configPaths.length === 0 && workspaceFolders.length === 1) {
        throw new Error(ERROR_MESSAGES.NO_TSCONFIG);
      }
      discoveredConfigPaths.push(...configPaths);
    }

    const relevantConfigPaths = discoveredConfigPaths.filter((configPath) =>
      filePaths.some((filePath) =>
        PathUtils.isWithin(path.dirname(configPath), filePath),
      ),
    );
    // The fall back to every discovered config is a last resort for when no
    // config claims a target file. It must be decided across the whole
    // workspace: doing it per folder would build every program in roots that
    // hold none of the requested files.
    const programContexts = this.createProgramContexts(
      relevantConfigPaths.length > 0 ? relevantConfigPaths : discoveredConfigPaths,
      cancellationToken,
    );

    const filePathSet = new Set(
      filePaths.map((filePath) => this.getPathKey(filePath)),
    );
    const specificSourceFiles = this.getScannableSourceFiles(
      programContexts,
    ).filter(({ sourceFile }) =>
      filePathSet.has(this.getPathKey(sourceFile.fileName)),
    );

    return this.scanSourceFiles(
      specificSourceFiles,
      onProgress
        ? (_filePath, current, total) => onProgress(current, total)
        : undefined,
      cancellationToken,
    );
  }

  public async scanFolder(
    workspaceFolder: vscode.WorkspaceFolder,
    targetFolderPath: string,
    onFileScanning?: (filePath: string, current: number, total: number) => void,
    cancellationToken?: vscode.CancellationToken,
  ): Promise<DeprecatedItem[]> {
    this.beginScan();
    const normalizedTargetFolder = path.normalize(targetFolderPath);
    const workspacePath = workspaceFolder.uri.fsPath;

    if (!PathUtils.isWithin(workspacePath, normalizedTargetFolder)) {
      throw new Error("Target folder must be within workspace");
    }

    if (!fs.existsSync(normalizedTargetFolder)) {
      throw new Error(`Folder does not exist: ${targetFolderPath}`);
    }

    const folderConfigPaths = this.findAllConfigFiles(normalizedTargetFolder);
    const configPaths =
      folderConfigPaths.length > 0
        ? folderConfigPaths
        : this.findAllConfigFiles(workspaceFolder.uri.fsPath);

    if (configPaths.length === 0) {
      throw new Error(ERROR_MESSAGES.NO_TSCONFIG);
    }

    if (cancellationToken?.isCancellationRequested) {
      throw new Error(ERROR_MESSAGES.SCAN_CANCELLED);
    }

    const programContexts = this.createProgramContexts(
      configPaths,
      cancellationToken,
    );
    const projectFiles = this.getScannableSourceFiles(programContexts).filter(
      ({ sourceFile }) =>
        PathUtils.isWithin(normalizedTargetFolder, sourceFile.fileName),
    );

    return this.scanSourceFiles(
      projectFiles,
      onFileScanning,
      cancellationToken,
    );
  }

  /**
   * Shared core of all scan entry points: walks each source file's AST and
   * collects deprecated declarations and usages.
   */
  private async scanSourceFiles(
    files: SourceFileContext[],
    onFileScanning?: (filePath: string, current: number, total: number) => void,
    cancellationToken?: vscode.CancellationToken,
  ): Promise<DeprecatedItem[]> {
    this.deprecationInfoCache.clear();
    const deprecatedItems: DeprecatedItem[] = [];
    const usageKeys = new Set<string>();
    const totalFiles = files.length;
    let currentFileIndex = 0;

    for (const { sourceFile, checker } of files) {
      // Yield so the extension host stays responsive and cancellation
      // requests can be delivered mid-scan.
      await new Promise<void>((resolve) => setImmediate(resolve));
      if (cancellationToken?.isCancellationRequested) {
        throw new Error(ERROR_MESSAGES.SCAN_CANCELLED);
      }

      const filePath = path.normalize(sourceFile.fileName);
      const fileName = path.basename(filePath);

      currentFileIndex++;
      if (onFileScanning) {
        onFileScanning(filePath, currentFileIndex, totalFiles);
      }

      ts.forEachChild(sourceFile, (node) => {
        this.collectBothDeclarationsAndUsages(
          node,
          sourceFile,
          filePath,
          fileName,
          deprecatedItems,
          checker,
          usageKeys,
        );
      });
    }

    return deprecatedItems;
  }

  private getSymbolDeclarations(
    node: ts.Node,
    checker: ts.TypeChecker,
  ): readonly ts.Declaration[] | undefined {
    const symbol = checker.getSymbolAtLocation(node);
    if (!symbol) {
      return undefined;
    }

    const resolvedSymbol =
      symbol.flags & ts.SymbolFlags.Alias
        ? checker.getAliasedSymbol(symbol)
        : symbol;
    return resolvedSymbol.getDeclarations();
  }

  private getDeclarationInfo(node: ts.Node): DeclarationInfo | null {
    let kind: DeprecatedItemKind;
    let nameNode: ts.Node | undefined;

    if (ts.isMethodDeclaration(node) || ts.isMethodSignature(node)) {
      kind = "method";
      nameNode = node.name;
    } else if (ts.isConstructorDeclaration(node)) {
      return { name: "constructor", kind: "method" };
    } else if (
      ts.isCallSignatureDeclaration(node) ||
      ts.isConstructSignatureDeclaration(node)
    ) {
      return {
        name: ts.isCallSignatureDeclaration(node) ? "call" : "new",
        kind: "method",
      };
    } else if (ts.isIndexSignatureDeclaration(node)) {
      return { name: "[index]", kind: "property" };
    } else if (
      ts.isPropertyDeclaration(node) ||
      ts.isPropertySignature(node) ||
      ts.isGetAccessorDeclaration(node) ||
      ts.isSetAccessorDeclaration(node) ||
      ts.isPropertyAssignment(node) ||
      ts.isShorthandPropertyAssignment(node) ||
      ts.isEnumMember(node)
    ) {
      kind = "property";
      nameNode = node.name;
    } else if (ts.isVariableDeclaration(node) || ts.isBindingElement(node)) {
      kind =
        ts.isVariableDeclaration(node) &&
        node.initializer &&
        (ts.isArrowFunction(node.initializer) ||
          ts.isFunctionExpression(node.initializer))
          ? "function"
          : "property";
      nameNode = node.name;
    } else if (ts.isParameter(node)) {
      kind = "property";
      nameNode = node.name;
    } else if (
      ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node)
    ) {
      kind = "function";
      nameNode = node.name;
    } else if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
      kind = "class";
      nameNode = node.name;
    } else if (ts.isInterfaceDeclaration(node)) {
      kind = "interface";
      nameNode = node.name;
    } else if (ts.isTypeAliasDeclaration(node)) {
      kind = "interface";
      nameNode = node.name;
    } else if (ts.isEnumDeclaration(node) || ts.isModuleDeclaration(node)) {
      kind = "class";
      nameNode = node.name;
    } else {
      return null;
    }

    const name = this.getNameText(nameNode);
    return name ? { name, kind } : null;
  }

  private getNameText(node: ts.Node | undefined): string | null {
    if (!node) return null;
    if (
      ts.isIdentifier(node) ||
      ts.isPrivateIdentifier(node) ||
      ts.isStringLiteralLike(node) ||
      ts.isNumericLiteral(node)
    ) {
      return node.text;
    }
    if (
      ts.isComputedPropertyName(node) &&
      (ts.isStringLiteralLike(node.expression) ||
        ts.isNumericLiteral(node.expression))
    ) {
      return node.expression.text;
    }
    return null;
  }

  private getPackageNameFromPath(filePath: string): string {
    const normalizedPath = filePath.replace(/\\/g, "/");

    const lastNodeModulesIndex = normalizedPath.lastIndexOf("node_modules/");
    if (lastNodeModulesIndex === -1) {
      return "";
    }

    const afterNodeModules = normalizedPath.substring(
      lastNodeModulesIndex + "node_modules/".length,
    );

    if (afterNodeModules.startsWith("@")) {
      const parts = afterNodeModules.split("/");
      if (parts.length >= 2 && parts[0] && parts[1]) {
        return `${parts[0]}/${parts[1]}`;
      }
      return "";
    }

    const parts = afterNodeModules.split("/");
    return parts[0] || "";
  }

  private shouldIncludeFile(filePath: string): boolean {
    if (this.config.excludePatterns && this.config.excludePatterns.length > 0) {
      if (matchesPattern(filePath, this.config.excludePatterns)) {
        return false;
      }
    }

    if (this.config.includePatterns && this.config.includePatterns.length > 0) {
      return matchesPattern(filePath, this.config.includePatterns);
    }

    return true;
  }

  /** Entry point for every scan: refreshes tag state and bounds the cache. */
  private beginScan(): void {
    this.refreshCustomTagCache();
    this.trimProgramCache();
  }

  // ponytail: soft cap, trimmed only between scans. A single scan that
  // discovers more configs than the cap keeps them all — bounding peak memory
  // *within* one scan would mean not holding every program at once, which is an
  // architecture change. This bounds session-long retention, the actual leak.
  private trimProgramCache(): void {
    // Iterating the keys avoids a `keys().next().value` undefined check that
    // could never fire. Deleting a visited key mid-iteration is well defined.
    for (const configKey of this.programCache.keys()) {
      if (this.programCache.size <= MAX_CACHED_PROGRAMS) {
        return;
      }
      this.programCache.delete(configKey);
    }
  }

  private refreshCustomTagCache(): void {
    if (!this.tagsManager) {
      this.enabledCustomTags.clear();
      return;
    }
    this.enabledCustomTags = new Map(
      this.tagsManager
        .getEnabledTags()
        .map((tag) => [this.normalizeCustomTag(tag.tag), tag.description]),
    );
  }

  private getTagName(tag: ts.JSDocTag): string {
    if (ts.isIdentifier(tag.tagName)) {
      return tag.tagName.text.toLowerCase();
    }
    const text = (
      tag.tagName as ts.Identifier & { escapedText?: string }
    ).escapedText?.toString();
    return text ? text.toLowerCase() : "";
  }

  private normalizeCustomTag(tag: string): string {
    const normalized = tag.startsWith("@") ? tag.slice(1) : tag;
    return normalized.trim().toLowerCase();
  }

  private getCachedDeprecationInfo(
    declaration: ts.Declaration,
  ): DeprecationInfo | null {
    const cached = this.deprecationInfoCache.get(declaration);
    if (cached !== undefined) {
      return cached;
    }
    const info = this.getDeprecationInfo(declaration);
    this.deprecationInfoCache.set(declaration, info);
    return info;
  }

  private getDeprecationInfo(node: ts.Node): DeprecationInfo | null {
    for (const markerNode of this.getDeprecationMarkerNodes(node)) {
      const jsDocTags = ts.getJSDocTags(markerNode);
      const deprecationTags = jsDocTags.filter((tag) => {
        const tagName = this.getTagName(tag);
        return tagName === "deprecated" || this.enabledCustomTags.has(tagName);
      });

      if (deprecationTags.length > 0) {
        for (const tag of deprecationTags) {
          const comment =
            typeof tag.comment === "string"
              ? tag.comment.trim()
              : tag.comment
                  ?.map((part) => part.text)
                  .join("")
                  .trim();
          if (comment) return this.toDeprecationInfo(comment);
        }

        const customTag = deprecationTags.find((tag) =>
          this.enabledCustomTags.has(this.getTagName(tag)),
        );
        return this.toDeprecationInfo(
          customTag
            ? this.enabledCustomTags.get(this.getTagName(customTag)) ||
                undefined
            : undefined,
        );
      }

      if (!ts.canHaveDecorators(markerNode)) continue;
      for (const decorator of ts.getDecorators(markerNode) || []) {
        const expression = ts.isCallExpression(decorator.expression)
          ? decorator.expression.expression
          : decorator.expression;
        const decoratorName = this.getDecoratorName(expression);
        if (
          decoratorName !== "deprecated" &&
          !this.enabledCustomTags.has(decoratorName)
        ) {
          continue;
        }

        const argument = ts.isCallExpression(decorator.expression)
          ? decorator.expression.arguments[0]
          : undefined;
        const reason =
          argument && ts.isStringLiteralLike(argument)
            ? argument.text
            : this.enabledCustomTags.get(decoratorName) || undefined;
        return this.toDeprecationInfo(reason);
      }
    }

    return null;
  }

  private toDeprecationInfo(reason?: string): DeprecationInfo {
    const schedule = parseDeprecationSchedule(reason);
    return schedule ? { reason, schedule } : { reason };
  }

  private getDeprecationMarkerNodes(node: ts.Node): ts.Node[] {
    const nodes = [node];
    if (!ts.isVariableDeclaration(node) && !ts.isBindingElement(node)) {
      return nodes;
    }

    let parent: ts.Node | undefined = node.parent;
    while (parent && !ts.isSourceFile(parent)) {
      if (ts.isVariableStatement(parent)) {
        nodes.push(parent);
        break;
      }
      parent = parent.parent;
    }
    return nodes;
  }

  private getDecoratorName(expression: ts.LeftHandSideExpression): string {
    if (ts.isIdentifier(expression)) return expression.text.toLowerCase();
    if (ts.isPropertyAccessExpression(expression)) {
      return expression.name.text.toLowerCase();
    }
    if (
      ts.isElementAccessExpression(expression) &&
      ts.isStringLiteralLike(expression.argumentExpression)
    ) {
      return expression.argumentExpression.text.toLowerCase();
    }
    return "";
  }

  private isTrustedExternalPackage(packageName: string): boolean {
    if (this.trustedExternalPackages.has(packageName)) {
      return true;
    }
    for (const trusted of this.trustedExternalPackages) {
      if (
        trusted.startsWith("@") &&
        !trusted.includes("/") &&
        packageName.startsWith(`${trusted}/`)
      ) {
        return true;
      }
    }
    return false;
  }

  private createProgramContexts(
    configPaths: string[],
    cancellationToken?: vscode.CancellationToken,
  ): ProgramContext[] {
    const contexts: ProgramContext[] = [];
    const visitedConfigs = new Set<string>();

    const visitConfig = (currentConfigPath: string): void => {
      if (cancellationToken?.isCancellationRequested) {
        throw new Error(ERROR_MESSAGES.SCAN_CANCELLED);
      }
      const resolvedConfigPath = path.resolve(currentConfigPath);
      const configKey = this.getPathKey(resolvedConfigPath);
      if (visitedConfigs.has(configKey)) {
        return;
      }
      visitedConfigs.add(configKey);

      // TypeScript reports config errors against slash-normalized paths.
      const configFile = ts.readConfigFile(
        resolvedConfigPath.replace(/\\/g, "/"),
        ts.sys.readFile,
      );
      if (configFile.error) {
        throw new Error(
          `Error reading config file: ${configFile.error.messageText}`,
        );
      }

      const parsedConfig = ts.parseJsonConfigFileContent(
        configFile.config,
        ts.sys,
        path.dirname(resolvedConfigPath),
        undefined,
        resolvedConfigPath,
      );
      contexts.push(
        this.getOrCreateProgramContext(
          configKey,
          resolvedConfigPath,
          parsedConfig,
        ),
      );

      for (const reference of parsedConfig.projectReferences || []) {
        visitConfig(ts.resolveProjectReferencePath(reference));
      }
    };

    for (const configPath of configPaths) {
      visitConfig(configPath);
    }
    return contexts;
  }

  /**
   * Reuses the previous ts.Program for a config when neither the config file
   * nor any of its root files changed on disk; otherwise rebuilds, seeding
   * TypeScript's structural reuse with the old program.
   */
  private getOrCreateProgramContext(
    configKey: string,
    configPath: string,
    parsedConfig: ts.ParsedCommandLine,
  ): ProgramContext {
    const cached = this.programCache.get(configKey);
    const fileMtimes = this.collectFileMtimes(configPath, parsedConfig.fileNames);

    if (cached && this.mtimesEqual(cached.fileMtimes, fileMtimes)) {
      // Re-insert so Map iteration order stays least-recently-used first,
      // which is the order trimProgramCache evicts in.
      this.programCache.delete(configKey);
      this.programCache.set(configKey, cached);
      return {
        program: cached.program,
        checker: cached.program.getTypeChecker(),
      };
    }

    const program = ts.createProgram({
      rootNames: parsedConfig.fileNames,
      options: parsedConfig.options,
      configFileParsingDiagnostics: parsedConfig.errors,
      oldProgram: cached?.program,
    });
    this.programCache.set(configKey, { program, fileMtimes });
    return { program, checker: program.getTypeChecker() };
  }

  private collectFileMtimes(
    configPath: string,
    fileNames: readonly string[],
  ): Map<string, number> {
    const fileMtimes = new Map<string, number>();
    for (const filePath of [configPath, ...fileNames]) {
      let mtime = -1;
      try {
        mtime = fs.statSync(filePath).mtimeMs;
      } catch {
        // Missing files count as changed on every scan.
      }
      fileMtimes.set(this.getPathKey(filePath), mtime);
    }
    return fileMtimes;
  }

  private mtimesEqual(
    previous: Map<string, number>,
    current: Map<string, number>,
  ): boolean {
    if (previous.size !== current.size) {
      return false;
    }
    for (const [key, mtime] of previous) {
      if (current.get(key) !== mtime) {
        return false;
      }
    }
    return true;
  }

  /**
   * Discovers every tsconfig.json / jsconfig.json under rootDir so a project
   * scan covers nested projects, not just the workspace root.
   */
  private findAllConfigFiles(rootDir: string): string[] {
    const configs: string[] = [];
    const skippedDirs = new Set([
      "node_modules",
      "out",
      "dist",
      "build",
      "coverage",
      ".vscode-test",
    ]);
    const walk = (dir: string): void => {
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      const fileNames = new Set(
        entries.filter((entry) => entry.isFile()).map((entry) => entry.name),
      );
      if (fileNames.has(TSCONFIG_FILE)) {
        configs.push(path.join(dir, TSCONFIG_FILE));
      } else if (fileNames.has(JSCONFIG_FILE)) {
        configs.push(path.join(dir, JSCONFIG_FILE));
      }
      for (const entry of entries) {
        if (
          !entry.isDirectory() ||
          entry.name.startsWith(".") ||
          skippedDirs.has(entry.name)
        ) {
          continue;
        }
        walk(path.join(dir, entry.name));
      }
    };
    walk(path.normalize(rootDir));
    return configs;
  }

  private getScannableSourceFiles(
    contexts: ProgramContext[],
  ): SourceFileContext[] {
    const sourceFiles: SourceFileContext[] = [];
    const seenFiles = new Set<string>();

    for (const { program, checker } of contexts) {
      for (const sourceFile of program.getSourceFiles()) {
        const filePath = path.normalize(sourceFile.fileName);
        if (sourceFile.isDeclarationFile || filePath.includes("node_modules")) {
          continue;
        }
        const fileKey = this.getPathKey(filePath);
        if (
          seenFiles.has(fileKey) ||
          this.ignoreManager.isFileIgnored(filePath) ||
          !this.shouldIncludeFile(filePath)
        ) {
          continue;
        }

        seenFiles.add(fileKey);
        sourceFiles.push({ sourceFile, checker });
      }
    }

    return sourceFiles;
  }

  private getPathKey(filePath: string): string {
    const resolvedPath = path.resolve(filePath);
    return process.platform === "win32"
      ? resolvedPath.toLowerCase()
      : resolvedPath;
  }


  private collectBothDeclarationsAndUsages(
    node: ts.Node,
    sourceFile: ts.SourceFile,
    filePath: string,
    fileName: string,
    deprecatedItems: DeprecatedItem[],
    checker: ts.TypeChecker,
    usageKeys: Set<string>,
  ): void {
    // getScannableSourceFiles never yields node_modules or declaration
    // files, so every node here gets both checks.
    this.checkAndCollectDeclaration(
      node,
      sourceFile,
      filePath,
      fileName,
      deprecatedItems,
    );

    this.checkAndCollectUsage(
      node,
      sourceFile,
      filePath,
      fileName,
      deprecatedItems,
      checker,
      usageKeys,
    );

    ts.forEachChild(node, (child) => {
      this.collectBothDeclarationsAndUsages(
        child,
        sourceFile,
        filePath,
        fileName,
        deprecatedItems,
        checker,
        usageKeys,
      );
    });
  }

  private checkAndCollectDeclaration(
    node: ts.Node,
    sourceFile: ts.SourceFile,
    filePath: string,
    fileName: string,
    deprecatedItems: DeprecatedItem[],
  ): void {
    const declarationInfo = this.getDeclarationInfo(node);
    const deprecationInfo = declarationInfo
      ? this.getDeprecationInfo(node)
      : null;
    if (
      !declarationInfo ||
      !deprecationInfo ||
      this.ignoreManager.isMethodIgnored(filePath, declarationInfo.name)
    ) {
      return;
    }

    const { line, character } = sourceFile.getLineAndCharacterOfPosition(
      node.getStart(),
    );
    deprecatedItems.push({
      name: declarationInfo.name,
      fileName,
      filePath,
      line: line + 1,
      character: character + 1,
      kind: declarationInfo.kind,
      severity: this.config.severity || "warning",
      deprecationReason: deprecationInfo.reason,
      deprecationSchedule: deprecationInfo.schedule,
    });
  }

  private checkAndCollectUsage(
    node: ts.Node,
    sourceFile: ts.SourceFile,
    filePath: string,
    fileName: string,
    deprecatedItems: DeprecatedItem[],
    checker: ts.TypeChecker,
    usageKeys: Set<string>,
  ): void {
    const declarations = this.getReferencedDeclarations(node, checker);
    if (!declarations || declarations.length === 0) return;
    if (declarations.some((declaration) => declaration === node.parent)) return;

    for (const declaration of declarations) {
      const declarationFilePath = path.normalize(
        declaration.getSourceFile().fileName,
      );
      const declarationInfo = this.getDeclarationInfo(declaration);
      if (!declarationInfo) continue;

      const isExternalDeclaration =
        declarationFilePath.includes("node_modules");
      if (
        this.ignoreManager.isFileIgnored(declarationFilePath) ||
        (!isExternalDeclaration && !this.shouldIncludeFile(declarationFilePath))
      ) {
        continue;
      }

      if (isExternalDeclaration) {
        const packageName = this.getPackageNameFromPath(declarationFilePath);
        if (this.isTrustedExternalPackage(packageName)) continue;
      }

      const deprecationInfo = this.getCachedDeprecationInfo(declaration);
      if (!deprecationInfo) continue;
      if (
        this.ignoreManager.isMethodIgnored(
          declarationFilePath,
          declarationInfo.name,
        )
      ) {
        break;
      }

      const usageNode = this.getUsageNode(node);
      const usageKey = [
        this.getPathKey(filePath),
        usageNode.getStart(),
        this.getPathKey(declarationFilePath),
        declaration.getStart(),
      ].join(":");
      if (usageKeys.has(usageKey)) break;
      usageKeys.add(usageKey);

      const { line, character } = sourceFile.getLineAndCharacterOfPosition(
        usageNode.getStart(),
      );
      const { character: endCharacter } =
        sourceFile.getLineAndCharacterOfPosition(usageNode.getEnd());
      const { line: declLine } = declaration
        .getSourceFile()
        .getLineAndCharacterOfPosition(declaration.getStart());

      deprecatedItems.push({
        name: this.getUsageName(usageNode, declarationInfo.name),
        fileName,
        filePath,
        line: line + 1,
        character: character + 1,
        // getUsageNode always resolves to a single-line token (identifier,
        // property name, or literal), so this end column is on `line`.
        endCharacter: endCharacter + 1,
        kind: "usage",
        severity: this.config.severity || "warning",
        deprecatedDeclaration: {
          name: declarationInfo.name,
          filePath: declarationFilePath,
          fileName: path.basename(declarationFilePath),
          line: declLine + 1,
        },
        deprecationReason: deprecationInfo.reason,
        deprecationSchedule: deprecationInfo.schedule,
      });
      break;
    }
  }

  private getReferencedDeclarations(
    node: ts.Node,
    checker: ts.TypeChecker,
  ): ts.Declaration[] {
    if (
      !ts.isIdentifier(node) &&
      !ts.isBindingElement(node) &&
      !ts.isElementAccessExpression(node) &&
      !ts.isCallExpression(node) &&
      !ts.isNewExpression(node)
    ) {
      return [];
    }
    const declarations: ts.Declaration[] = [];
    const seen = new Set<string>();
    const add = (items: readonly ts.Declaration[] | undefined): void => {
      for (const declaration of items || []) {
        const key = `${this.getPathKey(
          declaration.getSourceFile().fileName,
        )}:${declaration.getStart()}`;
        if (!seen.has(key)) {
          seen.add(key);
          declarations.push(declaration);
        }
      }
    };

    if (ts.isIdentifier(node)) add(this.getSymbolDeclarations(node, checker));

    if (ts.isBindingElement(node)) {
      const propertyName = this.getNameText(node.propertyName || node.name);
      if (propertyName) {
        const containerType = checker.getTypeAtLocation(node.parent.parent);
        add(containerType.getProperty(propertyName)?.getDeclarations());
      }
    }

    if (ts.isElementAccessExpression(node)) {
      const type = checker.getTypeAtLocation(node.expression);
      const propertyName = this.getNameText(node.argumentExpression);
      if (propertyName) add(type.getProperty(propertyName)?.getDeclarations());

      const argumentType = checker.getTypeAtLocation(node.argumentExpression);
      const indexKind =
        argumentType.flags & ts.TypeFlags.NumberLike
          ? ts.IndexKind.Number
          : ts.IndexKind.String;
      const indexDeclaration = checker.getIndexInfoOfType(
        type,
        indexKind,
      )?.declaration;
      if (indexDeclaration) add([indexDeclaration]);
    }

    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      const signatureDeclaration = checker
        .getResolvedSignature(node)
        ?.getDeclaration();
      if (signatureDeclaration) add([signatureDeclaration]);
    }

    for (let index = 0; index < declarations.length; index++) {
      const declaration = declarations[index];
      const declarationInfo = this.getDeclarationInfo(declaration);
      const container = declaration.parent;
      if (
        !declarationInfo ||
        declarationInfo.name === "constructor" ||
        (!ts.isClassDeclaration(container) &&
          !ts.isClassExpression(container) &&
          !ts.isInterfaceDeclaration(container))
      ) {
        continue;
      }

      for (const clause of container.heritageClauses || []) {
        for (const heritageType of clause.types) {
          const type = checker.getTypeAtLocation(heritageType);
          add(type.getProperty(declarationInfo.name)?.getDeclarations());
        }
      }
    }

    return declarations;
  }

  private getUsageNode(node: ts.Node): ts.Node {
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      return this.getUsageNode(node.expression);
    }
    if (ts.isPropertyAccessExpression(node)) return node.name;
    if (ts.isElementAccessExpression(node)) return node.argumentExpression;
    if (ts.isBindingElement(node)) return node.propertyName || node.name;
    return node;
  }

  private getUsageName(node: ts.Node, fallback: string): string {
    return this.getNameText(node) || fallback;
  }
}
