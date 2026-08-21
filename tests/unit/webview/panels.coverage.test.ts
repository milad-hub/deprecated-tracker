import * as fs from "fs";
import * as vscode from "vscode";
import { DeprecationStatistics } from "../../../src/interfaces";
import { StatisticsPanel } from "../../../src/webview/statisticsPanel";
import { getWebviewHtml } from "../../../src/webview/templateLoader";

jest.mock("fs");

jest.mock("vscode", () => {
  const mockCreateWebviewPanel = jest.fn();
  return {
    ...jest.requireActual("vscode"),
    window: {
      createWebviewPanel: mockCreateWebviewPanel,
      showErrorMessage: jest.fn(),
      showInformationMessage: jest.fn(),
      showTextDocument: jest.fn(),
      activeTextEditor: undefined,
    },
    commands: { executeCommand: jest.fn() },
    workspace: {
      workspaceFolders: undefined,
      onDidChangeConfiguration: jest.fn(),
      getConfiguration: jest.fn(() => ({ get: jest.fn() })),
      openTextDocument: jest.fn(),
      fs: { readFile: jest.fn().mockRejectedValue(new Error("no vsfs")) },
    },
    Uri: {
      file: (p: string) => ({ fsPath: p }),
      joinPath: jest.fn((uri, ...parts: string[]) => ({
        fsPath: `${uri.fsPath}/${parts.join("/")}`,
      })),
    },
    ViewColumn: { One: 1, Two: 2 },
    ExtensionMode: { Test: 2 },
  };
});

const statistics: DeprecationStatistics = {
  totalItems: 1,
  totalDeclarations: 1,
  totalUsages: 0,
  byKind: {
    method: 1,
    property: 0,
    class: 0,
    interface: 0,
    function: 0,
    usage: 0,
  },
  topMostUsed: [],
  hotspotFiles: [],
  quickWins: [],
  needsAttention: [],
};

describe("panel coverage", () => {
  let mockContext: vscode.ExtensionContext;
  let mockPanel: any;
  let messageHandler: (message: any) => Promise<void>;

  beforeEach(() => {
    jest.clearAllMocks();
    (StatisticsPanel as any).currentPanel = undefined;
    (vscode.window as any).activeTextEditor = undefined;
    (fs.readFileSync as jest.Mock).mockReturnValue(
      "<html>{{cspSource}}{{scriptUri}}{{styleUri}}</html>",
    );
    (vscode.workspace.fs.readFile as jest.Mock).mockRejectedValue(
      new Error("no vsfs"),
    );
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
      extensionUri: { fsPath: "/test/path" },
      extensionMode: 2,
    } as unknown as vscode.ExtensionContext;
    mockPanel = {
      webview: {
        html: "",
        cspSource: "csp",
        asWebviewUri: jest.fn((uri: any) => uri),
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
          mockPanel._disposeHandler = handler;
          const d = { dispose: jest.fn() };
          disposables?.push(d);
          return d;
        },
      ),
      reveal: jest.fn(),
      dispose: jest.fn(),
    };
    (vscode.window.createWebviewPanel as jest.Mock).mockReturnValue(mockPanel);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    (StatisticsPanel as any).currentPanel = undefined;
  });

  describe("StatisticsPanel", () => {
    const create = () => {
      StatisticsPanel.createOrShow(
        mockContext.extensionUri,
        mockContext,
        statistics,
      );
    };

    it("reveals and refreshes the existing panel", () => {
      create();
      create();
      expect(mockPanel.reveal).toHaveBeenCalled();
      expect(vscode.window.createWebviewPanel).toHaveBeenCalledTimes(1);
    });

    it("uses the active editor's view column when present", () => {
      (vscode.window as any).activeTextEditor = { viewColumn: 1 };
      create();
      expect(
        (vscode.window.createWebviewPanel as jest.Mock).mock.calls[0][2],
      ).toBe(1);
    });

    it("posts statistics once the webview is ready", async () => {
      create();
      await messageHandler({ command: "webviewReady" });
      expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ command: "updateStatistics" }),
      );
    });

    it("opens a file at a line from a statistics entry", async () => {
      const editor: any = { selection: undefined, revealRange: jest.fn() };
      (vscode.workspace.openTextDocument as jest.Mock).mockResolvedValue({});
      (vscode.window.showTextDocument as jest.Mock).mockResolvedValue(editor);
      create();
      await messageHandler({
        command: "openFileAtLine",
        filePath: "/workspace/a.ts",
        line: 3,
      });
      expect(editor.selection).toBeDefined();
      expect(editor.revealRange).toHaveBeenCalled();
    });

    it("ignores openFileAtLine without a line number", async () => {
      create();
      await messageHandler({
        command: "openFileAtLine",
        filePath: "/workspace/a.ts",
      });
      expect(vscode.workspace.openTextDocument).not.toHaveBeenCalled();
    });

    it("ignores openFileAtLine without a file path", async () => {
      create();
      await messageHandler({ command: "openFileAtLine", line: 3 });
      expect(vscode.workspace.openTextDocument).not.toHaveBeenCalled();
    });

    it("ignores unknown commands", async () => {
      create();
      mockPanel.webview.postMessage.mockClear();
      await messageHandler({ command: "unknown" });
      expect(mockPanel.webview.postMessage).not.toHaveBeenCalled();
    });

    it("logs initialization failures", async () => {
      const error = jest.spyOn(console, "error").mockImplementation(() => {});
      mockPanel.webview.asWebviewUri.mockImplementation(() => {
        throw new Error("no uri");
      });
      create();
      await new Promise((r) => setTimeout(r, 0));
      expect(error).toHaveBeenCalledWith(
        "Failed to initialize statistics panel webview:",
        expect.any(Error),
      );
      error.mockRestore();
    });

    it("disposes when the panel is closed by the user", () => {
      create();
      mockPanel._disposeHandler();
      expect((StatisticsPanel as any).currentPanel).toBeUndefined();
    });

    it("skips falsy entries while disposing", () => {
      create();
      const panel = (StatisticsPanel as any).currentPanel;
      panel._disposables.push(undefined);
      panel.dispose();
      expect(mockPanel.dispose).toHaveBeenCalled();
    });
  });

  describe("templateLoader fallbacks", () => {
    const webview: any = {
      cspSource: "csp",
      asWebviewUri: jest.fn((uri: any) => uri),
    };

    it("loads via the VS Code fs API when available", async () => {
      (vscode.workspace.fs.readFile as jest.Mock).mockResolvedValue(
        Buffer.from("<html>vsfs {{cspSource}}</html>"),
      );
      const html = await getWebviewHtml(
        webview,
        mockContext.extensionUri,
        mockContext,
        "main",
      );
      expect(html).toContain("vsfs csp");
    });

    it("falls back to the compiled template on disk", async () => {
      (fs.readFileSync as jest.Mock).mockReturnValueOnce("<html>disk</html>");
      const html = await getWebviewHtml(
        webview,
        mockContext.extensionUri,
        mockContext,
        "main",
      );
      expect(html).toContain("disk");
    });

    it("falls back to the source template when the compiled one is missing", async () => {
      (fs.readFileSync as jest.Mock)
        .mockImplementationOnce(() => {
          throw new Error("no compiled");
        })
        .mockReturnValueOnce("<html>source</html>");
      const html = await getWebviewHtml(
        webview,
        mockContext.extensionUri,
        mockContext,
        "main",
      );
      expect(html).toContain("source");
    });

    it("serves the error page when every template read fails", async () => {
      const error = jest.spyOn(console, "error").mockImplementation(() => {});
      (fs.readFileSync as jest.Mock).mockImplementation(() => {
        throw new Error("nothing on disk");
      });
      const html = await getWebviewHtml(
        webview,
        mockContext.extensionUri,
        mockContext,
        "main",
      );
      expect(html).toContain("Failed to load main HTML template");
      error.mockRestore();
    });

    it("applies extra replacements", async () => {
      (vscode.workspace.fs.readFile as jest.Mock).mockResolvedValue(
        Buffer.from("<html>{{custom}}</html>"),
      );
      const html = await getWebviewHtml(
        webview,
        mockContext.extensionUri,
        mockContext,
        "main",
        { custom: "value" },
      );
      expect(html).toContain("value");
    });
  });
});
