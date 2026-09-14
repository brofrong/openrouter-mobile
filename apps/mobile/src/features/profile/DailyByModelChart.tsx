import type { UsageBucket, UsageModelSlice } from "@openrouter-mobile/domain";
import { useMemo, useState } from "react";
import { Pressable } from "react-native";
import { Text, XStack, YStack } from "tamagui";
import {
  colorForModel,
  formatMetricList,
  type UsageMetric,
} from "./format-usage";

const CHART_HEIGHT = 160;
const Y_TICKS = 4;

const niceMax = (value: number): number => {
  if (value <= 0) {
    return 1;
  }
  const exp = 10 ** Math.floor(Math.log10(value));
  const scaled = value / exp;
  const nice = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;
  return nice * exp;
};

const formatAxis = (value: number, metric: UsageMetric): string => {
  if (metric === "spend") {
    return `$${value >= 1 ? value.toFixed(1) : value.toFixed(2)}`;
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)}k`;
  }
  return String(Math.round(value));
};

const formatBucketLabel = (
  date: string,
  index: number,
  total: number,
): string => {
  if (date.length === 7) {
    const month = Number(date.slice(5, 7));
    return Number.isFinite(month)
      ? new Date(Date.UTC(2026, month - 1, 1)).toLocaleString("en-US", {
          month: "short",
          timeZone: "UTC",
        })
      : date;
  }
  const parts = date.split("-");
  const month = parts[1];
  const day = parts[2];
  if (month === undefined || day === undefined) {
    return date;
  }
  const step = total > 14 ? 5 : 1;
  if (index % step !== 0 && index !== total - 1) {
    return "";
  }
  return `${Number(month)}/${Number(day)}`;
};

const sliceValue = (slice: UsageModelSlice, metric: UsageMetric): number => {
  if (metric === "tokens") {
    return slice.totalTokens;
  }
  if (metric === "requests") {
    return slice.requestCount;
  }
  return slice.costUsd;
};

const bucketValue = (bucket: UsageBucket, metric: UsageMetric): number => {
  if (metric === "tokens") {
    return bucket.totalTokens;
  }
  if (metric === "requests") {
    return bucket.requestCount;
  }
  return bucket.costUsd;
};

export function DailyByModelChart(props: {
  readonly buckets: ReadonlyArray<UsageBucket>;
  readonly metric: UsageMetric;
}) {
  const [selected, setSelected] = useState<number | undefined>();
  const max = useMemo(
    () =>
      niceMax(
        Math.max(
          0,
          ...props.buckets.map((bucket) => bucketValue(bucket, props.metric)),
        ),
      ),
    [props.buckets, props.metric],
  );
  const ticks = useMemo(
    () =>
      Array.from(
        { length: Y_TICKS },
        (_, index) => (max * (Y_TICKS - 1 - index)) / (Y_TICKS - 1),
      ),
    [max],
  );
  const selectedBucket =
    selected === undefined ? undefined : props.buckets[selected];

  return (
    <YStack gap="$2">
      <Text color="$color10">Daily by model</Text>
      <XStack gap="$2" height={CHART_HEIGHT + 28}>
        <YStack height={CHART_HEIGHT} justify="space-between" width={48}>
          {ticks.map((tick) => (
            <Text color="$color10" fontSize={10} key={tick}>
              {formatAxis(tick, props.metric)}
            </Text>
          ))}
        </YStack>
        <YStack flex={1} gap="$1">
          <XStack flex={1} items="flex-end" gap={4}>
            {props.buckets.map((bucket, index) => (
              <BarColumn
                bucket={bucket}
                key={bucket.date}
                max={max}
                metric={props.metric}
                onPress={() => {
                  setSelected((current) =>
                    current === index ? undefined : index,
                  );
                }}
                selected={selected === index}
              />
            ))}
          </XStack>
          <XStack>
            {props.buckets.map((bucket, index) => (
              <Text
                color="$color10"
                flex={1}
                fontSize={10}
                key={bucket.date}
                style={{ textAlign: "center" }}
              >
                {formatBucketLabel(bucket.date, index, props.buckets.length)}
              </Text>
            ))}
          </XStack>
        </YStack>
      </XStack>
      {selectedBucket !== undefined ? (
        <YStack gap="$1">
          <Text color="$color10">{selectedBucket.date}</Text>
          {selectedBucket.byModel.map((slice) => (
            <Text key={slice.model}>
              {slice.model} ·{" "}
              {formatMetricList(sliceValue(slice, props.metric), props.metric)}
            </Text>
          ))}
        </YStack>
      ) : null}
    </YStack>
  );
}

function BarColumn(props: {
  readonly bucket: UsageBucket;
  readonly metric: UsageMetric;
  readonly max: number;
  readonly selected: boolean;
  readonly onPress: () => void;
}) {
  const total = bucketValue(props.bucket, props.metric);
  const height = props.max <= 0 ? 0 : (total / props.max) * CHART_HEIGHT;
  const slices = [...props.bucket.byModel].reverse();

  return (
    <Pressable
      onPress={props.onPress}
      style={{ flex: 1, height: CHART_HEIGHT }}
    >
      <YStack flex={1} items="center" justify="flex-end">
        <YStack
          height={Math.max(height, total > 0 ? 4 : 0)}
          overflow="hidden"
          rounded={4}
          width="70%"
          opacity={props.selected ? 1 : 0.92}
        >
          {slices.map((slice) => {
            const value = sliceValue(slice, props.metric);
            const share = total <= 0 ? 0 : value / total;
            return (
              <YStack
                flex={share}
                key={slice.model}
                minH={share > 0 ? 2 : 0}
                style={{ backgroundColor: colorForModel(slice.model) }}
              />
            );
          })}
        </YStack>
      </YStack>
    </Pressable>
  );
}
