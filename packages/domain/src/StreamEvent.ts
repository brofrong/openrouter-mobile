import { Schema } from "effect";
import { StreamId } from "./ids";

export class StreamEvent extends Schema.Class<StreamEvent>("StreamEvent")({
  streamId: StreamId,
  seq: Schema.Number,
  kind: Schema.Literals(["token", "job"]),
  payload: Schema.Unknown,
  createdAt: Schema.DateTimeUtc,
}) {}
