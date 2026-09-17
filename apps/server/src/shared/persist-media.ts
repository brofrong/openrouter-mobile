import { AppError } from "@openrouter-mobile/domain";
import { Effect } from "effect";
import { AppConfig } from "./config";
import {
  isAllowedMediaMime,
  isDataUrl,
  isHttpUrl,
  isOurMediaUrl,
  MAX_PERSIST_BYTES,
  makeObjectKey,
  objectKeyFromUrl,
  parseDataUrl,
  publicMediaUrl,
  toDataUrl,
} from "./media-url";
import { ObjectStore, ObjectStoreError } from "./object-store";

const unexpected = (error: unknown) =>
  new AppError({
    code: "STREAM_GONE",
    message: error instanceof Error ? error.message : "Unexpected error",
  });

const requireConfig = AppConfig.pipe(Effect.mapError(unexpected));

const storeFailed = (error: unknown) =>
  error instanceof AppError
    ? error
    : unexpected(
        error instanceof ObjectStoreError ? new Error(error.message) : error,
      );

const contentTypeOf = (value: string | undefined, fallback: string): string => {
  const mime = value?.split(";")[0]?.trim();
  return mime !== undefined && mime.length > 0 ? mime : fallback;
};

const persistBytes = (options: {
  readonly userId: string;
  readonly bytes: Uint8Array;
  readonly contentType: string;
}) =>
  Effect.gen(function* () {
    if (options.bytes.byteLength === 0) {
      return yield* new AppError({
        code: "VALIDATION",
        message: "Empty media",
      });
    }
    if (options.bytes.byteLength > MAX_PERSIST_BYTES) {
      return yield* new AppError({
        code: "VALIDATION",
        message: "Media is too large",
      });
    }
    const mime = isAllowedMediaMime(options.contentType)
      ? (options.contentType.split(";")[0]?.trim() ?? options.contentType)
      : "application/octet-stream";
    const key = makeObjectKey(options.userId, mime);
    const store = yield* ObjectStore;
    const config = yield* requireConfig;
    yield* store
      .put(key, options.bytes, mime)
      .pipe(Effect.mapError(storeFailed));
    return publicMediaUrl(config.baseUrl, key);
  });

const persistRemoteUrl = (url: string, userId: string) =>
  Effect.tryPromise({
    try: async () => {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch media (${response.status})`);
      }
      const lengthHeader = response.headers.get("content-length");
      if (lengthHeader !== null) {
        const length = Number(lengthHeader);
        if (Number.isFinite(length) && length > MAX_PERSIST_BYTES) {
          throw new Error("Media is too large");
        }
      }
      const buffer = new Uint8Array(await response.arrayBuffer());
      return {
        bytes: buffer,
        contentType: contentTypeOf(
          response.headers.get("content-type") ?? undefined,
          "application/octet-stream",
        ),
      };
    },
    catch: (error) =>
      unexpected(error instanceof Error ? error : new Error("Fetch failed")),
  }).pipe(
    Effect.flatMap(({ bytes, contentType }) =>
      persistBytes({ userId, bytes, contentType }),
    ),
  );

export const persistMediaUrl = (url: string, userId: string) =>
  Effect.gen(function* () {
    const trimmed = url.trim();
    if (trimmed.length === 0) {
      return yield* new AppError({
        code: "VALIDATION",
        message: "Empty media URL",
      });
    }
    const config = yield* requireConfig;
    if (isOurMediaUrl(trimmed, config.baseUrl)) {
      return trimmed;
    }
    if (isDataUrl(trimmed)) {
      const parsed = parseDataUrl(trimmed);
      if (parsed === undefined) {
        return yield* new AppError({
          code: "VALIDATION",
          message: "Invalid data URL",
        });
      }
      return yield* persistBytes({
        userId,
        bytes: parsed.bytes,
        contentType: parsed.mime,
      });
    }
    if (isHttpUrl(trimmed)) {
      return yield* persistRemoteUrl(trimmed, userId);
    }
    return yield* new AppError({
      code: "VALIDATION",
      message: "Unsupported media URL",
    });
  });

export const persistMediaUrls = (urls: ReadonlyArray<string>, userId: string) =>
  Effect.gen(function* () {
    const stored: Array<string> = [];
    for (const url of urls) {
      stored.push(yield* persistMediaUrl(url, userId));
    }
    return stored;
  });

export const persistGeneratedUrl = (url: string, userId: string) =>
  persistMediaUrls(
    url
      .split("\n")
      .map((part) => part.trim())
      .filter((part) => part.length > 0),
    userId,
  ).pipe(Effect.map((urls) => urls.join("\n")));

export const resolveMediaUrl = (url: string) =>
  Effect.gen(function* () {
    const trimmed = url.trim();
    if (trimmed.length === 0 || isDataUrl(trimmed)) {
      return trimmed;
    }
    const config = yield* requireConfig;
    const key = objectKeyFromUrl(trimmed, config.baseUrl);
    if (key === undefined) {
      return trimmed;
    }
    const store = yield* ObjectStore;
    const stored = yield* store.get(key).pipe(Effect.mapError(storeFailed));
    return toDataUrl(stored.body, stored.contentType);
  });

export const resolveMediaUrls = (urls: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const resolved: Array<string> = [];
    for (const url of urls) {
      resolved.push(yield* resolveMediaUrl(url));
    }
    return resolved;
  });
