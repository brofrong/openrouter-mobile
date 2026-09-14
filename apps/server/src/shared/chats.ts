import { chats } from "@openrouter-mobile/db";
import {
  AppError,
  Chat,
  type ChatKind,
  type ReasoningEffort,
  reasoningEffortValues,
} from "@openrouter-mobile/domain";
import { eq } from "drizzle-orm";
import { DateTime, Effect, Schema } from "effect";
import { CurrentSession } from "./AuthMiddleware";
import { AppDb } from "./db";

const unexpected = (error: unknown) =>
  new AppError({
    code: "STREAM_GONE",
    message: error instanceof Error ? error.message : "Unexpected error",
  });

const notFound = () =>
  new AppError({
    code: "NOT_FOUND",
    message: "Chat not found",
  });

const isEffort = (value: string | null): value is ReasoningEffort =>
  value !== null &&
  (reasoningEffortValues as readonly string[]).includes(value);

export const toChat = (row: typeof chats.$inferSelect) =>
  Schema.decodeUnknownEffect(Chat)({
    id: row.id,
    userId: row.userId,
    kind: row.kind,
    title: row.title,
    titleLocked: row.titleLocked,
    createdAt: DateTime.fromDateUnsafe(row.createdAt),
    ...(row.model === null || row.model.length === 0
      ? {}
      : { model: row.model }),
    ...(isEffort(row.effort) ? { effort: row.effort } : {}),
  }).pipe(Effect.mapError(unexpected));

export const persistChatSelection = (
  chatId: string,
  selection: {
    readonly model: string;
    readonly effort?: ReasoningEffort;
    readonly replaceEffort?: boolean;
  },
) =>
  Effect.gen(function* () {
    yield* requireOwnedChat(chatId);
    const model = selection.model.trim();
    if (model.length === 0) {
      return yield* new AppError({
        code: "VALIDATION",
        message: "Model cannot be empty",
      });
    }
    const db = yield* AppDb;
    const replaceEffort = selection.replaceEffort === true;
    const rows = yield* db
      .update(chats)
      .set({
        model,
        ...(replaceEffort ? { effort: selection.effort ?? null } : {}),
      })
      .where(eq(chats.id, chatId))
      .returning()
      .pipe(Effect.mapError(unexpected));
    const row = rows[0];
    if (row === undefined) {
      return yield* notFound();
    }
    return yield* toChat(row);
  });

export const requireOwnedChat = (chatId: string) =>
  Effect.gen(function* () {
    const session = yield* CurrentSession;
    const db = yield* AppDb;
    const chat = yield* db.query.chats
      .findFirst({
        where: {
          id: chatId,
          userId: session.user.id,
        },
      })
      .pipe(Effect.mapError(unexpected));
    if (chat === undefined || chat === null) {
      return yield* notFound();
    }
    return chat;
  });

export const requireOwnedChatKind = (chatId: string, kind: ChatKind) =>
  Effect.gen(function* () {
    const chat = yield* requireOwnedChat(chatId);
    if (chat.kind !== kind) {
      return yield* new AppError({
        code: "VALIDATION",
        message:
          kind === "image" || kind === "audio"
            ? `Not an ${kind} chat`
            : `Not a ${kind} chat`,
      });
    }
    return chat;
  });
