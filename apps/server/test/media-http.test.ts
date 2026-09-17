import { expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import { HttpRouter } from "effect/unstable/http";
import { Auth, createAuth } from "../src/shared/auth";
import { MediaHttpLive } from "../src/shared/MediaHttp";
import { makeMemoryObjectStore, ObjectStore } from "../src/shared/object-store";

const SECRET = "test-secret-that-is-at-least-32-chars-long";

const withHandler = async (
  seed: (
    store: ReturnType<typeof makeMemoryObjectStore>,
  ) => void | Promise<void>,
  run: (handler: (request: Request) => Promise<Response>) => Promise<void>,
) => {
  const store = makeMemoryObjectStore();
  await seed(store);
  const live = MediaHttpLive.pipe(
    Layer.provide(Layer.succeed(ObjectStore, store)),
    Layer.provide(Layer.succeed(Auth, createAuth(SECRET))),
  );
  const { handler, dispose } = HttpRouter.toWebHandler(live, {
    disableLogger: true,
  });
  try {
    await run(handler);
  } finally {
    await dispose();
  }
};

test("GET /media/* proxies bytes from object storage", async () => {
  await withHandler(
    async (store) => {
      await Effect.runPromise(
        store.put("user/pic.png", new Uint8Array([1, 2, 3, 4]), "image/png"),
      );
    },
    async (handler) => {
      const response = await handler(
        new Request("http://localhost/media/user/pic.png"),
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("image/png");
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(
        new Uint8Array([1, 2, 3, 4]),
      );
    },
  );
});

test("GET /media/* honors Range", async () => {
  await withHandler(
    async (store) => {
      await Effect.runPromise(
        store.put(
          "user/clip.bin",
          new Uint8Array([10, 20, 30, 40]),
          "video/mp4",
        ),
      );
    },
    async (handler) => {
      const response = await handler(
        new Request("http://localhost/media/user/clip.bin", {
          headers: { Range: "bytes=1-2" },
        }),
      );
      expect(response.status).toBe(206);
      expect(response.headers.get("content-range")).toBe("bytes 1-2/4");
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(
        new Uint8Array([20, 30]),
      );
    },
  );
});

test("GET /media/* rejects path traversal", async () => {
  await withHandler(
    () => undefined,
    async (handler) => {
      const response = await handler(
        new Request("http://localhost/media/../secret"),
      );
      expect(response.status).toBe(404);
    },
  );
});

test("POST /media requires a session", async () => {
  await withHandler(
    () => undefined,
    async (handler) => {
      const body = new FormData();
      body.append("file", new File(["hello"], "hi.png", { type: "image/png" }));
      const response = await handler(
        new Request("http://localhost/media", { method: "POST", body }),
      );
      expect(response.status).toBe(401);
    },
  );
});
