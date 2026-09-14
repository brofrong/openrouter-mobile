import { AuthSettings } from "@openrouter-mobile/domain";
import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";

export class HealthRpcs extends RpcGroup.make(
  Rpc.make("Health", {
    success: Schema.Struct({
      ok: Schema.Literal(true),
    }),
  }),
  Rpc.make("AuthSettings", {
    success: AuthSettings,
  }),
) {}
