import * as vscode from "vscode";
import { COMMAND_CHECK_REQUIREMENTS } from "../../src/constants";
import { activate } from "../../src/extension";
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

  it("opens the requirements page when a blocking requirement fails", async () => {
    (vscode.workspace as any).isTrusted = false;
    await activate(mockContext);

    expect(createOrShow).toHaveBeenCalledTimes(1);
    const report = createOrShow.mock.calls[0][2];
    expect(report.unmetBlocking).toBe(true);
  });

  it("never lets a failed requirements check break activation", async () => {
    const consoleWarn = jest.spyOn(console, "warn").mockImplementation();
    (vscode.workspace as any).isTrusted = false;
    createOrShow.mockImplementation(() => {
      throw new Error("no panel");
    });

    await expect(activate(mockContext)).resolves.toBeUndefined();
    expect(consoleWarn).toHaveBeenCalledWith(
      "Requirements check failed:",
      expect.any(Error),
    );
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
