import type { UsageTotals } from "@openrouter-mobile/domain";

export type UsageMetric = "tokens" | "spend" | "requests";

export const formatTokenCount = (value: number): string =>
  value.toLocaleString("en-US");

export const formatUsd = (value: number): string => {
  if (value === 0) {
    return "$0.00";
  }
  if (Math.abs(value) < 0.01) {
    return `$${value.toFixed(6)}`;
  }
  return `$${value.toFixed(2)}`;
};

export const formatUsdHero = (value: number): string => {
  if (value === 0) {
    return "$0.00";
  }
  if (Math.abs(value) >= 1) {
    return `$${value.toFixed(2)}`;
  }
  return `$${value.toFixed(3)}`;
};

export const formatUsdList = (value: number): string => {
  if (Math.abs(value) < 0.01) {
    return "<$0.01";
  }
  return `$${value.toFixed(2)}`;
};

export const formatRequestCount = (value: number): string =>
  value.toLocaleString("en-US");

export const metricValue = (
  totals: Pick<UsageTotals, "costUsd" | "totalTokens" | "requestCount">,
  metric: UsageMetric,
): number => {
  if (metric === "tokens") {
    return totals.totalTokens;
  }
  if (metric === "requests") {
    return totals.requestCount;
  }
  return totals.costUsd;
};

export const formatMetricValue = (
  value: number,
  metric: UsageMetric,
): string => {
  if (metric === "tokens") {
    return formatTokenCount(value);
  }
  if (metric === "requests") {
    return formatRequestCount(value);
  }
  return formatUsdHero(value);
};

export const formatMetricList = (
  value: number,
  metric: UsageMetric,
): string => {
  if (metric === "tokens") {
    return formatTokenCount(value);
  }
  if (metric === "requests") {
    return formatRequestCount(value);
  }
  return formatUsdList(value);
};

export const formatPercentDelta = (
  current: number,
  previous: number,
): string | undefined => {
  if (previous === 0 && current === 0) {
    return undefined;
  }
  if (previous === 0) {
    return "↑ 100% vs previous period";
  }
  const delta = ((current - previous) / previous) * 100;
  const arrow = delta < 0 ? "↓" : "↑";
  return `${arrow} ${Math.abs(delta).toFixed(1)}% vs previous period`;
};

export const providerFromModel = (model: string): string => {
  const slash = model.indexOf("/");
  if (slash <= 0) {
    return model;
  }
  return model.slice(0, slash);
};

export const modelLabel = (model: string): string => {
  const slash = model.indexOf("/");
  if (slash < 0 || slash === model.length - 1) {
    return model;
  }
  return model.slice(slash + 1);
};

const MODEL_COLORS = [
  "#7C9CFF",
  "#9CA3AF",
  "#34D399",
  "#A78BFA",
  "#F59E0B",
  "#F472B6",
  "#22D3EE",
] as const;

export const colorForModel = (model: string): string => {
  let hash = 0;
  for (let index = 0; index < model.length; index += 1) {
    hash = (hash * 31 + model.charCodeAt(index)) >>> 0;
  }
  return MODEL_COLORS[hash % MODEL_COLORS.length] ?? MODEL_COLORS[0];
};

export const SOURCE_COLORS: Record<
  "chat" | "image" | "video" | "speech" | "audio",
  string
> = {
  chat: "#A78BFA",
  image: "#7C9CFF",
  video: "#F59E0B",
  speech: "#34D399",
  audio: "#F472B6",
};
