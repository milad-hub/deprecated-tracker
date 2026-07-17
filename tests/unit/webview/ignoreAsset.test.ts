import * as fs from "fs";
import * as vm from "vm";

class FakeElement {
  public children: FakeElement[] = [];
  public className = "";
  public textContent = "";
  public value = "";
  public classList = {
    add: (): void => undefined,
    remove: (): void => undefined,
  };
  private readonly _listeners = new Map<string, () => void>();

  public set innerHTML(_value: string) {
    this.children = [];
  }

  public addEventListener(event: string, listener: () => void): void {
    this._listeners.set(event, listener);
  }

  public appendChild(child: FakeElement): void {
    this.children.push(child);
  }

  public click(): void {
    this._listeners.get("click")?.();
  }

  public getAttribute(_name: string): string | null {
    return null;
  }
}

describe("ignore webview asset", () => {
  it("renders ignored files and removes the exact selected path", () => {
    const elements = new Map<string, FakeElement>();
    for (const id of [
      "clearAllBtn",
      "filesList",
      "methodsList",
      "filePatternsList",
      "methodPatternsList",
      "addFilePatternBtn",
      "addMethodPatternBtn",
      "filePatternInput",
      "methodPatternInput",
    ]) {
      elements.set(id, new FakeElement());
    }

    const postedMessages: unknown[] = [];
    let messageHandler:
      | ((event: { data: { command: string; rules: object } }) => void)
      | undefined;
    const windowObject = {
      addEventListener: (
        event: string,
        handler: (event: { data: { command: string; rules: object } }) => void,
      ): void => {
        if (event === "message") messageHandler = handler;
      },
    };
    const documentObject = {
      getElementById: (id: string): FakeElement | undefined => elements.get(id),
      querySelectorAll: (): FakeElement[] => [],
      createElement: (): FakeElement => new FakeElement(),
    };

    vm.runInNewContext(fs.readFileSync("src/webview/assets/ignore.js", "utf8"), {
      acquireVsCodeApi: () => ({
        postMessage: (message: unknown): void => {
          postedMessages.push(message);
        },
      }),
      document: documentObject,
      window: windowObject,
    });

    const filePath = "D:/project/src/legacy.ts";
    messageHandler?.({
      data: {
        command: "updateIgnoreList",
        rules: { files: [filePath], methods: {}, filePatterns: [], methodPatterns: [] },
      },
    });
    const fileRow = elements.get("filesList")?.children[0];
    expect(fileRow?.children[0].textContent).toBe(filePath);

    fileRow?.children[1].click();
    expect(postedMessages).toContainEqual({ command: "removeFileIgnore", filePath });
  });
});
