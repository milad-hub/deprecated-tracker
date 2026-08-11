import { execFileSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { PassThrough } from "stream";
import {
  SERVER_NAME,
  install,
  uninstall,
} from "../../../../src/cli/mcp/install";
import { startMcpServer } from "../../../../src/cli/mcp/server";

jest.mock("child_process", () => ({ execFileSync: jest.fn() }));

const execMock = execFileSync as jest.Mock;

const withPlatform = (platform: string, assert: () => void): void => {
  const original = Object.getOwnPropertyDescriptor(process, "platform");
  Object.defineProperty(process, "platform", { value: platform });
  try {
    assert();
  } finally {
    if (original) {
      Object.defineProperty(process, "platform", original);
    }
  }
};

let cwd: string;

beforeEach(() => {
  cwd = fs.mkdtempSync(path.join(os.tmpdir(), "dt-platform-"));
  execMock.mockReset();
});

afterEach(() => {
  fs.rmSync(cwd, { recursive: true, force: true });
});

describe("finding the agent's CLI", () => {
  // claude and codex are .cmd shims on Windows, which execFileSync cannot
  // launch by bare name — without the retry the fallback would run on every
  // Windows machine.
  it("retries with .cmd on Windows", () => {
    execMock.mockImplementation((command: string) => {
      if (command === "claude") {
        throw new Error("spawn claude ENOENT");
      }
      return "";
    });

    withPlatform("win32", () => {
      install("claude-code", "project", { cwd, home: cwd, out: () => {} });
    });

    expect(execMock.mock.calls.map((call) => call[0])).toEqual([
      "claude",
      "claude.cmd",
    ]);
    expect(fs.existsSync(path.join(cwd, ".mcp.json"))).toBe(false);
  });

  it("tries the bare name only, elsewhere", () => {
    execMock.mockImplementation(() => {
      throw new Error("command not found");
    });

    withPlatform("linux", () => {
      install("claude-code", "project", { cwd, home: cwd, out: () => {} });
    });

    expect(execMock.mock.calls.map((call) => call[0])).toEqual(["claude"]);
    expect(fs.existsSync(path.join(cwd, ".mcp.json"))).toBe(true);
  });

  it("stops at the first candidate that works", () => {
    execMock.mockReturnValue("");

    withPlatform("win32", () => {
      install("claude-code", "project", { cwd, home: cwd, out: () => {} });
    });

    expect(execMock).toHaveBeenCalledTimes(1);
    expect(execMock).toHaveBeenCalledWith(
      "claude",
      expect.arrayContaining([SERVER_NAME]),
      expect.anything(),
    );
  });
});

describe("the default runner on every path", () => {
  // Each entry point resolves the runner separately; a missed one would shell
  // out where the caller asked for an injected fake.
  const noCli = (): void => {
    execMock.mockImplementation(() => {
      throw new Error("command not found");
    });
  };

  it("is used by the Claude uninstall", () => {
    noCli();
    fs.writeFileSync(
      path.join(cwd, ".mcp.json"),
      JSON.stringify({ mcpServers: { [SERVER_NAME]: {} } }),
      "utf8",
    );

    uninstall("claude-code", "project", { cwd, home: cwd, out: () => {} });

    expect(execMock).toHaveBeenCalled();
    expect(
      JSON.parse(fs.readFileSync(path.join(cwd, ".mcp.json"), "utf8"))
        .mcpServers,
    ).not.toHaveProperty(SERVER_NAME);
  });

  it("is used by the Codex install", () => {
    noCli();

    install("codex", "user", { cwd, home: cwd, out: () => {} });

    expect(execMock).toHaveBeenCalled();
    expect(fs.existsSync(path.join(cwd, ".codex", "config.toml"))).toBe(true);
  });

  it("is used by the Codex uninstall", () => {
    noCli();
    install("codex", "user", { cwd, home: cwd, out: () => {} });

    uninstall("codex", "user", { cwd, home: cwd, out: () => {} });

    expect(
      fs.readFileSync(path.join(cwd, ".codex", "config.toml"), "utf8"),
    ).not.toContain(SERVER_NAME);
  });
});

describe("server stream defaults", () => {
  it("reads from process.stdin when no input is injected", async () => {
    const fakeStdin = new PassThrough();
    const original = Object.getOwnPropertyDescriptor(process, "stdin");
    Object.defineProperty(process, "stdin", {
      value: fakeStdin,
      configurable: true,
    });

    const output = new PassThrough();
    const frames: string[] = [];
    output.on("data", (chunk: Buffer) => frames.push(chunk.toString()));

    try {
      const served = startMcpServer({
        cwd: "/repo",
        version: "9.9.9",
        output,
        tools: [],
      });
      fakeStdin.write('{"jsonrpc":"2.0","id":1,"method":"ping"}\n');
      fakeStdin.end();
      await served;
    } finally {
      if (original) {
        Object.defineProperty(process, "stdin", original);
      }
    }

    expect(JSON.parse(frames.join("")).id).toBe(1);
  });
});
