import { chats, messages } from "@openrouter-mobile/db";
import {
  aiConfigModel,
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
  GenerationJob,
  Message,
  type MessageId,
  type OutputModality,
  type ReasoningEffort,
  StoredChatFile,
  type VideoToolOptions,
} from "@openrouter-mobile/domain";
import { ChatRpcs } from "@openrouter-mobile/rpc";
import { and, eq } from "drizzle-orm";
import { DateTime, Effect, Ref, Result, Schema, Stream } from "effect";

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
import { AppConfig } from "../../shared/config";
import { AppDb } from "../../shared/db";
import { McpClient, parseToolCallArguments } from "../../shared/mcp-client";
import { objectKeyFromUrl } from "../../shared/media-url";
import { ObjectStore } from "../../shared/object-store";
import {
  assembleToolCalls,
  DEFAULT_OPENROUTER_VIDEO_MODEL,
  type OpenRouterTool,
  type OpenRouterToolCallDelta,
  type OpenRouterUsage,
  toOpenRouterUserContent,
} from "../../shared/openrouter";
import {
  persistMediaBytes,
  persistMediaUrl,
  persistMediaUrls,
  resolveMediaUrls,
} from "../../shared/persist-media";
import { persistUsageEvent } from "../../shared/persist-usage";
import {
  logSandboxExecuteResult,
  PythonSandbox,
  type PythonSandboxService,
  truncateSandboxLog,
} from "../../shared/python-sandbox";
import {
  parsePythonToolCode,
  SANDBOX_EXECUTE_TOOL_NAME,
  sandboxBasename,
  sandboxSessionId,
  workspaceFilesPreamble,
} from "../../shared/python-tool";
import {
  GENERATE_VIDEO_TOOL,
  GENERATE_VIDEO_TOOL_NAME,
  mergeVideoToolArgs,
  parseVideoToolArgumentsJson,
  videoToolArgsFromOptions,
} from "../../shared/video-tool";
import { getAiConfig } from "../ai-config/AiConfigLive";
import {
  DurableStream,
  type DurableStreamService,
} from "../durable-stream/DurableStream";
import { startJob } from "../generation/GenerationLive";
import {
  OpenRouterChat,
  type OpenRouterChatService,
  type OpenRouterCompleteOptions,
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

const isTerminalJobPayload = (payload: unknown): boolean => {
  if (payloadTag(payload) !== "job") {
    return false;
  }
  const record = asRecord(payload);
  return record?.status === "completed" || record?.status === "failed";
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
    if (
      isDoneOrErrorPayload(row.payload) ||
      isTerminalJobPayload(row.payload)
    ) {
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

const toJob = (row: {
  readonly id: string;
  readonly userId: string;
  readonly chatId: string | null;
  readonly kind: string;
  readonly status: string;
  readonly prompt: string;
  readonly resultUrl: string | null;
  readonly error: string | null;
  readonly createdAt: Date;
}) =>
  Schema.decodeUnknownEffect(GenerationJob)({
    id: row.id,
    userId: row.userId,
    kind: row.kind,
    status: row.status,
    prompt: row.prompt,
    createdAt: DateTime.fromDateUnsafe(row.createdAt),
    ...(row.chatId !== null ? { chatId: row.chatId } : {}),
    ...(row.resultUrl !== null ? { resultUrl: row.resultUrl } : {}),
    ...(row.error !== null ? { error: row.error } : {}),
  }).pipe(Effect.mapError(unexpected));

const toOpenRouterRole = (
  role: string,
): "user" | "assistant" | "system" | undefined =>
  role === "user" || role === "assistant" || role === "system"
    ? role
    : undefined;

const openRouterUserContent = (content: string) =>
  Effect.gen(function* () {
    const decoded = decodeStoredContent(content);
    const fileNote =
      decoded.files.length === 0
        ? ""
        : `\n\nAttached files:\n${decoded.files
            .map(
              (file) =>
                `- ${file.name} (${file.mime}, ${file.size} bytes) ${file.url}`,
            )
            .join("\n")}`;
    const text = `${decoded.text}${fileNote}`;
    if (decoded.images.length === 0) {
      return toOpenRouterUserContent(text);
    }
    const images = yield* resolveMediaUrls(decoded.images).pipe(
      Effect.mapError(unexpected),
    );
    return toOpenRouterUserContent(encodeStoredContent(text, images));
  });

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
    const jobRows = yield* db.query.generationJobs
      .findMany({
        where: {
          chatId: payload.chatId,
          status: { in: ["queued", "running"] },
        },
        orderBy: { createdAt: "asc" },
      })
      .pipe(Effect.mapError(unexpected));
    const jobs = yield* Effect.all(jobRows.map(toJob));
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
  toolDeltasRef: Ref.Ref<ReadonlyArray<OpenRouterToolCallDelta>>,
  options?: {
    readonly model?: string;
    readonly effort?: ReasoningEffort;
    readonly tools?: OpenRouterCompleteOptions["tools"];
  },
) =>
  Stream.unwrap(
    openrouter
      .complete(outgoing, {
        ...(options?.model === undefined ? {} : { model: options.model }),
        ...(options?.effort === undefined ? {} : { effort: options.effort }),
        ...(options?.tools === undefined ? {} : { tools: options.tools }),
      })
      .pipe(
        Effect.map((parts) =>
          parts.pipe(
            Stream.tap((part) => {
              if (part._tag === "usage") {
                return Ref.set(usageRef, part.usage);
              }
              if (part._tag === "tool_call_delta") {
                return Ref.update(toolDeltasRef, (current) => [
                  ...current,
                  {
                    index: part.index,
                    ...(part.id === undefined ? {} : { id: part.id }),
                    ...(part.name === undefined ? {} : { name: part.name }),
                    ...(part.arguments === undefined
                      ? {}
                      : { arguments: part.arguments }),
                  },
                ]);
              }
              return Effect.void;
            }),
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

const persistChatFiles = (
  files: ReadonlyArray<StoredChatFile>,
  userId: string,
) =>
  Effect.gen(function* () {
    const stored: Array<StoredChatFile> = [];
    for (const file of files) {
      const url = yield* persistMediaUrl(file.url, userId);
      stored.push(
        new StoredChatFile({
          url,
          name: sandboxBasename(file.name),
          mime: file.mime,
          size: file.size,
        }),
      );
    }
    return stored;
  });

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

const MAX_TOOL_ROUNDS = 8;
const CHAT_TOOLS = [GENERATE_VIDEO_TOOL];

const toolCallId = (id: string): string =>
  id.length > 0 ? id : `call_${crypto.randomUUID()}`;

const bytesFromStoredUrl = (url: string) =>
  Effect.gen(function* () {
    const config = yield* AppConfig.pipe(Effect.mapError(unexpected));
    const key = objectKeyFromUrl(url, config.baseUrl);
    if (key === undefined) {
      return undefined;
    }
    const store = yield* ObjectStore;
    const result = yield* store.get(key).pipe(Effect.result);
    if (Result.isFailure(result)) {
      return undefined;
    }
    return result.success;
  });

const seedSandboxFile = (
  sandbox: PythonSandboxService,
  sessionId: string,
  path: string,
  url: string,
  mime: string,
) =>
  Effect.gen(function* () {
    const stored = yield* bytesFromStoredUrl(url);
    if (stored === undefined) {
      return;
    }
    yield* sandbox
      .putFile(
        sessionId,
        path,
        stored.body,
        mime.length > 0 ? mime : stored.contentType,
      )
      .pipe(
        Effect.tapError((error) =>
          Effect.logWarning(
            `Sandbox putFile failed path=${path}: ${truncateSandboxLog(error.message)}`,
          ).pipe(
            Effect.annotateLogs({
              sessionId,
              path,
              sandboxCode: error.code,
              message: error.message,
            }),
          ),
        ),
        Effect.ignore,
      );
  });

const seedSandboxSession = (options: {
  readonly sandbox: PythonSandboxService;
  readonly sessionId: string;
  readonly historyFiles: ReadonlyArray<StoredChatFile>;
  readonly inputFiles: ReadonlyArray<StoredChatFile>;
}) =>
  Effect.gen(function* () {
    const seen = new Set<string>();
    for (const file of options.historyFiles) {
      const name = sandboxBasename(file.name);
      if (seen.has(name)) {
        continue;
      }
      seen.add(name);
      yield* seedSandboxFile(
        options.sandbox,
        options.sessionId,
        name,
        file.url,
        file.mime,
      );
    }
    for (const file of options.inputFiles) {
      const name = sandboxBasename(file.name);
      yield* seedSandboxFile(
        options.sandbox,
        options.sessionId,
        `uploads/${name}`,
        file.url,
        file.mime,
      );
    }
  });

const harvestSandboxFiles = (options: {
  readonly sandbox: PythonSandboxService;
  readonly sessionId: string;
  readonly chatId: string;
  readonly userId: string;
  readonly files: ReadonlyArray<{
    readonly path: string;
    readonly size: number;
    readonly mime: string;
  }>;
}) =>
  Effect.gen(function* () {
    const harvested: Array<StoredChatFile> = [];
    for (const file of options.files) {
      const got = yield* options.sandbox
        .getFile(options.sessionId, file.path)
        .pipe(Effect.result);
      if (Result.isFailure(got)) {
        yield* Effect.logError(
          `Sandbox harvest failed path=${file.path}: ${truncateSandboxLog(got.failure.message)}`,
        ).pipe(
          Effect.annotateLogs({
            chatId: options.chatId,
            sessionId: options.sessionId,
            path: file.path,
            sandboxCode: got.failure.code,
            message: got.failure.message,
          }),
        );
        continue;
      }
      const mime = file.mime.length > 0 ? file.mime : got.success.mime;
      const url = yield* persistMediaBytes({
        userId: options.userId,
        bytes: got.success.body,
        contentType: mime,
      }).pipe(Effect.catchTag("AppError", () => Effect.succeed(undefined)));
      if (url === undefined) {
        yield* Effect.logError(
          `Sandbox harvest persist failed path=${file.path}`,
        ).pipe(
          Effect.annotateLogs({
            chatId: options.chatId,
            sessionId: options.sessionId,
            path: file.path,
          }),
        );
        continue;
      }
      harvested.push(
        new StoredChatFile({
          url,
          name: sandboxBasename(file.path),
          mime,
          size: file.size,
        }),
      );
    }
    return harvested;
  });

const executeVideoTool = (options: {
  readonly chatId: string;
  readonly call: {
    readonly id: string;
    readonly name: string;
    readonly arguments: string;
  };
  readonly video?: VideoToolOptions;
  readonly fallbackPrompt: string;
  readonly inputImages: ReadonlyArray<string>;
}) =>
  Effect.gen(function* () {
    const id =
      options.call.id.length > 0
        ? options.call.id
        : `call_${crypto.randomUUID()}`;
    if (options.call.name !== GENERATE_VIDEO_TOOL_NAME) {
      return {
        id,
        result: JSON.stringify({ error: `Unknown tool ${options.call.name}` }),
        files: [] as ReadonlyArray<StoredChatFile>,
      };
    }
    const config = yield* getAiConfig();
    const videoModel =
      aiConfigModel(config, "video") ?? DEFAULT_OPENROUTER_VIDEO_MODEL;
    const merged = mergeVideoToolArgs(
      parseVideoToolArgumentsJson(options.call.arguments),
      videoToolArgsFromOptions(options.video),
      {
        prompt: options.fallbackPrompt,
        model: videoModel,
        ...(options.inputImages.length === 0
          ? {}
          : { inputReferences: options.inputImages }),
      },
    );
    if (merged === undefined) {
      return {
        id,
        result: JSON.stringify({ error: "Video prompt is required" }),
        files: [] as ReadonlyArray<StoredChatFile>,
      };
    }
    const job = yield* startJob({
      kind: "video",
      chatId: options.chatId,
      prompt: merged.prompt,
      model: videoModel,
      ...(merged.aspectRatio === undefined
        ? {}
        : { aspectRatio: merged.aspectRatio }),
      ...(merged.resolution === undefined
        ? {}
        : { resolution: merged.resolution }),
      ...(merged.duration === undefined ? {} : { duration: merged.duration }),
      ...(merged.generateAudio === undefined
        ? {}
        : { generateAudio: merged.generateAudio }),
      ...(merged.size === undefined ? {} : { size: merged.size }),
      ...(merged.seed === undefined ? {} : { seed: merged.seed }),
      ...(merged.inputReferences === undefined
        ? {}
        : { inputReferences: merged.inputReferences }),
      ...(merged.frameImages === undefined
        ? {}
        : { frameImages: merged.frameImages }),
    });
    return {
      id,
      result: JSON.stringify({ status: "queued", jobId: job.id }),
      files: [] as ReadonlyArray<StoredChatFile>,
    };
  });

const executePythonTool = (options: {
  readonly chatId: string;
  readonly userId: string;
  readonly call: {
    readonly id: string;
    readonly name: string;
    readonly arguments: string;
  };
  readonly inputFiles: ReadonlyArray<StoredChatFile>;
  readonly historyFiles: ReadonlyArray<StoredChatFile>;
}) =>
  Effect.gen(function* () {
    const id = toolCallId(options.call.id);
    const code = parsePythonToolCode(options.call.arguments);
    if (code === undefined) {
      yield* Effect.logWarning(
        "Sandbox execute skipped: Python code is required",
      ).pipe(Effect.annotateLogs({ chatId: options.chatId }));
      return {
        id,
        result: JSON.stringify({ error: "Python code is required" }),
        files: [] as ReadonlyArray<StoredChatFile>,
      };
    }
    const sandbox = yield* PythonSandbox;
    const sessionId = sandboxSessionId(options.userId, options.chatId);
    yield* seedSandboxSession({
      sandbox,
      sessionId,
      historyFiles: options.historyFiles,
      inputFiles: options.inputFiles,
    });
    const executed = yield* sandbox.execute(sessionId, code).pipe(
      Effect.catchTag("SandboxError", (error) =>
        Effect.succeed({
          exitCode: 1,
          stdout: "",
          stderr: error.message,
          timedOut: false,
          files: [] as const,
        }),
      ),
    );
    yield* logSandboxExecuteResult(executed, {
      chatId: options.chatId,
      sessionId,
    });
    const files = yield* harvestSandboxFiles({
      sandbox,
      sessionId,
      chatId: options.chatId,
      userId: options.userId,
      files: executed.files,
    });
    return {
      id,
      result: JSON.stringify({
        exitCode: executed.exitCode,
        stdout: executed.stdout,
        stderr: executed.stderr,
        timedOut: executed.timedOut,
        files,
      }),
      files,
    };
  });

const executeMcpTool = (options: {
  readonly call: {
    readonly id: string;
    readonly name: string;
    readonly arguments: string;
  };
}) =>
  Effect.gen(function* () {
    const id = toolCallId(options.call.id);
    const mcp = yield* McpClient;
    const result = yield* mcp
      .callTool(
        options.call.name,
        parseToolCallArguments(options.call.arguments),
      )
      .pipe(
        Effect.catchTag("McpError", (error) =>
          Effect.logError(
            `MCP tool ${options.call.name} failed: ${truncateSandboxLog(error.message)}`,
          ).pipe(
            Effect.annotateLogs({
              tool: options.call.name,
              mcpCode: error.code,
              message: error.message,
            }),
            Effect.as(JSON.stringify({ error: error.message })),
          ),
        ),
      );
    return {
      id,
      result,
      files: [] as ReadonlyArray<StoredChatFile>,
    };
  });

const executeChatTool = (options: {
  readonly chatId: string;
  readonly userId: string;
  readonly call: {
    readonly id: string;
    readonly name: string;
    readonly arguments: string;
  };
  readonly video?: VideoToolOptions;
  readonly fallbackPrompt: string;
  readonly inputImages: ReadonlyArray<string>;
  readonly inputFiles: ReadonlyArray<StoredChatFile>;
  readonly historyFiles: ReadonlyArray<StoredChatFile>;
  readonly mcpNames: ReadonlySet<string>;
}) => {
  if (options.call.name === GENERATE_VIDEO_TOOL_NAME) {
    return executeVideoTool({
      chatId: options.chatId,
      call: options.call,
      fallbackPrompt: options.fallbackPrompt,
      inputImages: options.inputImages,
      ...(options.video === undefined ? {} : { video: options.video }),
    });
  }
  if (options.call.name === SANDBOX_EXECUTE_TOOL_NAME) {
    return executePythonTool({
      chatId: options.chatId,
      userId: options.userId,
      call: options.call,
      inputFiles: options.inputFiles,
      historyFiles: options.historyFiles,
    });
  }
  if (options.mcpNames.has(options.call.name)) {
    return executeMcpTool({ call: options.call });
  }
  return Effect.succeed({
    id: toolCallId(options.call.id),
    result: JSON.stringify({ error: `Unknown tool ${options.call.name}` }),
    files: [] as ReadonlyArray<StoredChatFile>,
  });
};

const runGeneration = (options: {
  readonly chatId: string;
  readonly userId: string;
  readonly outgoing: ReadonlyArray<OpenRouterMessage>;
  readonly openrouter: OpenRouterChatService;
  readonly durable: DurableStreamService;
  readonly db: Effect.Success<typeof AppDb>;
  readonly model?: string;
  readonly effort?: ReasoningEffort;
  readonly video?: VideoToolOptions;
  readonly fallbackPrompt: string;
  readonly inputImages: ReadonlyArray<string>;
  readonly inputFiles: ReadonlyArray<StoredChatFile>;
  readonly historyFiles: ReadonlyArray<StoredChatFile>;
}) =>
  Effect.gen(function* () {
    const outgoing: Array<OpenRouterMessage> = [...options.outgoing];
    const sandbox = yield* PythonSandbox;
    const listed = yield* sandbox
      .listFiles(sandboxSessionId(options.userId, options.chatId))
      .pipe(
        Effect.catchTag("SandboxError", (error) =>
          Effect.logWarning(
            `Sandbox listFiles failed: ${truncateSandboxLog(error.message)}`,
          ).pipe(
            Effect.annotateLogs({
              chatId: options.chatId,
              sessionId: sandboxSessionId(options.userId, options.chatId),
              sandboxCode: error.code,
              message: error.message,
            }),
            Effect.as([]),
          ),
        ),
      );
    const preamble = workspaceFilesPreamble(listed);
    if (preamble !== undefined) {
      outgoing.splice(Math.max(0, outgoing.length - 1), 0, {
        role: "user",
        content: preamble,
      });
    }
    const mcp = yield* McpClient;
    const mcpTools = yield* mcp.listTools().pipe(
      Effect.catchTag("McpError", (error) =>
        Effect.logWarning(
          `MCP listTools failed: ${truncateSandboxLog(error.message)}`,
        ).pipe(
          Effect.annotateLogs({
            mcpCode: error.code,
            message: error.message,
          }),
          Effect.as([] as ReadonlyArray<OpenRouterTool>),
        ),
      ),
    );
    const mcpNames = new Set(mcpTools.map((tool) => tool.function.name));
    const tools = [...CHAT_TOOLS, ...sandbox.chatTools, ...mcpTools];
    let usage: OpenRouterUsage | undefined;
    let content = "";
    let failed = false;
    const artifactFiles: Array<StoredChatFile> = [];

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const usageRef = yield* Ref.make<OpenRouterUsage | undefined>(undefined);
      const toolDeltasRef = yield* Ref.make<
        ReadonlyArray<OpenRouterToolCallDelta>
      >([]);
      const events = yield* options.durable
        .runInto(
          options.chatId,
          "token",
          tokenPayloads(options.openrouter, outgoing, usageRef, toolDeltasRef, {
            ...(options.model === undefined ? {} : { model: options.model }),
            ...(options.effort === undefined ? {} : { effort: options.effort }),
            tools,
          }),
        )
        .pipe(Stream.runCollect);
      const roundUsage = yield* Ref.get(usageRef);
      if (roundUsage !== undefined) {
        usage = roundUsage;
      }
      if (events.some((event) => isGenerationErrorPayload(event.payload))) {
        failed = true;
        break;
      }
      const roundText = events
        .map((event) => tokenText(event.payload))
        .join("");
      content += roundText;
      const toolCalls = assembleToolCalls(yield* Ref.get(toolDeltasRef));
      if (toolCalls.length === 0) {
        break;
      }
      const executed = yield* Effect.all(
        toolCalls.map((call) =>
          executeChatTool({
            chatId: options.chatId,
            userId: options.userId,
            call,
            fallbackPrompt: options.fallbackPrompt,
            inputImages: options.inputImages,
            inputFiles: options.inputFiles,
            historyFiles: options.historyFiles,
            mcpNames,
            ...(options.video === undefined ? {} : { video: options.video }),
          }),
        ),
      );
      for (const item of executed) {
        artifactFiles.push(...item.files);
      }
      outgoing.push({
        role: "assistant",
        content: roundText.length > 0 ? roundText : null,
        tool_calls: executed.map((item, index) => ({
          id: item.id,
          type: "function" as const,
          function: {
            name: toolCalls[index]?.name ?? SANDBOX_EXECUTE_TOOL_NAME,
            arguments: toolCalls[index]?.arguments ?? "{}",
          },
        })),
      });
      for (const item of executed) {
        outgoing.push({
          role: "tool",
          tool_call_id: item.id,
          content: item.result,
        });
      }
    }

    if (usage !== undefined) {
      yield* persistUsage({
        db: options.db,
        userId: options.userId,
        usage,
        ...(options.model === undefined ? {} : { model: options.model }),
      });
    }
    if (failed) {
      return;
    }
    const uniqueFiles = [
      ...new Map(artifactFiles.map((file) => [file.url, file])).values(),
    ];
    const stored = encodeStoredContent(content, [], uniqueFiles);
    if (stored.length === 0) {
      const encoded = yield* encodeMessage(
        new Message({
          id: crypto.randomUUID() as MessageId,
          chatId: options.chatId as ChatId,
          role: "assistant",
          content: "",
          createdAt: DateTime.fromDateUnsafe(new Date()),
        }),
      );
      yield* options.durable.append(options.chatId, "token", {
        _tag: "done",
        message: encoded,
      });
      return;
    }
    const inserted = yield* options.db
      .insert(messages)
      .values({
        chatId: options.chatId,
        role: "assistant",
        content: stored,
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
    const completeOpts =
      options.model === undefined ? {} : { model: options.model };
    const collected = yield* options.openrouter
      .complete(titleSummaryMessages(options.content), completeOpts)
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
  readonly files?: ReadonlyArray<StoredChatFile>;
  readonly video?: VideoToolOptions;
}) =>
  Effect.gen(function* () {
    const chat = yield* requireOwnedChat(payload.chatId);
    if (chat.kind !== "text") {
      return yield* new AppError({
        code: "VALIDATION",
        message: "Not a text chat",
      });
    }
    const images = yield* persistMediaUrls(payload.images ?? [], chat.userId);
    const files = yield* persistChatFiles(payload.files ?? [], chat.userId);
    if (
      payload.content.trim().length === 0 &&
      images.length === 0 &&
      files.length === 0
    ) {
      return yield* new AppError({
        code: "VALIDATION",
        message: "Message is empty",
      });
    }
    const stored = encodeStoredContent(payload.content, images, files);
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
            content: yield* openRouterUserContent(row.content),
          });
        }
      }
      outgoing.push({
        role: "user",
        content: yield* openRouterUserContent(stored),
      });

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
      return {
        userMessage,
        outgoing,
        firstMessage: history.length === 0,
        historyFiles: history.flatMap(
          (row) => decodeStoredContent(row.content).files,
        ),
      };
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
        fallbackPrompt: decodeStoredContent(stored).text,
        inputImages: images,
        inputFiles: files,
        historyFiles: prepared.historyFiles,
        ...(payload.model === undefined ? {} : { model: payload.model }),
        ...(payload.effort === undefined ? {} : { effort: payload.effort }),
        ...(payload.video === undefined ? {} : { video: payload.video }),
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
