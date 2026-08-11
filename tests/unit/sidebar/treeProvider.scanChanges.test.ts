import * as vscode from "vscode";
import { TagsManager } from "../../../src/config/tagsManager";
import { DeprecatedItem, Scanner } from "../../../src/scanner";
import * as gitChanges from "../../../src/scanner/gitChanges";
import { IgnoreManager } from "../../../src/scanner/ignoreManager";
import { DeprecatedTrackerSidebarProvider } from "../../../src/sidebar";
import { MainPanel } from "../../../src/webview/mainPanel";

jest.mock("../../../src/scanner/gitChanges");

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
  const mockWithProgress = jest.fn((_options, task) =>
    task(
      { report: jest.fn() },
      { isCancellationRequested: false, onCancellationRequested: jest.fn() },
    ),
  );
  return {
    ...jest.requireActual("vscode"),
    commands: {
      registerCommand: jest.fn(() => ({ dispose: jest.fn() })),
      executeCommand: jest.fn(),
    },
    window: {
      registerWebviewViewProvider: jest.fn(() => ({ dispose: jest.fn() })),
      showInformationMessage: jest.fn(),
      showErrorMessage: jest.fn(),
      showWarningMessage: jest.fn(),
      withProgress: mockWithProgress,
      createWebviewPanel: jest.fn(),
    },
    workspace: {
      workspaceFolders: [{ uri: { fsPath: "/workspace" } }],
      onDidChangeConfiguration: jest.fn(),
      getConfiguration: jest.fn(() => ({ get: jest.fn() })),
      asRelativePath: jest.fn((p: string) => p),
    },
    Uri: { file: (p: string) => ({ fsPath: p }) },
    ProgressLocation: { Notification: 15 },
  };
});

const item = (filePath: string, line: number): DeprecatedItem => ({
  name: "oldMethod",
  fileName: filePath.split("/").pop() as string,
  filePath,
  line,
  character: 1,
  kind: "method",
});

/**
 * The scan itself is nearly free — everything worth pinning here is what
 * surrounds it: refusing to run without git, not clearing results when the
 * tree is clean, never writing to history, and being honest about scanning a
 * subset.
 */
describe("DeprecatedTrackerSidebarProvider.scanChanges", () => {
  let provider: DeprecatedTrackerSidebarProvider;
  let mockContext: vscode.ExtensionContext;
  let scanSpy: jest.SpyInstance;
  let saveScanSpy: jest.SpyInstance;

  const gitApi = { repositories: [] } as unknown as gitChanges.GitApi;

  beforeEach(() => {
    jest.clearAllMocks();
    (MainPanel as any).currentPanel = undefined;
    (vscode.workspace as any).workspaceFolders = [
      { uri: { fsPath: "/workspace" } },
    ];

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
      globalState: { get: jest.fn(), update: jest.fn(), keys: jest.fn(() => []) },
      extensionPath: "/test/path",
      extensionUri: { fsPath: "/test/path" },
      extensionMode: 2,
    } as unknown as vscode.ExtensionContext;

    provider = new DeprecatedTrackerSidebarProvider(
      mockContext,
      new IgnoreManager(mockContext),
      new TagsManager(mockContext),
    );

    scanSpy = jest
      .spyOn(Scanner.prototype, "scanWorkspaceFiles")
      .mockResolvedValue([]);
    saveScanSpy = jest.spyOn(
      (provider as any).scanHistory,
      "saveScan",
    ) as jest.SpyInstance;

    (gitChanges.getGitApi as jest.Mock).mockResolvedValue(gitApi);
    (gitChanges.collectChangedFiles as jest.Mock).mockReturnValue([]);
    (gitChanges.collectChangedLineRanges as jest.Mock).mockResolvedValue(
      new Map(),
    );
    (gitChanges.isWithinChangedLines as jest.Mock).mockReturnValue(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("refuses to start while another scan is running", async () => {
    (provider as any).isScanning = true;
    await provider.scanChanges();
    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      "A scan is already in progress",
    );
    expect(gitChanges.getGitApi).not.toHaveBeenCalled();
    (provider as any).isScanning = false;
  });

  it("reports when no workspace folder is open", async () => {
    (vscode.workspace as any).workspaceFolders = undefined;
    await provider.scanChanges();
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      "No workspace folder found",
    );
  });

  it("reports when the workspace has an empty folder list", async () => {
    (vscode.workspace as any).workspaceFolders = [];
    await provider.scanChanges();
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      "No workspace folder found",
    );
  });

  // The Git extension can be disabled; saying "no changes" would be a lie.
  it("reports plainly when the Git extension is unavailable", async () => {
    (gitChanges.getGitApi as jest.Mock).mockResolvedValue(undefined);
    await provider.scanChanges();
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      "The built-in Git extension is not available, so changed files cannot be listed.",
    );
    expect(scanSpy).not.toHaveBeenCalled();
  });

  it("does not clear existing results when nothing has changed", async () => {
    (provider as any).currentResults = [item("/workspace/a.ts", 1)];
    await provider.scanChanges();

    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      "No changed files to scan. Existing results are unchanged.",
    );
    expect(scanSpy).not.toHaveBeenCalled();
    expect((provider as any).currentResults).toHaveLength(1);
  });

  it("scans the changed files across every workspace folder", async () => {
    (vscode.workspace as any).workspaceFolders = [
      { uri: { fsPath: "/workspace" } },
      { uri: { fsPath: "/other" } },
    ];
    (gitChanges.collectChangedFiles as jest.Mock).mockReturnValue([
      "/workspace/a.ts",
      "/other/b.ts",
    ]);
    scanSpy.mockResolvedValue([item("/workspace/a.ts", 3)]);

    await provider.scanChanges();

    expect(scanSpy).toHaveBeenCalledWith(
      ["/workspace", "/other"],
      ["/workspace/a.ts", "/other/b.ts"],
      expect.any(Function),
    );
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      "Scanned 2 changed file(s) — 1 deprecated item(s)",
    );
  });

  it("reports progress as files are scanned", async () => {
    (gitChanges.collectChangedFiles as jest.Mock).mockReturnValue([
      "/workspace/a.ts",
    ]);
    await provider.scanChanges();

    const onProgress = scanSpy.mock.calls[0][2] as (
      current: number,
      total: number,
    ) => void;
    expect(() => {
      onProgress(1, 2);
      onProgress(2, 2);
    }).not.toThrow();
  });

  // getScanTrend plots every entry, and this runs from a button people click
  // all day.
  it("never writes a changed-files scan to history", async () => {
    (gitChanges.collectChangedFiles as jest.Mock).mockReturnValue([
      "/workspace/a.ts",
    ]);
    scanSpy.mockResolvedValue([item("/workspace/a.ts", 3)]);

    await provider.scanChanges();

    expect(saveScanSpy).not.toHaveBeenCalled();
  });

  it("tells the panel it is showing a subset", async () => {
    const panel = { showSubsetNote: jest.fn(), reveal: jest.fn(), updateResults: jest.fn() };
    (MainPanel as any).currentPanel = panel;
    (gitChanges.collectChangedFiles as jest.Mock).mockReturnValue([
      "/workspace/a.ts",
    ]);
    scanSpy.mockResolvedValue([item("/workspace/a.ts", 3)]);

    await provider.scanChanges();

    expect(panel.showSubsetNote).toHaveBeenCalledWith(
      "Scanned 1 changed file(s) — 1 deprecated item(s)",
    );
  });

  // Scanning 26 changed files and finding nothing does not mean the project
  // is clean, and the sidebar used to say exactly that.
  describe("when the changed files contain nothing", () => {
    beforeEach(() => {
      (gitChanges.collectChangedFiles as jest.Mock).mockReturnValue([
        "/workspace/a.ts",
      ]);
      scanSpy.mockResolvedValue([]);
      (provider as any).currentResults = [
        item("/workspace/old.ts", 1),
        item("/workspace/old.ts", 9),
      ];
    });

    it("keeps the previous results rather than replacing them with an empty set", async () => {
      await provider.scanChanges();
      expect((provider as any).currentResults).toHaveLength(2);
    });

    it("keeps the diagnostics that belong to those results", async () => {
      const clear = jest.spyOn((provider as any).diagnosticManager, "clear");
      await provider.scanChanges();
      expect(clear).not.toHaveBeenCalled();
    });

    it("reports what is still viewable, not the empty subset", async () => {
      const post = jest.fn();
      (provider as any).webviewView = { webview: { postMessage: post } };

      await provider.scanChanges();

      expect(post).toHaveBeenCalledWith({
        command: "scanComplete",
        resultsCount: 2,
        message: "Scanned 1 changed file(s) — 0 deprecated item(s)",
      });
    });

    it("does not stamp a subset banner on results from another scan", async () => {
      const panel = {
        showSubsetNote: jest.fn(),
        reveal: jest.fn(),
        updateResults: jest.fn(),
      };
      (MainPanel as any).currentPanel = panel;

      await provider.scanChanges();

      expect(panel.showSubsetNote).not.toHaveBeenCalled();
    });
  });

  it("leaves the results panel closed when nothing was found", async () => {
    (gitChanges.collectChangedFiles as jest.Mock).mockReturnValue([
      "/workspace/a.ts",
    ]);
    scanSpy.mockResolvedValue([]);

    await provider.scanChanges();

    expect(MainPanel.createOrShow).not.toHaveBeenCalled();
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      "Scanned 1 changed file(s) — 0 deprecated item(s)",
    );
  });

  it("surfaces a scan failure without leaving the provider locked", async () => {
    (gitChanges.collectChangedFiles as jest.Mock).mockReturnValue([
      "/workspace/a.ts",
    ]);
    scanSpy.mockRejectedValue(new Error("boom"));

    await provider.scanChanges();

    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      "Changes scan failed: boom",
    );
    expect((provider as any).isScanning).toBe(false);
  });

  it("describes a non-Error failure readably", async () => {
    (gitChanges.collectChangedFiles as jest.Mock).mockReturnValue([
      "/workspace/a.ts",
    ]);
    scanSpy.mockRejectedValue("boom");

    await provider.scanChanges();

    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      "Changes scan failed: Unknown error occurred",
    );
  });

  it("posts scan lifecycle messages to the sidebar webview", async () => {
    const post = jest.fn();
    (provider as any).webviewView = { webview: { postMessage: post } };
    (gitChanges.collectChangedFiles as jest.Mock).mockReturnValue([
      "/workspace/a.ts",
    ]);
    scanSpy.mockResolvedValue([]);

    await provider.scanChanges();

    expect(post).toHaveBeenCalledWith({ command: "scanStarted" });
    expect(post).toHaveBeenCalledWith(
      expect.objectContaining({ command: "scanComplete", resultsCount: 0 }),
    );
  });

  it("posts a failure message to the sidebar webview", async () => {
    const post = jest.fn();
    (provider as any).webviewView = { webview: { postMessage: post } };
    (gitChanges.collectChangedFiles as jest.Mock).mockReturnValue([
      "/workspace/a.ts",
    ]);
    scanSpy.mockRejectedValue(new Error("boom"));

    await provider.scanChanges();

    expect(post).toHaveBeenCalledWith({
      command: "scanFailed",
      message: "boom",
    });
  });

  describe("changed lines only", () => {
    beforeEach(async () => {
      await (provider as any).scanScope.setScope({ granularity: "lines" });
      (gitChanges.collectChangedFiles as jest.Mock).mockReturnValue([
        "/workspace/a.ts",
      ]);
    });

    it("keeps only rows inside a changed hunk and says what it hid", async () => {
      scanSpy.mockResolvedValue([
        item("/workspace/a.ts", 3),
        item("/workspace/a.ts", 40),
      ]);
      (gitChanges.isWithinChangedLines as jest.Mock).mockImplementation(
        (_file: string, line: number) => line === 3,
      );

      await provider.scanChanges();

      expect((provider as any).currentResults).toHaveLength(1);
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        "Scanned 1 changed file(s) — 1 item(s) in changed lines (1 elsewhere in the modified files)",
      );
    });

    it("omits the elsewhere count when the filter hid nothing", async () => {
      scanSpy.mockResolvedValue([item("/workspace/a.ts", 3)]);
      (gitChanges.isWithinChangedLines as jest.Mock).mockReturnValue(true);

      await provider.scanChanges();

      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        "Scanned 1 changed file(s) — 1 item(s) in changed lines",
      );
    });

    it("asks for the ranges under the same scope the files came from", async () => {
      scanSpy.mockResolvedValue([item("/workspace/a.ts", 3)]);

      await provider.scanChanges();

      expect(gitChanges.collectChangedLineRanges).toHaveBeenCalledWith(
        gitApi,
        expect.objectContaining({ granularity: "lines" }),
        ["/workspace/a.ts"],
      );
    });

    it("falls back to the unfiltered results when the api is missing", async () => {
      scanSpy.mockResolvedValue([item("/workspace/a.ts", 3)]);

      const unfiltered = await (provider as any).filterToChangedLines(
        undefined,
        { staged: true, unstaged: true, granularity: "lines" },
        ["/workspace/a.ts"],
        [item("/workspace/a.ts", 3)],
      );

      expect(unfiltered).toHaveLength(1);
      expect(gitChanges.collectChangedLineRanges).not.toHaveBeenCalled();
    });
  });
});
