import { chats, messages } from "@openrouter-mobile/db";
import {
  AppError,
  type ChatId,
  type ChatKind,
  ChatMessagePage,
  decodeStoredContent,
  encodeStoredContent,
  Message,
  type MessageId,
  type OutputModality,
  type ReasoningEffort,
  TokenChunk,
} from "@openrouter-mobile/domain";
import { ChatRpcs } from "@openrouter-mobile/rpc";
import { and, eq } from "drizzle-orm";
import { DateTime, Effect, Ref, Schema, Stream } from "effect";
import { AuthMiddleware, CurrentSession } from "../../shared/AuthMiddleware";
import {
  persistChatSelection,
  requireOwnedChat,
  toChat,
} from "../../shared/chats";
import {
  sanitizeChatTitle,
  titleSummaryMessages,
} from "../../shared/chatTitle";
import { AppDb } from "../../shared/db";
import {
  type OpenRouterUsage,
  toOpenRouterUserContent,
} from "../../shared/openrouter";
import { persistUsageEvent } from "../../shared/persist-usage";
import {
  DurableStream,
  type DurableStreamService,
} from "../durable-stream/DurableStream";
import {
  OpenRouterChat,
  type OpenRouterChatService,
  type OpenRouterMessage,
  type OpenRouterStreamPart,
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

const tokenTitle = (payload: unknown): string | undefined => {
  if (
    payload !== null &&
    typeof payload === "object" &&
    "title" in payload &&
    typeof payload.title === "string" &&
    payload.title.length > 0
  ) {
    return payload.title;
  }
  return undefined;
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

export const listChats = (payload?: { readonly kind?: ChatKind }) =>
  Effect.gen(function* () {
    const session = yield* CurrentSession;
    const db = yield* AppDb;
    const rows = yield* db.query.chats
      .findMany({
        where: {
          userId: session.user.id,
          ...(payload?.kind === undefined ? {} : { kind: payload.kind }),
        },
        orderBy: { createdAt: "desc" },
      })
      .pipe(Effect.mapError(unexpected));
    return yield* Effect.all(rows.map(toChat));
  });

export const createChat = (payload?: {
  readonly kind?: ChatKind;
  readonly model?: string;
  readonly effort?: ReasoningEffort;
}) =>
  Effect.gen(function* () {
    const session = yield* CurrentSession;
    const db = yield* AppDb;
    const model = payload?.model?.trim();
    const rows = yield* db
      .insert(chats)
      .values({
        userId: session.user.id,
        kind: payload?.kind ?? "text",
        title: "New chat",
        ...(model === undefined || model.length === 0 ? {} : { model }),
        ...(payload?.effort === undefined ? {} : { effort: payload.effort }),
      })
      .returning()
      .pipe(Effect.mapError(unexpected));
    const row = rows[0];
    if (row === undefined) {
      return yield* unexpected(new Error("Chat insert returned no row"));
    }
    return yield* toChat(row);
  });

export const renameChat = (payload: {
  readonly chatId: ChatId;
  readonly title: string;
}) =>
  Effect.gen(function* () {
    const chat = yield* requireOwnedChat(payload.chatId);
    const title = sanitizeChatTitle(payload.title);
    if (title === undefined) {
      return yield* new AppError({
        code: "VALIDATION",
        message: "Title cannot be empty",
      });
    }
    const db = yield* AppDb;
    const rows = yield* db
      .update(chats)
      .set({ title, titleLocked: true })
      .where(eq(chats.id, chat.id))
      .returning()
      .pipe(Effect.mapError(unexpected));
    const row = rows[0];
    if (row === undefined) {
      return yield* notFound();
    }
    return yield* toChat(row);
  });

export const setChatModel = (payload: {
  readonly chatId: ChatId;
  readonly model: string;
  readonly effort?: ReasoningEffort;
}) =>
  persistChatSelection(payload.chatId, {
    model: payload.model,
    replaceEffort: true,
    ...(payload.effort === undefined ? {} : { effort: payload.effort }),
  });

const DEFAULT_MESSAGE_LIMIT = 30;
const MAX_MESSAGE_LIMIT = 100;

export const messagePageLimit = (limit?: number): number => {
  if (limit === undefined || !Number.isFinite(limit)) {
    return DEFAULT_MESSAGE_LIMIT;
  }
  return Math.min(MAX_MESSAGE_LIMIT, Math.max(1, Math.floor(limit)));
};

export const listMessages = (payload: {
  readonly chatId: ChatId;
  readonly afterSeq?: number;
  readonly limit?: number;
  readonly before?: MessageId;
}) =>
  Effect.gen(function* () {
    yield* requireOwnedChat(payload.chatId);
    const db = yield* AppDb;
    const limit = messagePageLimit(payload.limit);

    let cursorCreatedAt: Date | undefined;
    if (payload.before !== undefined) {
      const before = yield* db.query.messages
        .findFirst({
          where: {
            id: payload.before,
            chatId: payload.chatId,
          },
        })
        .pipe(Effect.mapError(unexpected));
      if (before === undefined || before === null) {
        return new ChatMessagePage({
          messages: [],
          hasMore: false,
          headSeq: 0,
          generating: false,
          jobs: [],
        });
      }
      cursorCreatedAt = before.createdAt;
    }

    const rows = yield* db.query.messages
      .findMany({
        where:
          cursorCreatedAt === undefined
            ? { chatId: payload.chatId }
            : {
                AND: [
                  { chatId: payload.chatId },
                  { createdAt: { lt: cursorCreatedAt } },
                ],
              },
        orderBy: { createdAt: "desc" },
        limit: limit + 1,
      })
      .pipe(Effect.mapError(unexpected));

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    page.reverse();
    const decoded = yield* Effect.all(page.map(toMessage));
    return new ChatMessagePage({
      messages: decoded,
      hasMore,
      headSeq: 0,
      generating: false,
      jobs: [],
    });
  });

const isTextPart = (
  part: OpenRouterStreamPart,
): part is Extract<OpenRouterStreamPart, { readonly _tag: "text" }> =>
  part._tag === "text";

const tokenPayloads = (
  openrouter: OpenRouterChatService,
  outgoing: ReadonlyArray<OpenRouterMessage>,
  usageRef: Ref.Ref<OpenRouterUsage | undefined>,
  options?: {
    readonly model?: string;
    readonly effort?: ReasoningEffort;
  },
) =>
  Stream.unwrap(
    openrouter.complete(outgoing, options).pipe(
      Effect.map((parts) =>
        parts.pipe(
          Stream.tap((part) =>
            part._tag === "usage" ? Ref.set(usageRef, part.usage) : Effect.void,
          ),
          Stream.filter(isTextPart),
          Stream.map((part) => ({ text: part.text })),
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

const persistUsage = (options: {
  readonly db: Effect.Success<typeof AppDb>;
  readonly userId: string;
  readonly usage: OpenRouterUsage;
  readonly model?: string;
}) =>
  persistUsageEvent({
    db: options.db,
    userId: options.userId,
    source: "chat",
    usage: options.usage,
    ...(options.model === undefined ? {} : { model: options.model }),
  });

const runGeneration = (options: {
  readonly chatId: string;
  readonly userId: string;
  readonly outgoing: ReadonlyArray<OpenRouterMessage>;
  readonly openrouter: OpenRouterChatService;
  readonly durable: DurableStreamService;
  readonly db: Effect.Success<typeof AppDb>;
  readonly model?: string;
  readonly effort?: ReasoningEffort;
}) =>
  Effect.gen(function* () {
    const usageRef = yield* Ref.make<OpenRouterUsage | undefined>(undefined);
    const events = yield* options.durable
      .runInto(
        options.chatId,
        "token",
        tokenPayloads(options.openrouter, options.outgoing, usageRef, {
          ...(options.model === undefined ? {} : { model: options.model }),
          ...(options.effort === undefined ? {} : { effort: options.effort }),
        }),
      )
      .pipe(Stream.runCollect);
    const usage = yield* Ref.get(usageRef);
    if (usage !== undefined) {
      yield* persistUsage({
        db: options.db,
        userId: options.userId,
        usage,
        ...(options.model === undefined ? {} : { model: options.model }),
      });
    }
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

const collectTitle = (parts: Stream.Stream<OpenRouterStreamPart, AppError>) =>
  parts.pipe(
    Stream.runFold(
      () => ({
        text: "",
        usage: undefined as OpenRouterUsage | undefined,
      }),
      (acc, part) =>
        part._tag === "text"
          ? { ...acc, text: acc.text + part.text }
          : part._tag === "usage"
            ? { ...acc, usage: part.usage }
            : acc,
    ),
  );

const maybeTitleFromFirstMessage = (options: {
  readonly chatId: string;
  readonly userId: string;
  readonly content: string;
  readonly titleLocked: boolean;
  readonly openrouter: OpenRouterChatService;
  readonly durable: DurableStreamService;
  readonly db: Effect.Success<typeof AppDb>;
  readonly model?: string;
}) =>
  Effect.gen(function* () {
    if (options.titleLocked) {
      return;
    }
    const collected = yield* options.openrouter
      .complete(titleSummaryMessages(options.content), {
        ...(options.model === undefined ? {} : { model: options.model }),
      })
      .pipe(
        Effect.flatMap(collectTitle),
        Effect.catchTag("AppError", () =>
          Effect.succeed({
            text: "",
            usage: undefined as OpenRouterUsage | undefined,
          }),
        ),
      );
    if (collected.usage !== undefined) {
      yield* persistUsage({
        db: options.db,
        userId: options.userId,
        usage: collected.usage,
        ...(options.model === undefined ? {} : { model: options.model }),
      });
    }
    const title = sanitizeChatTitle(collected.text);
    if (title === undefined) {
      return;
    }
    const rows = yield* options.db
      .update(chats)
      .set({ title })
      .where(and(eq(chats.id, options.chatId), eq(chats.titleLocked, false)))
      .returning()
      .pipe(Effect.mapError(unexpected));
    const row = rows[0];
    if (row === undefined) {
      return;
    }
    yield* options.durable
      .append(options.chatId, "token", { text: "", title: row.title })
      .pipe(Effect.mapError(unexpected), Effect.asVoid);
  }).pipe(Effect.catchTag("AppError", () => Effect.void));

export const sendMessage = (payload: {
  readonly chatId: ChatId;
  readonly content: string;
  readonly model?: string;
  readonly effort?: ReasoningEffort;
  readonly images?: ReadonlyArray<string>;
}) =>
  Effect.gen(function* () {
    const chat = yield* requireOwnedChat(payload.chatId);
    if (chat.kind !== "text") {
      return yield* new AppError({
        code: "VALIDATION",
        message: "Not a text chat",
      });
    }
    const images = payload.images ?? [];
    if (payload.content.trim().length === 0 && images.length === 0) {
      return yield* new AppError({
        code: "VALIDATION",
        message: "Message is empty",
      });
    }
    const stored = encodeStoredContent(payload.content, images);
    if (payload.model !== undefined) {
      yield* persistChatSelection(chat.id, {
        model: payload.model,
        replaceEffort: true,
        ...(payload.effort === undefined ? {} : { effort: payload.effort }),
      }).pipe(Effect.asVoid);
    }
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
        outgoing.push({ role, content: toOpenRouterUserContent(row.content) });
      }
    }
    outgoing.push({ role: "user", content: toOpenRouterUserContent(stored) });

    const inserted = yield* db
      .insert(messages)
      .values({
        chatId: chat.id,
        role: "user",
        content: stored,
      })
      .returning()
      .pipe(Effect.mapError(unexpected));
    const userRow = inserted[0];
    if (userRow === undefined) {
      return yield* unexpected(new Error("Message insert returned no row"));
    }

    if (history.length === 0) {
      yield* Effect.forkDetach(
        maybeTitleFromFirstMessage({
          chatId: chat.id,
          userId: chat.userId,
          content: decodeStoredContent(stored).text,
          titleLocked: chat.titleLocked,
          openrouter,
          durable,
          db,
          ...(payload.model === undefined ? {} : { model: payload.model }),
        }),
      );
    }

    yield* Effect.forkDetach(
      runGeneration({
        chatId: chat.id,
        userId: chat.userId,
        outgoing,
        openrouter,
        durable,
        db,
        ...(payload.model === undefined ? {} : { model: payload.model }),
        ...(payload.effort === undefined ? {} : { effort: payload.effort }),
      }),
    );

    return yield* toMessage(userRow);
  });

export const listModels = (payload: {
  readonly query?: string;
  readonly offset?: number;
  readonly limit?: number;
  readonly outputModality: OutputModality;
}) =>
  Effect.gen(function* () {
    const openrouter = yield* OpenRouterChat;
    const query = payload.query?.trim();
    return yield* openrouter.listModels({
      offset: payload.offset ?? 0,
      limit: messagePageLimit(payload.limit),
      outputModality: payload.outputModality,
      ...(query === undefined || query.length === 0 ? {} : { query }),
    });
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
            return Effect.succeed(
              new TokenChunk({
                seq: event.seq,
                text: tokenText(event.payload),
                error: failure.message,
              }),
            );
          }
          const title = tokenTitle(event.payload);
          return Effect.succeed(
            new TokenChunk({
              seq: event.seq,
              text: tokenText(event.payload),
              ...(title === undefined ? {} : { title }),
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
  ChatList: (payload) => listChats(payload),
  ChatCreate: (payload) => createChat(payload),
  ChatSetModel: (payload) => setChatModel(payload),
  ChatRename: (payload) => renameChat(payload),
  ChatMessages: (payload) => listMessages(payload),
  ChatSend: (payload) => sendMessage(payload),
  ChatSubscribe: (payload) => subscribeTokens(payload.chatId, payload.afterSeq),
  ModelsList: (payload) => listModels(payload),
});
