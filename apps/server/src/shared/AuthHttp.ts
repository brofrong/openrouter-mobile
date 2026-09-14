import { Effect, Layer } from "effect";
import {
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
} from "effect/unstable/http";
import { Auth } from "./auth";

export const AuthHttpLive = Layer.unwrap(
  Effect.gen(function* () {
    const auth = yield* Auth;
    return HttpRouter.add("*", "/api/auth/*", (request) =>
      Effect.gen(function* () {
        const webRequest = yield* HttpServerRequest.toWeb(request);
        const webResponse = yield* Effect.promise(() =>
          auth.handler(webRequest),
        );
        return HttpServerResponse.fromWeb(webResponse);
      }),
    );
  }),
);
