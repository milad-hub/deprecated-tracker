import {
  McpTool,
  PROTOCOL_VERSION,
  handleMessage,
} from "../../../../src/cli/mcp/protocol";

const serverInfo = { name: "deprecated-tracker", version: "9.9.9" };

const tool = (run: McpTool["run"]): McpTool => ({
  name: "scan_project",
  description: "Scan everything",
  inputSchema: { type: "object" },
  run,
});

const tools = [tool(async () => ({ passed: true }))];

describe("initialize", () => {
  it("advertises the tools capability and the server identity", async () => {
    const response = await handleMessage(
      { id: 1, method: "initialize", params: {} },
      tools,
      serverInfo,
    );

    expect(response).toEqual({
      jsonrpc: "2.0",
      id: 1,
      result: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo,
      },
    });
  });

  // Echoing the client's version is what keeps an older client working.
  it("echoes the protocol version the client asked for", async () => {
    const response = await handleMessage(
      { id: 1, method: "initialize", params: { protocolVersion: "2024-11-05" } },
      tools,
      serverInfo,
    );

    expect((response?.result as { protocolVersion: string }).protocolVersion).toBe(
      "2024-11-05",
    );
  });

  it("falls back to ours when the client asks for nothing usable", async () => {
    const response = await handleMessage(
      { id: 1, method: "initialize", params: { protocolVersion: "" } },
      tools,
      serverInfo,
    );

    expect((response?.result as { protocolVersion: string }).protocolVersion).toBe(
      PROTOCOL_VERSION,
    );
  });

  it("handles a request with no params at all", async () => {
    const response = await handleMessage(
      { id: 1, method: "initialize" },
      tools,
      serverInfo,
    );

    expect(response?.result).toBeDefined();
  });
});

describe("notifications", () => {
  // Answering a notification is a protocol violation some clients treat as
  // a fatal desync, so silence is the assertion that matters here.
  it.each([
    ["notifications/initialized"],
    ["notifications/cancelled"],
  ])("never answers %s", async (method) => {
    expect(await handleMessage({ method }, tools, serverInfo)).toBeUndefined();
  });

  it("stays silent for an unknown method sent as a notification", async () => {
    expect(
      await handleMessage({ method: "whatever" }, tools, serverInfo),
    ).toBeUndefined();
  });

  it("stays silent for a tools/call notification", async () => {
    expect(
      await handleMessage(
        { method: "tools/call", params: { name: "scan_project" } },
        tools,
        serverInfo,
      ),
    ).toBeUndefined();
  });

  it("stays silent for an unknown tool sent as a notification", async () => {
    expect(
      await handleMessage(
        { method: "tools/call", params: { name: "nope" } },
        tools,
        serverInfo,
      ),
    ).toBeUndefined();
  });

  it("stays silent when a notified tool throws", async () => {
    expect(
      await handleMessage(
        { method: "tools/call", params: { name: "boom" } },
        [
          tool(async () => {
            throw new Error("nope");
          }),
          { ...tools[0], name: "boom", run: async () => {
            throw new Error("nope");
          } },
        ],
        serverInfo,
      ),
    ).toBeUndefined();
  });
});

describe("ping", () => {
  it("answers with an empty result", async () => {
    const response = await handleMessage({ id: 7, method: "ping" }, tools, serverInfo);

    expect(response).toEqual({ jsonrpc: "2.0", id: 7, result: {} });
  });
});

describe("tools/list", () => {
  it("lists name, description and schema but not the implementation", async () => {
    const response = await handleMessage(
      { id: 2, method: "tools/list" },
      tools,
      serverInfo,
    );

    expect(response?.result).toEqual({
      tools: [
        {
          name: "scan_project",
          description: "Scan everything",
          inputSchema: { type: "object" },
        },
      ],
    });
  });
});

describe("tools/call", () => {
  it("returns the result as text and as structured content", async () => {
    const response = await handleMessage(
      {
        id: 3,
        method: "tools/call",
        params: { name: "scan_project", arguments: { root: "." } },
      },
      tools,
      serverInfo,
    );

    expect(response?.result).toEqual({
      content: [{ type: "text", text: JSON.stringify({ passed: true }, null, 2) }],
      structuredContent: { passed: true },
    });
  });

  it("passes the arguments through", async () => {
    const run = jest.fn().mockResolvedValue({});

    await handleMessage(
      {
        id: 3,
        method: "tools/call",
        params: { name: "scan_project", arguments: { root: "/x" } },
      },
      [tool(run)],
      serverInfo,
    );

    expect(run).toHaveBeenCalledWith({ root: "/x" });
  });

  it("defaults missing arguments to an empty object", async () => {
    const run = jest.fn().mockResolvedValue({});

    await handleMessage(
      { id: 3, method: "tools/call", params: { name: "scan_project" } },
      [tool(run)],
      serverInfo,
    );

    expect(run).toHaveBeenCalledWith({});
  });

  it("rejects an unknown tool by name", async () => {
    const response = await handleMessage(
      { id: 4, method: "tools/call", params: { name: "nope" } },
      tools,
      serverInfo,
    );

    expect(response?.error).toEqual({
      code: -32602,
      message: "Unknown tool: nope",
    });
  });

  it("treats a call with no params as an unknown tool", async () => {
    const response = await handleMessage(
      { id: 4, method: "tools/call" },
      tools,
      serverInfo,
    );

    expect(response?.error?.code).toBe(-32602);
  });

  // A failed scan must not kill the session — it is one bad call, not a dead
  // server, and an agent that loses its server loses everything else too.
  it("reports a throwing tool as a tool error, not a transport error", async () => {
    const response = await handleMessage(
      { id: 5, method: "tools/call", params: { name: "scan_project" } },
      [
        tool(async () => {
          throw new Error("scan exploded");
        }),
      ],
      serverInfo,
    );

    expect(response?.error).toBeUndefined();
    expect(response?.result).toEqual({
      content: [{ type: "text", text: "scan exploded" }],
      isError: true,
    });
  });

  it("describes a non-Error rejection", async () => {
    const response = await handleMessage(
      { id: 5, method: "tools/call", params: { name: "scan_project" } },
      [
        tool(async () => {
          throw "just a string";
        }),
      ],
      serverInfo,
    );

    expect(
      (response?.result as { content: { text: string }[] }).content[0].text,
    ).toBe("just a string");
  });
});

describe("unknown methods", () => {
  it("returns method-not-found for a request", async () => {
    const response = await handleMessage(
      { id: 6, method: "resources/list" },
      tools,
      serverInfo,
    );

    expect(response?.error).toEqual({
      code: -32601,
      message: "Unknown method: resources/list",
    });
  });

  it("treats a null id as a request, not a notification", async () => {
    const response = await handleMessage(
      { id: null, method: "ping" },
      tools,
      serverInfo,
    );

    expect(response).toEqual({ jsonrpc: "2.0", id: null, result: {} });
  });
});
