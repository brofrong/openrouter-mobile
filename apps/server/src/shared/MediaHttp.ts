import { Effect, Layer, Result } from "effect";
import {
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
} from "effect/unstable/http";
import { Auth } from "./auth";
import { AppConfig } from "./config";
import {
  isAllowedMediaMime,
  isObjectKey,
  MAX_UPLOAD_BYTES,
  makeObjectKey,
  objectKeyFromPathname,
  parseByteRange,
  publicMediaUrl,
} from "./media-url";
import { ObjectStore, type ObjectStoreService } from "./object-store";

const json = (body: unknown, status: number) =>
  HttpServerResponse.json(body, { status }).pipe(
    Effect.catchCause(() =>
      Effect.succeed(HttpServerResponse.text("error", { status })),
    ),
  );

const mediaHeaders = (options: {
  readonly contentLength: number;
  readonly contentRange?: string;
}): Record<string, string> => ({
  "accept-ranges": "bytes",
  "cache-control": "private, max-age=31536000, immutable",
  "content-length": String(options.contentLength),
  ...(options.contentRange === undefined
    ? {}
    : { "content-range": options.contentRange }),
});

const getObject = (
  request: HttpServerRequest.HttpServerRequest,
  store: ObjectStoreService,
) =>
  Effect.gen(function* () {
    const key = objectKeyFromPathname(request.url);
    if (key === undefined || !isObjectKey(key)) {
      return HttpServerResponse.empty({ status: 404 });
    }
    const result = yield* store.get(key).pipe(Effect.result);
    if (Result.isFailure(result)) {
      return HttpServerResponse.empty({
        status: result.failure.code === "NOT_FOUND" ? 404 : 500,
      });
    }
    const stored = result.success;
    const rangeHeader = request.headers.range;
    const range = parseByteRange(rangeHeader, stored.body.byteLength);
    if (rangeHeader !== undefined && range === undefined) {
      return HttpServerResponse.empty({
        status: 416,
        headers: {
          "content-range": `bytes */${stored.body.byteLength}`,
        },
      });
    }
    const slice =
      range === undefined
        ? stored.body
        : stored.body.subarray(range.start, range.end + 1);
    const status = range === undefined ? 200 : 206;
    const headers = mediaHeaders({
      contentLength: slice.byteLength,
      ...(range === undefined
        ? {}
        : {
            contentRange: `bytes ${range.start}-${range.end}/${stored.body.byteLength}`,
          }),
    });
    return HttpServerResponse.uint8Array(slice, {
      status,
      contentType: stored.contentType,
      headers,
    });
  }).pipe(
    Effect.catchCause(() =>
      Effect.succeed(HttpServerResponse.empty({ status: 500 })),
    ),
  );

const uploadObject = (
  request: HttpServerRequest.HttpServerRequest,
  auth: Effect.Success<typeof Auth>,
  config: { readonly baseUrl: string },
  store: ObjectStoreService,
) =>
  Effect.gen(function* () {
    const webRequest = yield* HttpServerRequest.toWeb(request);
    const session = yield* Effect.promise(() =>
      auth.api.getSession({ headers: webRequest.headers }).catch(() => null),
    );
    if (session == null) {
      return yield* json({ error: "unauthorized" }, 401);
    }
    const form = yield* Effect.promise(() =>
      webRequest.formData().catch(() => null),
    );
    if (form === null) {
      return yield* json({ error: "invalid form" }, 400);
    }
    const file = form.get("file");
    if (!(file instanceof File)) {
      return yield* json({ error: "missing file" }, 400);
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return yield* json({ error: "too large" }, 413);
    }
    const contentType =
      file.type.length > 0 ? file.type : "application/octet-stream";
    if (!isAllowedMediaMime(contentType)) {
      return yield* json({ error: "unsupported type" }, 415);
    }
    const bytes = new Uint8Array(
      yield* Effect.promise(() => file.arrayBuffer()),
    );
    if (bytes.byteLength === 0) {
      return yield* json({ error: "empty file" }, 400);
    }
    const mime = contentType.split(";")[0]?.trim() ?? contentType;
    const key = makeObjectKey(session.user.id, mime);
    yield* store.put(key, bytes, mime);
    return yield* json({ url: publicMediaUrl(config.baseUrl, key) }, 201);
  }).pipe(Effect.catchCause(() => json({ error: "upload failed" }, 500)));

export const MediaHttpLive = Layer.unwrap(
  Effect.gen(function* () {
    const store = yield* ObjectStore;
    const auth = yield* Auth;
    const config = yield* AppConfig.pipe(Effect.orDie);
    return Layer.mergeAll(
      HttpRouter.add("GET", "/media/*", (request) => getObject(request, store)),
      HttpRouter.add("POST", "/media", (request) =>
        uploadObject(request, auth, config, store),
      ),
    );
  }),
);
