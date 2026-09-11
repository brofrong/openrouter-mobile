import { AppError, GenerationJob } from "@openrouter-mobile/domain";
import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";

export class MediaRpcs extends RpcGroup.make(
  Rpc.make("ImageGenerate", {
    payload: { prompt: Schema.String },
    success: GenerationJob,
    error: AppError,
  }),
  Rpc.make("VideoGenerate", {
    payload: { prompt: Schema.String },
    success: GenerationJob,
    error: AppError,
  }),
  Rpc.make("SpeechSynthesize", {
    payload: {
      text: Schema.String,
      voice: Schema.optionalKey(Schema.String),
    },
    success: GenerationJob,
    error: AppError,
  }),
  Rpc.make("AudioTranscribe", {
    payload: { assetId: Schema.String },
    success: GenerationJob,
    error: AppError,
  }),
) {}
