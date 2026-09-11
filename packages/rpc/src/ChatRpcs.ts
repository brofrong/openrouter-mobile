import {
  AppError,
  Chat,
  ChatId,
  Message,
  TokenChunk,
} from "@openrouter-mobile/domain";
import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";

export class ChatRpcs extends RpcGroup.make(
  Rpc.make("ChatList", {
    success: Schema.Array(Chat),
    error: AppError,
  }),
  Rpc.make("ChatCreate", {
    success: Chat,
    error: AppError,
  }),
  Rpc.make("ChatMessages", {
    payload: {
      chatId: ChatId,
      afterSeq: Schema.optionalKey(Schema.Number),
    },
    success: Schema.Array(Message),
    error: AppError,
  }),
  Rpc.make("ChatSend", {
    payload: {
      chatId: ChatId,
      content: Schema.String,
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
