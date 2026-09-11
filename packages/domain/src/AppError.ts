import { Schema } from "effect";

export class AppError extends Schema.TaggedError<AppError>()("AppError", {
  code: Schema.Literals([
    "UNAUTHORIZED",
    "NOT_FOUND",
    "OPENROUTER",
    "STREAM_GONE",
  ]),
  message: Schema.String,
}) {}
