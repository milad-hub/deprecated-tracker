import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  InstallContext,
  SERVER_NAME,
  install,
  uninstall,
} from "../../../../src/cli/mcp/install";

let cwd: string;
let home: string;
let out: string[];

const noAgentCli = (): boolean => false;
const context = (over: Partial<InstallContext> = {}): InstallContext => ({
  cwd,
  home,
  out: (text) => out.push(text),
  runAgentCli: noAgentCli,
  ...over,
});

const read = (...segments: string[]): string =>
  fs.readFileSync(path.join(...segments), "utf8");

beforeEach(() => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dt-mcp-"));
  cwd = path.join(root, "repo");
  home = path.join(root, "home");
  fs.mkdirSync(cwd);
  fs.mkdirSync(home);
  out = [];
});

afterEach(() => {
  fs.rmSync(path.dirname(cwd), { recursive: true, force: true });
});

describe("Claude Code", () => {
  it("prefers the agent's own CLI, with the scope stated explicitly", () => {
    const runAgentCli = jest.fn().mockReturnValue(true);

    install("claude-code", "user", context({ runAgentCli }));

    expect(runAgentCli).toHaveBeenCalledWith("claude", [
      "mcp",
      "add",
      SERVER_NAME,
      "--scope",
      "user",
      "--",
      "npx",
      "-y",
      "deprecated-tracker",
      "mcp",
    ]);
    expect(fs.existsSync(path.join(cwd, ".mcp.json"))).toBe(false);
  });

  it("writes .mcp.json at the repo root when the CLI is missing", () => {
    install("claude-code", "project", context());

    expect(JSON.parse(read(cwd, ".mcp.json"))).toEqual({
      mcpServers: {
        [SERVER_NAME]: {
          type: "stdio",
          command: "npx",
          args: ["-y", "deprecated-tracker", "mcp"],
        },
      },
    });
  });

  it("writes user scope into the home config, not the repo", () => {
    install("claude-code", "user", context());

    expect(fs.existsSync(path.join(cwd, ".mcp.json"))).toBe(false);
    expect(JSON.parse(read(home, ".claude.json")).mcpServers).toHaveProperty(
      SERVER_NAME,
    );
  });

  // ~/.claude.json holds unrelated preferences; clobbering it would be a
  // support ticket about lost settings.
  it("preserves everything else in the file", () => {
    fs.writeFileSync(
      path.join(cwd, ".mcp.json"),
      JSON.stringify({
        mcpServers: { other: { command: "node" } },
        somethingElse: true,
      }),
      "utf8",
    );

    install("claude-code", "project", context());

    const config = JSON.parse(read(cwd, ".mcp.json"));
    expect(Object.keys(config.mcpServers).sort()).toEqual([
      SERVER_NAME,
      "other",
    ]);
    expect(config.somethingElse).toBe(true);
  });

  it("is idempotent", () => {
    install("claude-code", "project", context());
    install("claude-code", "project", context());

    expect(
      Object.keys(JSON.parse(read(cwd, ".mcp.json")).mcpServers),
    ).toEqual([SERVER_NAME]);
  });

  it("tolerates a file with no servers block", () => {
    fs.writeFileSync(path.join(cwd, ".mcp.json"), "{}", "utf8");

    install("claude-code", "project", context());

    expect(JSON.parse(read(cwd, ".mcp.json")).mcpServers).toHaveProperty(
      SERVER_NAME,
    );
  });

  it("tolerates an empty file", () => {
    fs.writeFileSync(path.join(cwd, ".mcp.json"), "   ", "utf8");

    install("claude-code", "project", context());

    expect(JSON.parse(read(cwd, ".mcp.json")).mcpServers).toHaveProperty(
      SERVER_NAME,
    );
  });

  it("refuses to overwrite a file it cannot parse", () => {
    fs.writeFileSync(path.join(cwd, ".mcp.json"), "{ not json", "utf8");

    expect(() => install("claude-code", "project", context())).toThrow(
      "is not valid JSON",
    );
    expect(read(cwd, ".mcp.json")).toBe("{ not json");
  });

  // An array parses fine, but assigning mcpServers to one and stringifying
  // drops the key: the install would report success and register nothing.
  it("refuses a JSON document that is not an object", () => {
    fs.writeFileSync(path.join(cwd, ".mcp.json"), "[]", "utf8");

    expect(() => install("claude-code", "project", context())).toThrow(
      "is not a JSON object",
    );
    expect(read(cwd, ".mcp.json")).toBe("[]");
  });

  it("refuses a JSON null", () => {
    fs.writeFileSync(path.join(cwd, ".mcp.json"), "null", "utf8");

    expect(() => install("claude-code", "project", context())).toThrow(
      "is not a JSON object",
    );
  });

  describe("uninstall", () => {
    it("prefers the agent's own CLI", () => {
      const runAgentCli = jest.fn().mockReturnValue(true);

      uninstall("claude-code", "project", context({ runAgentCli }));

      expect(runAgentCli).toHaveBeenCalledWith("claude", [
        "mcp",
        "remove",
        SERVER_NAME,
        "--scope",
        "project",
      ]);
    });

    it("removes only our entry", () => {
      fs.writeFileSync(
        path.join(cwd, ".mcp.json"),
        JSON.stringify({ mcpServers: { other: { command: "node" } } }),
        "utf8",
      );
      install("claude-code", "project", context());

      uninstall("claude-code", "project", context());

      expect(
        Object.keys(JSON.parse(read(cwd, ".mcp.json")).mcpServers),
      ).toEqual(["other"]);
    });

    it("says so when there is nothing to remove", () => {
      uninstall("claude-code", "project", context());

      expect(out.join("\n")).toContain("Nothing to remove");
    });

    it("says so when the file has other servers but not ours", () => {
      fs.writeFileSync(
        path.join(cwd, ".mcp.json"),
        JSON.stringify({ mcpServers: { other: {} } }),
        "utf8",
      );

      uninstall("claude-code", "project", context());

      expect(out.join("\n")).toContain("Nothing to remove");
    });
  });
});

describe("Codex", () => {
  it("writes the project config inside the repo", () => {
    install("codex", "project", context());

    expect(read(cwd, ".codex", "config.toml")).toContain(
      `[mcp_servers.${SERVER_NAME}]`,
    );
  });

  it("writes the user config in the home directory", () => {
    install("codex", "user", context());

    expect(read(home, ".codex", "config.toml")).toContain(
      `[mcp_servers.${SERVER_NAME}]`,
    );
  });

  // `codex mcp add` writes the user-level file and takes no scope flag, so a
  // project-scoped install must never delegate to it.
  it("never delegates a project-scoped install to the agent CLI", () => {
    const runAgentCli = jest.fn().mockReturnValue(true);

    install("codex", "project", context({ runAgentCli }));

    expect(runAgentCli).not.toHaveBeenCalled();
  });

  it("delegates a user-scoped install when the CLI is there", () => {
    const runAgentCli = jest.fn().mockReturnValue(true);

    install("codex", "user", context({ runAgentCli }));

    expect(runAgentCli).toHaveBeenCalledWith("codex", [
      "mcp",
      "add",
      SERVER_NAME,
      "--",
      "npx",
      "-y",
      "deprecated-tracker",
      "mcp",
    ]);
    expect(fs.existsSync(path.join(home, ".codex", "config.toml"))).toBe(false);
  });

  it("appends to an existing config without disturbing it", () => {
    fs.mkdirSync(path.join(cwd, ".codex"));
    fs.writeFileSync(
      path.join(cwd, ".codex", "config.toml"),
      '[mcp_servers.other]\ncommand = "node"\n',
      "utf8",
    );

    install("codex", "project", context());

    const config = read(cwd, ".codex", "config.toml");
    expect(config).toContain("[mcp_servers.other]");
    expect(config).toContain(`[mcp_servers.${SERVER_NAME}]`);
  });

  it("adds a separating newline when the file does not end in one", () => {
    fs.mkdirSync(path.join(cwd, ".codex"));
    fs.writeFileSync(
      path.join(cwd, ".codex", "config.toml"),
      "[mcp_servers.other]",
      "utf8",
    );

    install("codex", "project", context());

    expect(read(cwd, ".codex", "config.toml")).toContain(
      "[mcp_servers.other]\n",
    );
  });

  it("is idempotent", () => {
    install("codex", "project", context());
    install("codex", "project", context());

    const occurrences = read(cwd, ".codex", "config.toml").split(
      `[mcp_servers.${SERVER_NAME}]`,
    ).length;
    expect(occurrences).toBe(2);
    expect(out.join("\n")).toContain("Already present");
  });

  describe("uninstall", () => {
    it("removes the block it wrote", () => {
      install("codex", "project", context());

      uninstall("codex", "project", context());

      expect(read(cwd, ".codex", "config.toml")).not.toContain(SERVER_NAME);
    });

    it("leaves other sections alone", () => {
      fs.mkdirSync(path.join(cwd, ".codex"));
      fs.writeFileSync(
        path.join(cwd, ".codex", "config.toml"),
        '[mcp_servers.other]\ncommand = "node"\n',
        "utf8",
      );
      install("codex", "project", context());

      uninstall("codex", "project", context());

      expect(read(cwd, ".codex", "config.toml")).toContain(
        "[mcp_servers.other]",
      );
    });

    it("says so when there is nothing to remove", () => {
      uninstall("codex", "project", context());

      expect(out.join("\n")).toContain("Nothing to remove");
    });

    // No TOML parser here, so a hand-edited block is reported rather than
    // guessed at — regex-editing someone's config is how it gets corrupted.
    it("refuses to touch a hand-modified section", () => {
      fs.mkdirSync(path.join(cwd, ".codex"));
      fs.writeFileSync(
        path.join(cwd, ".codex", "config.toml"),
        `[mcp_servers.${SERVER_NAME}]\ncommand = "my-own-build"\n`,
        "utf8",
      );

      const removed = uninstall("codex", "project", context());

      expect(removed).toBe(false);
      expect(out.join("\n")).toContain("Remove it by hand");
      expect(read(cwd, ".codex", "config.toml")).toContain("my-own-build");
    });

    it("delegates a user-scoped removal to the agent CLI", () => {
      const runAgentCli = jest.fn().mockReturnValue(true);

      uninstall("codex", "user", context({ runAgentCli }));

      expect(runAgentCli).toHaveBeenCalledWith("codex", [
        "mcp",
        "remove",
        SERVER_NAME,
      ]);
    });
  });
});

describe("scope isolation", () => {
  // Wiping a user-scope registration because someone cleaned up one project
  // is the kind of surprise that ends trust in an installer.
  it("leaves the user registration alone when a project is uninstalled", () => {
    install("claude-code", "user", context());
    install("claude-code", "project", context());

    uninstall("claude-code", "project", context());

    expect(JSON.parse(read(home, ".claude.json")).mcpServers).toHaveProperty(
      SERVER_NAME,
    );
    expect(JSON.parse(read(cwd, ".mcp.json")).mcpServers).not.toHaveProperty(
      SERVER_NAME,
    );
  });

  it("does the same for Codex", () => {
    install("codex", "user", context());
    install("codex", "project", context());

    uninstall("codex", "project", context());

    expect(read(home, ".codex", "config.toml")).toContain(SERVER_NAME);
    expect(read(cwd, ".codex", "config.toml")).not.toContain(SERVER_NAME);
  });
});

describe("the default agent runner", () => {
  it("reports failure when the agent CLI is not installed", () => {
    // No runAgentCli override: the real one shells out and must fail cleanly
    // for a command that does not exist.
    install("claude-code", "project", { cwd, home, out: (t) => out.push(t) });

    expect(fs.existsSync(path.join(cwd, ".mcp.json"))).toBe(true);
  });
});
