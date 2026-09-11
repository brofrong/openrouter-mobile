import { Schema } from "effect";

export class JobEvent extends Schema.Class<JobEvent>("JobEvent")({
  seq: Schema.Number,
  status: Schema.Literals(["queued", "running", "completed", "failed"]),
  progress: Schema.optionalKey(Schema.Number),
  url: Schema.optionalKey(Schema.String),
  error: Schema.optionalKey(Schema.String),
}) {}
