import {
  USAGE_SOURCES,
  UsageActivity,
  UsageBucket,
  UsageHeatmapDay,
  UsageModelSlice,
  type UsageRange,
  type UsageSource,
  UsageSourceSlice,
  UsageSummary,
  UsageTotals,
} from "@openrouter-mobile/domain";

export type UsageEventRow = {
  readonly source: string;
  readonly model: string | null;
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
  readonly costUsd: number;
  readonly createdAt: Date;
};

const MS_PER_DAY = 86_400_000;
const UNKNOWN_MODEL = "unknown";
const HEATMAP_DAYS = 365;

const emptyTotals = (): UsageTotals =>
  new UsageTotals({
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    costUsd: 0,
    requestCount: 0,
  });

const addTotals = (totals: UsageTotals, row: UsageEventRow): UsageTotals =>
  new UsageTotals({
    promptTokens: totals.promptTokens + row.promptTokens,
    completionTokens: totals.completionTokens + row.completionTokens,
    totalTokens: totals.totalTokens + row.totalTokens,
    costUsd: totals.costUsd + row.costUsd,
    requestCount: totals.requestCount + 1,
  });

export const startOfUtcDay = (date: Date): Date =>
  new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );

export const addUtcDays = (date: Date, days: number): Date =>
  new Date(date.getTime() + days * MS_PER_DAY);

export const utcDayKey = (date: Date): string =>
  startOfUtcDay(date).toISOString().slice(0, 10);

export const utcMonthKey = (date: Date): string =>
  startOfUtcDay(date).toISOString().slice(0, 7);

const endOfUtcDay = (date: Date): Date =>
  new Date(startOfUtcDay(date).getTime() + MS_PER_DAY - 1);

const isUsageSource = (value: string): value is UsageSource =>
  (USAGE_SOURCES as readonly string[]).includes(value);

const modelName = (row: UsageEventRow): string =>
  row.model !== null && row.model.length > 0 ? row.model : UNKNOWN_MODEL;

const rowSource = (row: UsageEventRow): UsageSource =>
  isUsageSource(row.source) ? row.source : "chat";

const inWindow = (
  row: UsageEventRow,
  start: Date | undefined,
  end: Date | undefined,
): boolean => {
  if (end !== undefined && row.createdAt > end) {
    return false;
  }
  if (start !== undefined && row.createdAt < start) {
    return false;
  }
  return true;
};

export const currentWindow = (
  range: UsageRange,
  now: Date,
): { readonly start: Date | undefined; readonly end: Date } => {
  const today = startOfUtcDay(now);
  const end = endOfUtcDay(today);
  if (range === "all") {
    return { start: undefined, end };
  }
  const days = range === "7d" ? 7 : 30;
  return { start: addUtcDays(today, 1 - days), end };
};

export const previousWindow = (
  range: UsageRange,
  now: Date,
): { readonly start: Date | undefined; readonly end: Date | undefined } => {
  if (range === "all") {
    return { start: undefined, end: undefined };
  }
  const current = currentWindow(range, now);
  if (current.start === undefined) {
    return { start: undefined, end: undefined };
  }
  const days = range === "7d" ? 7 : 30;
  const end = new Date(current.start.getTime() - 1);
  return { start: addUtcDays(startOfUtcDay(end), 1 - days), end };
};

type MutableSlice = {
  source: UsageSource;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  requestCount: number;
};

const emptySlice = (source: UsageSource): MutableSlice => ({
  source,
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  costUsd: 0,
  requestCount: 0,
});

const addSlice = (slice: MutableSlice, row: UsageEventRow): void => {
  slice.promptTokens += row.promptTokens;
  slice.completionTokens += row.completionTokens;
  slice.totalTokens += row.totalTokens;
  slice.costUsd += row.costUsd;
  slice.requestCount += 1;
};

const toModelSlice = (model: string, slice: MutableSlice): UsageModelSlice =>
  new UsageModelSlice({
    model,
    source: slice.source,
    promptTokens: slice.promptTokens,
    completionTokens: slice.completionTokens,
    totalTokens: slice.totalTokens,
    costUsd: slice.costUsd,
    requestCount: slice.requestCount,
  });

const groupByModel = (
  rows: ReadonlyArray<UsageEventRow>,
): ReadonlyArray<UsageModelSlice> => {
  const grouped = new Map<string, MutableSlice>();
  for (const row of rows) {
    const model = modelName(row);
    const existing = grouped.get(model);
    if (existing === undefined) {
      const slice = emptySlice(rowSource(row));
      addSlice(slice, row);
      grouped.set(model, slice);
      continue;
    }
    addSlice(existing, row);
  }
  return [...grouped.entries()]
    .map(([model, slice]) => toModelSlice(model, slice))
    .sort((left, right) => right.costUsd - left.costUsd);
};

const sumRows = (rows: ReadonlyArray<UsageEventRow>): UsageTotals =>
  rows.reduce(addTotals, emptyTotals());

const eachUtcDay = (start: Date, end: Date): ReadonlyArray<Date> => {
  const days: Array<Date> = [];
  let cursor = startOfUtcDay(start);
  const last = startOfUtcDay(end);
  while (cursor <= last) {
    days.push(cursor);
    cursor = addUtcDays(cursor, 1);
  }
  return days;
};

const eachUtcMonth = (start: Date, end: Date): ReadonlyArray<string> => {
  const months: Array<string> = [];
  let cursor = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1),
  );
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
  while (cursor <= last) {
    months.push(utcMonthKey(cursor));
    cursor = new Date(
      Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1),
    );
  }
  return months;
};

const bucketsForRange = (
  range: UsageRange,
  rows: ReadonlyArray<UsageEventRow>,
  now: Date,
): ReadonlyArray<UsageBucket> => {
  const { start, end } = currentWindow(range, now);
  const inRange = rows.filter((row) => inWindow(row, start, end));
  if (range === "all") {
    const first = inRange[0]?.createdAt ?? now;
    const keys = eachUtcMonth(first, now);
    return keys.map((key) => {
      const monthRows = inRange.filter(
        (row) => utcMonthKey(row.createdAt) === key,
      );
      const totals = sumRows(monthRows);
      return new UsageBucket({
        date: key,
        promptTokens: totals.promptTokens,
        completionTokens: totals.completionTokens,
        totalTokens: totals.totalTokens,
        costUsd: totals.costUsd,
        requestCount: totals.requestCount,
        byModel: groupByModel(monthRows),
      });
    });
  }
  const firstDay = start ?? startOfUtcDay(now);
  return eachUtcDay(firstDay, end).map((day) => {
    const key = utcDayKey(day);
    const dayRows = inRange.filter((row) => utcDayKey(row.createdAt) === key);
    const totals = sumRows(dayRows);
    return new UsageBucket({
      date: key,
      promptTokens: totals.promptTokens,
      completionTokens: totals.completionTokens,
      totalTokens: totals.totalTokens,
      costUsd: totals.costUsd,
      requestCount: totals.requestCount,
      byModel: groupByModel(dayRows),
    });
  });
};

const sourceSlices = (
  rows: ReadonlyArray<UsageEventRow>,
): ReadonlyArray<UsageSourceSlice> => {
  const grouped = new Map<UsageSource, MutableSlice>(
    USAGE_SOURCES.map((source) => [source, emptySlice(source)]),
  );
  for (const row of rows) {
    const slice = grouped.get(rowSource(row));
    if (slice !== undefined) {
      addSlice(slice, row);
    }
  }
  return USAGE_SOURCES.map((source) => {
    const slice = grouped.get(source) ?? emptySlice(source);
    return new UsageSourceSlice({
      source,
      promptTokens: slice.promptTokens,
      completionTokens: slice.completionTokens,
      totalTokens: slice.totalTokens,
      costUsd: slice.costUsd,
      requestCount: slice.requestCount,
    });
  });
};

const longestStreak = (daysWithActivity: ReadonlyArray<string>): number => {
  if (daysWithActivity.length === 0) {
    return 0;
  }
  const unique = [...new Set(daysWithActivity)].sort();
  let best = 1;
  let current = 1;
  for (let index = 1; index < unique.length; index += 1) {
    const previous = unique[index - 1];
    const day = unique[index];
    if (previous === undefined || day === undefined) {
      continue;
    }
    const delta =
      (startOfUtcDay(new Date(`${day}T00:00:00.000Z`)).getTime() -
        startOfUtcDay(new Date(`${previous}T00:00:00.000Z`)).getTime()) /
      MS_PER_DAY;
    if (delta === 1) {
      current += 1;
      if (current > best) {
        best = current;
      }
    } else {
      current = 1;
    }
  }
  return best;
};

const activityFrom = (
  rows: ReadonlyArray<UsageEventRow>,
  now: Date,
): UsageActivity => {
  const lifetime = sumRows(rows);
  const first = rows[0]?.createdAt;
  const elapsedDays =
    first === undefined
      ? 1
      : Math.max(
          1,
          Math.round(
            (startOfUtcDay(now).getTime() - startOfUtcDay(first).getTime()) /
              MS_PER_DAY,
          ) + 1,
        );
  const heatmapStart = addUtcDays(startOfUtcDay(now), 1 - HEATMAP_DAYS);
  const byDay = new Map<string, MutableSlice>();
  for (const row of rows) {
    const key = utcDayKey(row.createdAt);
    const existing = byDay.get(key) ?? emptySlice(rowSource(row));
    addSlice(existing, row);
    byDay.set(key, existing);
  }
  const heatmap = eachUtcDay(heatmapStart, now).map((day) => {
    const key = utcDayKey(day);
    const slice = byDay.get(key);
    return new UsageHeatmapDay({
      date: key,
      requestCount: slice?.requestCount ?? 0,
      costUsd: slice?.costUsd ?? 0,
      totalTokens: slice?.totalTokens ?? 0,
    });
  });
  return new UsageActivity({
    longestStreakDays: longestStreak(
      rows.map((row) => utcDayKey(row.createdAt)),
    ),
    avgPerDay: lifetime.costUsd / elapsedDays,
    avgPerWeek: (lifetime.costUsd / elapsedDays) * 7,
    total: lifetime.costUsd,
    heatmap,
  });
};

export const buildUsageSummary = (
  rows: ReadonlyArray<UsageEventRow>,
  range: UsageRange,
  now: Date,
): UsageSummary => {
  const ordered = [...rows].sort(
    (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
  );
  const current = currentWindow(range, now);
  const previous = previousWindow(range, now);
  const currentRows = ordered.filter((row) =>
    inWindow(row, current.start, current.end),
  );
  const previousRows =
    previous.start === undefined && previous.end === undefined
      ? []
      : ordered.filter((row) => inWindow(row, previous.start, previous.end));

  return new UsageSummary({
    range,
    current: sumRows(currentRows),
    previous: sumRows(previousRows),
    byDay: bucketsForRange(range, ordered, now),
    bySource: sourceSlices(currentRows),
    byModel: groupByModel(currentRows),
    activity: activityFrom(ordered, now),
  });
};
