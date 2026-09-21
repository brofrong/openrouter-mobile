import { expect, test } from "bun:test";
import { Effect, Logger } from "effect";
import {
  logSandboxExecuteResult,
  makeDisabledPythonSandbox,
  parseSandboxExecuteResult,
  parseSandboxFileBytes,
  parseSandboxFileMetas,
  sandboxExecuteProblem,
  sandboxMcpUrl,
  truncateSandboxLog,
} from "../src/shared/python-sandbox";

test("sandboxMcpUrl appends /mcp unless already present", () => {
  expect(sandboxMcpUrl("http://localhost:8090")).toBe(
    "http://localhost:8090/mcp",
  );
  expect(sandboxMcpUrl("http://sandbox:8090/mcp")).toBe(
    "http://sandbox:8090/mcp",
  );
});

test("disabled sandbox advertises no chat tools", () => {
  expect(makeDisabledPythonSandbox().chatTools).toEqual([]);
});

test("parseSandboxExecuteResult reads MCP structured execute output", () => {
  expect(
    parseSandboxExecuteResult({
      exitCode: 0,
      stdout: "ok",
      stderr: "",
      timedOut: false,
      files: [{ path: "out.txt", size: 2, mime: "text/plain" }],
    }),
  ).toEqual({
    exitCode: 0,
    stdout: "ok",
    stderr: "",
    timedOut: false,
    files: [{ path: "out.txt", size: 2, mime: "text/plain" }],
  });
  expect(parseSandboxExecuteResult("nope")).toBeUndefined();
});

test("parseSandboxFileBytes decodes base64 and utf-8 payloads", () => {
  expect(
    parseSandboxFileBytes({
      content: "aGVsbG8=",
      encoding: "base64",
      mime: "text/plain",
    }),
  ).toEqual({
    body: new Uint8Array([104, 101, 108, 108, 111]),
    mime: "text/plain",
  });
  expect(
    parseSandboxFileBytes({
      content: "hello",
      encoding: "utf-8",
      mime: "text/plain",
    }),
  ).toEqual({
    body: new TextEncoder().encode("hello"),
    mime: "text/plain",
  });
});

test("parseSandboxFileMetas skips malformed entries", () => {
  expect(
    parseSandboxFileMetas([
      { path: "a.txt", size: 1, mime: "text/plain" },
      { path: "bad" },
    ]),
  ).toEqual([{ path: "a.txt", size: 1, mime: "text/plain" }]);
});

const okExecute = {
  exitCode: 0,
  stdout: "ok",
  stderr: "",
  timedOut: false,
  files: [] as const,
};

test("sandboxExecuteProblem ignores successful execute", () => {
  expect(sandboxExecuteProblem(okExecute)).toBeUndefined();
});

test("sandboxExecuteProblem flags isolation and timeout failures", () => {
  expect(
    sandboxExecuteProblem({
      ...okExecute,
      exitCode: 1,
      stderr: "network unshare failed",
    }),
  ).toEqual({
    reason: "nonzero_exit",
    exitCode: 1,
    timedOut: false,
    stderr: "network unshare failed",
  });
  expect(
    sandboxExecuteProblem({
      ...okExecute,
      exitCode: 1,
      timedOut: true,
      stderr: "kernel exited",
    }),
  ).toMatchObject({ reason: "timeout", timedOut: true });
  expect(
    sandboxExecuteProblem({
      ...okExecute,
      stderr: "UserWarning: fonts",
    }),
  ).toMatchObject({ reason: "stderr", stderr: "UserWarning: fonts" });
});

test("truncateSandboxLog keeps short text and ellipsizes long dumps", () => {
  expect(truncateSandboxLog("network unshare failed")).toBe(
    "network unshare failed",
  );
  expect(truncateSandboxLog("x".repeat(2001)).endsWith("…")).toBe(true);
});

test("logSandboxExecuteResult writes a grepable error for isolation failures", async () => {
  const lines: Array<string> = [];
  const logger = Logger.make<unknown, void>((options) => {
    lines.push(
      `[${String(options.logLevel)}] ${Array.isArray(options.message) ? options.message.map(String).join(" ") : String(options.message)}`,
    );
  });
  await Effect.runPromise(
    logSandboxExecuteResult(
      {
        ...okExecute,
        exitCode: 1,
        stderr: "network unshare failed",
      },
      { chatId: "chat-1", sessionId: "user_chat" },
    ).pipe(Effect.provide(Logger.layer([logger]))),
  );
  const logged = lines.join("\n");
  expect(logged).toContain("Sandbox execute failed");
  expect(logged).toContain("network unshare failed");
});

test("logSandboxExecuteResult stays silent on success", async () => {
  const lines: Array<string> = [];
  const logger = Logger.make<unknown, void>((options) => {
    lines.push(String(options.message));
  });
  await Effect.runPromise(
    logSandboxExecuteResult(okExecute, {
      chatId: "chat-1",
      sessionId: "user_chat",
    }).pipe(Effect.provide(Logger.layer([logger]))),
  );
  expect(lines).toEqual([]);
});
