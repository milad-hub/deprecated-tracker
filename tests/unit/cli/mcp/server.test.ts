import { PassThrough } from "stream";
import { McpTool } from "../../../../src/cli/mcp/protocol";
import { startMcpServer } from "../../../../src/cli/mcp/server";

const tool = (run: McpTool["run"]): McpTool => ({
  name: "scan_project",
  description: "Scan everything",
  inputSchema: { type: "object" },
  run,
});

interface Session {
  send: (line: string) => void;
  finish: () => Promise<unknown[]>;
}

const session = (tools: McpTool[]): Session => {
  const input = new PassThrough();
  const output = new PassThrough();
  const chunks: string[] = [];
  output.on("data", (chunk: Buffer) => chunks.push(chunk.toString()));

  const served = startMcpServer({
    cwd: "/repo",
    version: "9.9.9",
    input,
    output,
    tools,
  });

  return {
    send: (line) => input.write(line),
    finish: async () => {
      input.end();
      await served;
      return chunks
        .join("")
        .split("\n")
        .filter((line) => line.trim())
        .map((line) => JSON.parse(line));
    },
  };
};

describe("startMcpServer", () => {
  it("answers a request framed as one line", async () => {
    const active = session([tool(async () => ({ ok: true }))]);

    active.send('{"jsonrpc":"2.0","id":1,"method":"ping"}\n');

    expect(await active.finish()).toEqual([
      { jsonrpc: "2.0", id: 1, result: {} },
    ]);
  });

  // A chunk boundary can land anywhere, including mid-token.
  it("reassembles a message split across chunks", async () => {
    const active = session([]);

    active.send('{"jsonrpc":"2.0","id"');
    active.send(':1,"method":"ping"}\n');

    expect(await active.finish()).toHaveLength(1);
  });

  it("handles several messages arriving in one chunk", async () => {
    const active = session([]);

    active.send(
      '{"jsonrpc":"2.0","id":1,"method":"ping"}\n{"jsonrpc":"2.0","id":2,"method":"ping"}\n',
    );

    expect((await active.finish()).map((m) => (m as { id: number }).id)).toEqual([
      1, 2,
    ]);
  });

  it("ignores blank lines between messages", async () => {
    const active = session([]);

    active.send('\n\n{"jsonrpc":"2.0","id":1,"method":"ping"}\n\n');

    expect(await active.finish()).toHaveLength(1);
  });

  it("writes nothing for a notification", async () => {
    const active = session([]);

    active.send('{"jsonrpc":"2.0","method":"notifications/initialized"}\n');

    expect(await active.finish()).toEqual([]);
  });

  it("reports unparseable input as a JSON-RPC parse error", async () => {
    const active = session([]);

    active.send("not json at all\n");

    expect(await active.finish()).toEqual([
      {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "Invalid JSON" },
      },
    ]);
  });

  // Out-of-order replies would pair the wrong result with the wrong id.
  it("answers in the order the requests arrived", async () => {
    const slowFirst = [
      {
        ...tool(async () => {
          await new Promise((resolve) => setTimeout(resolve, 20));
          return { first: true };
        }),
        name: "slow",
      },
      { ...tool(async () => ({ second: true })), name: "fast" },
    ];
    const active = session(slowFirst);

    active.send(
      '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"slow"}}\n',
    );
    active.send(
      '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"fast"}}\n',
    );

    expect((await active.finish()).map((m) => (m as { id: number }).id)).toEqual([
      1, 2,
    ]);
  });

  it("returns an internal error when handling itself throws", async () => {
    const exploding: McpTool[] = [];
    Object.defineProperty(exploding, "find", {
      value: () => {
        throw new Error("handler broke");
      },
    });
    const active = session(exploding);

    active.send(
      '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"x"}}\n',
    );

    expect(await active.finish()).toEqual([
      {
        jsonrpc: "2.0",
        id: 1,
        error: { code: -32603, message: "handler broke" },
      },
    ]);
  });

  it("answers a null-id request that throws", async () => {
    const exploding: McpTool[] = [];
    Object.defineProperty(exploding, "find", {
      value: () => {
        throw new Error("handler broke");
      },
    });
    const active = session(exploding);

    active.send(
      '{"jsonrpc":"2.0","id":null,"method":"tools/call","params":{"name":"x"}}\n',
    );

    expect(await active.finish()).toEqual([
      {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32603, message: "handler broke" },
      },
    ]);
  });

  it("stays silent when handling a notification throws", async () => {
    const exploding: McpTool[] = [];
    Object.defineProperty(exploding, "find", {
      value: () => {
        throw new Error("handler broke");
      },
    });
    const active = session(exploding);

    active.send('{"jsonrpc":"2.0","method":"tools/call","params":{"name":"x"}}\n');

    expect(await active.finish()).toEqual([]);
  });
});
