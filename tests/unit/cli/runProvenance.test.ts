import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { run } from "../../../src/cli";
import { CLI_EXIT } from "../../../src/constants";
import * as scanCore from "../../../src/cli/scanCore";
import { compareToBaseline } from "../../../src/cli/baseline";

jest.mock("../../../src/cli/scanCore", () => {
  const actual = jest.requireActual("../../../src/cli/scanCore");
  return { ...actual, performScan: jest.fn() };
});

const performScan = scanCore.performScan as jest.MockedFunction<
  typeof scanCore.performScan
>;

let root: string;
let out: string[];

const io = {
  out: (text: string) => out.push(text),
  err: () => undefined,
};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "dt-prov-"));
  out = [];
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  jest.clearAllMocks();
});

describe("provenance over a config that defines nothing", () => {
  it("reports zero of each rather than nothing at all", async () => {
    performScan.mockResolvedValue({
      config: {},
      configSource: { kind: "defaults", path: null },
      suppressed: new Map(),
      targets: [],
      items: [],
      comparison: compareToBaseline([], root),
      passed: true,
      baselineIgnored: false,
      empty: false,
    });

    const exit = await run(["."], { cwd: root, io, version: "9.9.9" });

    expect(exit).toBe(CLI_EXIT.OK);
    expect(out.join("\n")).toContain(
      "Config: built-in defaults — 0 exclude pattern(s), 0 suppressed package(s)",
    );
  });
});
