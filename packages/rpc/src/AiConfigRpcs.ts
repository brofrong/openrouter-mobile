import { AiConfig, AppError, ChatKind } from "@openrouter-mobile/domain";
import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";

export class AiConfigRpcs extends RpcGroup.make(
  Rpc.make("AiConfigGet", {
    success: AiConfig,
    error: AppError,
  }),
  Rpc.make("AiConfigSet", {
    payload: {
      kind: ChatKind,
      model: Schema.String,
    },
    success: AiConfig,
    error: AppError,
  }),
) {}
