import { Schema } from "effect";
import { Message } from "./Message";

export class ChatMessagePage extends Schema.Class<ChatMessagePage>(
  "ChatMessagePage",
)({
  messages: Schema.Array(Message),
  hasMore: Schema.Boolean,
}) {}
