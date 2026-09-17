import { chats, generationJobs, messages } from "@openrouter-mobile/db";
import {
  AppError,
  type ChatId,
  encodeStoredContent,
  GenerationJob,
  type GenerationJobId,
  JobEvent,
  Message,
} from "@openrouter-mobile/domain";
import { JobRpcs, MediaRpcs } from "@openrouter-mobile/rpc";
import { eq } from "drizzle-orm";
import { Cause, DateTime, Effect, Schema, Stream } from "effect";
import { AuthMiddleware, CurrentSession } from "../../shared/AuthMiddleware";
import { persistChatSelection, requireOwnedChatKind } from "../../shared/chats";
import { sanitizeChatTitle } from "../../shared/chatTitle";
import { AppDb } from "../../shared/db";
import type { OpenRouterUsage } from "../../shared/openrouter";
import {
  persistGeneratedUrl,
  persistMediaUrls,
  resolveMediaUrls,
} from "../../shared/persist-media";
import { persistUsageEvent } from "../../shared/persist-usage";
import {
  DurableStream,
  type DurableStreamService,
} from "../durable-stream/DurableStream";
import {
  type MediaKind,
  OpenRouterMedia,
  type OpenRouterMediaService,
} from "./OpenRouterMedia";

const unexpected = (error: unknown) =>
  new AppError({
    code: "STREAM_GONE",
    message: error instanceof Error ? error.message : "Unexpected error",
  });

const notFound = () =>
  new AppError({
    code: "NOT_FOUND",
    message: "Job not found",
  });

const JobEventPayload = Schema.Struct({
  status: Schema.Literals(["queued", "running", "completed", "failed"]),
  progress: Schema.optionalKey(Schema.Number),
  url: Schema.optionalKey(Schema.String),
  error: Schema.optionalKey(Schema.String),
});

type JobEventPayload = typeof JobEventPayload.Type;

const toAppError = (error: unknown): AppError =>
  error instanceof AppError ? error : unexpected(error);

const toJob = (row: typeof generationJobs.$inferSelect) =>
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

const MessageJson = Schema.toCodecJson(Message);

const encodeMessage = (message: Message) =>
  Schema.encodeUnknownEffect(MessageJson)(message).pipe(
    Effect.mapError(unexpected),
  );

const toMessage = (row: typeof messages.$inferSelect) =>
  Schema.decodeUnknownEffect(Message)({
    id: row.id,
    chatId: row.chatId,
    role: row.role,
    content: row.content,
    createdAt: DateTime.fromDateUnsafe(row.createdAt),
  }).pipe(Effect.mapError(unexpected));

const toJobEvent = (seq: number, payload: unknown) =>
  Schema.decodeUnknownEffect(JobEventPayload)(payload).pipe(
    Effect.map(
      (decoded) =>
        new JobEvent({
          seq,
          ...decoded,
        }),
    ),
    Effect.mapError(unexpected),
  );

const requireOwnedJob = (jobId: string) =>
  Effect.gen(function* () {
    const session = yield* CurrentSession;
    const db = yield* AppDb;
    const job = yield* db.query.generationJobs
      .findFirst({
        where: {
          id: jobId,
          userId: session.user.id,
        },
      })
      .pipe(Effect.mapError(unexpected));
    if (job === undefined || job === null) {
      return yield* notFound();
    }
    return job;
  });

const appendJobEvent = (
  durable: DurableStreamService,
  jobId: string,
  payload: JobEventPayload,
  chatId?: string,
) =>
  Effect.gen(function* () {
    yield* durable
      .append(jobId, "job", payload)
      .pipe(Effect.mapError(unexpected));
    if (chatId !== undefined) {
      yield* durable
        .append(chatId, "token", {
          _tag: "job" as const,
          jobId,
          status: payload.status,
          ...(payload.url === undefined ? {} : { url: payload.url }),
          ...(payload.error === undefined ? {} : { error: payload.error }),
        })
        .pipe(Effect.mapError(unexpected));
    }
  }).pipe(Effect.asVoid);

const errorFromCause = (cause: Cause.Cause<unknown>): AppError => {
  const squashed = Cause.squash(cause);
  if (squashed instanceof AppError) {
    return squashed;
  }
  if (squashed instanceof Error) {
    return unexpected(squashed);
  }
  const pretty = Cause.pretty(cause);
  return unexpected(
    new Error(pretty.length > 0 ? pretty : "Generation fiber failed"),
  );
};

const persistFailure = (options: {
  readonly jobId: string;
  readonly error: AppError;
  readonly db: Effect.Success<typeof AppDb>;
  readonly durable: DurableStreamService;
  readonly chatId?: string;
}) =>
  Effect.gen(function* () {
    const row = yield* options.db.query.generationJobs
      .findFirst({
        where: { id: options.jobId },
      })
      .pipe(Effect.mapError(unexpected));
    if (row === undefined || row.status === "completed") {
      return;
    }
    if (row.status !== "failed") {
      yield* options.db
        .update(generationJobs)
        .set({
          status: "failed",
          error: options.error.message,
        })
        .where(eq(generationJobs.id, options.jobId))
        .pipe(Effect.mapError(unexpected), Effect.asVoid);
    }
    const chatId =
      options.chatId ?? (row.chatId === null ? undefined : row.chatId);
    yield* appendJobEvent(
      options.durable,
      options.jobId,
      {
        status: "failed",
        error: options.error.message,
      },
      chatId,
    );
  }).pipe(Effect.asVoid);

const zeroUsage: OpenRouterUsage = {
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  costUsd: 0,
};

const trackedMediaSource = (
  kind: MediaKind,
): "image" | "video" | "speech" | "audio" => kind;

const runGeneration = (options: {
  readonly jobId: string;
  readonly userId: string;
  readonly kind: MediaKind;
  readonly prompt: string;
  readonly chatId?: string;
  readonly model?: string;
  readonly aspectRatio?: string;
  readonly resolution?: string;
  readonly quality?: string;
  readonly background?: string;
  readonly n?: number;
  readonly duration?: number;
  readonly generateAudio?: boolean;
  readonly inputReferences?: ReadonlyArray<string>;
  readonly voice?: string;
  readonly db: Effect.Success<typeof AppDb>;
  readonly durable: DurableStreamService;
  readonly media: OpenRouterMediaService;
}) => {
  const fail = (error: AppError) =>
    persistFailure({
      jobId: options.jobId,
      error,
      db: options.db,
      durable: options.durable,
      ...(options.chatId === undefined ? {} : { chatId: options.chatId }),
    });

  return Effect.gen(function* () {
    yield* options.db
      .update(generationJobs)
      .set({ status: "running" })
      .where(eq(generationJobs.id, options.jobId))
      .pipe(Effect.mapError(unexpected), Effect.asVoid);
    yield* appendJobEvent(
      options.durable,
      options.jobId,
      {
        status: "running",
      },
      options.chatId,
    );

    const inputReferences =
      options.inputReferences === undefined
        ? undefined
        : yield* resolveMediaUrls(options.inputReferences).pipe(
            Effect.mapError(toAppError),
          );

    const generated = yield* options.media
      .generate({
        kind: options.kind,
        prompt: options.prompt,
        jobId: options.jobId,
        ...(options.model === undefined ? {} : { model: options.model }),
        ...(options.aspectRatio === undefined
          ? {}
          : { aspectRatio: options.aspectRatio }),
        ...(options.resolution === undefined
          ? {}
          : { resolution: options.resolution }),
        ...(options.quality === undefined ? {} : { quality: options.quality }),
        ...(options.background === undefined
          ? {}
          : { background: options.background }),
        ...(options.n === undefined ? {} : { n: options.n }),
        ...(options.duration === undefined
          ? {}
          : { duration: options.duration }),
        ...(options.generateAudio === undefined
          ? {}
          : { generateAudio: options.generateAudio }),
        ...(inputReferences === undefined ? {} : { inputReferences }),
        ...(options.voice === undefined ? {} : { voice: options.voice }),
      })
      .pipe(
        Effect.mapError(toAppError),
        Effect.catchTag("AppError", (error) =>
          fail(error).pipe(Effect.as(undefined)),
        ),
      );
    if (generated === undefined) {
      return;
    }

    const storedUrl = yield* persistGeneratedUrl(
      generated.url,
      options.userId,
    ).pipe(
      Effect.mapError(toAppError),
      Effect.catchTag("AppError", (error) =>
        fail(error).pipe(Effect.as(undefined)),
      ),
    );
    if (storedUrl === undefined) {
      return;
    }

    const result = { ...generated, url: storedUrl };

    yield* persistUsageEvent({
      db: options.db,
      userId: options.userId,
      source: trackedMediaSource(options.kind),
      usage: result.usage ?? zeroUsage,
      ...(options.model === undefined ? {} : { model: options.model }),
    });

    yield* options.db
      .update(generationJobs)
      .set({
        status: "completed",
        resultUrl: result.url.split("\n")[0] ?? result.url,
      })
      .where(eq(generationJobs.id, options.jobId))
      .pipe(Effect.mapError(unexpected), Effect.asVoid);
    if (options.chatId !== undefined) {
      yield* options.db
        .insert(messages)
        .values({
          chatId: options.chatId,
          role: "assistant",
          content: result.url,
        })
        .pipe(Effect.mapError(unexpected), Effect.asVoid);
    }
    yield* appendJobEvent(
      options.durable,
      options.jobId,
      {
        status: "completed",
        url: result.url,
      },
      options.chatId,
    );
  }).pipe(
    Effect.catchCause((cause) =>
      fail(errorFromCause(cause)).pipe(Effect.catchCause(() => Effect.void)),
    ),
  );
};

const startJob = (options: {
  readonly kind: MediaKind;
  readonly prompt: string;
  readonly chatId?: string;
  readonly model?: string;
  readonly aspectRatio?: string;
  readonly resolution?: string;
  readonly quality?: string;
  readonly background?: string;
  readonly n?: number;
  readonly duration?: number;
  readonly generateAudio?: boolean;
  readonly inputReferences?: ReadonlyArray<string>;
  readonly voice?: string;
}) =>
  Effect.gen(function* () {
    const session = yield* CurrentSession;
    const db = yield* AppDb;
    const durable = yield* DurableStream;
    const media = yield* OpenRouterMedia;

    const inserted = yield* db
      .insert(generationJobs)
      .values({
        userId: session.user.id,
        kind: options.kind,
        status: "queued",
        prompt: options.prompt,
        ...(options.chatId === undefined ? {} : { chatId: options.chatId }),
      })
      .returning()
      .pipe(Effect.mapError(unexpected));
    const row = inserted[0];
    if (row === undefined) {
      return yield* unexpected(new Error("Job insert returned no row"));
    }

    yield* appendJobEvent(
      durable,
      row.id,
      { status: "queued" },
      options.chatId,
    );

    yield* Effect.forkDetach(
      runGeneration({
        jobId: row.id,
        userId: session.user.id,
        kind: options.kind,
        prompt: options.prompt,
        db,
        durable,
        media,
        ...(options.chatId === undefined ? {} : { chatId: options.chatId }),
        ...(options.model === undefined ? {} : { model: options.model }),
        ...(options.aspectRatio === undefined
          ? {}
          : { aspectRatio: options.aspectRatio }),
        ...(options.resolution === undefined
          ? {}
          : { resolution: options.resolution }),
        ...(options.quality === undefined ? {} : { quality: options.quality }),
        ...(options.background === undefined
          ? {}
          : { background: options.background }),
        ...(options.n === undefined ? {} : { n: options.n }),
        ...(options.duration === undefined
          ? {}
          : { duration: options.duration }),
        ...(options.generateAudio === undefined
          ? {}
          : { generateAudio: options.generateAudio }),
        ...(options.inputReferences === undefined
          ? {}
          : { inputReferences: options.inputReferences }),
        ...(options.voice === undefined ? {} : { voice: options.voice }),
      }),
    );

    return yield* toJob(row);
  });

export const getJob = (jobId: GenerationJobId) =>
  Effect.gen(function* () {
    const row = yield* requireOwnedJob(jobId);
    return yield* toJob(row);
  });

export const subscribeJob = (jobId: GenerationJobId, afterSeq?: number) =>
  Stream.unwrap(
    Effect.gen(function* () {
      yield* requireOwnedJob(jobId);
      const durable = yield* DurableStream;
      return durable.subscribe(jobId, afterSeq).pipe(
        Stream.filter((event) => event.kind === "job"),
        Stream.mapEffect((event) => toJobEvent(event.seq, event.payload)),
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

const generateInChat = (options: {
  readonly kind: MediaKind;
  readonly chatId: ChatId;
  readonly prompt: string;
  readonly model?: string;
  readonly aspectRatio?: string;
  readonly resolution?: string;
  readonly quality?: string;
  readonly background?: string;
  readonly n?: number;
  readonly duration?: number;
  readonly generateAudio?: boolean;
  readonly inputReferences?: ReadonlyArray<string>;
  readonly voice?: string;
}) =>
  Effect.gen(function* () {
    const chat = yield* requireOwnedChatKind(options.chatId, options.kind);
    if (options.model !== undefined) {
      yield* persistChatSelection(chat.id, { model: options.model }).pipe(
        Effect.asVoid,
      );
    }
    const db = yield* AppDb;
    const durable = yield* DurableStream;
    const inputReferences = yield* persistMediaUrls(
      options.inputReferences ?? [],
      chat.userId,
    ).pipe(Effect.mapError(toAppError));
    const history = yield* db.query.messages
      .findMany({
        where: { chatId: chat.id },
      })
      .pipe(Effect.mapError(unexpected));
    const inserted = yield* db
      .insert(messages)
      .values({
        chatId: chat.id,
        role: "user",
        content: encodeStoredContent(options.prompt, inputReferences),
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

    if (history.length === 0 && !chat.titleLocked) {
      const title = sanitizeChatTitle(options.prompt);
      if (title !== undefined) {
        const rows = yield* db
          .update(chats)
          .set({ title })
          .where(eq(chats.id, chat.id))
          .returning()
          .pipe(Effect.mapError(unexpected));
        if (rows[0] !== undefined) {
          yield* durable
            .append(chat.id, "token", { text: "", title })
            .pipe(Effect.mapError(unexpected), Effect.asVoid);
        }
      }
    }

    return yield* startJob({
      kind: options.kind,
      prompt: options.prompt,
      chatId: chat.id,
      ...(options.model === undefined ? {} : { model: options.model }),
      ...(options.aspectRatio === undefined
        ? {}
        : { aspectRatio: options.aspectRatio }),
      ...(options.resolution === undefined
        ? {}
        : { resolution: options.resolution }),
      ...(options.quality === undefined ? {} : { quality: options.quality }),
      ...(options.background === undefined
        ? {}
        : { background: options.background }),
      ...(options.n === undefined ? {} : { n: options.n }),
      ...(options.duration === undefined ? {} : { duration: options.duration }),
      ...(options.generateAudio === undefined
        ? {}
        : { generateAudio: options.generateAudio }),
      ...(inputReferences.length === 0 ? {} : { inputReferences }),
      ...(options.voice === undefined ? {} : { voice: options.voice }),
    });
  });

export const generateImage = (payload: {
  readonly chatId: ChatId;
  readonly prompt: string;
  readonly model?: string;
  readonly aspectRatio?: string;
  readonly resolution?: string;
  readonly quality?: string;
  readonly background?: string;
  readonly n?: number;
  readonly inputReferences?: ReadonlyArray<string>;
}) =>
  generateInChat({
    kind: "image",
    chatId: payload.chatId,
    prompt: payload.prompt,
    ...(payload.model === undefined ? {} : { model: payload.model }),
    ...(payload.aspectRatio === undefined
      ? {}
      : { aspectRatio: payload.aspectRatio }),
    ...(payload.resolution === undefined
      ? {}
      : { resolution: payload.resolution }),
    ...(payload.quality === undefined ? {} : { quality: payload.quality }),
    ...(payload.background === undefined
      ? {}
      : { background: payload.background }),
    ...(payload.n === undefined ? {} : { n: payload.n }),
    ...(payload.inputReferences === undefined
      ? {}
      : { inputReferences: payload.inputReferences }),
  });

export const generateVideo = (payload: {
  readonly chatId: ChatId;
  readonly prompt: string;
  readonly model?: string;
  readonly aspectRatio?: string;
  readonly resolution?: string;
  readonly duration?: number;
  readonly generateAudio?: boolean;
}) =>
  generateInChat({
    kind: "video",
    chatId: payload.chatId,
    prompt: payload.prompt,
    ...(payload.model === undefined ? {} : { model: payload.model }),
    ...(payload.aspectRatio === undefined
      ? {}
      : { aspectRatio: payload.aspectRatio }),
    ...(payload.resolution === undefined
      ? {}
      : { resolution: payload.resolution }),
    ...(payload.duration === undefined ? {} : { duration: payload.duration }),
    ...(payload.generateAudio === undefined
      ? {}
      : { generateAudio: payload.generateAudio }),
  });

export const synthesizeSpeech = (payload: {
  readonly chatId: ChatId;
  readonly text: string;
  readonly model?: string;
  readonly voice?: string;
}) =>
  generateInChat({
    kind: "speech",
    chatId: payload.chatId,
    prompt: payload.text,
    ...(payload.model === undefined ? {} : { model: payload.model }),
    ...(payload.voice === undefined ? {} : { voice: payload.voice }),
  });

export const generateAudio = (payload: {
  readonly chatId: ChatId;
  readonly prompt: string;
  readonly model?: string;
}) =>
  generateInChat({
    kind: "audio",
    chatId: payload.chatId,
    prompt: payload.prompt,
    ...(payload.model === undefined ? {} : { model: payload.model }),
  });

export const GenerationLive = JobRpcs.merge(MediaRpcs)
  .middleware(AuthMiddleware)
  .toLayer({
    JobGet: (payload) => getJob(payload.jobId),
    JobSubscribe: (payload) => subscribeJob(payload.jobId, payload.afterSeq),
    ImageGenerate: (payload) => generateImage(payload),
    VideoGenerate: (payload) => generateVideo(payload),
    SpeechSynthesize: (payload) => synthesizeSpeech(payload),
    AudioGenerate: (payload) => generateAudio(payload),
  });
