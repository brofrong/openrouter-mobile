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
import {
  DurableStream,
  type DurableStreamService,
} from "../durable-stream/DurableStream";
import {
  OpenRouterChat,
  type OpenRouterChatService,
  type OpenRouterMessage,
} from "./OpenRouterChat";

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

type GenerationErrorPayload = {
  readonly text: string;
  readonly error: string;
  readonly code: AppError["code"];
};

const isGenerationErrorPayload = (
  payload: unknown,
): payload is GenerationErrorPayload =>
  payload !== null &&
  typeof payload === "object" &&
  "error" in payload &&
  typeof payload.error === "string" &&
  payload.error.length > 0;

const generationErrorPayload = (error: AppError): GenerationErrorPayload => ({
  text: "",
  error: error.message,
  code: error.code,
});

const generationErrorFromPayload = (payload: unknown): AppError | undefined => {
  if (!isGenerationErrorPayload(payload)) {
    return undefined;
  }
  const code =
    payload.code === "STREAM_GONE" || payload.code === "OPENROUTER"
      ? payload.code
      : "OPENROUTER";
  return new AppError({
    code,
    message: payload.error,
  });
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

const tokenPayloads = (
  openrouter: OpenRouterChatService,
  outgoing: ReadonlyArray<OpenRouterMessage>,
) =>
  Stream.unwrap(
    openrouter.complete(outgoing).pipe(
      Effect.map((tokens) =>
        tokens.pipe(
          Stream.map((text) => ({ text })),
          Stream.catchTag("AppError", (error) =>
            Stream.succeed(generationErrorPayload(error)),
          ),
        ),
      ),
      Effect.catchTag("AppError", (error) =>
        Effect.succeed(Stream.succeed(generationErrorPayload(error))),
      ),
    ),
  );

const runGeneration = (options: {
  readonly chatId: string;
  readonly outgoing: ReadonlyArray<OpenRouterMessage>;
  readonly openrouter: OpenRouterChatService;
  readonly durable: DurableStreamService;
  readonly db: Effect.Success<typeof AppDb>;
}) =>
  Effect.gen(function* () {
    const events = yield* options.durable
      .runInto(
        options.chatId,
        "token",
        tokenPayloads(options.openrouter, options.outgoing),
      )
      .pipe(Stream.runCollect);
    if (events.some((event) => isGenerationErrorPayload(event.payload))) {
      return;
    }
    const content = events.map((event) => tokenText(event.payload)).join("");
    if (content.length === 0) {
      return;
    }
    yield* options.db
      .insert(messages)
      .values({
        chatId: options.chatId,
        role: "assistant",
        content,
      })
      .pipe(Effect.asVoid);
  }).pipe(
    Effect.mapError(unexpected),
    Effect.catchTag("AppError", (error) =>
      options.durable
        .append(options.chatId, "token", generationErrorPayload(error))
        .pipe(Effect.asVoid),
    ),
  );

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
      runGeneration({
        chatId: chat.id,
        outgoing,
        openrouter,
        durable,
        db,
      }),
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
        Stream.mapEffect((event) => {
          const failure = generationErrorFromPayload(event.payload);
          if (failure !== undefined) {
            return Effect.fail(failure);
          }
          return Effect.succeed(
            new TokenChunk({
              seq: event.seq,
              text: tokenText(event.payload),
            }),
          );
        }),
        Stream.mapError((error) =>
          error instanceof AppError
            ? error
            : new AppError({
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
