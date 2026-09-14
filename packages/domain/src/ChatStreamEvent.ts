import { Schema } from "effect";
import { GenerationJobId } from "./ids";
import { Message } from "./Message";

export class ChatUserEvent extends Schema.Class<ChatUserEvent>("ChatUserEvent")(
  {
    _tag: Schema.Literal("user"),
    seq: Schema.Number,
    message: Message,
  },
) {}

export class ChatTokenEvent extends Schema.Class<ChatTokenEvent>(
  "ChatTokenEvent",
)({
  _tag: Schema.Literal("token"),
  seq: Schema.Number,
  text: Schema.String,
}) {}

export class ChatTitleEvent extends Schema.Class<ChatTitleEvent>(
  "ChatTitleEvent",
)({
  _tag: Schema.Literal("title"),
  seq: Schema.Number,
  title: Schema.String,
}) {}

export class ChatErrorEvent extends Schema.Class<ChatErrorEvent>(
  "ChatErrorEvent",
)({
  _tag: Schema.Literal("error"),
  seq: Schema.Number,
  error: Schema.String,
  code: Schema.Literals(["OPENROUTER", "STREAM_GONE", "VALIDATION"]),
}) {}

export class ChatDoneEvent extends Schema.Class<ChatDoneEvent>("ChatDoneEvent")(
  {
    _tag: Schema.Literal("done"),
    seq: Schema.Number,
    message: Message,
  },
) {}

export class ChatJobEvent extends Schema.Class<ChatJobEvent>("ChatJobEvent")({
  _tag: Schema.Literal("job"),
  seq: Schema.Number,
  jobId: GenerationJobId,
  status: Schema.Literals(["queued", "running", "completed", "failed"]),
  url: Schema.optionalKey(Schema.String),
  error: Schema.optionalKey(Schema.String),
}) {}

export const ChatStreamEvent = Schema.Union([
  ChatUserEvent,
  ChatTokenEvent,
  ChatTitleEvent,
  ChatErrorEvent,
  ChatDoneEvent,
  ChatJobEvent,
]);
export type ChatStreamEvent = typeof ChatStreamEvent.Type;
