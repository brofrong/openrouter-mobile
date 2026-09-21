import { Context, Data, Effect, Layer, Option, Redacted } from "effect";
import { AppConfig } from "./config";
import {
  createMcpSession,
  type McpError,
  type McpSession,
  mcpToolResultToString,
} from "./mcp-client";
import type { OpenRouterTool } from "./openrouter";
import { SANDBOX_EXECUTE_TOOL } from "./python-tool";

export type SandboxFileMeta = {
  readonly path: string;
  readonly size: number;
  readonly mime: string;
};

export type SandboxExecuteResult = {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
  readonly files: ReadonlyArray<SandboxFileMeta>;
};

export class SandboxError extends Data.TaggedError("SandboxError")<{
  readonly code: "UNAVAILABLE" | "HTTP";
  readonly message: string;
}> {}

export interface PythonSandboxService {
  readonly chatTools: ReadonlyArray<OpenRouterTool>;
  readonly execute: (
    sessionId: string,
    code: string,
    timeoutMs?: number,
  ) => Effect.Effect<SandboxExecuteResult, SandboxError>;
  readonly putFile: (
    sessionId: string,
    path: string,
    body: Uint8Array,
    mime: string,
  ) => Effect.Effect<void, SandboxError>;
  readonly getFile: (
    sessionId: string,
    path: string,
  ) => Effect.Effect<
    { readonly body: Uint8Array; readonly mime: string },
    SandboxError
  >;
  readonly listFiles: (
    sessionId: string,
  ) => Effect.Effect<ReadonlyArray<SandboxFileMeta>, SandboxError>;
  readonly deleteSession: (
    sessionId: string,
  ) => Effect.Effect<void, SandboxError>;
}

export class PythonSandbox extends Context.Service<
  PythonSandbox,
  PythonSandboxService
>()("@openrouter-mobile/server/PythonSandbox") {}

const unavailable = new SandboxError({
  code: "UNAVAILABLE",
  message: "Python sandbox is not configured",
});

const emptyResult: SandboxExecuteResult = {
  exitCode: 1,
  stdout: "",
  stderr: "Python sandbox is not configured",
  timedOut: false,
  files: [],
};

export const sandboxMcpUrl = (baseUrl: string): string =>
  baseUrl.endsWith("/mcp") ? baseUrl : `${baseUrl}/mcp`;

export const makeDisabledPythonSandbox = (): PythonSandboxService => ({
  chatTools: [],
  execute: () => Effect.succeed(emptyResult),
  putFile: () => Effect.void,
  getFile: () => Effect.fail(unavailable),
  listFiles: () => Effect.succeed([]),
  deleteSession: () => Effect.void,
});

export const PythonSandboxStubLive = Layer.succeed(
  PythonSandbox,
  makeDisabledPythonSandbox(),
);

const asRecord = (
  value: unknown,
): { readonly [key: string]: unknown } | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as { readonly [key: string]: unknown })
    : undefined;

export const parseSandboxFileMetas = (
  value: unknown,
): ReadonlyArray<SandboxFileMeta> => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    const record = asRecord(item);
    if (record === undefined) {
      return [];
    }
    if (
      typeof record.path !== "string" ||
      typeof record.size !== "number" ||
      typeof record.mime !== "string"
    ) {
      return [];
    }
    return [
      {
        path: record.path,
        size: record.size,
        mime: record.mime,
      },
    ];
  });
};

export const parseSandboxExecuteResult = (
  value: unknown,
): SandboxExecuteResult | undefined => {
  const record = asRecord(value);
  if (record === undefined) {
    return undefined;
  }
  return {
    exitCode: typeof record.exitCode === "number" ? record.exitCode : 1,
    stdout: typeof record.stdout === "string" ? record.stdout : "",
    stderr: typeof record.stderr === "string" ? record.stderr : "",
    timedOut: record.timedOut === true,
    files: parseSandboxFileMetas(record.files),
  };
};

const SANDBOX_LOG_TEXT_MAX = 2000;

export const truncateSandboxLog = (text: string): string =>
  text.length <= SANDBOX_LOG_TEXT_MAX
    ? text
    : `${text.slice(0, SANDBOX_LOG_TEXT_MAX)}…`;

export type SandboxExecuteProblem = {
  readonly reason: "timeout" | "nonzero_exit" | "stderr";
  readonly exitCode: number;
  readonly timedOut: boolean;
  readonly stderr: string;
};

export const sandboxExecuteProblem = (
  result: SandboxExecuteResult,
): SandboxExecuteProblem | undefined => {
  if (result.timedOut) {
    return {
      reason: "timeout",
      exitCode: result.exitCode,
      timedOut: true,
      stderr: result.stderr,
    };
  }
  if (result.exitCode !== 0) {
    return {
      reason: "nonzero_exit",
      exitCode: result.exitCode,
      timedOut: false,
      stderr: result.stderr,
    };
  }
  if (result.stderr.trim().length > 0) {
    return {
      reason: "stderr",
      exitCode: result.exitCode,
      timedOut: false,
      stderr: result.stderr,
    };
  }
  return undefined;
};

export const logSandboxExecuteResult = (
  result: SandboxExecuteResult,
  annotations: {
    readonly chatId: string;
    readonly sessionId: string;
  },
): Effect.Effect<void> => {
  const problem = sandboxExecuteProblem(result);
  if (problem === undefined) {
    return Effect.void;
  }
  const stderr = truncateSandboxLog(problem.stderr);
  const detail = stderr.length > 0 ? stderr : problem.reason;
  return Effect.logError(
    `Sandbox execute failed (exitCode=${String(problem.exitCode)}, timedOut=${String(problem.timedOut)}): ${detail}`,
  ).pipe(
    Effect.annotateLogs({
      chatId: annotations.chatId,
      sessionId: annotations.sessionId,
      reason: problem.reason,
      exitCode: problem.exitCode,
      timedOut: problem.timedOut,
      stderr,
    }),
  );
};

export const parseSandboxFileBytes = (
  value: unknown,
): { readonly body: Uint8Array; readonly mime: string } | undefined => {
  const record = asRecord(value);
  if (record === undefined || typeof record.content !== "string") {
    return undefined;
  }
  const mime =
    typeof record.mime === "string" && record.mime.length > 0
      ? record.mime
      : "application/octet-stream";
  if (record.encoding === "utf-8") {
    return { body: new TextEncoder().encode(record.content), mime };
  }
  return {
    body: new Uint8Array(Buffer.from(record.content, "base64")),
    mime,
  };
};

const asSandboxError = (error: McpError) =>
  new SandboxError({
    code: error.code,
    message: error.message,
  });

const callSandboxTool = (
  session: McpSession,
  name: string,
  args: { readonly [key: string]: unknown },
) =>
  session.callToolRaw(name, args).pipe(
    Effect.mapError(asSandboxError),
    Effect.flatMap((result) => {
      if (result.isError === true) {
        return Effect.fail(
          new SandboxError({
            code: "HTTP",
            message: mcpToolResultToString(result),
          }),
        );
      }
      if (result.structuredContent !== undefined) {
        return Effect.succeed(result.structuredContent);
      }
      const text = mcpToolResultToString(result);
      try {
        return Effect.succeed(JSON.parse(text) as unknown);
      } catch {
        return Effect.succeed(result);
      }
    }),
  );

const makeMcpPythonSandbox = (session: McpSession): PythonSandboxService => ({
  chatTools: [SANDBOX_EXECUTE_TOOL],
  execute: (sessionId, code, timeoutMs) =>
    callSandboxTool(session, "execute", {
      session_id: sessionId,
      code,
      ...(timeoutMs === undefined ? {} : { timeout_ms: timeoutMs }),
    }).pipe(
      Effect.flatMap((value) => {
        const parsed = parseSandboxExecuteResult(value);
        if (parsed === undefined) {
          return Effect.fail(
            new SandboxError({
              code: "HTTP",
              message: "Sandbox execute returned an invalid result",
            }),
          );
        }
        return Effect.succeed(parsed);
      }),
    ),
  putFile: (sessionId, path, body, mime) =>
    callSandboxTool(session, "write_file", {
      session_id: sessionId,
      path,
      content: Buffer.from(body).toString("base64"),
      encoding: "base64",
      mime,
    }).pipe(Effect.asVoid),
  getFile: (sessionId, path) =>
    callSandboxTool(session, "read_file", {
      session_id: sessionId,
      path,
      encoding: "base64",
    }).pipe(
      Effect.flatMap((value) => {
        const parsed = parseSandboxFileBytes(value);
        if (parsed === undefined) {
          return Effect.fail(
            new SandboxError({
              code: "HTTP",
              message: "Sandbox read_file returned an invalid result",
            }),
          );
        }
        return Effect.succeed(parsed);
      }),
    ),
  listFiles: (sessionId) =>
    callSandboxTool(session, "list_files", {
      session_id: sessionId,
    }).pipe(
      Effect.map((value) => parseSandboxFileMetas(asRecord(value)?.files)),
    ),
  deleteSession: (sessionId) =>
    callSandboxTool(session, "delete_session", {
      session_id: sessionId,
    }).pipe(Effect.asVoid),
});

export const PythonSandboxLive = Layer.effect(
  PythonSandbox,
  Effect.gen(function* () {
    const config = yield* AppConfig;
    const baseUrl = Option.getOrUndefined(config.sandboxUrl);
    const secret = Option.getOrUndefined(config.sandboxSecret);
    if (baseUrl === undefined || secret === undefined) {
      return makeDisabledPythonSandbox();
    }
    return makeMcpPythonSandbox(
      createMcpSession({
        url: sandboxMcpUrl(baseUrl),
        headers: { authorization: `Bearer ${Redacted.value(secret)}` },
      }),
    );
  }),
);
