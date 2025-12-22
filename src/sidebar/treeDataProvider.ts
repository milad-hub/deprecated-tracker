import * as path from "path";
import * as vscode from "vscode";
import { DeprecatedItem } from "../scanner";
import { IgnoreManager } from "../scanner/ignoreManager";

export class DeprecatedItemTreeItem extends vscode.TreeItem {
  constructor(
    public readonly item: DeprecatedItem,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
  ) {
    super(item.name, collapsibleState);

    this.tooltip = `${item.kind}: ${item.name}\nFile: ${item.filePath}:${item.line}`;
    this.description = `${item.fileName}:${item.line}`;

    switch (item.kind) {
      case "method":
        this.iconPath = new vscode.ThemeIcon("symbol-method");
        break;
      case "property":
        this.iconPath = new vscode.ThemeIcon("symbol-property");
        break;
      case "class":
        this.iconPath = new vscode.ThemeIcon("symbol-class");
        break;
      case "interface":
        this.iconPath = new vscode.ThemeIcon("symbol-interface");
        break;
      case "function":
        this.iconPath = new vscode.ThemeIcon("symbol-function");
        break;
    }

    this.contextValue = "deprecatedItem";

    this.command = {
      command: "deprecatedTracker.openResults",
      title: "Open Results Panel",
      arguments: [item],
    };
  }
}

export class FileGroupTreeItem extends vscode.TreeItem {
  constructor(
    public readonly filePath: string,
    public readonly items: DeprecatedItem[],
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
  ) {
    const fileName = path.basename(filePath);
    super(fileName, collapsibleState);

    this.tooltip = `${items.length} deprecated item(s)\n${filePath}`;
    this.description = `${items.length} item(s)`;
    this.iconPath = new vscode.ThemeIcon("file");

    this.contextValue = "fileGroup";
  }
}

export class DeprecatedTrackerTreeDataProvider
  implements vscode.TreeDataProvider<DeprecatedItemTreeItem | FileGroupTreeItem>
{
  private _onDidChangeTreeData: vscode.EventEmitter<
    DeprecatedItemTreeItem | FileGroupTreeItem | undefined | null | void
  > = new vscode.EventEmitter<
    DeprecatedItemTreeItem | FileGroupTreeItem | undefined | null | void
  >();
  readonly onDidChangeTreeData: vscode.Event<
    DeprecatedItemTreeItem | FileGroupTreeItem | undefined | null | void
  > = this._onDidChangeTreeData.event;

  private _deprecatedItems: DeprecatedItem[] = [];
  private _groupByFile: boolean = true;

  constructor(private ignoreManager: IgnoreManager) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  setDeprecatedItems(items: DeprecatedItem[]): void {
    this._deprecatedItems = items;
    this.refresh();
  }

  setGroupByFile(groupByFile: boolean): void {
    this._groupByFile = groupByFile;
    this.refresh();
  }

  getTreeItem(
    element: DeprecatedItemTreeItem | FileGroupTreeItem,
  ): vscode.TreeItem {
    return element;
  }

  getChildren(
    element?: DeprecatedItemTreeItem | FileGroupTreeItem,
  ): Thenable<(DeprecatedItemTreeItem | FileGroupTreeItem)[]> {
    if (!element) {
      if (this._deprecatedItems.length === 0) {
        return Promise.resolve([]);
      }

      if (this._groupByFile) {
        const fileGroups = new Map<string, DeprecatedItem[]>();
        for (const item of this._deprecatedItems) {
          if (!fileGroups.has(item.filePath)) {
            fileGroups.set(item.filePath, []);
          }
          fileGroups.get(item.filePath)!.push(item);
        }

        return Promise.resolve(
          Array.from(fileGroups.entries()).map(
            ([filePath, items]) =>
              new FileGroupTreeItem(
                filePath,
                items,
                vscode.TreeItemCollapsibleState.Collapsed,
              ),
          ),
        );
      } else {
        return Promise.resolve(
          this._deprecatedItems.map(
            (item) =>
              new DeprecatedItemTreeItem(
                item,
                vscode.TreeItemCollapsibleState.None,
              ),
          ),
        );
      }
    } else if (element instanceof FileGroupTreeItem) {
      return Promise.resolve(
        element.items.map(
          (item) =>
            new DeprecatedItemTreeItem(
              item,
              vscode.TreeItemCollapsibleState.None,
            ),
        ),
      );
    }

    return Promise.resolve([]);
  }

  getParent?(
    element: DeprecatedItemTreeItem | FileGroupTreeItem,
  ): vscode.ProviderResult<DeprecatedItemTreeItem | FileGroupTreeItem> {
    if (element instanceof DeprecatedItemTreeItem && this._groupByFile) {
      for (const item of this._deprecatedItems) {
        if (
          item.filePath === element.item.filePath &&
          item.name === element.item.name
        ) {
          return new FileGroupTreeItem(
            element.item.filePath,
            this._deprecatedItems.filter(
              (i) => i.filePath === element.item.filePath,
            ),
            vscode.TreeItemCollapsibleState.Collapsed,
          );
        }
      }
    }
    return undefined;
  }
}
