import * as vscode from "vscode";
import { ConfigReader } from "../../src/config/configReader";
import { activate } from "../../src/extension";
import { DeprecatedItem } from "../../src/interfaces";
import { DeprecatedTrackerSidebarProvider } from "../../src/sidebar";
import { MainPanel, SettingsPanel, StatisticsPanel } from "../../src/webview";

jest.mock("../../src/exporter", () => {
  const saveToFile = jest.fn().mockResolvedValue(undefined);
  const exportToCSV = jest.fn((_results: unknown) => "csv-content");
  const exportToJSON = jest.fn((_results: unknown) => "json-content");
  const exportToMarkdown = jest.fn((_results: unknown) => "md-content");
  const exportDispatch = jest.fn((results: unknown, format: string) => {
    if (format === "csv") return exportToCSV(results);
    if (format === "json") return exportToJSON(results);
    if (format === "markdown") return exportToMarkdown(results);
    throw new Error(`Unsupported format: ${format}`);
  });
  return {
    ResultExporter: jest.fn(() => ({
      saveToFile,
      exportToCSV,
      exportToJSON,
      exportToMarkdown,
      export: exportDispatch,
    })),
    _mocks: { saveToFile, exportToCSV, exportToJSON, exportToMarkdown },
  };
});

const sampleResults: DeprecatedItem[] = [
  {
    name: "oldMethod",
    fileName: "a.ts",
    filePath: "/workspace/a.ts",
    line: 1,
    character: 1,
    kind: "method",
  },
];

describe("Extension commands", () => {
  let mockContext: vscode.ExtensionContext;
  let registeredCommands: Map<string, Function>;

  const run = (command: string, ...args: unknown[]) => {
    const callback = registeredCommands.get(command);
    expect(callback).toBeDefined();
    return callback!(...args);
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (vscode.workspace as any).workspaceFolders = [
      { uri: vscode.Uri.file("/workspace"), name: "workspace", index: 0 },
    ];
    (vscode.window as any).activeTextEditor = undefined;
    registeredCommands = new Map();
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
      asAbsolutePath: (relativePath: string) =>
        vscode.Uri.joinPath(extensionUri, relativePath).fsPath,
    } as unknown as vscode.ExtensionContext;

    jest
      .spyOn(vscode.commands, "registerCommand")
      .mockImplementation((command: string, callback: Function) => {
        registeredCommands.set(command, callback);
        return { dispose: jest.fn() } as vscode.Disposable;
      });
    jest.spyOn(vscode.commands, "executeCommand").mockResolvedValue(undefined);
    (vscode.workspace.createFileSystemWatcher as jest.Mock).mockReturnValue({
      onDidCreate: jest.fn(() => ({ dispose: jest.fn() })),
      onDidChange: jest.fn(() => ({ dispose: jest.fn() })),
      onDidDelete: jest.fn(() => ({ dispose: jest.fn() })),
      dispose: jest.fn(),
    });
    jest
      .spyOn(ConfigReader.prototype, "tryLoadConfiguration")
      .mockResolvedValue({} as any);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe("activation edge cases", () => {
    it("warns and continues when initial configuration load fails", async () => {
      const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
      (ConfigReader.prototype.tryLoadConfiguration as jest.Mock).mockRejectedValue(
        new Error("bad config"),
      );
      await activate(mockContext);
      expect(warn).toHaveBeenCalledWith(
        "Failed to load configuration, using defaults:",
        expect.any(Error),
      );
      warn.mockRestore();
    });

    it("warns when configuration reload fails after a watcher event", async () => {
      jest.useFakeTimers();
      const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
      const handlers: Function[] = [];
      (vscode.workspace.createFileSystemWatcher as jest.Mock).mockReturnValue({
        onDidCreate: jest.fn((cb: Function) => {
          handlers.push(cb);
          return { dispose: jest.fn() };
        }),
        onDidChange: jest.fn(() => ({ dispose: jest.fn() })),
        onDidDelete: jest.fn(() => ({ dispose: jest.fn() })),
        dispose: jest.fn(),
      });
      await activate(mockContext);
      (ConfigReader.prototype.tryLoadConfiguration as jest.Mock).mockRejectedValue(
        new Error("reload boom"),
      );
      handlers[0]();
      handlers[0]();
      jest.advanceTimersByTime(250);
      await Promise.resolve();
      await Promise.resolve();
      expect(warn).toHaveBeenCalledWith(
        "Failed to load configuration, using defaults:",
        expect.any(Error),
      );
      warn.mockRestore();
    });

    it("disposes cleanly when no reload timer is pending", async () => {
      await activate(mockContext);
      for (const subscription of mockContext.subscriptions) {
        (subscription as { dispose?: () => void } | undefined)?.dispose?.();
      }
      expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
    });

    it("clears a pending reload timer on deactivation cleanup", async () => {
      jest.useFakeTimers();
      const handlers: Function[] = [];
      (vscode.workspace.createFileSystemWatcher as jest.Mock).mockReturnValue({
        onDidCreate: jest.fn((cb: Function) => {
          handlers.push(cb);
          return { dispose: jest.fn() };
        }),
        onDidChange: jest.fn(() => ({ dispose: jest.fn() })),
        onDidDelete: jest.fn(() => ({ dispose: jest.fn() })),
        dispose: jest.fn(),
      });
      await activate(mockContext);
      handlers[0]();
      for (const subscription of mockContext.subscriptions) {
        (subscription as { dispose?: () => void } | undefined)?.dispose?.();
      }
      expect(jest.getTimerCount()).toBe(0);
    });
  });

  describe("ignoreFile command", () => {
    it("shows an error when no workspace folder exists", async () => {
      (vscode.workspace as any).workspaceFolders = undefined;
      await activate(mockContext);
      await run("deprecatedTracker.ignoreFile");
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        "No workspace folder found",
      );
    });

    it("rejects a non-file active editor and cancels when no pick is made", async () => {
      (vscode.window as any).activeTextEditor = {
        document: { uri: { scheme: "untitled", fsPath: "/workspace/a.ts" } },
      };
      (vscode.window.showOpenDialog as jest.Mock).mockResolvedValue(undefined);
      await activate(mockContext);
      await run("deprecatedTracker.ignoreFile");
      expect(vscode.window.showOpenDialog).toHaveBeenCalled();
      expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith(
        "deprecatedTracker.scan",
      );
    });

    it("shows an error when the ignore flow throws", async () => {
      (vscode.window as any).activeTextEditor = {
        document: { uri: { scheme: "file", fsPath: "/workspace/a.ts" } },
      };
      (vscode.commands.executeCommand as jest.Mock).mockRejectedValue(
        new Error("boom"),
      );
      await activate(mockContext);
      await run("deprecatedTracker.ignoreFile");
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining("Ignore File failed:"),
      );
    });
  });

  describe("exportResults command", () => {
    it("warns when there are no results", async () => {
      jest.spyOn(MainPanel, "getCurrentResults").mockReturnValue(undefined);
      await activate(mockContext);
      await run("deprecatedTracker.exportResults");
      expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
        "No deprecated items to export. Please run a scan first.",
      );
    });

    it("stops when no format is picked", async () => {
      jest.spyOn(MainPanel, "getCurrentResults").mockReturnValue(sampleResults);
      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue(undefined);
      await activate(mockContext);
      await run("deprecatedTracker.exportResults");
      expect(vscode.window.showSaveDialog).not.toHaveBeenCalled();
    });

    it("stops when the save dialog is cancelled", async () => {
      jest.spyOn(MainPanel, "getCurrentResults").mockReturnValue(sampleResults);
      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue({
        label: "CSV",
        value: "csv",
      });
      (vscode.window.showSaveDialog as jest.Mock).mockResolvedValue(undefined);
      await activate(mockContext);
      await run("deprecatedTracker.exportResults");
      expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
    });

    it.each([
      ["csv", "exportToCSV"],
      ["json", "exportToJSON"],
      ["markdown", "exportToMarkdown"],
    ])("exports %s and saves the file", async (value, exportFn) => {
      jest.spyOn(MainPanel, "getCurrentResults").mockReturnValue(sampleResults);
      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue({
        label: value.toUpperCase(),
        value,
      });
      (vscode.window.showSaveDialog as jest.Mock).mockResolvedValue(
        vscode.Uri.file(`/workspace/out.${value}`),
      );
      await activate(mockContext);
      await run("deprecatedTracker.exportResults");
      const exporterMocks = jest.requireMock("../../src/exporter")._mocks;
      expect(exporterMocks[exportFn]).toHaveBeenCalledWith(sampleResults);
      expect(exporterMocks.saveToFile).toHaveBeenCalled();
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        expect.stringContaining("Results exported successfully"),
      );
    });

    it("opens the AI fix prompt in the results panel instead of saving a file", async () => {
      const showAiFixPrompt = jest.fn();
      jest.spyOn(MainPanel, "getCurrentResults").mockReturnValue(sampleResults);
      (MainPanel as unknown as { currentPanel: unknown }).currentPanel = {
        showAiFixPrompt,
      };
      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue({
        label: "Copy prompt for AI fix",
        value: "ai-prompt",
      });
      await activate(mockContext);
      await run("deprecatedTracker.exportResults");
      expect(showAiFixPrompt).toHaveBeenCalled();
      expect(vscode.window.showSaveDialog).not.toHaveBeenCalled();
      (MainPanel as unknown as { currentPanel: unknown }).currentPanel =
        undefined;
    });

    it("does nothing when the results panel is already gone", async () => {
      jest.spyOn(MainPanel, "getCurrentResults").mockReturnValue(sampleResults);
      (MainPanel as unknown as { currentPanel: unknown }).currentPanel =
        undefined;
      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue({
        label: "Copy prompt for AI fix",
        value: "ai-prompt",
      });
      await activate(mockContext);
      await run("deprecatedTracker.exportResults");
      expect(vscode.window.showSaveDialog).not.toHaveBeenCalled();
      expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
    });

    it("shows an error for an unsupported format", async () => {
      jest.spyOn(MainPanel, "getCurrentResults").mockReturnValue(sampleResults);
      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue({
        label: "XML",
        value: "xml",
      });
      (vscode.window.showSaveDialog as jest.Mock).mockResolvedValue(
        vscode.Uri.file("/workspace/out.xml"),
      );
      await activate(mockContext);
      await run("deprecatedTracker.exportResults");
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining("Export failed:"),
      );
    });
  });

  describe("scanFolder command", () => {
    it("shows an error when no workspace folder exists", async () => {
      (vscode.workspace as any).workspaceFolders = undefined;
      await activate(mockContext);
      await run("deprecatedTracker.scanFolder");
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        "No workspace folder found",
      );
    });

    it("stops when folder selection is cancelled", async () => {
      const scanFolder = jest
        .spyOn(DeprecatedTrackerSidebarProvider.prototype, "scanFolder")
        .mockResolvedValue(undefined);
      (vscode.window.showOpenDialog as jest.Mock).mockResolvedValue(undefined);
      await activate(mockContext);
      await run("deprecatedTracker.scanFolder");
      expect(scanFolder).not.toHaveBeenCalled();
    });

    it("rejects a folder outside the workspace", async () => {
      await activate(mockContext);
      await run("deprecatedTracker.scanFolder", vscode.Uri.file("/elsewhere"));
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        "Selected folder must be within the workspace",
      );
    });

    it("scans a picked folder inside the workspace", async () => {
      const scanFolder = jest
        .spyOn(DeprecatedTrackerSidebarProvider.prototype, "scanFolder")
        .mockResolvedValue(undefined);
      (vscode.window.showOpenDialog as jest.Mock).mockResolvedValue([
        vscode.Uri.file("/workspace/src"),
      ]);
      await activate(mockContext);
      await run("deprecatedTracker.scanFolder");
      expect(scanFolder).toHaveBeenCalledWith(
        vscode.Uri.file("/workspace/src").fsPath,
      );
    });

    it("shows an error when the folder scan throws", async () => {
      jest
        .spyOn(DeprecatedTrackerSidebarProvider.prototype, "scanFolder")
        .mockRejectedValue(new Error("scan boom"));
      await activate(mockContext);
      await run(
        "deprecatedTracker.scanFolder",
        vscode.Uri.file("/workspace/src"),
      );
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining("Folder Scan Error:"),
      );
    });
  });

  describe("scanChanges command", () => {
    it("delegates to the sidebar provider", async () => {
      const scanChanges = jest
        .spyOn(DeprecatedTrackerSidebarProvider.prototype, "scanChanges")
        .mockResolvedValue(undefined);
      await activate(mockContext);
      await run("deprecatedTracker.scanChanges");
      expect(scanChanges).toHaveBeenCalled();
    });

    it("surfaces a failure instead of throwing out of the command", async () => {
      jest
        .spyOn(DeprecatedTrackerSidebarProvider.prototype, "scanChanges")
        .mockRejectedValue(new Error("boom"));
      await activate(mockContext);
      await run("deprecatedTracker.scanChanges");
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        "Changes Scan Error: Error: boom",
      );
    });
  });

  describe("scanFile command", () => {
    it("shows an error when no workspace folder exists", async () => {
      (vscode.workspace as any).workspaceFolders = undefined;
      await activate(mockContext);
      await run("deprecatedTracker.scanFile");
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        "No workspace folder found",
      );
    });

    it("stops when file selection is cancelled", async () => {
      const scanFile = jest
        .spyOn(DeprecatedTrackerSidebarProvider.prototype, "scanFile")
        .mockResolvedValue(undefined);
      (vscode.window.showOpenDialog as jest.Mock).mockResolvedValue([]);
      await activate(mockContext);
      await run("deprecatedTracker.scanFile");
      expect(scanFile).not.toHaveBeenCalled();
    });

    it("rejects a file outside the workspace", async () => {
      await activate(mockContext);
      await run(
        "deprecatedTracker.scanFile",
        vscode.Uri.file("/elsewhere/file.ts"),
      );
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        "Selected file must be within the workspace",
      );
    });

    it("scans a picked file inside the workspace", async () => {
      const scanFile = jest
        .spyOn(DeprecatedTrackerSidebarProvider.prototype, "scanFile")
        .mockResolvedValue(undefined);
      (vscode.window.showOpenDialog as jest.Mock).mockResolvedValue([
        vscode.Uri.file("/workspace/src/a.ts"),
      ]);
      await activate(mockContext);
      await run("deprecatedTracker.scanFile");
      expect(scanFile).toHaveBeenCalledWith(
        vscode.Uri.file("/workspace/src/a.ts").fsPath,
      );
    });

    it("shows an error when the file scan throws", async () => {
      jest
        .spyOn(DeprecatedTrackerSidebarProvider.prototype, "scanFile")
        .mockRejectedValue(new Error("scan boom"));
      await activate(mockContext);
      await run(
        "deprecatedTracker.scanFile",
        vscode.Uri.file("/workspace/src/a.ts"),
      );
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining("File Scan Error:"),
      );
    });
  });

  describe("showStatistics command", () => {
    it("warns when there are no results", async () => {
      jest
        .spyOn(DeprecatedTrackerSidebarProvider.prototype, "getLatestScanResults")
        .mockResolvedValue([]);
      await activate(mockContext);
      await run("deprecatedTracker.showStatistics");
      expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
        "No scan results available. Please run a scan first.",
      );
    });

    it("opens the statistics panel when results exist", async () => {
      jest
        .spyOn(DeprecatedTrackerSidebarProvider.prototype, "getLatestScanResults")
        .mockResolvedValue(sampleResults);
      const createOrShow = jest
        .spyOn(StatisticsPanel, "createOrShow")
        .mockReturnValue(undefined as any);
      await activate(mockContext);
      await run("deprecatedTracker.showStatistics");
      expect(createOrShow).toHaveBeenCalledWith(
        mockContext.extensionUri,
        mockContext,
        expect.objectContaining({ totalItems: 1 }),
        [],
      );
    });

    it("shows an error when statistics fail", async () => {
      jest
        .spyOn(DeprecatedTrackerSidebarProvider.prototype, "getLatestScanResults")
        .mockResolvedValue(sampleResults);
      jest.spyOn(StatisticsPanel, "createOrShow").mockImplementation(() => {
        throw new Error("stats boom");
      });
      await activate(mockContext);
      await run("deprecatedTracker.showStatistics");
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining("Statistics Error:"),
      );
    });
  });

  describe("openSettings command", () => {
    it("shows the settings panel", async () => {
      const show = jest
        .spyOn(SettingsPanel.prototype, "show")
        .mockImplementation(() => {});
      await activate(mockContext);
      run("deprecatedTracker.openSettings");
      expect(show).toHaveBeenCalled();
    });
  });
});
