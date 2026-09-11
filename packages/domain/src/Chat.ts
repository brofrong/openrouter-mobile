import { Schema } from "effect";
import { ChatId, UserId } from "./ids";

export class Chat extends Schema.Class<Chat>("Chat")({
  id: ChatId,
  userId: UserId,
  title: Schema.String,
  createdAt: Schema.DateTimeUtc,
}) {}
