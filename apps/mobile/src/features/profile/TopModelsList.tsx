import type { UsageModelSlice } from "@openrouter-mobile/domain";
import { Text, XStack, YStack } from "tamagui";
import {
  colorForModel,
  formatMetricList,
  modelLabel,
  providerFromModel,
  type UsageMetric,
} from "./format-usage";

export function TopModelsList(props: {
  readonly models: ReadonlyArray<UsageModelSlice>;
  readonly metric: UsageMetric;
}) {
  const top = props.models[0];
  const max =
    top === undefined
      ? 0
      : props.metric === "tokens"
        ? top.totalTokens
        : props.metric === "requests"
          ? top.requestCount
          : top.costUsd;

  return (
    <YStack gap="$3">
      <Text color="$color10">Top models by {props.metric}</Text>
      {props.models.length === 0 ? (
        <Text color="$color10">No usage yet</Text>
      ) : (
        props.models.map((slice) => {
          const value =
            props.metric === "tokens"
              ? slice.totalTokens
              : props.metric === "requests"
                ? slice.requestCount
                : slice.costUsd;
          const width = max <= 0 ? 0 : Math.max(0.04, value / max);
          return (
            <YStack gap="$1" key={slice.model}>
              <XStack items="center" justify="space-between" gap="$2">
                <XStack flex={1} items="center" gap="$2">
                  <YStack
                    height={8}
                    rounded={4}
                    style={{ backgroundColor: colorForModel(slice.model) }}
                    width={8}
                  />
                  <Text flex={1} numberOfLines={1}>
                    {modelLabel(slice.model)}
                  </Text>
                  <Text color="$color10">{providerFromModel(slice.model)}</Text>
                </XStack>
                <Text>{formatMetricList(value, props.metric)}</Text>
              </XStack>
              <YStack bg="$color4" height={4} overflow="hidden" rounded={4}>
                <YStack
                  height={4}
                  style={{
                    backgroundColor: colorForModel(slice.model),
                    width: `${width * 100}%`,
                  }}
                />
              </YStack>
            </YStack>
          );
        })
      )}
    </YStack>
  );
}
