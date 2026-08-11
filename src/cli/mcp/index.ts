import { CLI_EXIT } from "../../constants";
import { CliIo } from "../run";
import {
  AGENTS,
  Agent,
  InstallContext,
  SCOPES,
  Scope,
  install,
  uninstall,
} from "./install";
import { McpServerContext, startMcpServer } from "./server";

export const MCP_USAGE = `deprecated-tracker mcp [install|uninstall] [options]

Runs the scanner as an MCP server over stdio, so a coding agent can call it
directly instead of shelling out. With no subcommand it serves; the agent
launches it, not you.

  deprecated-tracker mcp                     serve on stdio
  deprecated-tracker mcp install             register with every agent found
  deprecated-tracker mcp uninstall           remove those registrations

Options
  --agent <name>   claude-code | codex | all (default: all)
  --scope <where>  project | user (default: project)

Tools exposed
  scan_project     scan a whole project
  scan_changes     scan staged, unstaged and untracked work
  scan_files       scan an explicit list of files`;

export interface McpContext {
  cwd: string;
  version: string;
  io: CliIo;
  installContext?: Partial<InstallContext>;
  /** Streams for the server, injected by tests. Defaults to the process ones. */
  serve?: Pick<McpServerContext, "input" | "output" | "tools">;
}

export async function runMcp(
  argv: string[],
  context: McpContext,
): Promise<number> {
  const [subcommand, ...rest] = argv;

  if (subcommand === "--help" || subcommand === "-h") {
    context.io.out(MCP_USAGE);
    return CLI_EXIT.OK;
  }

  if (subcommand === undefined) {
    await startMcpServer({
      cwd: context.cwd,
      version: context.version,
      ...context.serve,
    });
    return CLI_EXIT.OK;
  }

  if (subcommand !== "install" && subcommand !== "uninstall") {
    context.io.err(`Unknown mcp subcommand: ${subcommand}`);
    context.io.err("");
    context.io.err(MCP_USAGE);
    return CLI_EXIT.USAGE;
  }

  const parsed = parseInstallArgs(rest);
  if (!parsed.ok) {
    context.io.err(parsed.error);
    context.io.err("");
    context.io.err(MCP_USAGE);
    return CLI_EXIT.USAGE;
  }

  const installContext: InstallContext = {
    cwd: context.cwd,
    out: context.io.out,
    ...context.installContext,
  };

  const act = subcommand === "install" ? install : uninstall;
  let allDone = true;
  for (const agent of parsed.agents) {
    if (!act(agent, parsed.scope, installContext)) {
      allDone = false;
    }
  }

  // Both are easy to read as "the install did nothing".
  if (subcommand === "install" && allDone) {
    context.io.out("Restart the agent to pick it up.");
    if (parsed.agents.includes("claude-code") && parsed.scope === "project") {
      context.io.out(
        "Claude Code asks you to approve a project-scoped server the first time it sees one — run /mcp if you miss the prompt.",
      );
    }
  }

  return allDone ? CLI_EXIT.OK : CLI_EXIT.USAGE;
}

type ParsedInstall =
  | { ok: true; agents: Agent[]; scope: Scope }
  | { ok: false; error: string };

function parseInstallArgs(argv: string[]): ParsedInstall {
  let agents: Agent[] = [...AGENTS];
  let scope: Scope = "project";

  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    const separator = argument.indexOf("=");
    const isLongFlag = argument.startsWith("--") && separator > -1;
    const flag = isLongFlag ? argument.slice(0, separator) : argument;
    const value = isLongFlag ? argument.slice(separator + 1) : argv[++index];

    if (flag === "--agent") {
      if (value === "all") {
        agents = [...AGENTS];
        continue;
      }
      if (!value || !AGENTS.includes(value as Agent)) {
        return {
          ok: false,
          error: `--agent must be ${AGENTS.join(", ")} or all`,
        };
      }
      agents = [value as Agent];
      continue;
    }

    if (flag === "--scope") {
      if (!value || !SCOPES.includes(value as Scope)) {
        return { ok: false, error: `--scope must be ${SCOPES.join(" or ")}` };
      }
      scope = value as Scope;
      continue;
    }

    return { ok: false, error: `Unknown option: ${argument}` };
  }

  return { ok: true, agents, scope };
}
