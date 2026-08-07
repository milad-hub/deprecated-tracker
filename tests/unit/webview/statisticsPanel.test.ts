import * as vscode from "vscode";
import { MESSAGE_COMMANDS } from "../../../src/constants";
import { DeprecationStatistics } from "../../../src/interfaces";
import { StatisticsPanel } from "../../../src/webview/statisticsPanel";

jest.mock("fs", () => ({
  readFileSync: jest.fn().mockReturnValue("<html>{{scriptUri}}</html>"),
}));

describe("StatisticsPanel", () => {
  it("sends the latest statistics only after the webview is ready", async () => {
    let messageHandler: (message: { command: string }) => Promise<void>;
    const postMessage = jest.fn();
    const webview = {
      html: "",
      cspSource: "test",
      postMessage,
      asWebviewUri: jest.fn((uri) => uri),
      onDidReceiveMessage: jest.fn((handler) => {
        messageHandler = handler;
        return { dispose: jest.fn() };
      }),
    } as unknown as vscode.Webview;
    const panel = {
      webview,
      reveal: jest.fn(),
      dispose: jest.fn(),
      onDidDispose: jest.fn(() => ({ dispose: jest.fn() })),
    } as unknown as vscode.WebviewPanel;
    jest.spyOn(vscode.window, "createWebviewPanel").mockReturnValue(panel);
    (vscode.workspace as unknown as {
      fs: { readFile: jest.Mock };
    }).fs = {
      readFile: jest.fn().mockRejectedValue(new Error("missing compiled template")),
    };
    const context = {
      extensionPath: "/extension",
      extensionUri: vscode.Uri.file("/extension"),
    } as vscode.ExtensionContext;
    const initial = { totalItems: 1 } as DeprecationStatistics;
    const latest = { totalItems: 2 } as DeprecationStatistics;

    StatisticsPanel.createOrShow(context.extensionUri, context, initial);
    StatisticsPanel.currentPanel?.updateStatistics(latest);
    expect(postMessage).not.toHaveBeenCalled();

    await messageHandler!({ command: MESSAGE_COMMANDS.WEBVIEW_READY });
    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenCalledWith({
      command: MESSAGE_COMMANDS.UPDATE_STATISTICS,
      statistics: latest,
      trend: [],
    });

    StatisticsPanel.currentPanel?.dispose();
    jest.restoreAllMocks();
  });
});
