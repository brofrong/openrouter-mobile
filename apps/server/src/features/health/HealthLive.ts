import { HealthRpcs } from "@openrouter-mobile/rpc";
import { Effect } from "effect";
import { publicAuthSettings } from "../../shared/auth-options";

export const HealthLive = HealthRpcs.toLayer({
  Health: () => Effect.succeed({ ok: true as const }),
  AuthSettings: () =>
    Effect.sync(() =>
      publicAuthSettings({
        issuer: process.env.OIDC_ISSUER,
        clientId: process.env.OIDC_CLIENT_ID,
        clientSecret: process.env.OIDC_CLIENT_SECRET,
        scopes: process.env.OIDC_SCOPES,
        disableSignup: process.env.AUTH_DISABLE_SIGNUP,
      }),
    ),
});
