import { Schema } from "effect";

export const UsageRange = Schema.Literals(["7d", "30d", "all"]);
export type UsageRange = typeof UsageRange.Type;

export const USAGE_SOURCES = [
  "chat",
  "image",
  "video",
  "speech",
  "audio",
] as const;

export const UsageSource = Schema.Literals(USAGE_SOURCES);
export type UsageSource = typeof UsageSource.Type;

export class UsageTotals extends Schema.Class<UsageTotals>("UsageTotals")({
  promptTokens: Schema.Number,
  completionTokens: Schema.Number,
  totalTokens: Schema.Number,
  costUsd: Schema.Number,
  requestCount: Schema.Number,
}) {}

export class UsageModelSlice extends Schema.Class<UsageModelSlice>(
  "UsageModelSlice",
)({
  model: Schema.String,
  source: UsageSource,
  promptTokens: Schema.Number,
  completionTokens: Schema.Number,
  totalTokens: Schema.Number,
  costUsd: Schema.Number,
  requestCount: Schema.Number,
}) {}

export class UsageSourceSlice extends Schema.Class<UsageSourceSlice>(
  "UsageSourceSlice",
)({
  source: UsageSource,
  promptTokens: Schema.Number,
  completionTokens: Schema.Number,
  totalTokens: Schema.Number,
  costUsd: Schema.Number,
  requestCount: Schema.Number,
}) {}

export class UsageBucket extends Schema.Class<UsageBucket>("UsageBucket")({
  date: Schema.String,
  promptTokens: Schema.Number,
  completionTokens: Schema.Number,
  totalTokens: Schema.Number,
  costUsd: Schema.Number,
  requestCount: Schema.Number,
  byModel: Schema.Array(UsageModelSlice),
}) {}

export class UsageHeatmapDay extends Schema.Class<UsageHeatmapDay>(
  "UsageHeatmapDay",
)({
  date: Schema.String,
  requestCount: Schema.Number,
  costUsd: Schema.Number,
  totalTokens: Schema.Number,
}) {}

export class UsageActivity extends Schema.Class<UsageActivity>("UsageActivity")(
  {
    longestStreakDays: Schema.Number,
    avgPerDay: Schema.Number,
    avgPerWeek: Schema.Number,
    total: Schema.Number,
    heatmap: Schema.Array(UsageHeatmapDay),
  },
) {}

export class UsageSummary extends Schema.Class<UsageSummary>("UsageSummary")({
  range: UsageRange,
  current: UsageTotals,
  previous: UsageTotals,
  byDay: Schema.Array(UsageBucket),
  bySource: Schema.Array(UsageSourceSlice),
  byModel: Schema.Array(UsageModelSlice),
  activity: UsageActivity,
}) {}
