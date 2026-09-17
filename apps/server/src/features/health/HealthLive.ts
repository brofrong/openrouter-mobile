import { HealthRpcs } from "@openrouter-mobile/rpc";
import { Effect } from "effect";
import { publicAuthSettingsFromConfig } from "../../shared/auth-options";
import { AppConfig } from "../../shared/config";

export const HealthLive = HealthRpcs.toLayer({
  Health: () => Effect.succeed({ ok: true as const }),
  AuthSettings: () =>
    Effect.gen(function* () {
      const config = yield* AppConfig.pipe(Effect.orDie);
      return publicAuthSettingsFromConfig(config);
    }),
});
