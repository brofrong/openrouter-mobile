import { chats, messages } from "@openrouter-mobile/db";
import {
  AppError,
  Chat,
  type ChatId,
  Message,
  TokenChunk,
} from "@openrouter-mobile/domain";
import { ChatRpcs } from "@openrouter-mobile/rpc";
import { DateTime, Effect, Schema, Stream } from "effect";
import { AuthMiddleware, CurrentSession } from "../../shared/AuthMiddleware";
import { AppDb } from "../../shared/db";
import { DurableStream } from "../durable-stream/DurableStream";
import { OpenRouterChat, type OpenRouterMessage } from "./OpenRouterChat";

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

const tokenText = (payload: unknown): string => {
  if (typeof payload === "string") {
    return payload;
  }
  if (
    payload !== null &&
    typeof payload === "object" &&
    "text" in payload &&
    typeof payload.text === "string"
  ) {
    return payload.text;
  }
  return "";
};

const toChat = (row: typeof chats.$inferSelect) =>
  Schema.decodeUnknownEffect(Chat)({
    id: row.id,
    userId: row.userId,
    title: row.title,
    createdAt: DateTime.fromDateUnsafe(row.createdAt),
  }).pipe(Effect.mapError(unexpected));

const toMessage = (row: typeof messages.$inferSelect) =>
  Schema.decodeUnknownEffect(Message)({
    id: row.id,
    chatId: row.chatId,
    role: row.role,
    content: row.content,
    createdAt: DateTime.fromDateUnsafe(row.createdAt),
  }).pipe(Effect.mapError(unexpected));

const toOpenRouterRole = (
  role: string,
): OpenRouterMessage["role"] | undefined =>
  role === "user" || role === "assistant" || role === "system"
    ? role
    : undefined;

const requireOwnedChat = (chatId: string) =>
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

export const listChats = Effect.gen(function* () {
  const session = yield* CurrentSession;
  const db = yield* AppDb;
  const rows = yield* db.query.chats
    .findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
    })
    .pipe(Effect.mapError(unexpected));
  return yield* Effect.all(rows.map(toChat));
});

export const createChat = Effect.gen(function* () {
  const session = yield* CurrentSession;
  const db = yield* AppDb;
  const rows = yield* db
    .insert(chats)
    .values({
      userId: session.user.id,
      title: "New chat",
    })
    .returning()
    .pipe(Effect.mapError(unexpected));
  const row = rows[0];
  if (row === undefined) {
    return yield* unexpected(new Error("Chat insert returned no row"));
  }
  return yield* toChat(row);
});

export const listMessages = (payload: {
  readonly chatId: ChatId;
  readonly afterSeq?: number;
}) =>
  Effect.gen(function* () {
    yield* requireOwnedChat(payload.chatId);
    const db = yield* AppDb;
    const rows = yield* db.query.messages
      .findMany({
        where: { chatId: payload.chatId },
        orderBy: { createdAt: "asc" },
      })
      .pipe(Effect.mapError(unexpected));
    return yield* Effect.all(rows.map(toMessage));
  });

export const sendMessage = (payload: {
  readonly chatId: ChatId;
  readonly content: string;
}) =>
  Effect.gen(function* () {
    const chat = yield* requireOwnedChat(payload.chatId);
    const db = yield* AppDb;
    const openrouter = yield* OpenRouterChat;
    const durable = yield* DurableStream;

    const history = yield* db.query.messages
      .findMany({
        where: { chatId: chat.id },
        orderBy: { createdAt: "asc" },
      })
      .pipe(Effect.mapError(unexpected));

    const outgoing: Array<OpenRouterMessage> = [];
    for (const row of history) {
      const role = toOpenRouterRole(row.role);
      if (role !== undefined) {
        outgoing.push({ role, content: row.content });
      }
    }
    outgoing.push({ role: "user", content: payload.content });

    const tokens = yield* openrouter.complete(outgoing);

    const inserted = yield* db
      .insert(messages)
      .values({
        chatId: chat.id,
        role: "user",
        content: payload.content,
      })
      .returning()
      .pipe(Effect.mapError(unexpected));
    const userRow = inserted[0];
    if (userRow === undefined) {
      return yield* unexpected(new Error("Message insert returned no row"));
    }

    yield* Effect.forkDetach(
      durable
        .runInto(
          chat.id,
          "token",
          tokens.pipe(
            Stream.map((text) => ({ text })),
            Stream.catchTag("AppError", () => Stream.empty),
          ),
        )
        .pipe(
          Stream.runFold(
            () => "",
            (acc, event) => acc + tokenText(event.payload),
          ),
          Effect.flatMap((content) =>
            content.length === 0
              ? Effect.void
              : db
                  .insert(messages)
                  .values({
                    chatId: chat.id,
                    role: "assistant",
                    content,
                  })
                  .pipe(Effect.asVoid, Effect.mapError(unexpected)),
          ),
          Effect.catchCause(() => Effect.void),
        ),
    );

    return yield* toMessage(userRow);
  });

export const subscribeTokens = (chatId: ChatId, afterSeq?: number) =>
  Stream.unwrap(
    Effect.gen(function* () {
      yield* requireOwnedChat(chatId);
      const durable = yield* DurableStream;
      return durable.subscribe(chatId, afterSeq).pipe(
        Stream.filter((event) => event.kind === "token"),
        Stream.map(
          (event) =>
            new TokenChunk({
              seq: event.seq,
              text: tokenText(event.payload),
            }),
        ),
        Stream.mapError(
          () =>
            new AppError({
              code: "STREAM_GONE",
              message: "Stream unavailable",
            }),
        ),
      );
    }),
  );

export const ChatLive = ChatRpcs.middleware(AuthMiddleware).toLayer({
  ChatList: () => listChats,
  ChatCreate: () => createChat,
  ChatMessages: (payload) => listMessages(payload),
  ChatSend: (payload) => sendMessage(payload),
  ChatSubscribe: (payload) => subscribeTokens(payload.chatId, payload.afterSeq),
});
