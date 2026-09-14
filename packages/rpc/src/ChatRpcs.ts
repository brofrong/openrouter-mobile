import {
  AppError,
  CatalogModelPage,
  Chat,
  ChatId,
  ChatKind,
  ChatMessagePage,
  Message,
  MessageId,
  OutputModality,
  ReasoningEffort,
  TokenChunk,
} from "@openrouter-mobile/domain";
import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";

export class ChatRpcs extends RpcGroup.make(
  Rpc.make("ChatList", {
    payload: {
      kind: Schema.optionalKey(ChatKind),
    },
    success: Schema.Array(Chat),
    error: AppError,
  }),
  Rpc.make("ChatCreate", {
    payload: {
      kind: Schema.optionalKey(ChatKind),
      model: Schema.optionalKey(Schema.String),
      effort: Schema.optionalKey(ReasoningEffort),
    },
    success: Chat,
    error: AppError,
  }),
  Rpc.make("ChatSetModel", {
    payload: {
      chatId: ChatId,
      model: Schema.String,
      effort: Schema.optionalKey(ReasoningEffort),
    },
    success: Chat,
    error: AppError,
  }),
  Rpc.make("ChatRename", {
    payload: {
      chatId: ChatId,
      title: Schema.String,
    },
    success: Chat,
    error: AppError,
  }),
  Rpc.make("ChatMessages", {
    payload: {
      chatId: ChatId,
      afterSeq: Schema.optionalKey(Schema.Number),
      limit: Schema.optionalKey(Schema.Number),
      before: Schema.optionalKey(MessageId),
    },
    success: ChatMessagePage,
    error: AppError,
  }),
  Rpc.make("ModelsList", {
    payload: {
      query: Schema.optionalKey(Schema.String),
      offset: Schema.optionalKey(Schema.Number),
      limit: Schema.optionalKey(Schema.Number),
      outputModality: OutputModality,
    },
    success: CatalogModelPage,
    error: AppError,
  }),
  Rpc.make("ChatSend", {
    payload: {
      chatId: ChatId,
      content: Schema.String,
      model: Schema.optionalKey(Schema.String),
      effort: Schema.optionalKey(ReasoningEffort),
      images: Schema.optionalKey(Schema.Array(Schema.String)),
    },
    success: Message,
    error: AppError,
  }),
  Rpc.make("ChatSubscribe", {
    payload: {
      chatId: ChatId,
      afterSeq: Schema.optionalKey(Schema.Number),
    },
    success: TokenChunk,
    error: AppError,
    stream: true,
  }),
) {}
