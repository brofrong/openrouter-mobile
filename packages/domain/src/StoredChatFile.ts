import { Schema } from "effect";

export class StoredChatFile extends Schema.Class<StoredChatFile>(
  "StoredChatFile",
)({
  url: Schema.String,
  name: Schema.String,
  mime: Schema.String,
  size: Schema.Number,
}) {}
