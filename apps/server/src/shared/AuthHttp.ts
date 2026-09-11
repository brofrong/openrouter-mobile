import { Effect } from "effect";
import {
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
} from "effect/unstable/http";
import { auth } from "./auth";

export const AuthHttpLive = HttpRouter.add("*", "/api/auth/*", (request) =>
  Effect.gen(function* () {
    const webRequest = yield* HttpServerRequest.toWeb(request);
    const webResponse = yield* Effect.promise(() => auth.handler(webRequest));
    return HttpServerResponse.fromWeb(webResponse);
  }),
);
