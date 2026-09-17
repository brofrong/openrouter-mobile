import { expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import { objectKeyFromUrl } from "../src/shared/media-url";
import { makeMemoryObjectStore, ObjectStore } from "../src/shared/object-store";
import {
  persistGeneratedUrl,
  persistMediaUrl,
  resolveMediaUrl,
} from "../src/shared/persist-media";

const runStore = async <A, E>(
  effect: Effect.Effect<A, E, ObjectStore>,
): Promise<A> => {
  const live = Layer.succeed(ObjectStore, makeMemoryObjectStore());
  return Effect.runPromise(effect.pipe(Effect.provide(live)));
};

test("persistMediaUrl stores a data URL and resolveMediaUrl reads it back", async () => {
  const original = "data:image/png;base64,cGl4";
  const { stored, resolved, object } = await runStore(
    Effect.gen(function* () {
      const storedUrl = yield* persistMediaUrl(original, "user-1");
      const resolvedUrl = yield* resolveMediaUrl(storedUrl);
      const key = objectKeyFromUrl(storedUrl, "http://localhost:3000");
      const store = yield* ObjectStore;
      const storedObject = yield* store.get(key ?? "");
      return {
        stored: storedUrl,
        resolved: resolvedUrl,
        object: storedObject,
      };
    }),
  );
  expect(stored.startsWith("http://localhost:3000/media/user-1/")).toBe(true);
  expect(stored.endsWith(".png")).toBe(true);
  expect(resolved).toBe(original);
  expect(object.contentType).toBe("image/png");
  expect(Buffer.from(object.body).toString()).toBe("pix");
});

test("persistGeneratedUrl keeps already stored media URLs", async () => {
  const first = await runStore(
    persistMediaUrl("data:audio/mpeg;base64,cGl4", "user-1"),
  );
  const again = await runStore(persistGeneratedUrl(first, "user-1"));
  expect(again).toBe(first);
});

test("persistGeneratedUrl stores every newline-separated payload", async () => {
  const stored = await runStore(
    persistGeneratedUrl(
      "data:image/png;base64,YQ==\ndata:image/png;base64,Yg==",
      "user-2",
    ),
  );
  const urls = stored.split("\n");
  expect(urls).toHaveLength(2);
  expect(urls[0]?.startsWith("http://localhost:3000/media/user-2/")).toBe(true);
  expect(urls[1]?.startsWith("http://localhost:3000/media/user-2/")).toBe(true);
});
