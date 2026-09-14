import { Schema } from "effect";
import { ChatId, UserId } from "./ids";
import { ReasoningEffort } from "./ReasoningEffort";

export const CHAT_TITLE_MAX_LENGTH = 50;

export const ChatKind = Schema.Literals([
  "text",
  "image",
  "video",
  "speech",
  "audio",
]);
export type ChatKind = typeof ChatKind.Type;

export class Chat extends Schema.Class<Chat>("Chat")({
  id: ChatId,
  userId: UserId,
  kind: ChatKind,
  title: Schema.String,
  titleLocked: Schema.Boolean,
  createdAt: Schema.DateTimeUtc,
  model: Schema.optionalKey(Schema.String),
  effort: Schema.optionalKey(ReasoningEffort),
}) {}

export const withChatTitle = (chat: Chat, title: string): Chat =>
  new Chat({
    id: chat.id,
    userId: chat.userId,
    kind: chat.kind,
    title,
    titleLocked: chat.titleLocked,
    createdAt: chat.createdAt,
    ...(chat.model === undefined ? {} : { model: chat.model }),
    ...(chat.effort === undefined ? {} : { effort: chat.effort }),
  });
