import { AppError, UsageRange, UsageSummary } from "@openrouter-mobile/domain";
import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";

export class UsageRpcs extends RpcGroup.make(
  Rpc.make("UsageSummary", {
    payload: {
      range: Schema.optionalKey(UsageRange),
    },
    success: UsageSummary,
    error: AppError,
  }),
) {}
