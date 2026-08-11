export interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string };
}

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run: (args: Record<string, unknown>) => Promise<unknown>;
}

export const PROTOCOL_VERSION = "2025-06-18";

const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const INTERNAL_ERROR = -32603;
export const PARSE_ERROR = -32700;

/**
 * The stdio half of MCP, by hand.
 *
 * The official SDK brings express, hono, cors, jose, ajv and zod along with it
 * — an HTTP and OAuth stack this server never reaches, in a package that
 * otherwise installs with no runtime dependencies at all. Over stdio the
 * protocol is a handful of JSON-RPC methods, so the honest trade is to
 * implement those and keep the install clean.
 */
export function handleMessage(
  request: JsonRpcRequest,
  tools: McpTool[],
  serverInfo: { name: string; version: string },
): Promise<JsonRpcResponse | undefined> {
  // A notification has no id and must never be answered — replying to one is a
  // protocol violation that some clients treat as a fatal desync.
  const id = request.id ?? null;
  const isNotification = request.id === undefined;

  switch (request.method) {
    case "initialize":
      return reply(id, isNotification, {
        protocolVersion: requestedVersion(request),
        capabilities: { tools: { listChanged: false } },
        serverInfo,
      });

    case "notifications/initialized":
    case "notifications/cancelled":
      return Promise.resolve(undefined);

    case "ping":
      return reply(id, isNotification, {});

    case "tools/list":
      return reply(id, isNotification, {
        tools: tools.map(({ name, description, inputSchema }) => ({
          name,
          description,
          inputSchema,
        })),
      });

    case "tools/call":
      return callTool(request, tools, id, isNotification);

    default:
      return Promise.resolve(
        isNotification
          ? undefined
          : fail(id, METHOD_NOT_FOUND, `Unknown method: ${request.method}`),
      );
  }
}

async function callTool(
  request: JsonRpcRequest,
  tools: McpTool[],
  id: string | number | null,
  isNotification: boolean,
): Promise<JsonRpcResponse | undefined> {
  const params = request.params ?? {};
  const tool = tools.find((candidate) => candidate.name === params.name);
  if (!tool) {
    return isNotification
      ? undefined
      : fail(id, INVALID_PARAMS, `Unknown tool: ${params.name}`);
  }

  try {
    const result = await tool.run(
      (params.arguments as Record<string, unknown>) ?? {},
    );
    return reply(id, isNotification, {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: result,
    });
  } catch (error) {
    // A failed scan is a failed tool call, not a dead server: exiting here
    // would take the whole agent session down over one bad argument.
    return isNotification
      ? undefined
      : reply(id, false, {
          content: [{ type: "text", text: describeError(error) }],
          isError: true,
        });
  }
}

/**
 * Clients announce the version they speak. Echoing a version we understand
 * keeps older ones working; anything unrecognised gets ours and the client
 * decides whether it can live with it.
 */
function requestedVersion(request: JsonRpcRequest): string {
  const asked = request.params?.protocolVersion;
  return typeof asked === "string" && asked.length > 0
    ? asked
    : PROTOCOL_VERSION;
}

function reply(
  id: string | number | null,
  isNotification: boolean,
  result: unknown,
): Promise<JsonRpcResponse | undefined> {
  return Promise.resolve(
    isNotification ? undefined : { jsonrpc: "2.0" as const, id, result },
  );
}

export function fail(
  id: string | number | null,
  code: number,
  message: string,
): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

export function internalError(
  id: string | number | null,
  error: unknown,
): JsonRpcResponse {
  return fail(id, INTERNAL_ERROR, describeError(error));
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
