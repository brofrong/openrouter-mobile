import { Schema } from "effect";

export const outputModalityValues = [
  "text",
  "image",
  "video",
  "audio",
] as const;

export const OutputModality = Schema.Literals(outputModalityValues);
export type OutputModality = typeof OutputModality.Type;
