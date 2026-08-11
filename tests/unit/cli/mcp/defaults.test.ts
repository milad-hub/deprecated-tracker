import { execFileSync, execSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { PassThrough } from "stream";
import { CLI_EXIT } from "../../../../src/constants";
import { runMcp } from "../../../../src/cli/mcp";
import { SERVER_NAME, install } from "../../../../src/cli/mcp/install";
import { startMcpServer } from "../../../../src/cli/mcp/server";
import { createTools } from "../../../../src/cli/mcp/tools";
import { ScanOutcome } from "../../../../src/cli/scanCore";
import {
  collectWorkingTreeLineRanges,
  listWorkingTreeFiles,
} from "../../../../src/cli/stagedDiff";

// Both spawns, so these stay about the wiring rather than about which one the
// host platform takes. Which is which is platform.test.ts's job.
jest.mock("child_process", () => ({
  execFileSync: jest.fn(),
  execSync: jest.fn(),
}));

// os.homedir is non-configurable, so it cannot be spied on — only replaced.
jest.mock("os", () => ({
  ...jest.requireActual("os"),
  homedir: jest.fn(() => jest.requireActual("os").homedir()),
}));

const execMock = execFileSync as jest.Mock;
const shellMock = execSync as jest.Mock;
const bothSpawns = (behaviour: () => string): void => {
  execMock.mockImplementation(behaviour);
  shellMock.mockImplementation(behaviour);
};
const homedirMock = os.homedir as jest.Mock;

afterEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

describe("the default git runner", () => {
  it("shells out to git for the working-tree list", () => {
    execMock.mockReturnValue("src/a.ts\0");

    listWorkingTreeFiles("/repo");

    expect(execMock).toHaveBeenCalledWith(
      "git",
      ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"],
      expect.objectContaining({ cwd: "/repo" }),
    );
  });

  it("shells out to git for the working-tree diff", () => {
    execMock.mockReturnValue("");

    collectWorkingTreeLineRanges(["a.ts"], "/repo");

    expect(execMock).toHaveBeenCalledWith(
      "git",
      ["diff", "--unified=0", "--no-color", "--", "a.ts"],
      expect.objectContaining({ cwd: "/repo" }),
    );
  });
});

describe("server defaults", () => {
  it("builds its own tool list when none is injected", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const frames: string[] = [];
    output.on("data", (chunk: Buffer) => frames.push(chunk.toString()));

    const served = startMcpServer({ cwd: "/repo", version: "9.9.9", input, output });
    input.write('{"jsonrpc":"2.0","id":1,"method":"tools/list"}\n');
    input.end();
    await served;

    const listed = JSON.parse(frames.join("")).result.tools as { name: string }[];
    expect(listed.map((tool) => tool.name)).toEqual([
      "scan_project",
      "scan_changes",
      "scan_files",
    ]);
  });

  // stdout carries protocol frames only; anything else desyncs the client.
  it("defaults its streams to the process ones", async () => {
    const input = new PassThrough();
    const write = jest
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    input.end();

    await startMcpServer({ cwd: "/repo", version: "9.9.9", input, tools: [] });

    expect(write).not.toHaveBeenCalled();
  });
});

describe("tool defaults", () => {
  it("reports config warnings on stderr, not stdout", async () => {
    const stderr = jest
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    const scan = jest.fn().mockImplementation(async (_options, warn) => {
      warn("config is off");
      return {
        config: {},
        targets: [],
        items: [],
        comparison: {
          hasBaseline: false,
          total: 0,
          baselineTotal: 0,
          delta: 0,
          risenFiles: [],
        },
        passed: true,
        baselineIgnored: false,
        empty: false,
      } as ScanOutcome;
    });

    // Third argument omitted, so the default warn channel is the one used.
    await createTools("/repo", scan)[0].run({});

    expect(stderr).toHaveBeenCalledWith("config is off\n");
  });
});

describe("install defaults", () => {
  it("falls back to the real home directory for user scope", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "dt-home-"));
    homedirMock.mockReturnValue(home);
    const out: string[] = [];

    install("claude-code", "user", {
      cwd: home,
      out: (text) => out.push(text),
      runAgentCli: () => false,
    });

    expect(fs.existsSync(path.join(home, ".claude.json"))).toBe(true);
    fs.rmSync(home, { recursive: true, force: true });
  });

  it("treats a missing agent CLI as a failure and writes the file itself", () => {
    bothSpawns(() => {
      throw new Error("command not found: claude");
    });
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "dt-nocli-"));

    install("claude-code", "project", { cwd, home: cwd, out: () => {} });

    expect(fs.existsSync(path.join(cwd, ".mcp.json"))).toBe(true);
    fs.rmSync(cwd, { recursive: true, force: true });
  });

  it("uses the agent CLI when it succeeds", () => {
    bothSpawns(() => "");
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "dt-cli-ok-"));

    install("claude-code", "project", { cwd, home: cwd, out: () => {} });

    expect(fs.existsSync(path.join(cwd, ".mcp.json"))).toBe(false);
    const spawned = execMock.mock.calls.length > 0 ? execMock : shellMock;
    expect(spawned.mock.calls[0].flat().join(" ")).toContain(
      `claude mcp add ${SERVER_NAME}`,
    );
    fs.rmSync(cwd, { recursive: true, force: true });
  });
});

describe("serving through the router", () => {
  it("starts the server when no subcommand is given", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const frames: string[] = [];
    output.on("data", (chunk: Buffer) => frames.push(chunk.toString()));

    const served = runMcp([], {
      cwd: "/repo",
      version: "9.9.9",
      io: { out: () => {}, err: () => {} },
      serve: { input, output, tools: [] },
    });
    input.write('{"jsonrpc":"2.0","id":1,"method":"ping"}\n');
    input.end();

    expect(await served).toBe(CLI_EXIT.OK);
    expect(JSON.parse(frames.join("")).id).toBe(1);
  });
});
