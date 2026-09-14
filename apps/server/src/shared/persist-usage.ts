import { usageEvents } from "@openrouter-mobile/db";
import type { UsageSource } from "@openrouter-mobile/domain";
import { Effect } from "effect";
import type { AppDb } from "./db";
import type { OpenRouterUsage } from "./openrouter";

export const persistUsageEvent = (options: {
  readonly db: Effect.Success<typeof AppDb>;
  readonly userId: string;
  readonly source: UsageSource;
  readonly usage: OpenRouterUsage;
  readonly model?: string;
}) =>
  options.db
    .insert(usageEvents)
    .values({
      userId: options.userId,
      source: options.source,
      promptTokens: options.usage.promptTokens,
      completionTokens: options.usage.completionTokens,
      totalTokens: options.usage.totalTokens,
      costUsd: options.usage.costUsd,
      ...(options.model === undefined ? {} : { model: options.model }),
    })
    .pipe(Effect.ignore);
