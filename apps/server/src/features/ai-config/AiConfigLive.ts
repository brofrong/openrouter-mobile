import { userAiConfigs } from "@openrouter-mobile/db";
import { AiConfig, AppError, type ChatKind } from "@openrouter-mobile/domain";
import { AiConfigRpcs } from "@openrouter-mobile/rpc";
import { eq } from "drizzle-orm";
import { Effect } from "effect";
import { AuthMiddleware, CurrentSession } from "../../shared/AuthMiddleware";
import { AppDb } from "../../shared/db";

const unexpected = (error: unknown) =>
  new AppError({
    code: "STREAM_GONE",
    message: error instanceof Error ? error.message : "Unexpected error",
  });

const columnForKind = (kind: ChatKind) => {
  switch (kind) {
    case "text":
      return "textModel" as const;
    case "image":
      return "imageModel" as const;
    case "video":
      return "videoModel" as const;
    case "speech":
      return "speechModel" as const;
    case "audio":
      return "audioModel" as const;
  }
};

const toAiConfig = (row?: typeof userAiConfigs.$inferSelect | null) =>
  new AiConfig({
    ...(row?.textModel === undefined ||
    row.textModel === null ||
    row.textModel.length === 0
      ? {}
      : { text: row.textModel }),
    ...(row?.imageModel === undefined ||
    row.imageModel === null ||
    row.imageModel.length === 0
      ? {}
      : { image: row.imageModel }),
    ...(row?.videoModel === undefined ||
    row.videoModel === null ||
    row.videoModel.length === 0
      ? {}
      : { video: row.videoModel }),
    ...(row?.speechModel === undefined ||
    row.speechModel === null ||
    row.speechModel.length === 0
      ? {}
      : { speech: row.speechModel }),
    ...(row?.audioModel === undefined ||
    row.audioModel === null ||
    row.audioModel.length === 0
      ? {}
      : { audio: row.audioModel }),
  });

export const getAiConfig = () =>
  Effect.gen(function* () {
    const session = yield* CurrentSession;
    const db = yield* AppDb;
    const row = yield* db.query.userAiConfigs
      .findFirst({
        where: { userId: session.user.id },
      })
      .pipe(Effect.mapError(unexpected));
    return toAiConfig(row);
  });

export const setAiConfigModel = (kind: ChatKind, model: string) =>
  Effect.gen(function* () {
    const trimmed = model.trim();
    if (trimmed.length === 0) {
      return yield* new AppError({
        code: "VALIDATION",
        message: "Model cannot be empty",
      });
    }
    const session = yield* CurrentSession;
    const db = yield* AppDb;
    const column = columnForKind(kind);
    const existing = yield* db.query.userAiConfigs
      .findFirst({
        where: { userId: session.user.id },
      })
      .pipe(Effect.mapError(unexpected));
    const now = new Date();
    if (existing === undefined || existing === null) {
      const rows = yield* db
        .insert(userAiConfigs)
        .values({
          userId: session.user.id,
          [column]: trimmed,
          updatedAt: now,
        })
        .returning()
        .pipe(Effect.mapError(unexpected));
      return toAiConfig(rows[0]);
    }
    const rows = yield* db
      .update(userAiConfigs)
      .set({
        [column]: trimmed,
        updatedAt: now,
      })
      .where(eq(userAiConfigs.userId, session.user.id))
      .returning()
      .pipe(Effect.mapError(unexpected));
    return toAiConfig(rows[0]);
  });

export const AiConfigLive = AiConfigRpcs.middleware(AuthMiddleware).toLayer({
  AiConfigGet: () => getAiConfig(),
  AiConfigSet: (payload) => setAiConfigModel(payload.kind, payload.model),
});
