import * as vscode from "vscode";
import { COMMAND_CHECK_REQUIREMENTS } from "../../src/constants";
import { activate } from "../../src/extension";
import { DeprecatedTrackerSidebarProvider } from "../../src/sidebar";
import { RequirementsPanel } from "../../src/webview";

describe("Extension requirements check", () => {
  let mockContext: vscode.ExtensionContext;
  let registeredCommands: Map<string, () => void>;
  let createOrShow: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    (vscode.workspace as any).workspaceFolders = undefined;
    (vscode.workspace as any).isTrusted = true;
    registeredCommands = new Map();
    const extensionUri = vscode.Uri.file("/test/path");
    mockContext = {
      subscriptions: [],
      workspaceState: { get: jest.fn(), update: jest.fn(), keys: jest.fn(() => []) },
      globalState: { get: jest.fn(), update: jest.fn(), keys: jest.fn(() => []) },
      extensionPath: "/test/path",
      extensionUri,
    } as unknown as vscode.ExtensionContext;
    jest
      .spyOn(vscode.commands, "registerCommand")
      .mockImplementation((command: string, callback: any) => {
        registeredCommands.set(command, callback);
        return { dispose: jest.fn() } as vscode.Disposable;
      });
    jest.spyOn(vscode.commands, "executeCommand").mockResolvedValue(undefined);
    jest.spyOn(vscode.window, "showErrorMessage").mockReturnValue(undefined!);
    jest
      .spyOn(vscode.window, "registerWebviewViewProvider")
      .mockReturnValue({ dispose: jest.fn() });
    createOrShow = jest
      .spyOn(RequirementsPanel, "createOrShow")
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("stays quiet when nothing blocking is unmet", async () => {
    await activate(mockContext);
    expect(createOrShow).not.toHaveBeenCalled();
  });

  // Opening an unrelated folder must not raise a page about a tool the user
  // never invoked.
  it("stays quiet at activation even when a blocking requirement fails", async () => {
    (vscode.workspace as any).isTrusted = false;
    await activate(mockContext);
    expect(createOrShow).not.toHaveBeenCalled();
  });

  describe.each([
    ["deprecatedTracker.scan", "scanProject"],
    ["deprecatedTracker.scanFolder", "scanFolder"],
    ["deprecatedTracker.scanFile", "scanFile"],
    ["deprecatedTracker.scanChanges", "scanChanges"],
  ])("%s", (command, method) => {
    it("raises the requirements page instead of scanning", async () => {
      const scan = jest
        .spyOn(DeprecatedTrackerSidebarProvider.prototype, method as any)
        .mockResolvedValue(undefined);
      (vscode.workspace as any).isTrusted = false;
      await activate(mockContext);

      await registeredCommands.get(command)!();

      expect(createOrShow).toHaveBeenCalledTimes(1);
      expect(createOrShow.mock.calls[0][2].unmetBlocking).toBe(true);
      expect(scan).not.toHaveBeenCalled();
    });

    it("scans as usual when nothing is blocking", async () => {
      const scan = jest
        .spyOn(DeprecatedTrackerSidebarProvider.prototype, method as any)
        .mockResolvedValue(undefined);
      (vscode.workspace as any).workspaceFolders = undefined;
      await activate(mockContext);

      await registeredCommands.get(command)!();

      expect(createOrShow).not.toHaveBeenCalled();
      // scanFolder and scanFile stop on their own without a folder open.
      if (method === "scanProject" || method === "scanChanges") {
        expect(scan).toHaveBeenCalled();
      }
    });
  });

  it("never lets a failed requirements check break the command", async () => {
    const consoleWarn = jest.spyOn(console, "warn").mockImplementation();
    const scan = jest
      .spyOn(DeprecatedTrackerSidebarProvider.prototype, "scanProject")
      .mockResolvedValue(undefined);
    (vscode.workspace as any).isTrusted = false;
    createOrShow.mockImplementation(() => {
      throw new Error("no panel");
    });
    await activate(mockContext);

    await expect(
      registeredCommands.get("deprecatedTracker.scan")!(),
    ).resolves.toBeUndefined();
    expect(consoleWarn).toHaveBeenCalledWith(
      "Requirements check failed:",
      expect.any(Error),
    );
    // A check that cannot run must not stand between the user and a scan.
    expect(scan).toHaveBeenCalled();
  });

  it("shows the page on demand through the command", async () => {
    await activate(mockContext);
    expect(createOrShow).not.toHaveBeenCalled();

    registeredCommands.get(COMMAND_CHECK_REQUIREMENTS)!();

    expect(createOrShow).toHaveBeenCalledTimes(1);
    const report = createOrShow.mock.calls[0][2];
    expect(report.requirements.some((entry: { met: boolean }) => !entry.met)).toBe(
      true,
    );
  });
});
