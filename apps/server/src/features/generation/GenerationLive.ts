import { generationJobs } from "@openrouter-mobile/db";
import {
  AppError,
  GenerationJob,
  type GenerationJobId,
  JobEvent,
} from "@openrouter-mobile/domain";
import { JobRpcs, MediaRpcs } from "@openrouter-mobile/rpc";
import { eq } from "drizzle-orm";
import { DateTime, Effect, Schema, Stream } from "effect";
import { AuthMiddleware, CurrentSession } from "../../shared/AuthMiddleware";
import { AppDb } from "../../shared/db";
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
    ...(row.resultUrl !== null ? { resultUrl: row.resultUrl } : {}),
    ...(row.error !== null ? { error: row.error } : {}),
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
) =>
  durable
    .append(jobId, "job", payload)
    .pipe(Effect.mapError(unexpected), Effect.asVoid);

const persistFailure = (options: {
  readonly jobId: string;
  readonly error: AppError;
  readonly db: Effect.Success<typeof AppDb>;
  readonly durable: DurableStreamService;
}) =>
  Effect.gen(function* () {
    yield* options.db
      .update(generationJobs)
      .set({
        status: "failed",
        error: options.error.message,
      })
      .where(eq(generationJobs.id, options.jobId))
      .pipe(Effect.mapError(unexpected), Effect.asVoid);
    yield* appendJobEvent(options.durable, options.jobId, {
      status: "failed",
      error: options.error.message,
    });
  }).pipe(Effect.asVoid);

const runGeneration = (options: {
  readonly jobId: string;
  readonly kind: MediaKind;
  readonly prompt: string;
  readonly db: Effect.Success<typeof AppDb>;
  readonly durable: DurableStreamService;
  readonly media: OpenRouterMediaService;
}) =>
  Effect.gen(function* () {
    yield* options.db
      .update(generationJobs)
      .set({ status: "running" })
      .where(eq(generationJobs.id, options.jobId))
      .pipe(Effect.mapError(unexpected), Effect.asVoid);
    yield* appendJobEvent(options.durable, options.jobId, {
      status: "running",
    });

    const result = yield* options.media
      .generate({
        kind: options.kind,
        prompt: options.prompt,
        jobId: options.jobId,
      })
      .pipe(Effect.mapError(toAppError));

    yield* options.db
      .update(generationJobs)
      .set({
        status: "completed",
        resultUrl: result.url,
      })
      .where(eq(generationJobs.id, options.jobId))
      .pipe(Effect.mapError(unexpected), Effect.asVoid);
    yield* appendJobEvent(options.durable, options.jobId, {
      status: "completed",
      url: result.url,
    });
  }).pipe(
    Effect.catchTag("AppError", (error) =>
      persistFailure({
        jobId: options.jobId,
        error,
        db: options.db,
        durable: options.durable,
      }),
    ),
  );

const startJob = (kind: MediaKind, prompt: string) =>
  Effect.gen(function* () {
    const session = yield* CurrentSession;
    const db = yield* AppDb;
    const durable = yield* DurableStream;
    const media = yield* OpenRouterMedia;

    const inserted = yield* db
      .insert(generationJobs)
      .values({
        userId: session.user.id,
        kind,
        status: "queued",
        prompt,
      })
      .returning()
      .pipe(Effect.mapError(unexpected));
    const row = inserted[0];
    if (row === undefined) {
      return yield* unexpected(new Error("Job insert returned no row"));
    }

    yield* appendJobEvent(durable, row.id, { status: "queued" });

    yield* Effect.forkDetach(
      runGeneration({
        jobId: row.id,
        kind,
        prompt,
        db,
        durable,
        media,
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

export const generateImage = (payload: { readonly prompt: string }) =>
  startJob("image", payload.prompt);

export const generateVideo = (payload: { readonly prompt: string }) =>
  startJob("video", payload.prompt);

export const synthesizeSpeech = (payload: {
  readonly text: string;
  readonly voice?: string;
}) => startJob("speech", payload.text);

export const transcribeAudio = (payload: { readonly assetId: string }) =>
  startJob("audio", payload.assetId);

export const GenerationLive = JobRpcs.merge(MediaRpcs)
  .middleware(AuthMiddleware)
  .toLayer({
    JobGet: (payload) => getJob(payload.jobId),
    JobSubscribe: (payload) => subscribeJob(payload.jobId, payload.afterSeq),
    ImageGenerate: (payload) => generateImage(payload),
    VideoGenerate: (payload) => generateVideo(payload),
    SpeechSynthesize: (payload) => synthesizeSpeech(payload),
    AudioTranscribe: (payload) => transcribeAudio(payload),
  });
