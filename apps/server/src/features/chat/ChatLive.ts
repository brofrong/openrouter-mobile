import { chats, messages } from "@openrouter-mobile/db";
import {
  AppError,
  ChatDoneEvent,
  ChatErrorEvent,
  type ChatId,
  ChatJobEvent,
  type ChatKind,
  ChatMessagePage,
  type ChatStreamEvent,
  ChatTitleEvent,
  ChatTokenEvent,
  ChatUserEvent,
  decodeStoredContent,
  encodeStoredContent,
  Message,
  type MessageId,
  type OutputModality,
  type ReasoningEffort,
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

const asRecord = (
  payload: unknown,
): { readonly [key: string]: unknown } | undefined =>
  payload !== null && typeof payload === "object"
    ? (payload as { readonly [key: string]: unknown })
    : undefined;

const payloadTag = (payload: unknown): string | undefined => {
  const record = asRecord(payload);
  return typeof record?._tag === "string" ? record._tag : undefined;
};

const tokenText = (payload: unknown): string => {
  if (typeof payload === "string") {
    return payload;
  }
  const record = asRecord(payload);
  if (record === undefined) {
    return "";
  }
  const tag = payloadTag(payload);
  if (tag === "token" || (tag === undefined && record.title === undefined)) {
    return typeof record.text === "string" ? record.text : "";
  }
  return "";
};

const streamErrorCode = (code: unknown): ChatErrorEvent["code"] =>
  code === "STREAM_GONE" || code === "VALIDATION" || code === "OPENROUTER"
    ? code
    : "OPENROUTER";

const isDoneOrErrorPayload = (payload: unknown): boolean => {
  const tag = payloadTag(payload);
  if (tag === "done" || tag === "error") {
    return true;
  }
  if (tag !== undefined) {
    return false;
  }
  const record = asRecord(payload);
  return typeof record?.error === "string" && record.error.length > 0;
};

const isTitlePayload = (payload: unknown): boolean => {
  const tag = payloadTag(payload);
  if (tag === "title") {
    return true;
  }
  if (tag !== undefined) {
    return false;
  }
  const record = asRecord(payload);
  return typeof record?.title === "string" && record.title.length > 0;
};

const isOpenTurnPayload = (payload: unknown): boolean => {
  const tag = payloadTag(payload);
  if (tag === "user" || tag === "token" || tag === "job") {
    return true;
  }
  if (tag !== undefined) {
    return false;
  }
  const record = asRecord(payload);
  if (typeof record?.error === "string" && record.error.length > 0) {
    return false;
  }
  return typeof record?.text === "string";
};

export const pageIsGenerating = (options: {
  readonly chatGenerating: boolean;
  readonly hasJobs: boolean;
  readonly eventsDesc: ReadonlyArray<{ readonly payload: unknown }>;
}): boolean => {
  let openTurn = false;
  let terminalAtEnd = false;
  for (const row of options.eventsDesc) {
    if (isTitlePayload(row.payload)) {
      continue;
    }
    if (isDoneOrErrorPayload(row.payload)) {
      terminalAtEnd = true;
      break;
    }
    if (isOpenTurnPayload(row.payload)) {
      openTurn = true;
      break;
    }
  }
  return (
    options.hasJobs || openTurn || (options.chatGenerating && !terminalAtEnd)
  );
};

const unlockChat = (db: Effect.Success<typeof AppDb>, chatId: string) =>
  db
    .update(chats)
    .set({ generating: false })
    .where(eq(chats.id, chatId))
    .pipe(Effect.asVoid, Effect.ignore);

const inProgressText = (
  rowsDesc: ReadonlyArray<{ readonly payload: unknown }>,
): string => {
  const parts: Array<string> = [];
  for (const row of rowsDesc) {
    if (isDoneOrErrorPayload(row.payload)) {
      break;
    }
    const text = tokenText(row.payload);
    const tag = payloadTag(row.payload);
    if (tag === "token" || (tag === undefined && text.length > 0)) {
      parts.push(text);
    }
  }
  parts.reverse();
  return parts.join("");
};

type GenerationErrorPayload = {
  readonly _tag: "error";
  readonly error: string;
  readonly code: ChatErrorEvent["code"];
};

const isGenerationErrorPayload = (
  payload: unknown,
): payload is GenerationErrorPayload =>
  isDoneOrErrorPayload(payload) && payloadTag(payload) !== "done";

const generationErrorPayload = (error: AppError): GenerationErrorPayload => ({
  _tag: "error",
  error: error.message,
  code: streamErrorCode(error.code),
});

const MessageJson = Schema.toCodecJson(Message);

const encodeMessage = (message: Message) =>
  Schema.encodeUnknownEffect(MessageJson)(message).pipe(
    Effect.mapError(unexpected),
  );

const decodeStoredMessage = (value: unknown) =>
  Schema.decodeUnknownEffect(MessageJson)(value).pipe(
    Effect.mapError(unexpected),
  );

const toChatStreamEvent = (
  seq: number,
  payload: unknown,
): Effect.Effect<ChatStreamEvent | undefined, AppError> => {
  const record = asRecord(payload);
  if (record === undefined) {
    return Effect.succeed(undefined);
  }
  const tag = payloadTag(payload);
  if (tag === "user") {
    return decodeStoredMessage(record.message).pipe(
      Effect.map(
        (message) =>
          new ChatUserEvent({
            _tag: "user",
            seq,
            message,
          }),
      ),
    );
  }
  if (tag === "token") {
    return Effect.succeed(
      new ChatTokenEvent({
        _tag: "token",
        seq,
        text: typeof record.text === "string" ? record.text : "",
      }),
    );
  }
  if (tag === "title") {
    return Effect.succeed(
      new ChatTitleEvent({
        _tag: "title",
        seq,
        title: typeof record.title === "string" ? record.title : "",
      }),
    );
  }
  if (tag === "error") {
    return Effect.succeed(
      new ChatErrorEvent({
        _tag: "error",
        seq,
        error: typeof record.error === "string" ? record.error : "",
        code: streamErrorCode(record.code),
      }),
    );
  }
  if (tag === "done") {
    return decodeStoredMessage(record.message).pipe(
      Effect.map(
        (message) =>
          new ChatDoneEvent({
            _tag: "done",
            seq,
            message,
          }),
      ),
    );
  }
  if (tag === "job") {
    return Schema.decodeUnknownEffect(ChatJobEvent)({
      _tag: "job",
      seq,
      jobId: record.jobId,
      status: record.status,
      ...(typeof record.url === "string" ? { url: record.url } : {}),
      ...(typeof record.error === "string" ? { error: record.error } : {}),
    }).pipe(Effect.mapError(unexpected));
  }
  if (typeof record.error === "string" && record.error.length > 0) {
    return Effect.succeed(
      new ChatErrorEvent({
        _tag: "error",
        seq,
        error: record.error,
        code: streamErrorCode(record.code),
      }),
    );
  }
  if (typeof record.title === "string" && record.title.length > 0) {
    return Effect.succeed(
      new ChatTitleEvent({
        _tag: "title",
        seq,
        title: record.title,
      }),
    );
  }
  if (typeof record.text === "string") {
    return Effect.succeed(
      new ChatTokenEvent({
        _tag: "token",
        seq,
        text: record.text,
      }),
    );
  }
  return Effect.succeed(undefined);
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
    const chat = yield* requireOwnedChat(payload.chatId);
    const db = yield* AppDb;
    const limit = messagePageLimit(payload.limit);
    const streamRows = yield* db.query.streamEvents
      .findMany({
        where: { streamId: payload.chatId },
        orderBy: { seq: "desc" },
      })
      .pipe(Effect.mapError(unexpected));
    const inProgress = inProgressText(streamRows);
    const jobs: ChatMessagePage["jobs"] = [];
    const streamPage = {
      headSeq: streamRows[0]?.seq ?? 0,
      generating: pageIsGenerating({
        chatGenerating: chat.generating,
        hasJobs: jobs.length > 0,
        eventsDesc: streamRows,
      }),
      jobs,
      ...(inProgress.length > 0 ? { inProgress } : {}),
    };

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
          ...streamPage,
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
      ...streamPage,
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
          Stream.map((part) => ({ _tag: "token" as const, text: part.text })),
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
    const inserted = yield* options.db
      .insert(messages)
      .values({
        chatId: options.chatId,
        role: "assistant",
        content,
      })
      .returning();
    const assistantRow = inserted[0];
    if (assistantRow === undefined) {
      return;
    }
    const message = yield* toMessage(assistantRow);
    const encoded = yield* encodeMessage(message);
    yield* options.durable.append(options.chatId, "token", {
      _tag: "done",
      message: encoded,
    });
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
      .append(options.chatId, "token", { _tag: "title", title: row.title })
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
    const locked = yield* db
      .update(chats)
      .set({ generating: true })
      .where(and(eq(chats.id, chat.id), eq(chats.generating, false)))
      .returning({ id: chats.id })
      .pipe(Effect.mapError(unexpected));
    if (locked[0] === undefined) {
      return yield* new AppError({
        code: "VALIDATION",
        message: "Already generating",
      });
    }

    const prepared = yield* Effect.gen(function* () {
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
          outgoing.push({
            role,
            content: toOpenRouterUserContent(row.content),
          });
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
      const userMessage = yield* toMessage(userRow);
      const encoded = yield* encodeMessage(userMessage);
      yield* durable
        .append(chat.id, "token", { _tag: "user", message: encoded })
        .pipe(Effect.mapError(unexpected), Effect.asVoid);
      return { userMessage, outgoing, firstMessage: history.length === 0 };
    }).pipe(Effect.tapError(() => unlockChat(db, chat.id)));

    if (prepared.firstMessage) {
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
        outgoing: prepared.outgoing,
        openrouter,
        durable,
        db,
        ...(payload.model === undefined ? {} : { model: payload.model }),
        ...(payload.effort === undefined ? {} : { effort: payload.effort }),
      }).pipe(Effect.ensuring(unlockChat(db, chat.id))),
    );

    return prepared.userMessage;
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
        Stream.mapEffect((event) =>
          toChatStreamEvent(event.seq, event.payload),
        ),
        Stream.filter((event): event is ChatStreamEvent => event !== undefined),
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
