import { expect, test } from "bun:test";
import {
  buildUsageSummary,
  currentWindow,
  previousWindow,
} from "../src/features/usage/build-usage-summary";

const now = new Date("2026-09-13T15:00:00.000Z");

const row = (overrides: {
  readonly createdAt: string;
  readonly costUsd?: number;
  readonly source?: string;
  readonly model?: string | null;
  readonly promptTokens?: number;
  readonly completionTokens?: number;
  readonly totalTokens?: number;
}) => ({
  source: overrides.source ?? "chat",
  model: overrides.model === undefined ? "openai/gpt-4o-mini" : overrides.model,
  promptTokens: overrides.promptTokens ?? 10,
  completionTokens: overrides.completionTokens ?? 4,
  totalTokens: overrides.totalTokens ?? 14,
  costUsd: overrides.costUsd ?? 0.01,
  createdAt: new Date(overrides.createdAt),
});

test("empty rows still return five sources and a 365-day heatmap", () => {
  const summary = buildUsageSummary([], "7d", now);
  expect(summary.current.costUsd).toBe(0);
  expect(summary.current.requestCount).toBe(0);
  expect(summary.previous.costUsd).toBe(0);
  expect(summary.bySource.map((slice) => slice.source)).toEqual([
    "chat",
    "image",
    "video",
    "speech",
    "audio",
  ]);
  expect(summary.byDay).toHaveLength(7);
  expect(summary.activity.heatmap).toHaveLength(365);
  expect(summary.activity.longestStreakDays).toBe(0);
});

test("7d window includes today and the previous six UTC days", () => {
  const { start, end } = currentWindow("7d", now);
  expect(start?.toISOString()).toBe("2026-09-07T00:00:00.000Z");
  expect(end.toISOString()).toBe("2026-09-13T23:59:59.999Z");
  const previous = previousWindow("7d", now);
  expect(previous.start?.toISOString()).toBe("2026-08-31T00:00:00.000Z");
  expect(previous.end?.toISOString()).toBe("2026-09-06T23:59:59.999Z");
});

test("buildUsageSummary splits current vs previous and stacks models by day", () => {
  const summary = buildUsageSummary(
    [
      row({ createdAt: "2026-09-01T10:00:00.000Z", costUsd: 0.2 }),
      row({
        createdAt: "2026-09-12T10:00:00.000Z",
        costUsd: 0.1,
        model: "openai/gpt-4o-mini",
      }),
      row({
        createdAt: "2026-09-12T11:00:00.000Z",
        costUsd: 0.05,
        model: "google/gemini-2.5-pro",
        source: "image",
      }),
    ],
    "7d",
    now,
  );

  expect(summary.current.costUsd).toBeCloseTo(0.15);
  expect(summary.current.requestCount).toBe(2);
  expect(summary.previous.costUsd).toBeCloseTo(0.2);
  expect(summary.byModel.map((slice) => slice.model)).toEqual([
    "openai/gpt-4o-mini",
    "google/gemini-2.5-pro",
  ]);
  expect(
    summary.bySource.find((slice) => slice.source === "image")?.costUsd,
  ).toBe(0.05);
  const stacked = summary.byDay.find((bucket) => bucket.date === "2026-09-12");
  expect(stacked?.byModel).toHaveLength(2);
  expect(stacked?.costUsd).toBeCloseTo(0.15);
});

test("all range buckets by month and leaves previous at zero", () => {
  const summary = buildUsageSummary(
    [
      row({ createdAt: "2026-07-02T00:00:00.000Z", costUsd: 1 }),
      row({ createdAt: "2026-09-13T00:00:00.000Z", costUsd: 2 }),
    ],
    "all",
    now,
  );
  expect(summary.previous.costUsd).toBe(0);
  expect(summary.current.costUsd).toBe(3);
  expect(summary.byDay.map((bucket) => bucket.date)).toEqual([
    "2026-07",
    "2026-08",
    "2026-09",
  ]);
});

test("activity streak and averages use lifetime spend", () => {
  const summary = buildUsageSummary(
    [
      row({ createdAt: "2026-09-11T00:00:00.000Z", costUsd: 1 }),
      row({ createdAt: "2026-09-12T00:00:00.000Z", costUsd: 1 }),
      row({ createdAt: "2026-09-13T00:00:00.000Z", costUsd: 1 }),
    ],
    "30d",
    now,
  );
  expect(summary.activity.longestStreakDays).toBe(3);
  expect(summary.activity.total).toBe(3);
  expect(summary.activity.avgPerDay).toBe(1);
  expect(summary.activity.avgPerWeek).toBe(7);
});
