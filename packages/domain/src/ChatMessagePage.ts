import { Schema } from "effect";
import { GenerationJob } from "./GenerationJob";
import { Message } from "./Message";

export class ChatMessagePage extends Schema.Class<ChatMessagePage>(
  "ChatMessagePage",
)({
  messages: Schema.Array(Message),
  hasMore: Schema.Boolean,
  headSeq: Schema.Number,
  generating: Schema.Boolean,
  inProgress: Schema.optionalKey(Schema.String),
  jobs: Schema.Array(GenerationJob),
}) {}
