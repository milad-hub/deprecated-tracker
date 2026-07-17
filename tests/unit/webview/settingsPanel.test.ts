import * as fs from "fs";
import * as vscode from "vscode";

jest.mock("fs", () => {
  const actual = jest.requireActual("fs");
  return {
    ...actual,
    readFileSync: jest.fn(actual.readFileSync),
    promises: {
      ...actual.promises,
      readFile: jest.fn(actual.promises.readFile),
    },
  };
});
import { TagsManager } from "../../../src/config/tagsManager";
import { SettingsPanel } from "../../../src/webview/settingsPanel";

describe("SettingsPanel", () => {
  let mockContext: vscode.ExtensionContext;
  let panelInstance: any;
  let messageHandler: (message: any) => Promise<void>;
  let disposeHandler: () => void;

  const createPanel = (): SettingsPanel =>
    new SettingsPanel(mockContext, mockContext.extensionUri);

  const show = async (panel: SettingsPanel): Promise<void> => {
    panel.show();
    // let updateWebview settle
    await Promise.resolve();
    await Promise.resolve();
  };

  beforeEach(() => {
    jest.clearAllMocks();
    const extensionUri = vscode.Uri.file("/test/path");
    const workspaceState: { [key: string]: unknown } = {};
    mockContext = {
      subscriptions: [],
      workspaceState: {
        get: jest.fn((key: string) => workspaceState[key]),
        update: jest.fn((key: string, value: unknown) => {
          workspaceState[key] = value;
          return Promise.resolve();
        }),
        keys: jest.fn(() => Object.keys(workspaceState)),
      },
      globalState: {
        get: jest.fn(),
        update: jest.fn(),
        keys: jest.fn(() => []),
      },
      extensionPath: "/test/path",
      extensionUri,
      extensionMode: vscode.ExtensionMode.Test,
    } as unknown as vscode.ExtensionContext;

    panelInstance = {
      webview: {
        html: "",
        cspSource: "csp-source",
        asWebviewUri: jest.fn((uri: vscode.Uri) => uri),
        postMessage: jest.fn(),
        onDidReceiveMessage: jest.fn(
          (handler: any, _thisArg: any, disposables?: any[]) => {
            messageHandler = handler;
            const d = { dispose: jest.fn() };
            disposables?.push(d);
            return d;
          },
        ),
      },
      onDidDispose: jest.fn(
        (handler: any, _thisArg: any, disposables?: any[]) => {
          disposeHandler = handler;
          const d = { dispose: jest.fn() };
          disposables?.push(d);
          return d;
        },
      ),
      reveal: jest.fn(),
      dispose: jest.fn(),
    };
    (vscode.window.createWebviewPanel as jest.Mock).mockReturnValue(
      panelInstance,
    );
    (fs.promises.readFile as jest.Mock).mockResolvedValue(
      "<html>{{cspSource}}|{{scriptUri}}|{{styleUri}}</html>",
    );
    jest.spyOn(vscode.window, "showInformationMessage");
    jest.spyOn(vscode.window, "showErrorMessage");
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("show", () => {
    it("creates the webview panel and renders the template", async () => {
      const panel = createPanel();
      await show(panel);
      expect(vscode.window.createWebviewPanel).toHaveBeenCalledWith(
        "deprecatedTrackerSettings",
        "Deprecated Tracker Settings",
        vscode.ViewColumn.Active,
        expect.objectContaining({ enableScripts: true }),
      );
      expect(panelInstance.webview.html).toContain("csp-source");
      expect(panelInstance.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ command: "customTagsData" }),
      );
    });

    it("reveals the existing panel on a second show", async () => {
      const panel = createPanel();
      await show(panel);
      panel.show();
      expect(panelInstance.reveal).toHaveBeenCalled();
      expect(vscode.window.createWebviewPanel).toHaveBeenCalledTimes(1);
    });

    it("falls back to the source template when the compiled one is missing", async () => {
      (fs.promises.readFile as jest.Mock).mockRejectedValue(
        new Error("missing"),
      );
      const readSync = (fs.readFileSync as jest.Mock).mockReturnValue(
        "<html>source</html>",
      );
      const panel = createPanel();
      await show(panel);
      expect(readSync).toHaveBeenCalled();
      expect(panelInstance.webview.html).toContain("source");
    });
  });

  describe("message handling", () => {
    it("responds to getCustomTags with the current tags", async () => {
      const panel = createPanel();
      await show(panel);
      panelInstance.webview.postMessage.mockClear();
      await messageHandler({ command: "getCustomTags" });
      expect(panelInstance.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ command: "customTagsData" }),
      );
    });

    it("adds a tag and confirms", async () => {
      const panel = createPanel();
      await show(panel);
      await messageHandler({
        command: "addCustomTag",
        payload: { tag: "@mycustom", label: "My Custom" },
      });
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        "Custom tag added successfully.",
      );
    });

    it("shows an error when adding a tag fails", async () => {
      jest.spyOn(TagsManager.prototype, "addTag").mockImplementation(() => {
        throw new Error("duplicate tag");
      });
      const panel = createPanel();
      await show(panel);
      await messageHandler({
        command: "addCustomTag",
        payload: { tag: "@mycustom", label: "My Custom" },
      });
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        "duplicate tag",
      );
    });

    it("shows a fallback message for non-Error add failures", async () => {
      jest.spyOn(TagsManager.prototype, "addTag").mockImplementation(() => {
        throw "nope";
      });
      const panel = createPanel();
      await show(panel);
      await messageHandler({ command: "addCustomTag", payload: {} });
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        "Failed to add custom tag.",
      );
    });

    it("updates a tag with partial fields", async () => {
      const updateTag = jest
        .spyOn(TagsManager.prototype, "updateTag")
        .mockImplementation(() => undefined as any);
      const panel = createPanel();
      await show(panel);
      await messageHandler({
        command: "updateCustomTag",
        payload: { id: "tag-1", label: "New Label", enabled: false },
      });
      expect(updateTag).toHaveBeenCalledWith("tag-1", {
        tag: undefined,
        label: "New Label",
        description: undefined,
        color: undefined,
        enabled: false,
      });
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        "Custom tag updated.",
      );
    });

    it("rejects an update without an id", async () => {
      const panel = createPanel();
      await show(panel);
      await messageHandler({ command: "updateCustomTag", payload: {} });
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        "Tag ID is required.",
      );
    });

    it("shows a fallback message for non-Error update failures", async () => {
      jest.spyOn(TagsManager.prototype, "updateTag").mockImplementation(() => {
        throw "nope";
      });
      const panel = createPanel();
      await show(panel);
      await messageHandler({
        command: "updateCustomTag",
        payload: { id: "tag-1", tag: "x", description: "d", color: "#fff" },
      });
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        "Failed to update custom tag.",
      );
    });

    it("deletes a tag", async () => {
      const deleteTag = jest
        .spyOn(TagsManager.prototype, "deleteTag")
        .mockImplementation(() => undefined as any);
      const panel = createPanel();
      await show(panel);
      await messageHandler({
        command: "deleteCustomTag",
        payload: { id: "tag-1" },
      });
      expect(deleteTag).toHaveBeenCalledWith("tag-1");
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        "Custom tag removed.",
      );
    });

    it("rejects a delete without an id", async () => {
      const panel = createPanel();
      await show(panel);
      await messageHandler({ command: "deleteCustomTag", payload: {} });
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        "Tag ID is required.",
      );
    });

    it("shows a fallback message for non-Error delete failures", async () => {
      jest.spyOn(TagsManager.prototype, "deleteTag").mockImplementation(() => {
        throw "nope";
      });
      const panel = createPanel();
      await show(panel);
      await messageHandler({
        command: "deleteCustomTag",
        payload: { id: "tag-1" },
      });
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        "Failed to delete custom tag.",
      );
    });

    it("confirm-deletes a tag when the user accepts", async () => {
      const deleteTag = jest
        .spyOn(TagsManager.prototype, "deleteTag")
        .mockImplementation(() => undefined as any);
      (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue(
        "Delete",
      );
      const panel = createPanel();
      await show(panel);
      await messageHandler({
        command: "confirmDeleteCustomTag",
        payload: { id: "tag-1", tagName: "@legacy" },
      });
      expect(deleteTag).toHaveBeenCalledWith("tag-1");
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        "Custom tag removed.",
      );
    });

    it("keeps the tag when the user cancels the confirmation", async () => {
      const deleteTag = jest.spyOn(TagsManager.prototype, "deleteTag");
      (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue(
        undefined,
      );
      const panel = createPanel();
      await show(panel);
      await messageHandler({
        command: "confirmDeleteCustomTag",
        payload: { id: "tag-1" },
      });
      expect(deleteTag).not.toHaveBeenCalled();
    });

    it("rejects a confirm-delete without an id", async () => {
      const panel = createPanel();
      await show(panel);
      await messageHandler({ command: "confirmDeleteCustomTag", payload: {} });
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        "Tag ID is required.",
      );
    });

    it("shows a fallback message for non-Error confirm-delete failures", async () => {
      (vscode.window.showWarningMessage as jest.Mock).mockImplementation(() => {
        throw "nope";
      });
      const panel = createPanel();
      await show(panel);
      await messageHandler({
        command: "confirmDeleteCustomTag",
        payload: { id: "tag-1" },
      });
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        "Failed to delete custom tag.",
      );
    });

    it("toggles a tag", async () => {
      const toggleTag = jest
        .spyOn(TagsManager.prototype, "toggleTag")
        .mockImplementation(() => undefined as any);
      const panel = createPanel();
      await show(panel);
      await messageHandler({
        command: "toggleCustomTag",
        payload: { id: "tag-1" },
      });
      expect(toggleTag).toHaveBeenCalledWith("tag-1");
    });

    it("rejects a toggle without an id", async () => {
      const panel = createPanel();
      await show(panel);
      await messageHandler({ command: "toggleCustomTag", payload: {} });
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        "Tag ID is required.",
      );
    });

    it("shows a fallback message for non-Error toggle failures", async () => {
      jest.spyOn(TagsManager.prototype, "toggleTag").mockImplementation(() => {
        throw "nope";
      });
      const panel = createPanel();
      await show(panel);
      await messageHandler({
        command: "toggleCustomTag",
        payload: { id: "tag-1" },
      });
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        "Failed to toggle custom tag.",
      );
    });

    it("ignores unknown commands", async () => {
      const panel = createPanel();
      await show(panel);
      panelInstance.webview.postMessage.mockClear();
      await messageHandler({ command: "unknown" });
      expect(panelInstance.webview.postMessage).not.toHaveBeenCalled();
    });
  });

  describe("disposed-state guards", () => {
    it("skips posting tags after dispose", async () => {
      const panel = createPanel();
      await show(panel);
      panel.dispose();
      panelInstance.webview.postMessage.mockClear();
      await messageHandler({ command: "getCustomTags" });
      expect(panelInstance.webview.postMessage).not.toHaveBeenCalled();
    });

    it("skips webview updates when no panel exists", async () => {
      const panel = createPanel();
      await (panel as any).updateWebview();
      expect(panelInstance.webview.asWebviewUri).not.toHaveBeenCalled();
    });
  });

  describe("dispose", () => {
    it("disposes the panel and its listeners", async () => {
      const panel = createPanel();
      await show(panel);
      disposeHandler();
      expect(panelInstance.dispose).toHaveBeenCalled();
      // second dispose is a no-op
      panel.dispose();
    });
  });
});
