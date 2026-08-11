import * as fs from "fs";
import * as vscode from "vscode";
import { MESSAGE_COMMANDS } from "../../../src/constants";
import { ResultExporter } from "../../../src/exporter";
import { ScanHistory } from "../../../src/history";
import { DeprecatedItem, Scanner } from "../../../src/scanner";
import { IgnoreManager } from "../../../src/scanner/ignoreManager";
import { TagsManager } from "../../../src/config/tagsManager";
import { MainPanel } from "../../../src/webview/mainPanel";

jest.mock("fs");

jest.mock("vscode", () => {
  const actual = jest.requireActual("vscode");
  return {
    ...actual,
    window: {
      createWebviewPanel: jest.fn(),
      showErrorMessage: jest.fn(),
      showInformationMessage: jest.fn(),
      showWarningMessage: jest.fn(),
      showSaveDialog: jest.fn(),
      activeTextEditor: undefined,
    },
    env: { clipboard: { writeText: jest.fn() } },
    commands: { executeCommand: jest.fn() },
    workspace: {
      workspaceFolders: undefined,
      onDidChangeConfiguration: jest.fn(),
      getConfiguration: jest.fn(() => ({ get: jest.fn() })),
      fs: { readFile: jest.fn().mockRejectedValue(new Error("no vsfs")) },
    },
    Uri: {
      file: (p: string) => ({ fsPath: p }),
      joinPath: jest.fn((uri: { fsPath: string }, ...parts: string[]) => ({
        fsPath: `${uri.fsPath}/${parts.join("/")}`,
      })),
    },
    ViewColumn: { One: 1 },
  };
});

const declaration: DeprecatedItem = {
  name: "getUser",
  fileName: "user.ts",
  filePath: "/workspace/src/api/user.ts",
  line: 12,
  character: 1,
  kind: "function",
};
const usage: DeprecatedItem = {
  name: "getUser",
  fileName: "profile.ts",
  filePath: "/workspace/src/pages/profile.ts",
  line: 22,
  character: 2,
  kind: "usage",
  deprecatedDeclaration: {
    name: "getUser",
    filePath: "/workspace/src/api/user.ts",
    fileName: "user.ts",
    line: 12,
  },
};
const otherDeclaration: DeprecatedItem = {
  ...declaration,
  name: "legacyCache",
  fileName: "legacy.ts",
  filePath: "/workspace/src/cache/legacy.ts",
  line: 8,
};

const rowOf = (item: DeprecatedItem) => ({
  filePath: item.filePath,
  line: item.line,
  name: item.name,
});

describe("MainPanel AI fix prompt", () => {
  let context: vscode.ExtensionContext;
  let panelStub: {
    webview: { postMessage: jest.Mock; [key: string]: unknown };
    [key: string]: unknown;
  };
  let messageHandler: (message: Record<string, unknown>) => Promise<void>;

  const posted = (command: string) =>
    panelStub.webview.postMessage.mock.calls
      .map((call) => call[0])
      .filter((message) => message.command === command);

  const createPanel = (results: DeprecatedItem[] = []): MainPanel => {
    const panel = MainPanel.createOrShow(
      context.extensionUri,
      context,
      new ScanHistory(context),
      new IgnoreManager(context),
      () => new Scanner(new IgnoreManager(context), new TagsManager(context)),
    );
    if (results.length > 0) {
      panel.updateResults(results);
    }
    panelStub.webview.postMessage.mockClear();
    return panel;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (MainPanel as unknown as { currentPanel: undefined }).currentPanel =
      undefined;
    (vscode.workspace as unknown as { workspaceFolders: unknown }).workspaceFolders =
      [{ uri: { fsPath: "/workspace" }, name: "workspace", index: 0 }];
    (fs.readFileSync as jest.Mock).mockReturnValue("<html>{{scriptUri}}</html>");
    context = {
      subscriptions: [],
      workspaceState: {
        get: jest.fn(),
        update: jest.fn(),
        keys: jest.fn(() => []),
      },
      globalState: { get: jest.fn(), update: jest.fn(), keys: jest.fn(() => []) },
      extensionPath: "/test",
      extensionUri: { fsPath: "/test" },
      extensionMode: 2,
    } as unknown as vscode.ExtensionContext;

    panelStub = {
      webview: {
        html: "",
        cspSource: "csp",
        asWebviewUri: jest.fn((uri: unknown) => uri),
        postMessage: jest.fn(),
        onDidReceiveMessage: jest.fn(
          (
            handler: (message: Record<string, unknown>) => Promise<void>,
            _thisArg: unknown,
            disposables?: Array<{ dispose: jest.Mock }>,
          ) => {
            messageHandler = handler;
            const disposable = { dispose: jest.fn() };
            disposables?.push(disposable);
            return disposable;
          },
        ),
      },
      onDidDispose: jest.fn(
        (
          _handler: () => void,
          _thisArg: unknown,
          disposables?: Array<{ dispose: jest.Mock }>,
        ) => {
          const disposable = { dispose: jest.fn() };
          disposables?.push(disposable);
          return disposable;
        },
      ),
      reveal: jest.fn(),
      dispose: jest.fn(),
    };
    (vscode.window.createWebviewPanel as jest.Mock).mockReturnValue(panelStub);
    (vscode.env.clipboard.writeText as jest.Mock).mockResolvedValue(undefined);
    jest
      .spyOn(ResultExporter.prototype, "saveToFile")
      .mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    (MainPanel as unknown as { currentPanel: undefined }).currentPanel =
      undefined;
  });

  describe("building", () => {
    it("builds the prompt from the rows the panel is showing", async () => {
      createPanel([declaration, usage, otherDeclaration]);

      await messageHandler({
        command: MESSAGE_COMMANDS.REQUEST_AI_PROMPT,
        visible: [rowOf(declaration), rowOf(usage)],
      });

      const [message] = posted(MESSAGE_COMMANDS.SHOW_AI_PROMPT);
      expect(message.prompt).toContain("getUser (function) @ src/api/user.ts:12");
      expect(message.prompt).toContain("src/pages/profile.ts:22");
      expect(message.prompt).not.toContain("legacyCache");
      expect(message.prompt).toContain("1 symbols, 1 usages.");
    });

    it("covers every result when the webview sends no row list", async () => {
      createPanel([declaration, otherDeclaration]);

      await messageHandler({ command: MESSAGE_COMMANDS.REQUEST_AI_PROMPT });

      const [message] = posted(MESSAGE_COMMANDS.SHOW_AI_PROMPT);
      expect(message.prompt).toContain("2 symbols");
    });

    it("uses full paths when no folder is open", async () => {
      (
        vscode.workspace as unknown as { workspaceFolders: undefined }
      ).workspaceFolders = undefined;
      createPanel([declaration]);

      await messageHandler({ command: MESSAGE_COMMANDS.REQUEST_AI_PROMPT });

      const [message] = posted(MESSAGE_COMMANDS.SHOW_AI_PROMPT);
      expect(message.prompt).toContain("/workspace/src/api/user.ts:12");
    });

    it("warns instead of opening an empty modal when the filter hides everything", async () => {
      createPanel([declaration]);

      await messageHandler({
        command: MESSAGE_COMMANDS.REQUEST_AI_PROMPT,
        visible: [],
      });

      expect(posted(MESSAGE_COMMANDS.SHOW_AI_PROMPT)).toHaveLength(0);
      expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
        "No deprecated items to export. Please run a scan first.",
      );
    });

    it("warns when the command runs before any scan", () => {
      const panel = createPanel();

      panel.showAiFixPrompt();

      expect(posted(MESSAGE_COMMANDS.SHOW_AI_PROMPT)).toHaveLength(0);
      expect(vscode.window.showWarningMessage).toHaveBeenCalled();
    });

    it("opens the modal from the export command with the unfiltered results", () => {
      const panel = createPanel([declaration, otherDeclaration]);

      panel.showAiFixPrompt();

      const [message] = posted(MESSAGE_COMMANDS.SHOW_AI_PROMPT);
      expect(message.prompt).toContain("2 symbols");
    });
  });

  describe("copying", () => {
    it("copies the prompt through the host clipboard", async () => {
      createPanel([declaration]);
      await messageHandler({ command: MESSAGE_COMMANDS.REQUEST_AI_PROMPT });
      const [shown] = posted(MESSAGE_COMMANDS.SHOW_AI_PROMPT);

      await messageHandler({ command: MESSAGE_COMMANDS.COPY_AI_PROMPT });

      expect(vscode.env.clipboard.writeText).toHaveBeenCalledWith(shown.prompt);
      expect(posted(MESSAGE_COMMANDS.AI_PROMPT_COPIED)).toEqual([
        { command: MESSAGE_COMMANDS.AI_PROMPT_COPIED, copied: true },
      ]);
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        "AI fix prompt copied to clipboard.",
      );
    });

    it("tells the modal when the clipboard refuses", async () => {
      (vscode.env.clipboard.writeText as jest.Mock).mockRejectedValue(
        new Error("no clipboard"),
      );
      createPanel([declaration]);

      await messageHandler({ command: MESSAGE_COMMANDS.COPY_AI_PROMPT });

      expect(posted(MESSAGE_COMMANDS.AI_PROMPT_COPIED)).toEqual([
        { command: MESSAGE_COMMANDS.AI_PROMPT_COPIED, copied: false },
      ]);
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        "Copy failed: Error: no clipboard",
      );
    });
  });

  describe("saving", () => {
    it("writes the prompt to the chosen file", async () => {
      (vscode.window.showSaveDialog as jest.Mock).mockResolvedValue({
        fsPath: "/workspace/prompt.txt",
      });
      createPanel([declaration]);
      await messageHandler({ command: MESSAGE_COMMANDS.REQUEST_AI_PROMPT });
      const [shown] = posted(MESSAGE_COMMANDS.SHOW_AI_PROMPT);

      await messageHandler({ command: MESSAGE_COMMANDS.SAVE_AI_PROMPT });

      expect(ResultExporter.prototype.saveToFile).toHaveBeenCalledWith(
        shown.prompt,
        "/workspace/prompt.txt",
      );
      expect(posted(MESSAGE_COMMANDS.AI_PROMPT_SAVED)).toEqual([
        { command: MESSAGE_COMMANDS.AI_PROMPT_SAVED, saved: true },
      ]);
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        "AI fix prompt saved to /workspace/prompt.txt",
      );
    });

    it("does nothing when the save dialog is cancelled", async () => {
      (vscode.window.showSaveDialog as jest.Mock).mockResolvedValue(undefined);
      createPanel([declaration]);

      await messageHandler({ command: MESSAGE_COMMANDS.SAVE_AI_PROMPT });

      expect(ResultExporter.prototype.saveToFile).not.toHaveBeenCalled();
      expect(posted(MESSAGE_COMMANDS.AI_PROMPT_SAVED)).toHaveLength(0);
    });

    it("tells the modal when the write fails", async () => {
      (vscode.window.showSaveDialog as jest.Mock).mockResolvedValue({
        fsPath: "/workspace/prompt.txt",
      });
      (ResultExporter.prototype.saveToFile as jest.Mock).mockRejectedValue(
        new Error("read-only"),
      );
      createPanel([declaration]);

      await messageHandler({ command: MESSAGE_COMMANDS.SAVE_AI_PROMPT });

      expect(posted(MESSAGE_COMMANDS.AI_PROMPT_SAVED)).toEqual([
        { command: MESSAGE_COMMANDS.AI_PROMPT_SAVED, saved: false },
      ]);
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        "Save failed: Error: read-only",
      );
    });
  });

  describe("showSubsetNote", () => {
    // Sent separately from the results so revealing the panel cannot
    // overwrite the banner.
    it("posts the note to the webview", () => {
      const panel = createPanel([declaration]);

      panel.showSubsetNote("Scanned 2 changed file(s) — 1 deprecated item(s)");

      expect(posted(MESSAGE_COMMANDS.SUBSET_NOTE)).toEqual([
        {
          command: MESSAGE_COMMANDS.SUBSET_NOTE,
          note: "Scanned 2 changed file(s) — 1 deprecated item(s)",
        },
      ]);
    });
  });
});
