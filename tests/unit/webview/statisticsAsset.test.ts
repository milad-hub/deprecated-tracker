import * as fs from "fs";

type StubElement = {
  tagName: string;
  attributes: Record<string, string>;
  children: StubElement[];
  textContent: string;
  className: string;
  style: Record<string, string>;
  innerHTML: string;
  setAttribute: (name: string, value: string) => void;
  appendChild: (child: StubElement) => StubElement;
  addEventListener: () => void;
  closest: () => StubElement;
};

const createStubElement = (tagName: string): StubElement => {
  let text = "";
  const element: StubElement = {
    tagName,
    attributes: {},
    children: [],
    get textContent() {
      return text;
    },
    set textContent(value: string) {
      text = value;
      element.children.length = 0;
    },
    className: "",
    style: {},
    innerHTML: "",
    setAttribute: (name, value) => {
      element.attributes[name] = value;
    },
    appendChild: (child) => {
      element.children.push(child);
      return child;
    },
    addEventListener: () => undefined,
    closest: () => createStubElement("div"),
  };
  return element;
};

const runStatisticsAsset = () => {
  const script = fs.readFileSync("src/webview/assets/statistics.js", "utf8");
  const elements = new Map<string, StubElement>();
  const getElementById = (id: string) => {
    if (!elements.has(id)) {
      elements.set(id, createStubElement("div"));
    }
    return elements.get(id) as StubElement;
  };

  let messageListener: ((event: { data: unknown }) => void) | undefined;

  const documentStub = {
    getElementById,
    createElement: (tagName: string) => createStubElement(tagName),
    createElementNS: (_ns: string, tagName: string) =>
      createStubElement(tagName),
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
  )(windowStub, documentStub, () => ({ postMessage: () => undefined }));

  const send = (statistics: unknown, trend: unknown) => {
    messageListener?.({
      data: { command: "updateStatistics", statistics, trend },
    });
  };

  return { send, getElementById };
};

const scan = (timestamp: number, usageCount: number) => ({
  scanId: `s${timestamp}`,
  timestamp,
  usageCount,
  totalItems: usageCount,
  declarationCount: 0,
  duration: 1,
});

const statistics = {
  totalItems: 1,
  totalDeclarations: 1,
  totalUsages: 0,
  byKind: {},
  topMostUsed: [],
  hotspotFiles: [],
  quickWins: [],
  needsAttention: [],
};

const collect = (element: StubElement): StubElement[] => [
  element,
  ...element.children.flatMap(collect),
];

const numericAttributes = (root: StubElement) =>
  collect(root)
    .flatMap((element) => Object.entries(element.attributes))
    .filter(([name]) =>
      ["x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r"].includes(name),
    )
    .map(([, value]) => value);

describe("statistics webview trend chart", () => {
  it("hides the trend section when there is no history", () => {
    const { send, getElementById } = runStatisticsAsset();
    send(statistics, []);
    expect(getElementById("trend-section").style.display).toBe("none");
  });

  it("hides the trend section when the trend is absent", () => {
    const { send, getElementById } = runStatisticsAsset();
    send(statistics, undefined);
    expect(getElementById("trend-section").style.display).toBe("none");
  });

  it("states there is nothing to compare for a single scan", () => {
    const { send, getElementById } = runStatisticsAsset();
    send(statistics, [scan(1000, 7)]);
    expect(getElementById("trend-section").style.display).toBe("block");
    expect(getElementById("trend-delta").textContent).toBe(
      "First scan — nothing to compare yet",
    );
  });

  it("reports a decrease as an improvement", () => {
    const { send, getElementById } = runStatisticsAsset();
    send(statistics, [scan(1000, 10), scan(2000, 4)]);
    const delta = getElementById("trend-delta");
    expect(delta.textContent).toBe("▼ 6 since oldest kept scan");
    expect(delta.className).toContain("trend-delta-down");
  });

  it("reports an increase as a regression", () => {
    const { send, getElementById } = runStatisticsAsset();
    send(statistics, [scan(1000, 4), scan(2000, 10)]);
    const delta = getElementById("trend-delta");
    expect(delta.textContent).toBe("▲ 6 since oldest kept scan");
    expect(delta.className).toContain("trend-delta-up");
  });

  it("reports an unchanged count", () => {
    const { send, getElementById } = runStatisticsAsset();
    send(statistics, [scan(1000, 5), scan(2000, 5)]);
    expect(getElementById("trend-delta").textContent).toBe(
      "No change since oldest kept scan",
    );
  });

  it("produces finite coordinates for a flat series", () => {
    const { send, getElementById } = runStatisticsAsset();
    send(statistics, [scan(1000, 5), scan(2000, 5), scan(3000, 5)]);
    const values = numericAttributes(getElementById("trend-chart"));
    expect(values.length).toBeGreaterThan(0);
    values.forEach((value) => expect(Number.isFinite(Number(value))).toBe(true));
  });

  it("produces finite coordinates when every scan is zero", () => {
    const { send, getElementById } = runStatisticsAsset();
    send(statistics, [scan(1000, 0), scan(2000, 0)]);
    const values = numericAttributes(getElementById("trend-chart"));
    expect(values.length).toBeGreaterThan(0);
    values.forEach((value) => expect(Number.isFinite(Number(value))).toBe(true));
  });

  it("skips scans with unusable numbers", () => {
    const { send, getElementById } = runStatisticsAsset();
    send(statistics, [
      { ...scan(1000, 5), usageCount: Number.NaN },
      { ...scan(2000, 8), timestamp: Number.NaN },
      scan(3000, 6),
    ]);
    expect(getElementById("trend-delta").textContent).toBe(
      "First scan — nothing to compare yet",
    );
  });

  it("replaces the previous chart instead of stacking renders", () => {
    const { send, getElementById } = runStatisticsAsset();
    send(statistics, [scan(1000, 10), scan(2000, 6), scan(3000, 8)]);
    send(statistics, [scan(4000, 4), scan(5000, 9)]);
    const drawn = collect(getElementById("trend-chart"));
    expect(drawn.filter((element) => element.tagName === "svg")).toHaveLength(1);
    expect(drawn.filter((element) => element.tagName === "circle")).toHaveLength(
      2,
    );
  });

  it("draws one point per scan and a baseline", () => {
    const { send, getElementById } = runStatisticsAsset();
    send(statistics, [scan(1000, 10), scan(2000, 6), scan(3000, 8)]);
    const drawn = collect(getElementById("trend-chart"));
    expect(drawn.filter((element) => element.tagName === "circle")).toHaveLength(
      3,
    );
    expect(drawn.filter((element) => element.tagName === "line")).toHaveLength(
      1,
    );
    expect(
      drawn.filter((element) => element.tagName === "polyline"),
    ).toHaveLength(1);
  });
});
