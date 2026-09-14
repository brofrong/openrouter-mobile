import { Schema } from "effect";

export class TokenChunk extends Schema.Class<TokenChunk>("TokenChunk")({
  seq: Schema.Number,
  text: Schema.String,
  error: Schema.optionalKey(Schema.String),
  title: Schema.optionalKey(Schema.String),
}) {}
