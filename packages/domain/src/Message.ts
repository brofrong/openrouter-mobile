import { Schema } from "effect";
import { ChatId, MessageId } from "./ids";

export class Message extends Schema.Class<Message>("Message")({
  id: MessageId,
  chatId: ChatId,
  role: Schema.Literals(["user", "assistant", "system"]),
  content: Schema.String,
  createdAt: Schema.DateTimeUtc,
}) {}
