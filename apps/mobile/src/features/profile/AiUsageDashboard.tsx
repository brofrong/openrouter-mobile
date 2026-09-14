import type { UsageRange, UsageSummary } from "@openrouter-mobile/domain";
import { useWindowDimensions } from "react-native";
import { Button, Text, XStack, YStack } from "tamagui";
import { ActivityHeatmap } from "./ActivityHeatmap";
import { ActivityStats } from "./ActivityStats";
import { DailyByModelChart } from "./DailyByModelChart";
import {
  formatMetricValue,
  formatPercentDelta,
  metricValue,
  type UsageMetric,
} from "./format-usage";
import { SourceShareBar } from "./SourceShareBar";
import { TopModelsList } from "./TopModelsList";

const RANGES: ReadonlyArray<{
  readonly id: UsageRange;
  readonly label: string;
}> = [
  { id: "7d", label: "7d" },
  { id: "30d", label: "30d" },
  { id: "all", label: "All" },
];

const METRICS: ReadonlyArray<{
  readonly id: UsageMetric;
  readonly label: string;
}> = [
  { id: "tokens", label: "Tokens" },
  { id: "spend", label: "Spend" },
  { id: "requests", label: "Requests" },
];

export function AiUsageDashboard(props: {
  readonly summary: UsageSummary;
  readonly range: UsageRange;
  readonly metric: UsageMetric;
  readonly onRangeChange: (range: UsageRange) => void;
  readonly onMetricChange: (metric: UsageMetric) => void;
}) {
  const { width } = useWindowDimensions();
  const wide = width >= 880;
  const current = metricValue(props.summary.current, props.metric);
  const previous = metricValue(props.summary.previous, props.metric);
  const delta = formatPercentDelta(current, previous);
  const deltaDown = delta?.startsWith("↓") === true;

  return (
    <YStack gap="$5">
      <XStack flexWrap="wrap" gap="$3" items="center" justify="space-between">
        <Text color="$color10">Usage summary</Text>
        <XStack flexWrap="wrap" gap="$2">
          {RANGES.map((range) => (
            <Button
              chromeless={props.range !== range.id}
              key={range.id}
              onPress={() => {
                props.onRangeChange(range.id);
              }}
              size="$2"
            >
              {range.label}
            </Button>
          ))}
          {METRICS.map((metric) => (
            <Button
              chromeless={props.metric !== metric.id}
              key={metric.id}
              onPress={() => {
                props.onMetricChange(metric.id);
              }}
              size="$2"
            >
              {metric.label}
            </Button>
          ))}
        </XStack>
      </XStack>

      <XStack flexWrap="wrap" gap="$5">
        <YStack flex={wide ? 2 : 1} gap="$3">
          <YStack>
            <Text fontSize={44} fontWeight="700">
              {formatMetricValue(current, props.metric)}
            </Text>
            {delta !== undefined ? (
              <Text color={deltaDown ? "$red10" : "$green10"}>{delta}</Text>
            ) : null}
          </YStack>
          <DailyByModelChart
            buckets={props.summary.byDay}
            metric={props.metric}
          />
          <SourceShareBar sources={props.summary.bySource} />
        </YStack>
        <YStack flex={1}>
          <TopModelsList metric={props.metric} models={props.summary.byModel} />
        </YStack>
      </XStack>

      <YStack gap="$3">
        <ActivityStats activity={props.summary.activity} />
        <ActivityHeatmap
          days={props.summary.activity.heatmap}
          metric={props.metric}
        />
      </YStack>
    </YStack>
  );
}
