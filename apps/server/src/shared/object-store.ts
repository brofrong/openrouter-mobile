import { S3Client } from "bun";
import { Context, Data, Effect, Layer, Redacted } from "effect";
import { AppConfig } from "./config";

export type StoredObject = {
  readonly body: Uint8Array;
  readonly contentType: string;
};

export class ObjectStoreError extends Data.TaggedError("ObjectStoreError")<{
  readonly code: "NOT_FOUND" | "IO";
  readonly message: string;
}> {}

export interface ObjectStoreService {
  readonly put: (
    key: string,
    body: Uint8Array,
    contentType: string,
  ) => Effect.Effect<void, ObjectStoreError>;
  readonly get: (key: string) => Effect.Effect<StoredObject, ObjectStoreError>;
}

export class ObjectStore extends Context.Service<
  ObjectStore,
  ObjectStoreService
>()("@openrouter-mobile/server/ObjectStore") {}

export const makeMemoryObjectStore = (): ObjectStoreService => {
  const objects = new Map<string, StoredObject>();
  return {
    put: (key, body, contentType) =>
      Effect.sync(() => {
        objects.set(key, { body, contentType });
      }),
    get: (key) =>
      Effect.gen(function* () {
        const stored = objects.get(key);
        if (stored === undefined) {
          return yield* new ObjectStoreError({
            code: "NOT_FOUND",
            message: "Object not found",
          });
        }
        return stored;
      }),
  };
};

export const MemoryObjectStoreLive = Layer.sync(
  ObjectStore,
  makeMemoryObjectStore,
);

const ioError = (error: unknown) =>
  new ObjectStoreError({
    code: "IO",
    message: error instanceof Error ? error.message : "Object store failed",
  });

export const makeS3ObjectStore = Effect.gen(function* () {
  const config = yield* AppConfig;
  const client = new S3Client({
    accessKeyId: config.s3AccessKeyId,
    secretAccessKey: Redacted.value(config.s3SecretAccessKey),
    bucket: config.s3Bucket,
    endpoint: config.s3Endpoint,
    region: config.s3Region,
  });
  return {
    put: (key, body, contentType) =>
      Effect.tryPromise({
        try: () =>
          client.write(key, body, { type: contentType }).then(() => undefined),
        catch: ioError,
      }),
    get: (key) =>
      Effect.tryPromise({
        try: async () => {
          const file = client.file(key);
          if (!(await file.exists())) {
            throw new ObjectStoreError({
              code: "NOT_FOUND",
              message: "Object not found",
            });
          }
          const buffer = await file.arrayBuffer();
          const contentType =
            typeof file.type === "string" && file.type.length > 0
              ? file.type
              : "application/octet-stream";
          return {
            body: new Uint8Array(buffer),
            contentType,
          } satisfies StoredObject;
        },
        catch: (error) =>
          error instanceof ObjectStoreError ? error : ioError(error),
      }),
  } satisfies ObjectStoreService;
});

export const ObjectStoreLive = Layer.effect(ObjectStore, makeS3ObjectStore);
