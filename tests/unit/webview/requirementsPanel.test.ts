import * as vscode from "vscode";
import { MESSAGE_COMMANDS } from "../../../src/constants";
import { RequirementReport } from "../../../src/interfaces";
import { RequirementsPanel } from "../../../src/webview/requirementsPanel";

jest.mock("fs", () => ({
  readFileSync: jest.fn().mockReturnValue("<html>{{scriptUri}}</html>"),
}));

type Message = { command: string; action?: string };

const workspaceMock = vscode.workspace as unknown as {
  workspaceFolders: Array<{ uri: vscode.Uri }> | undefined;
  isTrusted: boolean | undefined;
  fs: { readFile: jest.Mock; writeFile: jest.Mock; stat: jest.Mock };
};

let postMessage: jest.Mock;
let reveal: jest.Mock;
let send: (message: Message) => Promise<void>;
let disposeHandler: () => void;
let context: vscode.ExtensionContext;

const report = (): RequirementReport => ({
  requirements: [
    {
      id: "typescriptConfig",
      label: "tsconfig",
      detail: "missing",
      met: false,
      blocking: true,
      requiresRestart: false,
      remedy: "add one",
      action: "createTsconfig",
    },
  ],
  unmetBlocking: true,
});

function createPanel(webviewOverrides: Record<string, unknown> = {}): void {
  postMessage = jest.fn();
  reveal = jest.fn();
  const webview = {
    html: "",
    cspSource: "test",
    postMessage,
    asWebviewUri: jest.fn((uri) => uri),
    onDidReceiveMessage: jest.fn(
      (handler, _thisArg?: unknown, disposables?: Array<{ dispose: jest.Mock }>) => {
        send = handler;
        const disposable = { dispose: jest.fn() };
        disposables?.push(disposable);
        return disposable;
      },
    ),
    ...webviewOverrides,
  } as unknown as vscode.Webview;
  const panel = {
    webview,
    reveal,
    dispose: jest.fn(),
    onDidDispose: jest.fn(
      (
        handler: () => void,
        _thisArg?: unknown,
        disposables?: Array<{ dispose: jest.Mock }>,
      ) => {
        disposeHandler = handler;
        const disposable = { dispose: jest.fn() };
        disposables?.push(disposable);
        return disposable;
      },
    ),
  } as unknown as vscode.WebviewPanel;
  jest.spyOn(vscode.window, "createWebviewPanel").mockReturnValue(panel);
  RequirementsPanel.createOrShow(context.extensionUri, context, report());
}

beforeEach(() => {
  context = {
    extensionPath: "/extension",
    extensionUri: vscode.Uri.file("/extension"),
  } as vscode.ExtensionContext;
  workspaceMock.workspaceFolders = undefined;
  workspaceMock.isTrusted = true;
  workspaceMock.fs.readFile = jest
    .fn()
    .mockRejectedValue(new Error("missing compiled template"));
  workspaceMock.fs.writeFile = jest.fn().mockResolvedValue(undefined);
  workspaceMock.fs.stat = jest.fn().mockRejectedValue(new Error("not found"));
  jest.spyOn(vscode.window, "showErrorMessage").mockReturnValue(undefined!);
  jest.spyOn(vscode.window, "showWarningMessage").mockReturnValue(undefined!);
  jest.spyOn(vscode.window, "showInformationMessage").mockReturnValue(
    undefined!,
  );
  jest.spyOn(vscode.commands, "executeCommand").mockResolvedValue(undefined);
});

afterEach(() => {
  RequirementsPanel.currentPanel?.dispose();
  jest.restoreAllMocks();
});

describe("RequirementsPanel", () => {
  it("holds the report until the webview announces it is ready", async () => {
    createPanel();
    expect(postMessage).not.toHaveBeenCalled();

    await send({ command: MESSAGE_COMMANDS.WEBVIEW_READY });
    expect(postMessage).toHaveBeenCalledWith({
      command: MESSAGE_COMMANDS.UPDATE_REQUIREMENTS,
      requirements: report().requirements,
    });
  });

  it("reveals and re-sends into an already open panel instead of creating a second one", async () => {
    createPanel();
    await send({ command: MESSAGE_COMMANDS.WEBVIEW_READY });
    postMessage.mockClear();
    (vscode.window.createWebviewPanel as jest.Mock).mockClear();

    RequirementsPanel.createOrShow(context.extensionUri, context, {
      requirements: [],
      unmetBlocking: false,
    });

    expect(reveal).toHaveBeenCalled();
    expect(vscode.window.createWebviewPanel).not.toHaveBeenCalled();
    expect(postMessage).toHaveBeenCalledWith({
      command: MESSAGE_COMMANDS.UPDATE_REQUIREMENTS,
      requirements: [],
    });
  });

  it("re-evaluates the requirements on demand", async () => {
    createPanel();
    await send({ command: MESSAGE_COMMANDS.WEBVIEW_READY });
    postMessage.mockClear();

    await send({ command: MESSAGE_COMMANDS.REFRESH_REQUIREMENTS });

    const sent = postMessage.mock.calls[0][0];
    expect(sent.command).toBe(MESSAGE_COMMANDS.UPDATE_REQUIREMENTS);
    expect(sent.requirements.map((entry: { id: string }) => entry.id)).toContain(
      "workspaceFolder",
    );
  });

  it("ignores messages it does not handle", async () => {
    createPanel();
    await send({ command: MESSAGE_COMMANDS.WEBVIEW_READY });
    postMessage.mockClear();

    await send({ command: "somethingElse" });
    expect(postMessage).not.toHaveBeenCalled();
  });

  it("runs the open-folder and reload actions through VS Code commands", async () => {
    createPanel();
    await send({ command: MESSAGE_COMMANDS.WEBVIEW_READY });

    await send({
      command: MESSAGE_COMMANDS.RUN_REQUIREMENT_ACTION,
      action: "openFolder",
    });
    await send({
      command: MESSAGE_COMMANDS.RUN_REQUIREMENT_ACTION,
      action: "reload",
    });

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      "workbench.action.files.openFolder",
    );
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      "workbench.action.reloadWindow",
    );
  });

  it("reports a failing action instead of throwing", async () => {
    createPanel();
    await send({ command: MESSAGE_COMMANDS.WEBVIEW_READY });
    (vscode.commands.executeCommand as jest.Mock).mockRejectedValueOnce(
      new Error("boom"),
    );

    await send({
      command: MESSAGE_COMMANDS.RUN_REQUIREMENT_ACTION,
      action: "reload",
    });

    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      "Requirement action failed: Error: boom",
    );
  });

  it("writes a starter tsconfig into the first workspace folder", async () => {
    workspaceMock.workspaceFolders = [{ uri: vscode.Uri.file("/project") }];
    createPanel();
    await send({ command: MESSAGE_COMMANDS.WEBVIEW_READY });

    await send({
      command: MESSAGE_COMMANDS.RUN_REQUIREMENT_ACTION,
      action: "createTsconfig",
    });

    expect(workspaceMock.fs.writeFile).toHaveBeenCalledTimes(1);
    const [target, contents] = workspaceMock.fs.writeFile.mock.calls[0];
    expect(target.fsPath).toContain("tsconfig.json");
    expect(new TextDecoder().decode(contents)).toContain('"allowJs": true');
    expect(vscode.window.showInformationMessage).toHaveBeenCalled();
  });

  it("never overwrites an existing tsconfig", async () => {
    workspaceMock.workspaceFolders = [{ uri: vscode.Uri.file("/project") }];
    workspaceMock.fs.stat = jest.fn().mockResolvedValue({ type: 1 });
    createPanel();
    await send({ command: MESSAGE_COMMANDS.WEBVIEW_READY });

    await send({
      command: MESSAGE_COMMANDS.RUN_REQUIREMENT_ACTION,
      action: "createTsconfig",
    });

    expect(workspaceMock.fs.writeFile).not.toHaveBeenCalled();
    expect(vscode.window.showWarningMessage).toHaveBeenCalled();
  });

  it("refuses to create a tsconfig with no folder open", async () => {
    createPanel();
    await send({ command: MESSAGE_COMMANDS.WEBVIEW_READY });

    await send({
      command: MESSAGE_COMMANDS.RUN_REQUIREMENT_ACTION,
      action: "createTsconfig",
    });

    expect(workspaceMock.fs.writeFile).not.toHaveBeenCalled();
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      "Open a folder before creating a tsconfig.json.",
    );
  });

  it("survives a webview that cannot be rendered", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation();
    createPanel({
      asWebviewUri: jest.fn(() => {
        throw new Error("no uri");
      }),
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(consoleError).toHaveBeenCalledWith(
      "Failed to initialize requirements panel webview:",
      expect.any(Error),
    );
  });

  it("keeps the report until the webview is ready, even when reopened", () => {
    createPanel();
    RequirementsPanel.createOrShow(context.extensionUri, context, report());
    expect(postMessage).not.toHaveBeenCalled();
  });

  it("releases its listeners and static handle on dispose", () => {
    createPanel();
    const listeners = (
      RequirementsPanel.currentPanel as unknown as {
        _disposables: Array<{ dispose: jest.Mock }>;
      }
    )._disposables.slice();
    expect(listeners).toHaveLength(2);

    disposeHandler();

    expect(RequirementsPanel.currentPanel).toBeUndefined();
    listeners.forEach((listener) => expect(listener.dispose).toHaveBeenCalled());
  });
});
