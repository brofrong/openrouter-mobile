import { AppError } from "@openrouter-mobile/domain";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const appErrorCode = (error: unknown): string | undefined => {
  if (error instanceof AppError) {
    return error.code;
  }
  if (isRecord(error) && typeof error.code === "string") {
    return error.code;
  }
  return undefined;
};

/** Typed app failures must not trigger reconnect (STREAM_GONE especially). */
export const isFatalStreamError = (error: unknown): boolean => {
  const code = appErrorCode(error);
  return (
    code === "STREAM_GONE" ||
    code === "OPENROUTER" ||
    code === "UNAUTHORIZED" ||
    code === "NOT_FOUND"
  );
};

export const formatRpcError = (error: unknown): string => {
  if (error instanceof AppError) {
    return error.code === "OPENROUTER"
      ? `OPENROUTER: ${error.message}`
      : error.message;
  }
  if (error instanceof Error && error.message.length > 0) {
    if (error.name === "AbortError" || error.name === "TimeoutError") {
      return "Could not reach the server.";
    }
    return error.message;
  }
  if (isRecord(error)) {
    const code = error.code;
    const message = error.message;
    if (code === "OPENROUTER" && typeof message === "string") {
      return `OPENROUTER: ${message}`;
    }
    if (typeof message === "string" && message.length > 0) {
      return message;
    }
  }
  return "Could not reach the server.";
};
