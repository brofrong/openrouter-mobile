import { expect, test } from "bun:test";
import { Effect, Result } from "effect";
import {
  makeDisabledMcpClient,
  mcpToolResultToString,
  parseToolCallArguments,
  toOpenRouterTool,
} from "../src/shared/mcp-client";

test("toOpenRouterTool maps MCP schemas into OpenRouter function tools", () => {
  expect(
    toOpenRouterTool({
      name: "search",
      description: "Search the web using DuckDuckGo.",
      inputSchema: {
        type: "object",
        required: ["query"],
        properties: { query: { type: "string" } },
      },
    }),
  ).toEqual({
    type: "function",
    function: {
      name: "search",
      description: "Search the web using DuckDuckGo.",
      parameters: {
        type: "object",
        required: ["query"],
        properties: { query: { type: "string" } },
      },
    },
  });
});

test("parseToolCallArguments reads a JSON object and ignores junk", () => {
  expect(parseToolCallArguments('{"query":"effect mcp"}')).toEqual({
    query: "effect mcp",
  });
  expect(parseToolCallArguments("")).toEqual({});
  expect(parseToolCallArguments("not-json")).toEqual({});
  expect(parseToolCallArguments("[1]")).toEqual({});
});

test("mcpToolResultToString prefers structured content then text parts", () => {
  expect(mcpToolResultToString({ structuredContent: { hits: 2 } })).toBe(
    '{"hits":2}',
  );
  expect(
    mcpToolResultToString({
      content: [
        { type: "text", text: "first" },
        { type: "text", text: "second" },
      ],
    }),
  ).toBe("first\nsecond");
});

test("disabled MCP client lists no tools", async () => {
  const client = makeDisabledMcpClient();
  const tools = await Effect.runPromise(client.listTools());
  expect(tools).toEqual([]);
  const called = await Effect.runPromise(
    client.callTool("search", {}).pipe(Effect.result),
  );
  expect(Result.isFailure(called)).toBe(true);
});
