import { AppError, type UsageRange } from "@openrouter-mobile/domain";
import { UsageRpcs } from "@openrouter-mobile/rpc";
import { Effect } from "effect";
import { AuthMiddleware, CurrentSession } from "../../shared/AuthMiddleware";
import { AppDb } from "../../shared/db";
import { buildUsageSummary } from "./build-usage-summary";

const unexpected = (error: unknown) =>
  new AppError({
    code: "STREAM_GONE",
    message: error instanceof Error ? error.message : "Unexpected error",
  });

export const summarizeUsage = (range: UsageRange = "30d") =>
  Effect.gen(function* () {
    const session = yield* CurrentSession;
    const db = yield* AppDb;
    const rows = yield* db.query.usageEvents
      .findMany({
        where: { userId: session.user.id },
      })
      .pipe(Effect.mapError(unexpected));

    return buildUsageSummary(rows, range, new Date());
  });

export const UsageLive = UsageRpcs.middleware(AuthMiddleware).toLayer({
  UsageSummary: (payload) => summarizeUsage(payload.range ?? "30d"),
});
