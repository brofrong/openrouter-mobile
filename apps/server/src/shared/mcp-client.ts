import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { Context, Data, Effect, Layer, Option, Redacted } from "effect";
import { AppConfig } from "./config";
import type { OpenRouterTool } from "./openrouter";

export class McpError extends Data.TaggedError("McpError")<{
  readonly code: "UNAVAILABLE" | "HTTP";
  readonly message: string;
}> {}

export type McpToolSchema = {
  readonly name: string;
  readonly description?: string;
  readonly inputSchema?: unknown;
};

export interface McpClientService {
  readonly listTools: () => Effect.Effect<
    ReadonlyArray<OpenRouterTool>,
    McpError
  >;
  readonly callTool: (
    name: string,
    args: { readonly [key: string]: unknown },
  ) => Effect.Effect<string, McpError>;
}

export class McpClient extends Context.Service<McpClient, McpClientService>()(
  "@openrouter-mobile/server/McpClient",
) {}

const unavailable = new McpError({
  code: "UNAVAILABLE",
  message: "MCP server is not configured",
});

const failed = (error: unknown) =>
  new McpError({
    code: "HTTP",
    message: error instanceof Error ? error.message : "MCP request failed",
  });

export const toOpenRouterTool = (tool: McpToolSchema): OpenRouterTool => ({
  type: "function",
  function: {
    name: tool.name,
    ...(tool.description === undefined
      ? {}
      : { description: tool.description }),
    ...(tool.inputSchema === undefined ? {} : { parameters: tool.inputSchema }),
  },
});

export const parseToolCallArguments = (
  raw: string,
): { readonly [key: string]: unknown } => {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return {};
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (
      parsed !== null &&
      typeof parsed === "object" &&
      !Array.isArray(parsed)
    ) {
      return parsed as { readonly [key: string]: unknown };
    }
  } catch {
    return {};
  }
  return {};
};

const textParts = (content: unknown): ReadonlyArray<string> => {
  if (!Array.isArray(content)) {
    return [];
  }
  return content.flatMap((part) => {
    if (part === null || typeof part !== "object") {
      return [];
    }
    const record = part as { readonly type?: unknown; readonly text?: unknown };
    if (record.type === "text" && typeof record.text === "string") {
      return [record.text];
    }
    return [];
  });
};

export const mcpToolResultToString = (result: {
  readonly content?: unknown;
  readonly structuredContent?: unknown;
}): string => {
  if (result.structuredContent !== undefined) {
    return typeof result.structuredContent === "string"
      ? result.structuredContent
      : JSON.stringify(result.structuredContent);
  }
  const texts = textParts(result.content);
  if (texts.length > 0) {
    return texts.join("\n");
  }
  return JSON.stringify(result);
};

export type McpToolResult = {
  readonly content?: unknown;
  readonly structuredContent?: unknown;
  readonly isError?: boolean;
};

export interface McpSession {
  readonly listMcpTools: () => Effect.Effect<
    ReadonlyArray<McpToolSchema>,
    McpError
  >;
  readonly callToolRaw: (
    name: string,
    args: { readonly [key: string]: unknown },
  ) => Effect.Effect<McpToolResult, McpError>;
}

export const makeDisabledMcpClient = (): McpClientService => ({
  listTools: () => Effect.succeed([]),
  callTool: () => Effect.fail(unavailable),
});

export const McpClientStubLive = Layer.succeed(
  McpClient,
  makeDisabledMcpClient(),
);

export const createMcpSession = (options: {
  readonly url: string;
  readonly headers?: { readonly [key: string]: string };
}): McpSession => {
  let session: Promise<Client> | undefined;

  const connect = (): Promise<Client> => {
    const client = new Client({
      name: "openrouter-mobile",
      version: "0.0.0",
    });
    const transport = new StreamableHTTPClientTransport(
      new URL(options.url),
      options.headers === undefined
        ? {}
        : { requestInit: { headers: options.headers } },
    );
    return client.connect(transport).then(() => client);
  };

  const getClient = (): Promise<Client> => {
    session ??= connect().then(
      (client) => client,
      (error: unknown) => {
        session = undefined;
        throw error;
      },
    );
    return session;
  };

  const run = <A>(fn: (client: Client) => Promise<A>) =>
    Effect.tryPromise({
      try: async () => {
        const client = await getClient();
        return await fn(client).then(
          (value) => value,
          async (error: unknown) => {
            session = undefined;
            await client.close().then(
              () => undefined,
              () => undefined,
            );
            throw error;
          },
        );
      },
      catch: failed,
    });

  return {
    listMcpTools: () =>
      run(async (client) => {
        const listed = await client.listTools();
        return listed.tools.map((tool) => ({
          name: tool.name,
          ...(tool.description === undefined
            ? {}
            : { description: tool.description }),
          ...(tool.inputSchema === undefined
            ? {}
            : { inputSchema: tool.inputSchema }),
        }));
      }),
    callToolRaw: (name, args) =>
      run(async (client) => {
        const result = await client.callTool({
          name,
          arguments: args,
        });
        return {
          ...(result.content === undefined ? {} : { content: result.content }),
          ...(result.structuredContent === undefined
            ? {}
            : { structuredContent: result.structuredContent }),
          ...(result.isError === true ? { isError: true } : {}),
        };
      }),
  };
};

const makeHttpMcpClient = (options: {
  readonly url: string;
  readonly headers?: { readonly [key: string]: string };
}): McpClientService => {
  const session = createMcpSession(options);
  return {
    listTools: () =>
      session
        .listMcpTools()
        .pipe(
          Effect.map((tools) => tools.map((tool) => toOpenRouterTool(tool))),
        ),
    callTool: (name, args) =>
      session.callToolRaw(name, args).pipe(Effect.map(mcpToolResultToString)),
  };
};

export const McpClientLive = Layer.effect(
  McpClient,
  Effect.gen(function* () {
    const config = yield* AppConfig;
    const url = Option.getOrUndefined(config.mcpUrl);
    if (url === undefined) {
      return makeDisabledMcpClient();
    }
    const secret = Option.getOrUndefined(config.mcpSecret);
    return makeHttpMcpClient({
      url,
      ...(secret === undefined
        ? {}
        : { headers: { authorization: `Bearer ${Redacted.value(secret)}` } }),
    });
  }),
);
