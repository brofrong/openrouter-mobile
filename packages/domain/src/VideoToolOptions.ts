import { Schema } from "effect";

export class VideoToolOptions extends Schema.Class<VideoToolOptions>(
  "VideoToolOptions",
)({
  model: Schema.optionalKey(Schema.String),
  duration: Schema.optionalKey(Schema.Number),
  resolution: Schema.optionalKey(Schema.String),
  aspectRatio: Schema.optionalKey(Schema.String),
  generateAudio: Schema.optionalKey(Schema.Boolean),
  size: Schema.optionalKey(Schema.String),
  seed: Schema.optionalKey(Schema.Number),
  inputReferences: Schema.optionalKey(Schema.Array(Schema.String)),
}) {}
