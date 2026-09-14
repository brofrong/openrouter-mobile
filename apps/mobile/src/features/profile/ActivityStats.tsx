import type { UsageActivity } from "@openrouter-mobile/domain";
import { Text, XStack, YStack } from "tamagui";
import { formatUsd } from "./format-usage";

export function ActivityStats(props: { readonly activity: UsageActivity }) {
  return (
    <XStack flexWrap="wrap" gap="$4">
      <Stat
        label="Longest streak"
        value={`${props.activity.longestStreakDays} days`}
      />
      <Stat label="Average / day" value={formatUsd(props.activity.avgPerDay)} />
      <Stat
        label="Average / week"
        value={formatUsd(props.activity.avgPerWeek)}
      />
      <Stat label="Total" value={formatUsd(props.activity.total)} />
    </XStack>
  );
}

function Stat(props: { readonly label: string; readonly value: string }) {
  return (
    <YStack gap="$1" minW={120}>
      <Text color="$color10">{props.label}</Text>
      <Text fontSize={20} fontWeight="700">
        {props.value}
      </Text>
    </YStack>
  );
}
