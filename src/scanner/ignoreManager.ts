import * as path from 'path';
import * as vscode from 'vscode';
import { STORAGE_KEY_IGNORE_RULES } from '../constants';

interface IgnoreRules {
  files: string[];
  methods: { [filePath: string]: string[] };
  methodsGlobal?: string[];
}

export class IgnoreManager {
  private static readonly STORAGE_KEY = STORAGE_KEY_IGNORE_RULES;
  private readonly context: vscode.ExtensionContext;
  private rules: IgnoreRules;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.rules = this.loadRules();
  }

  private loadRules(): IgnoreRules {
    const stored = this.context.workspaceState.get<IgnoreRules>(IgnoreManager.STORAGE_KEY);
    const base = stored || { files: [], methods: {} };
    if (!base.methodsGlobal) {
      base.methodsGlobal = [];
    }
    return base;
  }

  public reload(): void {
    this.rules = this.loadRules();
  }

  private saveRules(): void {
    this.context.workspaceState.update(IgnoreManager.STORAGE_KEY, this.rules);
  }

  public isFileIgnored(filePath: string): boolean {
    const normalizedPath = path.normalize(filePath);
    return this.rules.files.some((f) => path.normalize(f) === normalizedPath);
  }

  public isMethodIgnored(filePath: string, methodName: string): boolean {
    if (this.rules.methodsGlobal?.includes(methodName)) {
      return true;
    }
    const normalizedPath = path.normalize(filePath);
    return (
      Object.keys(this.rules.methods).some(
        (f) => path.normalize(f) === normalizedPath && this.rules.methods[f]?.includes(methodName)
      ) || false
    );
  }

  public ignoreFile(filePath: string): void {
    const normalizedPath = path.normalize(filePath);
    if (!this.isFileIgnored(normalizedPath)) {
      this.rules.files.push(normalizedPath);
      this.saveRules();
    }
  }

  public ignoreMethod(filePath: string, methodName: string): void {
    const normalizedPath = path.normalize(filePath);
    if (!this.rules.methods[normalizedPath]) {
      this.rules.methods[normalizedPath] = [];
    }
    if (!this.rules.methods[normalizedPath].includes(methodName)) {
      this.rules.methods[normalizedPath].push(methodName);
    }
    if (!this.rules.methodsGlobal) {
      this.rules.methodsGlobal = [];
    }
    if (!this.rules.methodsGlobal.includes(methodName)) {
      this.rules.methodsGlobal.push(methodName);
    }
    this.saveRules();
  }

  public removeFileIgnore(filePath: string): void {
    const normalizedPath = path.normalize(filePath);
    this.rules.files = this.rules.files.filter((f) => path.normalize(f) !== normalizedPath);
    this.saveRules();
  }

  public removeMethodIgnore(filePath: string, methodName: string): void {
    const normalizedPath = path.normalize(filePath || '');
    if (normalizedPath) {
      const matchingKey = Object.keys(this.rules.methods).find(
        (f) => path.normalize(f) === normalizedPath
      );
      if (matchingKey && this.rules.methods[matchingKey]) {
        this.rules.methods[matchingKey] = this.rules.methods[matchingKey].filter(
          (m) => m !== methodName
        );
        if (this.rules.methods[matchingKey].length === 0) {
          delete this.rules.methods[matchingKey];
        }
      }
    }
    Object.keys(this.rules.methods).forEach((key) => {
      this.rules.methods[key] = this.rules.methods[key].filter((m) => m !== methodName);
      if (this.rules.methods[key].length === 0) {
        delete this.rules.methods[key];
      }
    });
    if (this.rules.methodsGlobal) {
      this.rules.methodsGlobal = this.rules.methodsGlobal.filter((m) => m !== methodName);
    }
    this.saveRules();
  }

  public getAllRules(): IgnoreRules {
    this.reload();
    return { ...this.rules };
  }

  public clearAll(): void {
    this.rules = { files: [], methods: {}, methodsGlobal: [] };
    this.saveRules();
  }
}
