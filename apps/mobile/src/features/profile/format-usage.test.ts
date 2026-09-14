import { expect, test } from "bun:test";
import {
  formatMetricList,
  formatPercentDelta,
  formatTokenCount,
  formatUsd,
  formatUsdHero,
  formatUsdList,
  modelLabel,
  providerFromModel,
} from "./format-usage";

test("formatTokenCount groups thousands", () => {
  expect(formatTokenCount(1234567)).toBe("1,234,567");
});

test("formatUsd uses extra precision for tiny amounts", () => {
  expect(formatUsd(0)).toBe("$0.00");
  expect(formatUsd(0.0012)).toBe("$0.001200");
  expect(formatUsd(1.5)).toBe("$1.50");
});

test("formatUsdHero matches activity-style totals", () => {
  expect(formatUsdHero(0)).toBe("$0.00");
  expect(formatUsdHero(0.355)).toBe("$0.355");
  expect(formatUsdHero(1.5)).toBe("$1.50");
});

test("formatUsdList uses a floor for tiny spend", () => {
  expect(formatUsdList(0.003)).toBe("<$0.01");
  expect(formatUsdList(0.2)).toBe("$0.20");
});

test("formatPercentDelta compares against the previous window", () => {
  expect(formatPercentDelta(0.355, 0.533)).toBe("↓ 33.4% vs previous period");
  expect(formatPercentDelta(1, 0)).toBe("↑ 100% vs previous period");
  expect(formatPercentDelta(0, 0)).toBeUndefined();
});

test("model slug helpers split provider and name", () => {
  expect(providerFromModel("openai/gpt-4o-mini")).toBe("openai");
  expect(modelLabel("openai/gpt-4o-mini")).toBe("gpt-4o-mini");
  expect(formatMetricList(12, "requests")).toBe("12");
});
