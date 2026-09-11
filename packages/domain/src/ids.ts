import { Schema } from "effect";

export const UserId = Schema.String.pipe(Schema.brand("UserId"));
export type UserId = typeof UserId.Type;

export const ChatId = Schema.String.pipe(Schema.brand("ChatId"));
export type ChatId = typeof ChatId.Type;

export const MessageId = Schema.String.pipe(Schema.brand("MessageId"));
export type MessageId = typeof MessageId.Type;

export const StreamId = Schema.String.pipe(Schema.brand("StreamId"));
export type StreamId = typeof StreamId.Type;

export const GenerationJobId = Schema.String.pipe(
  Schema.brand("GenerationJobId"),
);
export type GenerationJobId = typeof GenerationJobId.Type;
