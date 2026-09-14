import { AppError, ChatId, GenerationJob } from "@openrouter-mobile/domain";
import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";

export class MediaRpcs extends RpcGroup.make(
  Rpc.make("ImageGenerate", {
    payload: {
      chatId: ChatId,
      prompt: Schema.String,
      model: Schema.optionalKey(Schema.String),
      aspectRatio: Schema.optionalKey(Schema.String),
      resolution: Schema.optionalKey(Schema.String),
      quality: Schema.optionalKey(Schema.String),
      background: Schema.optionalKey(Schema.String),
      n: Schema.optionalKey(Schema.Number),
      inputReferences: Schema.optionalKey(Schema.Array(Schema.String)),
    },
    success: GenerationJob,
    error: AppError,
  }),
  Rpc.make("VideoGenerate", {
    payload: {
      chatId: ChatId,
      prompt: Schema.String,
      model: Schema.optionalKey(Schema.String),
      aspectRatio: Schema.optionalKey(Schema.String),
      resolution: Schema.optionalKey(Schema.String),
      duration: Schema.optionalKey(Schema.Number),
      generateAudio: Schema.optionalKey(Schema.Boolean),
    },
    success: GenerationJob,
    error: AppError,
  }),
  Rpc.make("SpeechSynthesize", {
    payload: {
      chatId: ChatId,
      text: Schema.String,
      model: Schema.optionalKey(Schema.String),
      voice: Schema.optionalKey(Schema.String),
    },
    success: GenerationJob,
    error: AppError,
  }),
  Rpc.make("AudioGenerate", {
    payload: {
      chatId: ChatId,
      prompt: Schema.String,
      model: Schema.optionalKey(Schema.String),
    },
    success: GenerationJob,
    error: AppError,
  }),
) {}
