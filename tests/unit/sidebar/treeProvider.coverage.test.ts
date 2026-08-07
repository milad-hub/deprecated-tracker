import * as vscode from "vscode";
import { ScanHistory } from "../../../src/history";
import { DeprecatedItem, Scanner } from "../../../src/scanner";
import { DeprecatedTrackerSidebarProvider } from "../../../src/sidebar";
import { MainPanel } from "../../../src/webview/mainPanel";
import { IgnoreManager } from "../../../src/scanner/ignoreManager";
import { TagsManager } from "../../../src/config/tagsManager";

jest.mock("../../../src/webview/mainPanel", () => ({
  MainPanel: {
    currentPanel: undefined,
    createOrShow: jest.fn(() => ({
      reveal: jest.fn(),
      updateResults: jest.fn(),
    })),
  },
}));

jest.mock("vscode", () => {
  const mockRegisterCommand = jest.fn(() => ({ dispose: jest.fn() }));
  const mockRegisterWebviewViewProvider = jest.fn(() => ({
    dispose: jest.fn(),
  }));
  const progressToken = {
    isCancellationRequested: false,
    onCancellationRequested: jest.fn(),
  };
  const mockWithProgress = jest.fn((_options, task) =>
    task({ report: jest.fn() }, progressToken),
  );
  return {
    ...jest.requireActual("vscode"),
    commands: {
      registerCommand: mockRegisterCommand,
      executeCommand: jest.fn(),
    },
    window: {
      registerWebviewViewProvider: mockRegisterWebviewViewProvider,
      showInformationMessage: jest.fn(),
      showErrorMessage: jest.fn(),
      showWarningMessage: jest.fn(),
      showOpenDialog: jest.fn(),
      withProgress: mockWithProgress,
      createWebviewPanel: jest.fn(),
    },
    workspace: {
      workspaceFolders: undefined,
      onDidChangeConfiguration: jest.fn(),
      getConfiguration: jest.fn(() => ({ get: jest.fn() })),
      asRelativePath: jest.fn((p: string) => p),
    },
    Uri: {
      file: (p: string) => ({ fsPath: p }),
      joinPath: jest.fn((uri, ...parts: string[]) => ({
        fsPath: `${uri.fsPath}/${parts.join("/")}`,
      })),
    },
    ProgressLocation: { Notification: 15 },
    ExtensionMode: { Test: 2 },
    _progressToken: progressToken,
    _mockRegisterCommand: mockRegisterCommand,
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

describe("DeprecatedTrackerSidebarProvider full coverage", () => {
  let mockContext: vscode.ExtensionContext;
  let provider: DeprecatedTrackerSidebarProvider;
  let mockWebviewView: vscode.WebviewView;
  let webview: any;
  let visibilityHandler: (() => void) | undefined;

  const messageHandler = () => (webview as any)._messageHandler;

  const resolve = () => {
    provider.resolveWebviewView(
      mockWebviewView,
      {} as vscode.WebviewViewResolveContext,
      {} as vscode.CancellationToken,
    );
  };

  const commandCallback = (name: string): Function => {
    const mocked = vscode as any;
    const call = mocked._mockRegisterCommand.mock.calls.find(
      (c: unknown[]) => c[0] === name,
    );
    expect(call).toBeDefined();
    return call[1];
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (MainPanel as any).currentPanel = undefined;
    (vscode.workspace as any).workspaceFolders = [
      { uri: { fsPath: "/workspace" }, name: "workspace", index: 0 },
    ];
    (vscode as any)._progressToken.isCancellationRequested = false;
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

    webview = {
      options: {},
      html: "",
      onDidReceiveMessage: jest.fn((callback: any) => {
        webview._messageHandler = callback;
        return { dispose: jest.fn() };
      }),
      postMessage: jest.fn(),
      asWebviewUri: jest.fn((uri: any) => uri),
      cspSource: "test-csp",
    };
    mockWebviewView = {
      webview,
      show: jest.fn(),
      onDidChangeVisibility: jest.fn((cb: any) => {
        visibilityHandler = cb;
        return { dispose: jest.fn() };
      }),
      visible: true,
    } as unknown as vscode.WebviewView;

    provider = new DeprecatedTrackerSidebarProvider(mockContext, new IgnoreManager(mockContext), new TagsManager(mockContext));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("registered commands", () => {
    it("refresh command posts an update", () => {
      resolve();
      commandCallback("deprecatedTracker.refresh")();
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ command: "resultsUpdated" }),
      );
    });

    it("openResults command opens the main panel", async () => {
      await commandCallback("deprecatedTracker.openResults")(declaration);
      expect(MainPanel.createOrShow).toHaveBeenCalled();
    });

    it("hands the panel a getter for the provider's current scanner", async () => {
      await commandCallback("deprecatedTracker.openResults")();
      const getScanner = (MainPanel.createOrShow as jest.Mock).mock.calls[0][4];

      expect(getScanner()).toBe((provider as any).scanner);

      // The panel must observe the replacement, not the scanner it was built with.
      provider.updateConfig({ severity: "error" });
      expect(getScanner()).toBe((provider as any).scanner);
    });

    it("openResults reveals an existing panel", async () => {
      const existing = { reveal: jest.fn(), updateResults: jest.fn() };
      (MainPanel as any).currentPanel = existing;
      await commandCallback("deprecatedTracker.openResults")();
      expect(existing.reveal).toHaveBeenCalled();
      expect(existing.updateResults).toHaveBeenCalled();
    });

    it("updateTreeView command replaces results", () => {
      commandCallback("deprecatedTracker.updateTreeView")([declaration]);
      expect(provider.getCurrentResults()).toEqual([declaration]);
    });

    it("updateTreeView tolerates a palette invocation with no args", () => {
      commandCallback("deprecatedTracker.updateTreeView")(undefined);
      expect(provider.getCurrentResults()).toEqual([]);
    });

    it("refuses to start a second scan while one is running", async () => {
      (provider as any).isScanning = true;
      await provider.scanProject();
      await provider.scanFolder("/workspace/src");
      await provider.scanFile("/workspace/a.ts");
      expect(vscode.window.showWarningMessage).toHaveBeenCalledTimes(3);
      expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
        "A scan is already in progress",
      );
      (provider as any).isScanning = false;
    });
  });

  describe("resolveWebviewView", () => {
    it("disposes stale listeners when re-resolved", () => {
      resolve();
      const firstDisposable = webview.onDidReceiveMessage.mock.results[0].value;
      resolve();
      expect(firstDisposable.dispose).toHaveBeenCalled();
    });

    it("reloads history when the view becomes visible", async () => {
      resolve();
      await messageHandler()({ command: "webviewReady" });
      webview.postMessage.mockClear();
      visibilityHandler!();
      await new Promise((resolveTimer) => setTimeout(resolveTimer, 0));
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ command: "historyData" }),
      );
    });

    it("does not reload history while the view is hidden", () => {
      resolve();
      (mockWebviewView as any).visible = false;
      webview.postMessage.mockClear();
      visibilityHandler!();
      expect(webview.postMessage).not.toHaveBeenCalled();
    });
  });

  describe("message handling", () => {
    beforeEach(resolve);

    it("handles webviewReady by loading history and refreshing", async () => {
      await messageHandler()({ command: "webviewReady" });
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ command: "historyData" }),
      );
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ command: "resultsUpdated" }),
      );
    });

    it("handles scan by starting a project scan", async () => {
      const scan = jest
        .spyOn(provider, "scanProject")
        .mockResolvedValue(undefined);
      await messageHandler()({ command: "scan" });
      expect(scan).toHaveBeenCalled();
    });

    it("handles cancelScan without an active scan", async () => {
      await messageHandler()({ command: "cancelScan" });
    });

    it("handles openResults", async () => {
      await messageHandler()({ command: "openResults" });
      expect(MainPanel.createOrShow).toHaveBeenCalled();
    });

    it("handles openSettings", async () => {
      await messageHandler()({ command: "openSettings" });
      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        "deprecatedTracker.openSettings",
      );
    });

    it("handles ignoreMethod by filtering results", async () => {
      provider.updateResults([declaration, usage]);
      await messageHandler()({
        command: "ignoreMethod",
        filePath: "/workspace/a.ts",
        methodName: "oldMethod",
      });
      expect(provider.getCurrentResults()).toEqual([]);
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        "Ignored method: oldMethod",
      );
    });

    it("handles ignoreFile by filtering results", async () => {
      provider.updateResults([declaration, usage]);
      await messageHandler()({
        command: "ignoreFile",
        filePath: "/workspace/a.ts",
      });
      expect(provider.getCurrentResults()).toEqual([]);
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        expect.stringContaining("Ignored file:"),
      );
    });

    it("handles getHistory", async () => {
      await messageHandler()({ command: "getHistory", limit: 3 });
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ command: "historyData" }),
      );
    });

    it("handles getHistory with the default limit", async () => {
      await messageHandler()({ command: "getHistory" });
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ command: "historyData" }),
      );
    });

    it("handles viewScan for a stored scan", async () => {
      const scanId = await new ScanHistory(mockContext).saveScan(
        [declaration],
        10,
        1,
      );
      await messageHandler()({ command: "viewScan", scanId });
      expect(MainPanel.createOrShow).toHaveBeenCalled();
      expect(provider.getCurrentResults()).toHaveLength(1);
    });

    it("warns when viewScan results were truncated", async () => {
      const history = new ScanHistory(mockContext);
      const scanId = await history.saveScan([declaration], 10, 1);
      const stored = (mockContext.workspaceState.get as jest.Mock)(
        "deprecatedTracker.scanHistory",
      );
      stored[0].metadata.totalItems = 999;
      await messageHandler()({ command: "viewScan", scanId });
      expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
        expect.stringContaining("stored scan results"),
      );
    });

    it("warns when viewScan cannot find the scan", async () => {
      await messageHandler()({ command: "viewScan", scanId: "missing" });
      expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
        "Scan not found in history",
      );
    });

    it("clears history when the user confirms", async () => {
      (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue(
        "Clear History",
      );
      await messageHandler()({ command: "confirmClearHistory" });
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        "Scan history cleared",
      );
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ command: "historyData", history: [] }),
      );
    });

    it("keeps history when the user cancels", async () => {
      (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue(
        undefined,
      );
      webview.postMessage.mockClear();
      await messageHandler()({ command: "confirmClearHistory" });
      expect(vscode.window.showInformationMessage).not.toHaveBeenCalledWith(
        "Scan history cleared",
      );
    });
  });

  describe("scanProject", () => {
    it("errors when no workspace folder exists", async () => {
      (vscode.workspace as any).workspaceFolders = undefined;
      await provider.scanProject();
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        "No workspace folder found",
      );
    });

    it("scans, saves history, opens the panel, and posts progress", async () => {
      resolve();
      jest
        .spyOn(Scanner.prototype, "scanWorkspace")
        .mockImplementation(async (_ws, onFileScanning) => {
          onFileScanning?.("/workspace/a.ts", 1, 1);
          return [declaration];
        });
      await provider.scanProject();
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ command: "scanStarted" }),
      );
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ command: "scanningFile" }),
      );
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ command: "scanComplete", resultsCount: 1 }),
      );
      expect(MainPanel.createOrShow).toHaveBeenCalled();
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        "Found 1 deprecated item(s)",
      );
    });

    it("reports an empty scan without opening the panel", async () => {
      jest.spyOn(Scanner.prototype, "scanWorkspace").mockResolvedValue([]);
      await provider.scanProject();
      expect(MainPanel.createOrShow).not.toHaveBeenCalled();
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        "No deprecated items found",
      );
    });

    it("shows a cancellation warning and notifies the webview", async () => {
      resolve();
      jest
        .spyOn(Scanner.prototype, "scanWorkspace")
        .mockRejectedValue(new Error("Scan cancelled by user"));
      await provider.scanProject();
      expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
        "Scan cancelled by user",
      );
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ command: "scanCancelled" }),
      );
    });

    // Multi-root aggregation itself lives in Scanner.scanWorkspace and is
    // covered in tests/unit/scanner/scanWorkspace.test.ts; here we only assert
    // the provider hands it every folder.
    it("passes all workspace folders to the scanner in multi-root", async () => {
      resolve();
      const folders = [
        { uri: { fsPath: "/workspace" }, name: "workspace", index: 0 },
        { uri: { fsPath: "/other" }, name: "other", index: 1 },
      ];
      (vscode.workspace as any).workspaceFolders = folders;
      const scanWorkspace = jest
        .spyOn(Scanner.prototype, "scanWorkspace")
        .mockResolvedValue([declaration]);
      await provider.scanProject();
      expect(scanWorkspace).toHaveBeenCalledWith(
        folders,
        expect.any(Function),
        expect.anything(),
      );
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        "Found 1 deprecated item(s)",
      );
    });

    it("reports non-Error scan failures", async () => {
      (vscode.workspace as any).workspaceFolders = [
        { uri: { fsPath: "/workspace" }, name: "workspace", index: 0 },
      ];
      jest.spyOn(Scanner.prototype, "scanWorkspace").mockRejectedValue("boom");
      await provider.scanProject();
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        "Scan failed: Unknown error occurred",
      );
    });

    it("re-throws cancellation even in multi-root scans", async () => {
      (vscode.workspace as any).workspaceFolders = [
        { uri: { fsPath: "/workspace" }, name: "workspace", index: 0 },
        { uri: { fsPath: "/other" }, name: "other", index: 1 },
      ];
      jest
        .spyOn(Scanner.prototype, "scanWorkspace")
        .mockRejectedValue(new Error("Scan cancelled by user"));
      await provider.scanProject();
      expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
        "Scan cancelled by user",
      );
    });

    it("scanFolder targets the workspace folder containing the path", async () => {
      (vscode.workspace as any).workspaceFolders = [
        { uri: { fsPath: "/workspace" }, name: "workspace", index: 0 },
        { uri: { fsPath: "/other" }, name: "other", index: 1 },
      ];
      const spy = jest
        .spyOn(Scanner.prototype, "scanFolder")
        .mockResolvedValue([]);
      await provider.scanFolder("/other/nested");
      expect((spy.mock.calls[0][0] as any).uri.fsPath).toBe("/other");
    });

    it("scanFolder falls back to the first folder for outside paths", async () => {
      const spy = jest
        .spyOn(Scanner.prototype, "scanFolder")
        .mockResolvedValue([]);
      await provider.scanFolder("/elsewhere/nested");
      expect((spy.mock.calls[0][0] as any).uri.fsPath).toBe("/workspace");
    });

    it("scanFile targets the workspace folder containing the file", async () => {
      (vscode.workspace as any).workspaceFolders = [
        { uri: { fsPath: "/workspace" }, name: "workspace", index: 0 },
        { uri: { fsPath: "/other" }, name: "other", index: 1 },
      ];
      const spy = jest
        .spyOn(Scanner.prototype, "scanSpecificFiles")
        .mockResolvedValue([]);
      await provider.scanFile("/other/file.ts");
      expect((spy.mock.calls[0][0] as any).uri.fsPath).toBe("/other");
    });

    it("scanFile falls back to the first folder for outside files", async () => {
      const spy = jest
        .spyOn(Scanner.prototype, "scanSpecificFiles")
        .mockResolvedValue([]);
      await provider.scanFile("/elsewhere/file.ts");
      expect((spy.mock.calls[0][0] as any).uri.fsPath).toBe("/workspace");
    });

    it("shows scan errors", async () => {
      jest
        .spyOn(Scanner.prototype, "scanWorkspace")
        .mockRejectedValue(new Error("no tsconfig"));
      await provider.scanProject();
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        "Scan failed: no tsconfig",
      );
    });

    it("handles non-Error scan failures", async () => {
      jest.spyOn(Scanner.prototype, "scanWorkspace").mockRejectedValue("boom");
      await provider.scanProject();
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        "Scan failed: Unknown error occurred",
      );
    });

    it("wires progress cancellation to the token source", async () => {
      let cancelCallback: (() => void) | undefined;
      (vscode as any)._progressToken.onCancellationRequested.mockImplementation(
        (cb: () => void) => {
          cancelCallback = cb;
        },
      );
      jest
        .spyOn(Scanner.prototype, "scanWorkspace")
        .mockImplementation(async (_ws, _cb, token) => {
          cancelCallback?.();
          expect(token?.isCancellationRequested).toBe(true);
          throw new Error("Scan cancelled by user");
        });
      await provider.scanProject();
      expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
        "Scan cancelled by user",
      );
    });

    it("handles cancelScan while a scan is active", async () => {
      resolve();
      jest
        .spyOn(Scanner.prototype, "scanWorkspace")
        .mockImplementation(async () => {
          await messageHandler()({ command: "cancelScan" });
          throw new Error("Scan cancelled by user");
        });
      await provider.scanProject();
      expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
        "Scan cancelled by user",
      );
    });
  });

  describe("scanFolder", () => {
    it("errors when no workspace folder exists", async () => {
      (vscode.workspace as any).workspaceFolders = undefined;
      await provider.scanFolder("/workspace/src");
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        "No workspace folder found",
      );
    });

    it("prompts for a folder when none is given and stops on cancel", async () => {
      (vscode.window.showOpenDialog as jest.Mock).mockResolvedValue(undefined);
      const scan = jest.spyOn(Scanner.prototype, "scanFolder");
      await provider.scanFolder();
      expect(scan).not.toHaveBeenCalled();
    });

    it("scans a picked folder, saves history, and opens the panel", async () => {
      resolve();
      (vscode.window.showOpenDialog as jest.Mock).mockResolvedValue([
        { fsPath: "/workspace/src" },
      ]);
      jest
        .spyOn(Scanner.prototype, "scanFolder")
        .mockImplementation(async (_ws, _folder, onFileScanning) => {
          onFileScanning?.("/workspace/src/a.ts", 1, 1);
          return [declaration];
        });
      await provider.scanFolder();
      expect(MainPanel.createOrShow).toHaveBeenCalled();
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ command: "scanComplete" }),
      );
    });

    it("reports an empty folder scan", async () => {
      jest.spyOn(Scanner.prototype, "scanFolder").mockResolvedValue([]);
      await provider.scanFolder("/workspace/src");
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        expect.stringContaining("No deprecated items found"),
      );
    });

    it("shows a cancellation warning", async () => {
      resolve();
      jest
        .spyOn(Scanner.prototype, "scanFolder")
        .mockRejectedValue(new Error("Scan cancelled by user"));
      await provider.scanFolder("/workspace/src");
      expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
        "Folder scan cancelled by user",
      );
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ command: "scanCancelled" }),
      );
    });

    it("shows folder scan errors", async () => {
      jest
        .spyOn(Scanner.prototype, "scanFolder")
        .mockRejectedValue(new Error("bad folder"));
      await provider.scanFolder("/workspace/src");
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        "Folder scan failed: bad folder",
      );
    });

    it("handles non-Error folder scan failures", async () => {
      jest.spyOn(Scanner.prototype, "scanFolder").mockRejectedValue("boom");
      await provider.scanFolder("/workspace/src");
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        "Folder scan failed: Unknown error occurred",
      );
    });

    it("wires progress cancellation to the token source", async () => {
      let cancelCallback: (() => void) | undefined;
      (vscode as any)._progressToken.onCancellationRequested.mockImplementation(
        (cb: () => void) => {
          cancelCallback = cb;
        },
      );
      jest
        .spyOn(Scanner.prototype, "scanFolder")
        .mockImplementation(async () => {
          cancelCallback?.();
          throw new Error("Scan cancelled by user");
        });
      await provider.scanFolder("/workspace/src");
      expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
        "Folder scan cancelled by user",
      );
    });
  });

  describe("scanFile", () => {
    it("errors when no workspace folder exists", async () => {
      (vscode.workspace as any).workspaceFolders = undefined;
      await provider.scanFile("/workspace/a.ts");
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        "No workspace folder found",
      );
    });

    it("prompts for a file when none is given and stops on cancel", async () => {
      (vscode.window.showOpenDialog as jest.Mock).mockResolvedValue([]);
      const scan = jest.spyOn(Scanner.prototype, "scanSpecificFiles");
      await provider.scanFile();
      expect(scan).not.toHaveBeenCalled();
    });

    it("scans a picked file, saves history, and opens the panel", async () => {
      resolve();
      (vscode.window.showOpenDialog as jest.Mock).mockResolvedValue([
        { fsPath: "/workspace/a.ts" },
      ]);
      jest
        .spyOn(Scanner.prototype, "scanSpecificFiles")
        .mockImplementation(async (_ws, _files, onProgress) => {
          onProgress?.(1, 1);
          return [declaration];
        });
      await provider.scanFile();
      expect(MainPanel.createOrShow).toHaveBeenCalled();
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ command: "scanComplete" }),
      );
    });

    it("reports an empty file scan", async () => {
      jest.spyOn(Scanner.prototype, "scanSpecificFiles").mockResolvedValue([]);
      await provider.scanFile("/workspace/a.ts");
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        expect.stringContaining("No deprecated items found"),
      );
    });

    it("shows file scan errors", async () => {
      jest
        .spyOn(Scanner.prototype, "scanSpecificFiles")
        .mockRejectedValue(new Error("bad file"));
      await provider.scanFile("/workspace/a.ts");
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        "File scan failed: bad file",
      );
    });

    it("handles non-Error file scan failures", async () => {
      jest
        .spyOn(Scanner.prototype, "scanSpecificFiles")
        .mockRejectedValue("boom");
      await provider.scanFile("/workspace/a.ts");
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        "File scan failed: Unknown error occurred",
      );
    });
  });

  describe("scans without a resolved sidebar webview", () => {
    it("scanProject reports progress with no webview attached", async () => {
      jest
        .spyOn(Scanner.prototype, "scanWorkspace")
        .mockImplementation(async (_ws, onFileScanning) => {
          onFileScanning?.("/workspace/a.ts", 1, 1);
          return [declaration];
        });
      await provider.scanProject();
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        "Found 1 deprecated item(s)",
      );
    });

    it("scanFolder reports progress with no webview attached", async () => {
      jest
        .spyOn(Scanner.prototype, "scanFolder")
        .mockImplementation(async (_ws, _folder, onFileScanning) => {
          onFileScanning?.("/workspace/src/a.ts", 1, 1);
          return [declaration];
        });
      await provider.scanFolder("/workspace/src");
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        expect.stringContaining("Found 1 deprecated item(s)"),
      );
    });
  });

  describe("misc", () => {
    it("updateConfig rebuilds the scanner", () => {
      provider.updateConfig({} as any);
      expect(provider.getCurrentResults()).toEqual([]);
    });
  });

  describe("dashboard entry point", () => {
    it("openDashboard runs the statistics command", async () => {
      resolve();
      await messageHandler()({ command: "openDashboard" });
      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        "deprecatedTracker.showStatistics",
      );
    });
  });

  describe("hydrateFromLatestScan", () => {
    it("loads the latest stored scan when nothing is displayed", async () => {
      jest.spyOn(ScanHistory.prototype, "getHistoryMetadata").mockResolvedValue([]);
      jest.spyOn(ScanHistory.prototype, "getHistory").mockResolvedValue([
        {
          metadata: {
            scanId: "s1",
            timestamp: 1,
            totalItems: 1,
            declarationCount: 1,
            usageCount: 0,
            duration: 5,
          },
          results: [declaration],
        },
      ]);
      resolve();
      await messageHandler()({ command: "webviewReady" });
      expect(provider.getCurrentResults()).toEqual([declaration]);
    });

    it("keeps existing results instead of rehydrating", async () => {
      jest.spyOn(ScanHistory.prototype, "getHistoryMetadata").mockResolvedValue([]);
      const getHistory = jest
        .spyOn(ScanHistory.prototype, "getHistory")
        .mockResolvedValue([]);
      provider.updateResults([usage]);
      resolve();
      await messageHandler()({ command: "webviewReady" });
      expect(provider.getCurrentResults()).toEqual([usage]);
      expect(getHistory).not.toHaveBeenCalled();
    });

    it("leaves results empty when history holds no scan", async () => {
      jest.spyOn(ScanHistory.prototype, "getHistoryMetadata").mockResolvedValue([]);
      jest.spyOn(ScanHistory.prototype, "getHistory").mockResolvedValue([]);
      resolve();
      await messageHandler()({ command: "webviewReady" });
      expect(provider.getCurrentResults()).toEqual([]);
    });
  });

  describe("getLatestScanResults", () => {
    it("returns null when there is no history", async () => {
      jest.spyOn(ScanHistory.prototype, "getHistory").mockResolvedValue([]);
      await expect(provider.getLatestScanResults()).resolves.toBeNull();
    });

    it("returns the stored results of the latest scan", async () => {
      jest.spyOn(ScanHistory.prototype, "getHistory").mockResolvedValue([
        {
          metadata: {
            scanId: "s1",
            timestamp: 1,
            totalItems: 1,
            declarationCount: 1,
            usageCount: 0,
            duration: 5,
          },
          results: [declaration],
        },
      ]);
      await expect(provider.getLatestScanResults()).resolves.toEqual([
        declaration,
      ]);
      expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
    });

    it("warns when the stored results are truncated", async () => {
      jest.spyOn(ScanHistory.prototype, "getHistory").mockResolvedValue([
        {
          metadata: {
            scanId: "s1",
            timestamp: 1,
            totalItems: 900,
            declarationCount: 400,
            usageCount: 500,
            duration: 5,
          },
          results: [declaration],
        },
      ]);
      await provider.getLatestScanResults();
      expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
        "Statistics cover 1 of 900 items from the latest scan.",
      );
    });
  });

  describe("getScanTrend", () => {
    it("returns stored scan metadata oldest first", async () => {
      const newest = {
        scanId: "s2",
        timestamp: 200,
        totalItems: 3,
        declarationCount: 1,
        usageCount: 2,
        duration: 5,
      };
      const oldest = {
        scanId: "s1",
        timestamp: 100,
        totalItems: 9,
        declarationCount: 4,
        usageCount: 5,
        duration: 7,
      };
      jest
        .spyOn(ScanHistory.prototype, "getHistoryMetadata")
        .mockResolvedValue([newest, oldest]);
      await expect(provider.getScanTrend()).resolves.toEqual([oldest, newest]);
    });
  });
});
