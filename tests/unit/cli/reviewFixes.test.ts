import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { PassThrough, Writable } from "stream";
import { CliOptions } from "../../../src/cli/args";
import { startMcpServer } from "../../../src/cli/mcp/server";
import { sarifUri } from "../../../src/cli/reporters";
import { performScan } from "../../../src/cli/scanCore";
import { collectChangedLineRanges } from "../../../src/scanner/gitChanges";
import { shiftRanges } from "../../../src/utils";

describe("shiftRanges", () => {
  it("moves a staged line down past lines inserted above it", () => {
    expect(
      shiftRanges(
        [{ start: 4, end: 4 }],
        [
          { oldStart: 9, oldCount: 1, newStart: 14, newCount: 1 },
          { oldStart: 0, oldCount: 0, newStart: 1, newCount: 5 },
        ],
      ),
    ).toEqual([{ start: 9, end: 9 }]);
  });

  it("stops at an insertion below the line", () => {
    expect(
      shiftRanges([{ start: 2, end: 2 }], [{ oldStart: 5, oldCount: 0, newStart: 6, newCount: 3 }]),
    ).toEqual([{ start: 2, end: 2 }]);
  });

  it("maps a line edited again to what replaced it, or to nothing when it was deleted", () => {
    expect(
      shiftRanges([{ start: 3, end: 3 }], [{ oldStart: 3, oldCount: 1, newStart: 3, newCount: 2 }]),
    ).toEqual([{ start: 3, end: 4 }]);
    expect(
      shiftRanges([{ start: 3, end: 3 }], [{ oldStart: 3, oldCount: 1, newStart: 2, newCount: 0 }]),
    ).toEqual([]);
  });

  it("shifts by a replaced block above and ignores one below", () => {
    expect(
      shiftRanges(
        [{ start: 10, end: 10 }],
        [
          { oldStart: 2, oldCount: 2, newStart: 2, newCount: 5 },
          { oldStart: 20, oldCount: 1, newStart: 23, newCount: 1 },
        ],
      ),
    ).toEqual([{ start: 13, end: 13 }]);
  });
});

describe("sarifUri", () => {
  const root = path.resolve("/repo");

  it("percent-encodes a path inside the root", () => {
    expect(sarifUri(root, path.join(root, "src", "a b#c.ts"))).toBe("src/a%20b%23c.ts");
  });

  it("gives a file outside the root the file scheme", () => {
    const uri = sarifUri(root, path.resolve("/elsewhere/x.ts"));
    expect(uri.startsWith("file://")).toBe(true);
    expect(uri.endsWith("/elsewhere/x.ts")).toBe(true);
  });

  it("keeps a Windows drive letter as part of the path", () => {
    if (process.platform !== "win32") {
      expect(sarifUri("/repo", "/other/x.ts")).toBe("file:///other/x.ts");
      return;
    }
    expect(sarifUri("C:\\repo", "D:\\other\\x.ts")).toBe("file:///D:/other/x.ts");
  });
});

describe("an explicit --baseline", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "dt-baseline-"));
    fs.writeFileSync(path.join(root, "package.json"), "{}");
    fs.writeFileSync(path.join(root, "tsconfig.json"), '{"include":["src"]}');
    fs.mkdirSync(path.join(root, "src"));
    fs.writeFileSync(path.join(root, "src", "a.ts"), "export const a = 1;\n");
  });

  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  const options = (baselineExplicit: boolean): CliOptions => ({
    root,
    baselinePath: path.join(root, "missing.json"),
    baselineExplicit,
    updateBaseline: false,
    maxNew: 0,
    format: "json",
    annotate: "none",
    failOnAny: false,
    quiet: true,
    help: false,
    version: false,
    files: [],
    staged: false,
    changed: false,
    hook: false,
    wholeFiles: false,
    workingTreeRanges: false,
    projectConfig: true,
  });

  it("fails the run when the named file does not exist", async () => {
    await expect(performScan(options(true), () => undefined)).rejects.toThrow(
      /does not exist/,
    );
  });

  it("still treats a missing default baseline as a first run", async () => {
    await expect(performScan(options(false), () => undefined)).resolves.toMatchObject({
      passed: true,
    });
  });
});

describe("the MCP server under bad input", () => {
  it("answers a non-object frame and keeps serving", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const frames: string[] = [];
    output.on("data", (chunk: Buffer) => frames.push(chunk.toString()));
    const served = startMcpServer({ cwd: "/repo", version: "1", input, output, tools: [] });

    input.write('null\n[1]\n{"jsonrpc":"2.0","id":7,"method":"ping"}\n');
    input.end();
    await served;

    const replies = frames.join("").trim().split("\n").map((line) => JSON.parse(line));
    expect(replies.map((reply) => reply.error?.code ?? reply.id)).toEqual([-32600, -32600, 7]);
  });

  it("keeps serving after writing a reply throws", async () => {
    const input = new PassThrough();
    let calls = 0;
    const output = new Writable({
      write(_chunk, _encoding, callback) {
        callback();
      },
    });
    output.write = ((chunk: string) => {
      calls += 1;
      if (calls <= 2) {
        throw new Error("pipe closed");
      }
      return chunk.length > 0;
    }) as typeof output.write;
    const served = startMcpServer({ cwd: "/repo", version: "1", input, output, tools: [] });

    input.write('{"jsonrpc":"2.0","id":1,"method":"ping"}\n{"jsonrpc":"2.0","id":2,"method":"ping"}\n');
    input.end();
    await served;

    expect(calls).toBeGreaterThanOrEqual(3);
  });
});

describe("collectChangedLineRanges with git itself", () => {
  const repoRoot = path.resolve("/no-such-repo");
  const api = {
    repositories: [{ rootUri: { fsPath: repoRoot }, state: {} }],
  } as never;

  it.each([
    { staged: true, unstaged: false },
    { staged: false, unstaged: true },
  ])("returns no ranges when git has nothing to say (%o)", async (sides) => {
    const ranges = await collectChangedLineRanges(
      api,
      { ...sides, granularity: "lines" },
      [path.join(repoRoot, "a.ts")],
    );
    expect(ranges.size).toBe(0);
  });
});
