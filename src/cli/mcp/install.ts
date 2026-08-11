import { execFileSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

export const SERVER_NAME = "deprecated-tracker";
export const SERVER_COMMAND = "npx";
export const SERVER_ARGS = ["-y", "deprecated-tracker", "mcp"];

export type Agent = "claude-code" | "codex";
export type Scope = "project" | "user";

export const AGENTS: Agent[] = ["claude-code", "codex"];
export const SCOPES: Scope[] = ["project", "user"];

export interface InstallContext {
  cwd: string;
  home?: string;
  out: (text: string) => void;
  /** Injected so tests never shell out to a real agent CLI. */
  runAgentCli?: (command: string, args: string[]) => boolean;
}

/**
 * True when the agent's own CLI accepted the registration.
 *
 * On Windows `claude` and `codex` are usually `.cmd` shims, which execFileSync
 * cannot launch — it needs the real executable, so the bare name fails with
 * ENOENT and the fallback would run on every Windows machine. `.cmd` is tried
 * second rather than using `shell: true`, which would put an argument string
 * through a command interpreter for no benefit.
 */
function defaultRunAgentCli(command: string, args: string[]): boolean {
  const candidates =
    process.platform === "win32" ? [command, `${command}.cmd`] : [command];

  for (const candidate of candidates) {
    try {
      execFileSync(candidate, args, { stdio: "ignore" });
      return true;
    } catch {
      continue;
    }
  }
  return false;
}

export function install(
  agent: Agent,
  scope: Scope,
  context: InstallContext,
): boolean {
  return agent === "claude-code"
    ? installClaude(scope, context)
    : installCodex(scope, context);
}

export function uninstall(
  agent: Agent,
  scope: Scope,
  context: InstallContext,
): boolean {
  return agent === "claude-code"
    ? uninstallClaude(scope, context)
    : uninstallCodex(scope, context);
}

// ---------------------------------------------------------------- Claude Code

function installClaude(scope: Scope, context: InstallContext): boolean {
  const runCli = context.runAgentCli ?? defaultRunAgentCli;
  // `claude mcp add` defaults to `local` scope, which is neither of ours, so
  // the scope is always stated rather than inherited.
  if (
    runCli("claude", [
      "mcp",
      "add",
      SERVER_NAME,
      "--scope",
      scope,
      "--",
      SERVER_COMMAND,
      ...SERVER_ARGS,
    ])
  ) {
    context.out(`Registered with Claude Code (${scope} scope).`);
    return true;
  }

  const target = claudeConfigPath(scope, context);
  const config = readJson(target);
  const servers = (config.mcpServers as Record<string, unknown>) ?? {};
  servers[SERVER_NAME] = {
    type: "stdio",
    command: SERVER_COMMAND,
    args: SERVER_ARGS,
  };
  config.mcpServers = servers;
  writeJson(target, config);
  context.out(`Wrote ${target}`);
  return true;
}

function uninstallClaude(scope: Scope, context: InstallContext): boolean {
  const runCli = context.runAgentCli ?? defaultRunAgentCli;
  if (runCli("claude", ["mcp", "remove", SERVER_NAME, "--scope", scope])) {
    context.out(`Removed from Claude Code (${scope} scope).`);
    return true;
  }

  const target = claudeConfigPath(scope, context);
  const config = readJson(target);
  const servers = config.mcpServers as Record<string, unknown> | undefined;
  if (!servers || !(SERVER_NAME in servers)) {
    context.out(`Nothing to remove in ${target}`);
    return true;
  }

  delete servers[SERVER_NAME];
  writeJson(target, config);
  context.out(`Removed from ${target}`);
  return true;
}

function claudeConfigPath(scope: Scope, context: InstallContext): string {
  return scope === "project"
    ? path.join(context.cwd, ".mcp.json")
    : path.join(homeDir(context), ".claude.json");
}

// ---------------------------------------------------------------------- Codex

function installCodex(scope: Scope, context: InstallContext): boolean {
  const runCli = context.runAgentCli ?? defaultRunAgentCli;
  // `codex mcp add` writes the user-level file and takes no scope flag, so a
  // project-scoped registration has to be written directly.
  if (
    scope === "user" &&
    runCli("codex", [
      "mcp",
      "add",
      SERVER_NAME,
      "--",
      SERVER_COMMAND,
      ...SERVER_ARGS,
    ])
  ) {
    context.out("Registered with Codex (user scope).");
    return true;
  }

  const target = codexConfigPath(scope, context);
  const existing = readText(target);
  if (existing.includes(codexSectionHeader())) {
    context.out(`Already present in ${target}`);
    return true;
  }

  const separator = existing.length > 0 && !existing.endsWith("\n") ? "\n" : "";
  writeText(target, `${existing}${separator}${codexSection()}`);
  context.out(`Wrote ${target}`);
  return true;
}

function uninstallCodex(scope: Scope, context: InstallContext): boolean {
  const runCli = context.runAgentCli ?? defaultRunAgentCli;
  if (scope === "user" && runCli("codex", ["mcp", "remove", SERVER_NAME])) {
    context.out("Removed from Codex (user scope).");
    return true;
  }

  const target = codexConfigPath(scope, context);
  const existing = readText(target);
  if (!existing.includes(codexSectionHeader())) {
    context.out(`Nothing to remove in ${target}`);
    return true;
  }

  // Only the exact block this tool writes is removed. There is no TOML parser
  // here, and editing someone's config with a regex is how config files get
  // corrupted — so anything hand-modified is reported, not guessed at.
  if (!existing.includes(codexSection())) {
    context.out(
      `${target} has a modified [mcp_servers.${SERVER_NAME}] section. Remove it by hand.`,
    );
    return false;
  }

  writeText(
    target,
    existing.replace(codexSection(), "").replace(/\n{3,}/g, "\n\n"),
  );
  context.out(`Removed from ${target}`);
  return true;
}

function codexConfigPath(scope: Scope, context: InstallContext): string {
  return scope === "project"
    ? path.join(context.cwd, ".codex", "config.toml")
    : path.join(homeDir(context), ".codex", "config.toml");
}

function codexSectionHeader(): string {
  return `[mcp_servers.${SERVER_NAME}]`;
}

function codexSection(): string {
  return `\n${codexSectionHeader()}\ncommand = "${SERVER_COMMAND}"\nargs = ${JSON.stringify(SERVER_ARGS)}\n`;
}

// --------------------------------------------------------------------- shared

function homeDir(context: InstallContext): string {
  return context.home ?? os.homedir();
}

function readJson(target: string): Record<string, unknown> {
  const raw = readText(target);
  if (!raw.trim()) {
    return {};
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // The file is the user's. Overwriting it is never acceptable, so the caller
    // is told rather than quietly losing whatever was in there.
    throw new Error(`${target} is not valid JSON. Fix it or edit it by hand.`);
  }

  // An array parses fine but cannot hold `mcpServers` — assigning to one and
  // stringifying drops the key, which would report success and register
  // nothing.
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(
      `${target} is not a JSON object. Fix it or edit it by hand.`,
    );
  }

  return parsed as Record<string, unknown>;
}

function writeJson(target: string, config: Record<string, unknown>): void {
  writeText(target, `${JSON.stringify(config, null, 2)}\n`);
}

function readText(target: string): string {
  return fs.existsSync(target) ? fs.readFileSync(target, "utf8") : "";
}

function writeText(target: string, contents: string): void {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents, "utf8");
}
