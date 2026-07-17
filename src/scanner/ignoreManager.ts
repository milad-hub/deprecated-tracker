import * as vscode from "vscode";
import { STORAGE_KEY_IGNORE_RULES } from "../constants";
import { IgnoreRules } from "../interfaces";
import { PathUtils } from "../utils/pathUtils";

export class IgnoreManager {
  private static readonly STORAGE_KEY = STORAGE_KEY_IGNORE_RULES;
  private readonly context: vscode.ExtensionContext;
  private rules: IgnoreRules;
  private ignoredFileSet = new Set<string>();
  private methodsByFile = new Map<string, Set<string>>();
  private filePatternRegexes: RegExp[] = [];
  private methodPatternRegexes: RegExp[] = [];

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.rules = this.loadRules();
    this.rebuildLookups();
  }

  /**
   * Canonical form for path comparisons: normalized separators, and
   * case-folded on Windows so ignore checks match the scanner's path keys.
   */
  private canonicalize(filePath: string): string {
    const normalized = PathUtils.normalizePath(filePath);
    return process.platform === "win32" ? normalized.toLowerCase() : normalized;
  }

  private compilePatterns(patterns: string[]): RegExp[] {
    const regexes: RegExp[] = [];
    for (const pattern of patterns) {
      try {
        regexes.push(new RegExp(pattern));
      } catch {
        // Invalid regex, skip
      }
    }
    return regexes;
  }

  private rebuildLookups(): void {
    this.ignoredFileSet = new Set(
      this.rules.files.map((f) => this.canonicalize(f)),
    );
    this.methodsByFile = new Map(
      Object.entries(this.rules.methods).map(([file, methods]) => [
        this.canonicalize(file),
        new Set(methods),
      ]),
    );
    this.filePatternRegexes = this.compilePatterns(this.rules.filePatterns!);
    this.methodPatternRegexes = this.compilePatterns(
      this.rules.methodPatterns!,
    );
  }

  private loadRules(): IgnoreRules {
    const stored = this.context.workspaceState.get<IgnoreRules>(
      IgnoreManager.STORAGE_KEY,
    );
    const base = stored || { files: [], methods: {} };
    base.files = base.files || [];
    base.methods = base.methods || {};
    base.filePatterns = base.filePatterns || [];
    base.methodPatterns = base.methodPatterns || [];
    return base;
  }

  public reload(): void {
    this.rules = this.loadRules();
    this.rebuildLookups();
  }

  private saveRules(): void {
    this.context.workspaceState.update(IgnoreManager.STORAGE_KEY, this.rules);
    this.rebuildLookups();
  }

  public isFileIgnored(filePath: string): boolean {
    if (this.ignoredFileSet.has(this.canonicalize(filePath))) {
      return true;
    }
    const normalizedPath = PathUtils.normalizePath(filePath);
    return this.filePatternRegexes.some((regex) => regex.test(normalizedPath));
  }

  public isMethodIgnored(filePath: string, methodName: string): boolean {
    if (this.methodPatternRegexes.some((regex) => regex.test(methodName))) {
      return true;
    }
    return (
      this.methodsByFile.get(this.canonicalize(filePath))?.has(methodName) ??
      false
    );
  }

  public ignoreFile(filePath: string): void {
    const normalizedPath = PathUtils.normalizePath(filePath);
    if (!this.isFileIgnored(normalizedPath)) {
      this.rules.files.push(normalizedPath);
      this.saveRules();
    }
  }

  public ignoreMethod(filePath: string, methodName: string): void {
    const normalizedPath = PathUtils.normalizePath(filePath);
    if (!this.rules.methods[normalizedPath]) {
      this.rules.methods[normalizedPath] = [];
    }
    if (!this.rules.methods[normalizedPath].includes(methodName)) {
      this.rules.methods[normalizedPath].push(methodName);
    }
    this.saveRules();
  }

  public removeFileIgnore(filePath: string): void {
    const normalizedPath = PathUtils.normalizePath(filePath);
    this.rules.files = this.rules.files.filter(
      (f) => PathUtils.normalizePath(f) !== normalizedPath,
    );
    this.saveRules();
  }

  public removeMethodIgnore(filePath: string, methodName: string): void {
    const normalizedPath = PathUtils.normalizePath(filePath || "");
    const matchingKey = Object.keys(this.rules.methods).find(
      (f) => PathUtils.normalizePath(f) === normalizedPath,
    );
    if (matchingKey) {
      this.rules.methods[matchingKey] = this.rules.methods[matchingKey].filter(
        (m) => m !== methodName,
      );
      if (this.rules.methods[matchingKey].length === 0) {
        delete this.rules.methods[matchingKey];
      }
    }
    this.saveRules();
  }

  public getAllRules(): IgnoreRules {
    this.reload();
    return {
      files: [...this.rules.files],
      methods: Object.fromEntries(
        Object.entries(this.rules.methods).map(([file, methods]) => [
          file,
          [...methods],
        ]),
      ),
      filePatterns: [...this.rules.filePatterns!],
      methodPatterns: [...this.rules.methodPatterns!],
    };
  }

  private isValidRegex(pattern: string): boolean {
    try {
      new RegExp(pattern);
      return true;
    } catch {
      return false;
    }
  }

  public addFilePattern(pattern: string): boolean {
    if (!this.isValidRegex(pattern)) {
      return false;
    }
    if (!this.rules.filePatterns!.includes(pattern)) {
      this.rules.filePatterns!.push(pattern);
      this.saveRules();
    }
    return true;
  }

  public addMethodPattern(pattern: string): boolean {
    if (!this.isValidRegex(pattern)) {
      return false;
    }
    if (!this.rules.methodPatterns!.includes(pattern)) {
      this.rules.methodPatterns!.push(pattern);
      this.saveRules();
    }
    return true;
  }

  public removeFilePattern(pattern: string): void {
    this.rules.filePatterns = this.rules.filePatterns!.filter(
      (p) => p !== pattern,
    );
    this.saveRules();
  }

  public removeMethodPattern(pattern: string): void {
    this.rules.methodPatterns = this.rules.methodPatterns!.filter(
      (p) => p !== pattern,
    );
    this.saveRules();
  }

  public clearAll(): void {
    this.rules = {
      files: [],
      methods: {},
      filePatterns: [],
      methodPatterns: [],
    };
    this.saveRules();
  }
}
