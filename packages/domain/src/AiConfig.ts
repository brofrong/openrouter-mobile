import { Schema } from "effect";
import type { ChatKind } from "./Chat";

export class AiConfig extends Schema.Class<AiConfig>("AiConfig")({
  text: Schema.optionalKey(Schema.String),
  image: Schema.optionalKey(Schema.String),
  video: Schema.optionalKey(Schema.String),
  speech: Schema.optionalKey(Schema.String),
  audio: Schema.optionalKey(Schema.String),
}) {}

export const aiConfigModel = (
  config: AiConfig | undefined,
  kind: ChatKind,
): string | undefined => {
  if (config === undefined) {
    return undefined;
  }
  const model = config[kind];
  if (model === undefined || model.length === 0) {
    return undefined;
  }
  return model;
};
