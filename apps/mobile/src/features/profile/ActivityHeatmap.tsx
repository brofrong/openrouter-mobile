import type { UsageHeatmapDay } from "@openrouter-mobile/domain";
import { useMemo } from "react";
import { ScrollView, View } from "react-native";
import { Text, XStack, YStack } from "tamagui";
import type { UsageMetric } from "./format-usage";

const CELL = 10;
const GAP = 3;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

const dayValue = (day: UsageHeatmapDay, metric: UsageMetric): number => {
  if (metric === "tokens") {
    return day.totalTokens;
  }
  if (metric === "spend") {
    return day.costUsd;
  }
  return day.requestCount;
};

const mondayIndex = (date: Date): number => {
  const day = date.getUTCDay();
  return day === 0 ? 6 : day - 1;
};

const heatmapColor = (value: number, max: number): string => {
  if (value <= 0 || max <= 0) {
    return "#2A2A2A";
  }
  const ratio = value / max;
  if (ratio < 0.25) {
    return "#1D4ED8";
  }
  if (ratio < 0.5) {
    return "#2563EB";
  }
  if (ratio < 0.75) {
    return "#3B82F6";
  }
  return "#93C5FD";
};

export function ActivityHeatmap(props: {
  readonly days: ReadonlyArray<UsageHeatmapDay>;
  readonly metric: UsageMetric;
}) {
  const weeks = useMemo(() => {
    const first = props.days[0];
    if (first === undefined) {
      return [];
    }
    const firstDate = new Date(`${first.date}T00:00:00.000Z`);
    const offset = mondayIndex(firstDate);
    const gridStart = new Date(firstDate.getTime() - offset * 86_400_000);
    const padded: Array<{
      readonly date: string;
      readonly day?: UsageHeatmapDay;
    }> = [];
    const byDate = new Map(props.days.map((day) => [day.date, day]));
    const last = props.days[props.days.length - 1];
    const lastDate = new Date(`${(last ?? first).date}T00:00:00.000Z`);
    let cursor = gridStart;
    while (cursor <= lastDate || padded.length % 7 !== 0) {
      const date = cursor.toISOString().slice(0, 10);
      padded.push({ date, day: byDate.get(date) });
      cursor = new Date(cursor.getTime() + 86_400_000);
    }
    const columns: Array<
      Array<{ readonly date: string; readonly day?: UsageHeatmapDay }>
    > = [];
    for (let index = 0; index < padded.length; index += 7) {
      columns.push(padded.slice(index, index + 7));
    }
    return columns;
  }, [props.days]);

  const max = useMemo(
    () => Math.max(0, ...props.days.map((day) => dayValue(day, props.metric))),
    [props.days, props.metric],
  );

  const monthLabels = useMemo(() => {
    const labels: Array<{ readonly week: number; readonly label: string }> = [];
    let last = "";
    weeks.forEach((week, weekIndex) => {
      const dated = week[0];
      if (dated === undefined) {
        return;
      }
      const month = dated.date.slice(0, 7);
      if (month !== last) {
        last = month;
        labels.push({
          week: weekIndex,
          label: new Date(`${dated.date}T00:00:00.000Z`).toLocaleString(
            "en-US",
            { month: "short", timeZone: "UTC" },
          ),
        });
      }
    });
    return labels;
  }, [weeks]);

  return (
    <YStack gap="$2">
      <XStack items="center" justify="space-between">
        <Text color="$color10">Activity</Text>
        <Text color="$color10">
          {props.metric === "spend"
            ? "Spend"
            : props.metric === "tokens"
              ? "Tokens"
              : "Requests"}
        </Text>
      </XStack>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <YStack gap="$2">
          <XStack height={16} ml={28}>
            {monthLabels.map((month) => (
              <Text
                color="$color10"
                fontSize={10}
                key={`${month.label}-${month.week}`}
                style={{
                  left: month.week * (CELL + GAP),
                  position: "absolute",
                }}
              >
                {month.label}
              </Text>
            ))}
          </XStack>
          <XStack gap="$2">
            <YStack gap={GAP} justify="space-between" width={22}>
              {WEEKDAYS.map((label, index) => (
                <Text color="$color10" fontSize={9} height={CELL} key={label}>
                  {index % 2 === 0 ? label[0] : ""}
                </Text>
              ))}
            </YStack>
            <XStack gap={GAP}>
              {weeks.map((week) => {
                const weekKey = week[0]?.date ?? "week";
                return (
                  <YStack gap={GAP} key={weekKey}>
                    {week.map((cell) => {
                      const value =
                        cell.day === undefined
                          ? 0
                          : dayValue(cell.day, props.metric);
                      return (
                        <View
                          key={cell.date}
                          style={{
                            backgroundColor: heatmapColor(value, max),
                            borderRadius: 2,
                            height: CELL,
                            width: CELL,
                          }}
                        />
                      );
                    })}
                  </YStack>
                );
              })}
            </XStack>
          </XStack>
          <XStack gap="$2" items="center" justify="flex-end">
            <Text color="$color10" fontSize={10}>
              Less
            </Text>
            {["#2A2A2A", "#1D4ED8", "#2563EB", "#3B82F6", "#93C5FD"].map(
              (color) => (
                <View
                  key={color}
                  style={{
                    backgroundColor: color,
                    borderRadius: 2,
                    height: CELL,
                    width: CELL,
                  }}
                />
              ),
            )}
            <Text color="$color10" fontSize={10}>
              More
            </Text>
          </XStack>
        </YStack>
      </ScrollView>
    </YStack>
  );
}
