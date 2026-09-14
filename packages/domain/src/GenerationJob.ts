import { Schema } from "effect";
import { ChatId, GenerationJobId, UserId } from "./ids";

export class GenerationJob extends Schema.Class<GenerationJob>("GenerationJob")(
  {
    id: GenerationJobId,
    userId: UserId,
    chatId: Schema.optionalKey(ChatId),
    kind: Schema.Literals(["image", "video", "speech", "audio"]),
    status: Schema.Literals(["queued", "running", "completed", "failed"]),
    prompt: Schema.String,
    resultUrl: Schema.optionalKey(Schema.String),
    error: Schema.optionalKey(Schema.String),
    createdAt: Schema.DateTimeUtc,
  },
) {}
