import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { TagsManager } from "../config/tagsManager";
import {
  ADD_CUSTOM_TAG,
  CONFIRM_DELETE_CUSTOM_TAG,
  CUSTOM_TAGS_DATA,
  DELETE_CUSTOM_TAG,
  GET_CUSTOM_TAGS,
  SETTINGS_PANEL_ID,
  TOGGLE_CUSTOM_TAG,
  UPDATE_CUSTOM_TAG,
} from "../constants";

export class SettingsPanel {
  private panel: vscode.WebviewPanel | undefined;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly tagsManager: TagsManager;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly extensionUri: vscode.Uri,
  ) {
    this.tagsManager = new TagsManager(context);
  }

  public show(): void {
    if (this.panel) {
      this.panel.reveal();
      this.postCurrentTags();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      SETTINGS_PANEL_ID,
      "Deprecated Tracker Settings",
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: false,
        localResourceRoots: [
          vscode.Uri.joinPath(
            this.extensionUri,
            "out",
            "src",
            "webview",
            "assets",
          ),
        ],
      },
    );

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case GET_CUSTOM_TAGS:
            this.postCurrentTags();
            break;
          case ADD_CUSTOM_TAG:
            await this.handleAddTag(message.payload);
            break;
          case UPDATE_CUSTOM_TAG:
            await this.handleUpdateTag(message.payload);
            break;
          case DELETE_CUSTOM_TAG:
            await this.handleDeleteTag(message.payload);
            break;
          case CONFIRM_DELETE_CUSTOM_TAG:
            await this.handleConfirmDeleteTag(message.payload);
            break;
          case TOGGLE_CUSTOM_TAG:
            await this.handleToggleTag(message.payload);
            break;
        }
      },
      null,
      this.disposables,
    );

    void this.updateWebview();
  }

  private async handleAddTag(payload: Record<string, unknown>): Promise<void> {
    try {
      await this.tagsManager.addTag({
        tag: String(payload?.tag || ""),
        label: String(payload?.label || ""),
        description: String(payload?.description || ""),
        enabled: Boolean(payload?.enabled ?? true),
        color: String(payload?.color || "#4ecdc4"),
      });
      this.postCurrentTags();
      vscode.window.showInformationMessage("Custom tag added successfully.");
    } catch (error) {
      vscode.window.showErrorMessage(
        error instanceof Error ? error.message : "Failed to add custom tag.",
      );
    }
  }

  private async handleUpdateTag(
    payload: Record<string, unknown>,
  ): Promise<void> {
    try {
      const id = String(payload?.id || "");
      if (!id) {
        throw new Error("Tag ID is required.");
      }
      await this.tagsManager.updateTag(id, {
        tag: payload?.tag ? String(payload.tag) : undefined,
        label: payload?.label ? String(payload.label) : undefined,
        description: payload?.description
          ? String(payload.description)
          : undefined,
        color: payload?.color ? String(payload.color) : undefined,
        enabled:
          typeof payload?.enabled === "boolean"
            ? (payload.enabled as boolean)
            : undefined,
      });
      this.postCurrentTags();
      vscode.window.showInformationMessage("Custom tag updated.");
    } catch (error) {
      vscode.window.showErrorMessage(
        error instanceof Error ? error.message : "Failed to update custom tag.",
      );
    }
  }

  private async handleDeleteTag(
    payload: Record<string, unknown>,
  ): Promise<void> {
    try {
      const id = String(payload?.id || "");
      if (!id) {
        throw new Error("Tag ID is required.");
      }
      await this.tagsManager.deleteTag(id);
      this.postCurrentTags();
      vscode.window.showInformationMessage("Custom tag removed.");
    } catch (error) {
      vscode.window.showErrorMessage(
        error instanceof Error ? error.message : "Failed to delete custom tag.",
      );
    }
  }

  private async handleConfirmDeleteTag(
    payload: Record<string, unknown>,
  ): Promise<void> {
    try {
      const id = String(payload?.id || "");
      const tagName = String(payload?.tagName || "this tag");

      if (!id) {
        throw new Error("Tag ID is required.");
      }

      // Show VS Code native confirmation dialog
      const confirmed = await vscode.window.showWarningMessage(
        `Delete ${tagName}? This cannot be undone.`,
        { modal: true },
        "Delete",
      );

      if (confirmed === "Delete") {
        await this.tagsManager.deleteTag(id);
        this.postCurrentTags();
        vscode.window.showInformationMessage("Custom tag removed.");
      }
    } catch (error) {
      vscode.window.showErrorMessage(
        error instanceof Error ? error.message : "Failed to delete custom tag.",
      );
    }
  }

  private async handleToggleTag(
    payload: Record<string, unknown>,
  ): Promise<void> {
    try {
      const id = String(payload?.id || "");
      if (!id) {
        throw new Error("Tag ID is required.");
      }
      await this.tagsManager.toggleTag(id);
      this.postCurrentTags();
    } catch (error) {
      vscode.window.showErrorMessage(
        error instanceof Error ? error.message : "Failed to toggle custom tag.",
      );
    }
  }

  private async updateWebview(): Promise<void> {
    if (!this.panel) {
      return;
    }

    const webview = this.panel.webview;
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.extensionUri,
        "out",
        "src",
        "webview",
        "assets",
        "settings.js",
      ),
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.extensionUri,
        "out",
        "src",
        "webview",
        "assets",
        "settings.css",
      ),
    );

    const htmlContent = await this.loadTemplate();
    this.panel.webview.html = htmlContent
      .replace(/{{cspSource}}/g, webview.cspSource)
      .replace(/{{scriptUri}}/g, scriptUri.toString())
      .replace(/{{styleUri}}/g, styleUri.toString());

    this.postCurrentTags();
  }

  private async loadTemplate(): Promise<string> {
    const compiledPath = path.join(
      this.extensionUri.fsPath,
      "out",
      "src",
      "webview",
      "assets",
      "settings.html",
    );
    const sourcePath = path.join(
      this.extensionUri.fsPath,
      "src",
      "webview",
      "assets",
      "settings.html",
    );

    try {
      return await fs.promises.readFile(compiledPath, "utf8");
    } catch {
      return fs.readFileSync(sourcePath, "utf8");
    }
  }

  private postCurrentTags(): void {
    if (!this.panel) {
      return;
    }
    this.panel.webview.postMessage({
      command: CUSTOM_TAGS_DATA,
      tags: this.tagsManager.getAllTags(),
    });
  }

  public dispose(): void {
    if (this.panel) {
      this.panel.dispose();
      this.panel = undefined;
    }
    while (this.disposables.length) {
      const disposable = this.disposables.pop();
      disposable?.dispose();
    }
  }
}
