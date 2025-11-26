import * as path from 'path';

export enum ExtensionMode {
  Production = 1,
  Development = 2,
  Test = 3,
}

export enum TextEditorRevealType {
  Default = 0,
  InCenter = 1,
  InCenterIfOutsideViewport = 2,
  AtTop = 3,
}

export class Uri {
  private constructor(
    public readonly fsPath: string,
    public readonly scheme: string
  ) { }

  static file(filePath: string): Uri {
    return new Uri(filePath, 'file');
  }

  static joinPath(base: Uri, ...pathSegments: string[]): Uri {
    const joined = path.join(base.fsPath, ...pathSegments);
    return new Uri(joined, base.scheme);
  }
}

export class Position {
  constructor(
    public readonly line: number,
    public readonly character: number
  ) { }
}

export class Selection {
  constructor(
    public readonly anchor: Position,
    public readonly active: Position
  ) { }
}

export interface Memento {
  get<T>(key: string): T | undefined;
  get<T>(key: string, defaultValue: T): T;
  update(key: string, value: unknown): Promise<void>;
  keys(): readonly string[];
}

export interface SecretStorage {
  get(key: string): Promise<string | undefined>;
  store(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface EnvironmentVariableCollection {
  persistent: boolean;
  replace(variable: string, value: string): void;
  append(variable: string, value: string): void;
  prepend(variable: string, value: string): void;
  get(variable: string): { value: string; type: number } | undefined;
  forEach(callback: (variable: string, value: { value: string; type: number }) => unknown): void;
  delete(variable: string): void;
  clear(): void;
}

export interface ExtensionContext {
  readonly subscriptions: { dispose(): unknown }[];
  readonly workspaceState: Memento;
  readonly globalState: Memento;
  readonly extensionPath: string;
  readonly extensionUri: Uri;
  readonly storagePath: string | undefined;
  readonly globalStoragePath: string;
  readonly logPath: string;
  readonly extensionMode: ExtensionMode;
  readonly secrets: SecretStorage;
  readonly environmentVariableCollection: EnvironmentVariableCollection;
  asAbsolutePath(relativePath: string): string;
  readonly storageUri: Uri | undefined;
  readonly globalStorageUri: Uri;
  readonly logUri: Uri;
  readonly extension: unknown;
  readonly languageModelAccessInformation: unknown;
}

export interface WorkspaceFolder {
  readonly uri: Uri;
  readonly name: string;
  readonly index: number;
}

export interface Disposable {
  dispose(): unknown;
}

export interface Event<T> {
  (listener: (e: T) => any, thisArgs?: any, disposables?: Disposable[]): Disposable;
}

export class EventEmitter<T> {
  private listeners: ((e: T) => any)[] = [];

  readonly event: Event<T> = (
    listener: (e: T) => any,
    thisArgs?: any,
    disposables?: Disposable[]
  ) => {
    this.listeners.push(listener);
    const disposable = {
      dispose: () => {
        const index = this.listeners.indexOf(listener);
        if (index !== -1) {
          this.listeners.splice(index, 1);
        }
      },
    };
    if (disposables) {
      disposables.push(disposable);
    }
    return disposable;
  };

  fire(data: T): void {
    this.listeners.forEach((listener) => listener(data));
  }

  dispose(): void {
    this.listeners = [];
  }
}

export const ViewColumn = {
  One: 1,
  Two: 2,
  Three: 3,
  Four: 4,
  Five: 5,
  Six: 6,
  Seven: 7,
  Eight: 8,
  Nine: 9,
  Active: -1,
  Beside: -2,
};

export enum TreeItemCollapsibleState {
  None = 0,
  Collapsed = 1,
  Expanded = 2,
}

export class ThemeIcon {
  constructor(
    public readonly id: string,
    public readonly color?: any
  ) { }
}

export class TreeItem {
  label?: string;
  tooltip?: string;
  description?: string;
  iconPath?: any;
  contextValue?: string;
  command?: any;
  collapsibleState?: TreeItemCollapsibleState;

  constructor(label: string, collapsibleState?: TreeItemCollapsibleState) {
    this.label = label;
    this.collapsibleState = collapsibleState;
  }
}

export interface TreeDataProvider<T> {
  onDidChangeTreeData?: any;
  getTreeItem(element: T): TreeItem;
  getChildren(element?: T): Promise<T[]>;
  getParent?(element: T): T | undefined;
}

export interface TreeView<T> extends Disposable {
  onDidChangeSelection?: any;
  onDidChangeVisibility?: any;
  onDidExpandElement?: any;
  onDidCollapseElement?: any;
  selection: T[];
  visible: boolean;
  title: string;
  description?: string;
  message?: string;
  reveal(element?: T, options?: any): Promise<void>;
}

export interface WebviewView extends Disposable {
  webview: any;
  onDidDispose: any;
  onDidChangeVisibility: any;
  show(preserveFocus?: boolean): void;
}

export interface WebviewViewProvider {
  resolveWebviewView(
    webviewView: WebviewView,
    context: WebviewViewResolveContext,
    token: CancellationToken
  ): Promise<void> | void;
}

export interface WebviewViewResolveContext {
  readonly state: any;
}

export interface CancellationToken {
  readonly isCancellationRequested: boolean;
  readonly onCancellationRequested: any;
}

export const window = {
  activeTextEditor: undefined,
  showTextDocument: jest.fn(),
  showErrorMessage: jest.fn(),
  showInformationMessage: jest.fn(),
  createWebviewPanel: jest.fn(),
  createTreeView: jest.fn(),
  registerWebviewViewProvider: jest.fn(),
  withProgress: jest.fn(),
};

export const commands = {
  registerCommand: jest.fn((_command: string, _callback: () => unknown) => ({
    dispose: jest.fn(),
  })),
  executeCommand: jest.fn(),
};

export const workspace: any = {
  workspaceFolders: undefined,
  getConfiguration: jest.fn(),
  onDidChangeConfiguration: jest.fn(),
  createFileSystemWatcher: jest.fn(),
};

export const languages = {
  createDiagnosticCollection: jest.fn(() => ({
    set: jest.fn(),
    delete: jest.fn(),
    clear: jest.fn(),
    forEach: jest.fn(),
    get: jest.fn(),
    has: jest.fn(),
    dispose: jest.fn(),
  })),
};

export enum DiagnosticSeverity {
  Error = 0,
  Warning = 1,
  Information = 2,
  Hint = 3,
}

export class Range {
  public readonly start: Position;
  public readonly end: Position;

  constructor(startLine: number, startCharacter: number, endLine: number, endCharacter: number);
  constructor(start: Position, end: Position);
  constructor(
    startLineOrStart: number | Position,
    startCharacterOrEnd: number | Position,
    endLine?: number,
    endCharacter?: number
  ) {
    if (startLineOrStart instanceof Position && startCharacterOrEnd instanceof Position) {
      this.start = startLineOrStart;
      this.end = startCharacterOrEnd;
    } else {
      this.start = new Position(startLineOrStart as number, startCharacterOrEnd as number);
      this.end = new Position(endLine!, endCharacter!);
    }
  }
}

export class Diagnostic {
  source?: string;
  code?: string | number;

  constructor(
    public readonly range: Range,
    public readonly message: string,
    public readonly severity?: DiagnosticSeverity
  ) { }
}

