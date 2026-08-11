import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { CLI_EXIT } from "../../../../src/constants";
import { MCP_USAGE, runMcp } from "../../../../src/cli/mcp";
import { SERVER_NAME } from "../../../../src/cli/mcp/install";

let cwd: string;
let home: string;
let out: string[];
let err: string[];

const invoke = (...argv: string[]): Promise<number> =>
  runMcp(argv, {
    cwd,
    version: "9.9.9",
    io: { out: (text) => out.push(text), err: (text) => err.push(text) },
    installContext: { home, runAgentCli: () => false },
  });

const stdout = (): string => out.join("\n");
const stderr = (): string => err.join("\n");

beforeEach(() => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dt-router-"));
  cwd = path.join(root, "repo");
  home = path.join(root, "home");
  fs.mkdirSync(cwd);
  fs.mkdirSync(home);
  out = [];
  err = [];
});

afterEach(() => {
  fs.rmSync(path.dirname(cwd), { recursive: true, force: true });
});

describe("help", () => {
  it.each([["--help"], ["-h"]])("prints usage for %s", async (flag) => {
    expect(await invoke(flag)).toBe(CLI_EXIT.OK);
    expect(stdout()).toBe(MCP_USAGE);
  });

  it("documents every subcommand and option it accepts", () => {
    expect(MCP_USAGE).toContain("install");
    expect(MCP_USAGE).toContain("uninstall");
    expect(MCP_USAGE).toContain("--agent");
    expect(MCP_USAGE).toContain("--scope");
    expect(MCP_USAGE).toContain("scan_project");
    expect(MCP_USAGE).toContain("scan_changes");
    expect(MCP_USAGE).toContain("scan_files");
  });
});

describe("install", () => {
  it("registers every agent by default", async () => {
    expect(await invoke("install")).toBe(CLI_EXIT.OK);

    expect(fs.existsSync(path.join(cwd, ".mcp.json"))).toBe(true);
    expect(fs.existsSync(path.join(cwd, ".codex", "config.toml"))).toBe(true);
  });

  it("registers only the named agent", async () => {
    await invoke("install", "--agent", "codex");

    expect(fs.existsSync(path.join(cwd, ".mcp.json"))).toBe(false);
    expect(fs.existsSync(path.join(cwd, ".codex", "config.toml"))).toBe(true);
  });

  it("accepts --agent=all", async () => {
    await invoke("install", "--agent=all");

    expect(fs.existsSync(path.join(cwd, ".mcp.json"))).toBe(true);
  });

  it("defaults to project scope", async () => {
    await invoke("install", "--agent", "claude-code");

    expect(fs.existsSync(path.join(cwd, ".mcp.json"))).toBe(true);
    expect(fs.existsSync(path.join(home, ".claude.json"))).toBe(false);
  });

  it("honours --scope user", async () => {
    await invoke("install", "--agent", "claude-code", "--scope", "user");

    expect(fs.existsSync(path.join(home, ".claude.json"))).toBe(true);
    expect(fs.existsSync(path.join(cwd, ".mcp.json"))).toBe(false);
  });

  // Both are easy to read as "the install silently did nothing".
  it("says the agent needs restarting", async () => {
    await invoke("install", "--agent", "codex");

    expect(stdout()).toContain("Restart the agent");
  });

  it("warns about Claude Code's approval prompt for a project install", async () => {
    await invoke("install", "--agent", "claude-code");

    expect(stdout()).toContain("approve a project-scoped server");
  });

  it("does not mention Claude Code's prompt when only Codex was asked for", async () => {
    await invoke("install", "--agent", "codex");

    expect(stdout()).not.toContain("approve a project-scoped server");
  });

  it("does not mention it for a user-scoped install either", async () => {
    await invoke("install", "--agent", "claude-code", "--scope", "user");

    expect(stdout()).not.toContain("approve a project-scoped server");
  });
});

describe("uninstall", () => {
  it("removes what install wrote", async () => {
    await invoke("install");
    out = [];

    expect(await invoke("uninstall")).toBe(CLI_EXIT.OK);
    expect(
      JSON.parse(fs.readFileSync(path.join(cwd, ".mcp.json"), "utf8"))
        .mcpServers,
    ).not.toHaveProperty(SERVER_NAME);
  });

  it("says nothing about restarting", async () => {
    await invoke("uninstall");

    expect(stdout()).not.toContain("Restart the agent");
  });

  it("reports a failure with a usage exit code", async () => {
    fs.mkdirSync(path.join(cwd, ".codex"));
    fs.writeFileSync(
      path.join(cwd, ".codex", "config.toml"),
      `[mcp_servers.${SERVER_NAME}]\ncommand = "hand-rolled"\n`,
      "utf8",
    );

    expect(await invoke("uninstall", "--agent", "codex")).toBe(CLI_EXIT.USAGE);
  });
});

describe("bad input", () => {
  it("rejects an unknown subcommand", async () => {
    expect(await invoke("serve")).toBe(CLI_EXIT.USAGE);
    expect(stderr()).toContain("Unknown mcp subcommand: serve");
  });

  it("rejects an unknown agent", async () => {
    expect(await invoke("install", "--agent", "emacs")).toBe(CLI_EXIT.USAGE);
    expect(stderr()).toContain("--agent must be claude-code, codex or all");
  });

  it("rejects an --agent with no value", async () => {
    expect(await invoke("install", "--agent")).toBe(CLI_EXIT.USAGE);
    expect(stderr()).toContain("--agent must be");
  });

  it("rejects an unknown scope", async () => {
    expect(await invoke("install", "--scope", "global")).toBe(CLI_EXIT.USAGE);
    expect(stderr()).toContain("--scope must be project or user");
  });

  it("rejects a --scope with no value", async () => {
    expect(await invoke("install", "--scope")).toBe(CLI_EXIT.USAGE);
    expect(stderr()).toContain("--scope must be");
  });

  it("rejects an unknown option", async () => {
    expect(await invoke("install", "--force")).toBe(CLI_EXIT.USAGE);
    expect(stderr()).toContain("Unknown option: --force");
  });

  it("writes nothing when the arguments are rejected", async () => {
    await invoke("install", "--agent", "emacs");

    expect(fs.existsSync(path.join(cwd, ".mcp.json"))).toBe(false);
  });
});
