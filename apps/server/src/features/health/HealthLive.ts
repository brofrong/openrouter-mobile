import { HealthRpcs } from "@openrouter-mobile/rpc";
import { Effect } from "effect";

export const HealthLive = HealthRpcs.toLayer({
  Health: () => Effect.succeed({ ok: true as const }),
});
