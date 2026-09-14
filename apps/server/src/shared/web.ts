import { existsSync } from "node:fs";
import { join } from "node:path";
import { Effect, Layer } from "effect";
import { HttpStaticServer } from "effect/unstable/http";
import { AppConfig } from "./config";

export const WebLive = Layer.unwrap(
  Effect.gen(function* () {
    const { webDir } = yield* AppConfig;
    if (!existsSync(join(webDir, "index.html"))) {
      return Layer.empty;
    }
    return HttpStaticServer.layer({
      root: webDir,
      spa: true,
    });
  }),
);
