import * as fs from "fs";

type StubElement = {
  tagName: string;
  children: StubElement[];
  textContent: string;
  className: string;
  listeners: Array<() => void>;
  appendChild: (child: StubElement) => StubElement;
  addEventListener: (type: string, listener: () => void) => void;
};

const createStubElement = (tagName: string): StubElement => {
  let text = "";
  const element: StubElement = {
    tagName,
    children: [],
    get textContent() {
      return text;
    },
    set textContent(value: string) {
      text = value;
      element.children.length = 0;
    },
    className: "",
    listeners: [],
    appendChild: (child) => {
      element.children.push(child);
      return child;
    },
    addEventListener: (_type, listener) => {
      element.listeners.push(listener);
    },
  };
  return element;
};

const runRequirementsAsset = () => {
  const script = fs.readFileSync("src/webview/assets/requirements.js", "utf8");
  const elements = new Map<string, StubElement>();
  const getElementById = (id: string) => {
    if (!elements.has(id)) {
      elements.set(id, createStubElement("div"));
    }
    return elements.get(id) as StubElement;
  };

  let messageListener: ((event: { data: unknown }) => void) | undefined;
  const posted: Array<Record<string, unknown>> = [];

  const documentStub = {
    getElementById,
    createElement: (tagName: string) => createStubElement(tagName),
  };
  const windowStub = {
    addEventListener: (_type: string, listener: (event: any) => void) => {
      messageListener = listener;
    },
  };

  new Function(
    "window",
    "document",
    "acquireVsCodeApi",
    script,
  )(windowStub, documentStub, () => ({
    postMessage: (message: Record<string, unknown>) => posted.push(message),
  }));

  const send = (requirements: unknown) => {
    messageListener?.({ data: { command: "updateRequirements", requirements } });
  };

  return { send, getElementById, posted };
};

const requirement = (overrides: Record<string, unknown> = {}) => ({
  id: "typescriptConfig",
  label: "tsconfig.json found",
  detail: "No config found",
  met: false,
  blocking: true,
  requiresRestart: false,
  remedy: "Add a tsconfig.json",
  action: "createTsconfig",
  ...overrides,
});

const collect = (element: StubElement): StubElement[] => [
  element,
  ...element.children.flatMap(collect),
];

const textOf = (root: StubElement, className: string): string[] =>
  collect(root)
    .filter((element) => element.className.split(" ").includes(className))
    .map((element) => element.textContent);

describe("requirements webview asset", () => {
  it("announces readiness on load", () => {
    const { posted } = runRequirementsAsset();
    expect(posted).toEqual([{ command: "webviewReady" }]);
  });

  it("summarises an all-clear list", () => {
    const { send, getElementById } = runRequirementsAsset();
    send([requirement({ met: true, detail: "2 config files found" })]);

    expect(getElementById("requirements-summary").textContent).toBe(
      "All requirements met — the extension is ready to scan.",
    );
    expect(getElementById("requirements-summary").className).toContain(
      "requirements-ok",
    );
    const list = getElementById("requirements-list");
    expect(textOf(list, "requirement-status")).toEqual(["✅"]);
    expect(textOf(list, "requirement-remedy")).toEqual([]);
    expect(textOf(list, "requirement-action")).toEqual([]);
  });

  it("counts the unmet requirements and shows their remedies", () => {
    const { send, getElementById } = runRequirementsAsset();
    send([requirement(), requirement({ id: "other", met: true })]);

    expect(getElementById("requirements-summary").textContent).toBe(
      "1 of 2 requirements need your attention.",
    );
    expect(getElementById("requirements-summary").className).toContain(
      "requirements-blocked",
    );
    const list = getElementById("requirements-list");
    expect(textOf(list, "requirement-remedy")).toEqual(["Add a tsconfig.json"]);
    expect(textOf(list, "requirement-action")).toEqual(["Create tsconfig.json"]);
    expect(textOf(list, "requirement-restart")).toEqual([]);
  });

  it("labels each action and flags the ones needing a reload", () => {
    const { send, getElementById } = runRequirementsAsset();
    send([
      requirement({ action: "openFolder" }),
      requirement({ action: "reload", requiresRestart: true }),
      requirement({ action: "somethingNew" }),
      requirement({ action: undefined }),
    ]);

    const list = getElementById("requirements-list");
    expect(textOf(list, "requirement-action")).toEqual([
      "Open Folder...",
      "Reload Window",
      "Fix",
    ]);
    expect(textOf(list, "requirement-restart")).toHaveLength(1);
  });

  it("asks the extension to run the action behind a button", () => {
    const { send, getElementById, posted } = runRequirementsAsset();
    send([requirement()]);

    const button = collect(getElementById("requirements-list")).find(
      (element) => element.tagName === "button",
    )!;
    button.listeners.forEach((listener) => listener());

    expect(posted).toContainEqual({
      command: "runRequirementAction",
      action: "createTsconfig",
    });
  });

  it("re-checks on demand and replaces the previous rows", () => {
    const { send, getElementById, posted } = runRequirementsAsset();
    send([requirement(), requirement({ id: "second" })]);
    send([requirement()]);
    expect(getElementById("requirements-list").children).toHaveLength(1);

    getElementById("requirements-recheck").listeners.forEach((listener) =>
      listener(),
    );
    expect(posted).toContainEqual({ command: "refreshRequirements" });
  });

  it("tolerates an empty payload", () => {
    const { send, getElementById } = runRequirementsAsset();
    send(undefined);
    expect(getElementById("requirements-summary").textContent).toBe(
      "All requirements met — the extension is ready to scan.",
    );
    expect(getElementById("requirements-list").children).toHaveLength(0);
  });
});
