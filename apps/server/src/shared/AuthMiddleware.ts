import { AppError } from "@openrouter-mobile/domain";
import { Context, Effect, Layer } from "effect";
import type { Headers } from "effect/unstable/http/Headers";
import { RpcMiddleware } from "effect/unstable/rpc";
import { Auth, type Session } from "./auth";

export class CurrentSession extends Context.Service<CurrentSession, Session>()(
  "@openrouter-mobile/server/CurrentSession",
) {}

export class AuthMiddleware extends RpcMiddleware.Service<
  AuthMiddleware,
  {
    provides: CurrentSession;
  }
>()("@openrouter-mobile/server/AuthMiddleware", {
  error: AppError,
}) {}

const unauthorized = () =>
  new AppError({
    code: "UNAUTHORIZED",
    message: "Not signed in",
  });

const toWebHeaders = (headers: Headers): globalThis.Headers => {
  const webHeaders = new globalThis.Headers();
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === "string") {
      webHeaders.append(key, value);
    }
  }
  return webHeaders;
};

export const AuthMiddlewareLive = Layer.effect(
  AuthMiddleware,
  Effect.gen(function* () {
    const auth = yield* Auth;
    return (effect, { headers }) =>
      Effect.tryPromise({
        try: () => auth.api.getSession({ headers: toWebHeaders(headers) }),
        catch: () => unauthorized(),
      }).pipe(
        Effect.flatMap((session) =>
          session
            ? Effect.provideService(effect, CurrentSession, session)
            : Effect.fail(unauthorized()),
        ),
      );
  }),
);
