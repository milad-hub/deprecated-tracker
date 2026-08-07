import * as fs from "fs";
import * as vscode from "vscode";
import { ResultExporter } from "../../../src/exporter";
import { ScanHistory } from "../../../src/history";
import { DeprecatedItem, Scanner } from "../../../src/scanner";
import { MainPanel } from "../../../src/webview/mainPanel";
import { IgnorePanel } from "../../../src/webview/ignorePanel";
import { IgnoreManager } from "../../../src/scanner/ignoreManager";
import { TagsManager } from "../../../src/config/tagsManager";

jest.mock("fs");
jest.mock("../../../src/webview/ignorePanel", () => ({
  IgnorePanel: { createOrShow: jest.fn() },
}));

jest.mock("vscode", () => {
  const mockCreateWebviewPanel = jest.fn();
  return {
    ...jest.requireActual("vscode"),
    window: {
      createWebviewPanel: mockCreateWebviewPanel,
      showErrorMessage: jest.fn(),
      showInformationMessage: jest.fn(),
      showWarningMessage: jest.fn(),
      showSaveDialog: jest.fn(),
      showTextDocument: jest.fn(),
      activeTextEditor: undefined,
    },
    commands: { executeCommand: jest.fn() },
    workspace: {
      workspaceFolders: undefined,
      onDidChangeConfiguration: jest.fn(),
      getConfiguration: jest.fn(() => ({ get: jest.fn() })),
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
    _mockCreateWebviewPanel: mockCreateWebviewPanel,
  };
});

const declaration: DeprecatedItem = {
  name: "oldMethod",
  fileName: "a.ts",
  filePath: "/workspace/a.ts",
  line: 1,
  character: 1,
  kind: "method",
};
const usage: DeprecatedItem = {
  name: "oldMethod",
  fileName: "b.ts",
  filePath: "/workspace/b.ts",
  line: 5,
  character: 2,
  kind: "usage",
  deprecatedDeclaration: {
    name: "oldMethod",
    filePath: "/workspace/a.ts",
    fileName: "a.ts",
    line: 1,
  },
};
const otherUsage: DeprecatedItem = {
  ...usage,
  deprecatedDeclaration: {
    name: "otherMethod",
    filePath: "/workspace/c.ts",
    fileName: "c.ts",
    line: 9,
  },
};

describe("MainPanel message handlers", () => {
  let mockContext: vscode.ExtensionContext;
  let mockPanel: any;
  let scanHistory: ScanHistory;
  let messageHandler: (message: any) => Promise<void>;
  let workspaceState: { [key: string]: unknown };

  const createPanel = (): MainPanel =>
    MainPanel.createOrShow(
      mockContext.extensionUri,
      mockContext,
      scanHistory,
      new IgnoreManager(mockContext),
      () => new Scanner(new IgnoreManager(mockContext), new TagsManager(mockContext)),
    );

  beforeEach(() => {
    jest.clearAllMocks();
    (MainPanel as any).currentPanel = undefined;
    (vscode.workspace as any).workspaceFolders = [
      { uri: { fsPath: "/workspace" }, name: "workspace", index: 0 },
    ];
    (fs.readFileSync as jest.Mock).mockReturnValue(
      "<html>{{cspSource}}{{scriptUri}}{{styleUri}}{{nameFilter}}{{fileFilter}}</html>",
    );
    workspaceState = {};
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
    scanHistory = new ScanHistory(mockContext);

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
        (_handler: any, _thisArg: any, disposables?: any[]) => {
          const d = { dispose: jest.fn() };
          disposables?.push(d);
          return d;
        },
      ),
      reveal: jest.fn(),
      dispose: jest.fn(),
    };
    (vscode.window.createWebviewPanel as jest.Mock).mockReturnValue(mockPanel);
    jest
      .spyOn(ResultExporter.prototype, "saveToFile")
      .mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    (MainPanel as any).currentPanel = undefined;
  });

  describe("simple messages", () => {
    it("replays results on webviewReady", async () => {
      const panel = createPanel();
      panel.updateResults([declaration]);
      mockPanel.webview.postMessage.mockClear();
      await messageHandler({ command: "webviewReady" });
      expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ command: "results" }),
      );
    });

    it("opens a file", async () => {
      createPanel();
      await messageHandler({
        command: "openFile",
        filePath: "/workspace/a.ts",
      });
      expect(vscode.window.showTextDocument).toHaveBeenCalled();
    });

    it("opens a file at a line and reveals it", async () => {
      const editor: any = { selection: undefined };
      (vscode.window.showTextDocument as jest.Mock).mockResolvedValue(editor);
      const revealRange = jest.fn();
      (vscode.window as any).activeTextEditor = { revealRange };
      createPanel();
      await messageHandler({
        command: "openFileAtLine",
        filePath: "/workspace/a.ts",
        line: 5,
      });
      expect(editor.selection).toBeDefined();
      expect(revealRange).toHaveBeenCalled();
    });

    it("opens a file at a line without an active editor", async () => {
      const editor: any = { selection: undefined };
      (vscode.window.showTextDocument as jest.Mock).mockResolvedValue(editor);
      (vscode.window as any).activeTextEditor = undefined;
      createPanel();
      await messageHandler({
        command: "openFileAtLine",
        filePath: "/workspace/a.ts",
        line: 1,
      });
      expect(editor.selection).toBeDefined();
    });

    it("ignores a method and filters usages of it", async () => {
      const panel = createPanel();
      panel.updateResults([declaration, usage, otherUsage]);
      await messageHandler({
        command: "ignoreMethod",
        filePath: "/workspace/a.ts",
        methodName: "oldMethod",
      });
      expect(MainPanel.getCurrentResults()).toEqual([otherUsage]);
      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        "deprecatedTracker.updateTreeView",
        [otherUsage],
      );
    });

    it("ignores a file and filters usages of its declarations", async () => {
      const panel = createPanel();
      panel.updateResults([declaration, usage, otherUsage]);
      await messageHandler({
        command: "ignoreFile",
        filePath: "/workspace/a.ts",
      });
      expect(MainPanel.getCurrentResults()).toEqual([otherUsage]);
    });

    it("persists filter state", async () => {
      createPanel();
      await messageHandler({
        command: "saveFilterState",
        nameFilter: "foo",
        fileFilter: "bar",
      });
      expect(mockContext.workspaceState.update).toHaveBeenCalledWith(
        "deprecatedTracker.mainPanel.filters",
        { nameFilter: "foo", fileFilter: "bar" },
      );
    });

    it("sends the ignore list into the results panel", async () => {
      createPanel();
      mockPanel.webview.postMessage.mockClear();
      await messageHandler({ command: "showIgnoreManager" });
      expect(IgnorePanel.createOrShow).not.toHaveBeenCalled();
      expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ command: "updateIgnoreList" }),
      );
    });

    it("opens settings", async () => {
      createPanel();
      await messageHandler({ command: "openSettings" });
      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        "deprecatedTracker.openSettings",
      );
    });

    it("ignores unknown commands", async () => {
      createPanel();
      mockPanel.webview.postMessage.mockClear();
      await messageHandler({ command: "unknown" });
      expect(mockPanel.webview.postMessage).not.toHaveBeenCalled();
    });
  });

  describe("refreshResults", () => {
    it("errors without a workspace", async () => {
      createPanel();
      (vscode.workspace as any).workspaceFolders = undefined;
      await messageHandler({ command: "refreshResults" });
      expect(vscode.window.showErrorMessage).toHaveBeenCalled();
    });

    it("asks for a scan when there are no results", async () => {
      createPanel();
      await messageHandler({ command: "refreshResults" });
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        "No results to refresh. Please run a scan first.",
      );
    });

    it("rescans the files of the current results", async () => {
      const scan = jest
        .spyOn(Scanner.prototype, "scanWorkspaceFiles")
        .mockResolvedValue([declaration]);
      const panel = createPanel();
      panel.updateResults([declaration, usage]);
      await messageHandler({ command: "refreshResults" });
      expect(scan).toHaveBeenCalledWith(expect.anything(), [
        "/workspace/a.ts",
        "/workspace/b.ts",
      ]);
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        "Results refreshed successfully.",
      );
    });

    it("reports refresh errors", async () => {
      jest
        .spyOn(Scanner.prototype, "scanWorkspaceFiles")
        .mockRejectedValue(new Error("refresh boom"));
      const panel = createPanel();
      panel.updateResults([declaration]);
      await messageHandler({ command: "refreshResults" });
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        "Refresh failed: refresh boom",
      );
    });

    it("reports non-Error refresh failures", async () => {
      jest
        .spyOn(Scanner.prototype, "scanWorkspaceFiles")
        .mockRejectedValue("boom");
      const panel = createPanel();
      panel.updateResults([declaration]);
      await messageHandler({ command: "refreshResults" });
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining("Refresh failed"),
      );
    });
  });

  describe("export current results", () => {
    it("warns when there is nothing to export", async () => {
      createPanel();
      await messageHandler({ command: "exportResults", format: "csv" });
      expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
        "No deprecated items to export. Please run a scan first.",
      );
    });

    it("stops when the save dialog is cancelled", async () => {
      (vscode.window.showSaveDialog as jest.Mock).mockResolvedValue(undefined);
      const panel = createPanel();
      panel.updateResults([declaration]);
      await messageHandler({ command: "exportResults", format: "csv" });
      expect(ResultExporter.prototype.saveToFile).not.toHaveBeenCalled();
    });

    it.each(["csv", "json", "markdown"])("exports %s", async (format) => {
      (vscode.window.showSaveDialog as jest.Mock).mockResolvedValue({
        fsPath: `/workspace/out.${format}`,
      });
      const panel = createPanel();
      panel.updateResults([declaration]);
      await messageHandler({ command: "exportResults", format });
      expect(ResultExporter.prototype.saveToFile).toHaveBeenCalled();
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        expect.stringContaining("Results exported successfully"),
      );
    });

    it("errors on unsupported formats", async () => {
      (vscode.window.showSaveDialog as jest.Mock).mockResolvedValue({
        fsPath: "/workspace/out.xml",
      });
      const panel = createPanel();
      panel.updateResults([declaration]);
      await messageHandler({ command: "exportResults", format: "xml" });
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining("Export failed"),
      );
    });
  });

  describe("history messages", () => {
    it("returns paged history metadata", async () => {
      await scanHistory.saveScan([declaration], 10, 1);
      createPanel();
      mockPanel.webview.postMessage.mockClear();
      await messageHandler({ command: "viewHistory", limit: 5 });
      expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ command: "historyMetadata", hasMore: false }),
      );
    });

    it("defaults the history limit for invalid values", async () => {
      createPanel();
      await messageHandler({ command: "viewHistory", limit: -3 });
      expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ command: "historyMetadata" }),
      );
    });

    it("reports history load failures", async () => {
      jest
        .spyOn(ScanHistory.prototype, "getHistoryMetadata")
        .mockRejectedValue(new Error("history boom"));
      createPanel();
      await messageHandler({ command: "viewHistory" });
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining("Failed to load history"),
      );
    });

    it("shows a stored scan", async () => {
      const scanId = await scanHistory.saveScan([declaration], 10, 1);
      createPanel();
      mockPanel.webview.postMessage.mockClear();
      await messageHandler({ command: "viewScan", scanId });
      expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ command: "results", viewOnly: true }),
      );
    });

    it("warns when a stored scan is truncated", async () => {
      const scanId = await scanHistory.saveScan([declaration], 10, 1);
      (
        workspaceState["deprecatedTracker.scanHistory"] as any
      )[0].metadata.totalItems = 999;
      createPanel();
      await messageHandler({ command: "viewScan", scanId });
      expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
        expect.stringContaining("stored scan results"),
      );
    });

    it("warns when a scan is missing", async () => {
      createPanel();
      await messageHandler({ command: "viewScan", scanId: "missing" });
      expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
        "Scan not found in history.",
      );
    });

    it("reports viewScan failures", async () => {
      jest
        .spyOn(ScanHistory.prototype, "getScanById")
        .mockRejectedValue(new Error("boom"));
      createPanel();
      await messageHandler({ command: "viewScan", scanId: "x" });
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining("Failed to load scan"),
      );
    });
  });

  describe("historical export", () => {
    it("warns when the scan is missing", async () => {
      createPanel();
      await messageHandler({
        command: "exportHistoricalScan",
        scanId: "missing",
        format: "csv",
      });
      expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
        "Scan not found in history.",
      );
    });

    it("stops when the save dialog is cancelled", async () => {
      const scanId = await scanHistory.saveScan([declaration], 10, 1);
      (vscode.window.showSaveDialog as jest.Mock).mockResolvedValue(undefined);
      createPanel();
      await messageHandler({
        command: "exportHistoricalScan",
        scanId,
        format: "csv",
      });
      expect(ResultExporter.prototype.saveToFile).not.toHaveBeenCalled();
    });

    it.each(["csv", "json", "markdown"])(
      "exports a historical scan as %s",
      async (format) => {
        const scanId = await scanHistory.saveScan([declaration], 10, 1);
        (vscode.window.showSaveDialog as jest.Mock).mockResolvedValue({
          fsPath: `/workspace/out.${format}`,
        });
        createPanel();
        await messageHandler({
          command: "exportHistoricalScan",
          scanId,
          format,
        });
        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
          expect.stringContaining("Historical scan exported successfully"),
        );
      },
    );

    it("warns when the export is truncated", async () => {
      const scanId = await scanHistory.saveScan([declaration], 10, 1);
      (
        workspaceState["deprecatedTracker.scanHistory"] as any
      )[0].metadata.totalItems = 999;
      (vscode.window.showSaveDialog as jest.Mock).mockResolvedValue({
        fsPath: "/workspace/out.csv",
      });
      createPanel();
      await messageHandler({
        command: "exportHistoricalScan",
        scanId,
        format: "csv",
      });
      expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
        expect.stringContaining("Export contains"),
      );
    });

    it("errors on unsupported historical formats", async () => {
      const scanId = await scanHistory.saveScan([declaration], 10, 1);
      (vscode.window.showSaveDialog as jest.Mock).mockResolvedValue({
        fsPath: "/workspace/out.xml",
      });
      createPanel();
      await messageHandler({
        command: "exportHistoricalScan",
        scanId,
        format: "xml",
      });
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining("Export failed"),
      );
    });
  });

  describe("clearHistory", () => {
    it("clears history after confirmation", async () => {
      (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue(
        "Clear History",
      );
      createPanel();
      await messageHandler({ command: "clearHistory" });
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        "Scan history cleared successfully.",
      );
      expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ command: "historyMetadata", history: [] }),
      );
    });

    it("keeps history when the user cancels", async () => {
      (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue(
        undefined,
      );
      const clear = jest.spyOn(ScanHistory.prototype, "clearHistory");
      createPanel();
      await messageHandler({ command: "clearHistory" });
      expect(clear).not.toHaveBeenCalled();
    });

    it("reports clear failures", async () => {
      (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue(
        "Clear History",
      );
      jest
        .spyOn(ScanHistory.prototype, "clearHistory")
        .mockRejectedValue(new Error("clear boom"));
      createPanel();
      await messageHandler({ command: "clearHistory" });
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining("Failed to clear history"),
      );
    });
  });

  describe("misc", () => {
    it("exposes current results through the singleton", () => {
      const panel = createPanel();
      panel.updateResults([declaration]);
      expect(MainPanel.getCurrentResults()).toEqual([declaration]);
    });

    it("recovers when reading the filter state throws", async () => {
      (mockContext.workspaceState.get as jest.Mock).mockImplementation(
        (key: string) => {
          if (key === "deprecatedTracker.mainPanel.filters") {
            throw new Error("corrupt state");
          }
          return workspaceState[key];
        },
      );
      createPanel();
      await Promise.resolve();
      expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
    });

    it("logs initialization failures", async () => {
      const error = jest.spyOn(console, "error").mockImplementation(() => {});
      mockPanel.webview.asWebviewUri.mockImplementation(() => {
        throw new Error("no uri");
      });
      createPanel();
      await new Promise((r) => setTimeout(r, 0));
      expect(error).toHaveBeenCalledWith(
        "Failed to initialize webview:",
        expect.any(Error),
      );
      error.mockRestore();
    });

    it("skips falsy entries while disposing", () => {
      const panel = createPanel();
      (panel as any)._disposables.push(undefined);
      panel.dispose();
      expect(mockPanel.dispose).toHaveBeenCalled();
    });
  });
});
