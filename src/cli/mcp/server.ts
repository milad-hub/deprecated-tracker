import { Readable, Writable } from "stream";
import {
  JsonRpcRequest,
  JsonRpcResponse,
  McpTool,
  PARSE_ERROR,
  fail,
  handleMessage,
  internalError,
} from "./protocol";
import { createTools } from "./tools";

export interface McpServerContext {
  cwd: string;
  version: string;
  input?: Readable;
  output?: Writable;
  tools?: McpTool[];
}

/**
 * Speaks MCP over stdio until the client closes the stream.
 *
 * stdout carries protocol frames and nothing else — every diagnostic goes to
 * stderr. A stray line on stdout desyncs the client, and the failure surfaces
 * as an unexplained disconnect rather than as our bug.
 */
export function startMcpServer(context: McpServerContext): Promise<void> {
  const input = context.input ?? process.stdin;
  const output = context.output ?? process.stdout;
  const tools = context.tools ?? createTools(context.cwd);
  const serverInfo = { name: "deprecated-tracker", version: context.version };

  const send = (response: JsonRpcResponse): void => {
    output.write(`${JSON.stringify(response)}\n`);
  };

  return new Promise((resolve) => {
    let buffer = "";
    // Messages are newline-delimited, and a chunk boundary can land anywhere,
    // so a partial line is held until the rest of it arrives.
    let queue: Promise<void> = Promise.resolve();

    input.setEncoding("utf8");
    input.on("data", (chunk: string) => {
      buffer += chunk;
      let newline = buffer.indexOf("\n");
      while (newline !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line) {
          // Serialised so responses leave in the order the requests arrived.
          queue = queue.then(() => dispatch(line, tools, serverInfo, send));
        }
        newline = buffer.indexOf("\n");
      }
    });

    input.on("end", () => {
      queue.then(resolve, resolve);
    });
  });
}

async function dispatch(
  line: string,
  tools: McpTool[],
  serverInfo: { name: string; version: string },
  send: (response: JsonRpcResponse) => void,
): Promise<void> {
  let request: JsonRpcRequest;
  try {
    request = JSON.parse(line);
  } catch {
    send(fail(null, PARSE_ERROR, "Invalid JSON"));
    return;
  }

  try {
    const response = await handleMessage(request, tools, serverInfo);
    if (response) {
      send(response);
    }
  } catch (error) {
    if (request.id !== undefined) {
      send(internalError(request.id ?? null, error));
    }
  }
}
