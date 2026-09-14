import type { UsageSourceSlice } from "@openrouter-mobile/domain";
import { Text, XStack, YStack } from "tamagui";
import { formatUsdList, SOURCE_COLORS } from "./format-usage";

export function SourceShareBar(props: {
  readonly sources: ReadonlyArray<UsageSourceSlice>;
}) {
  const total = props.sources.reduce((sum, slice) => sum + slice.costUsd, 0);

  return (
    <YStack gap="$2">
      <YStack bg="$color4" height={8} overflow="hidden" rounded={8}>
        <XStack flex={1}>
          {props.sources.map((slice) => {
            const share = total <= 0 ? 0 : slice.costUsd / total;
            if (share <= 0) {
              return null;
            }
            return (
              <YStack
                flex={share}
                key={slice.source}
                style={{ backgroundColor: SOURCE_COLORS[slice.source] }}
              />
            );
          })}
        </XStack>
      </YStack>
      <XStack flexWrap="wrap" gap="$3">
        {props.sources.map((slice) => (
          <XStack
            items="center"
            gap="$2"
            key={slice.source}
            opacity={slice.costUsd > 0 ? 1 : 0.45}
          >
            <YStack
              height={8}
              rounded={4}
              style={{ backgroundColor: SOURCE_COLORS[slice.source] }}
              width={8}
            />
            <Text color="$color10">
              {slice.source} {formatUsdList(slice.costUsd)}
            </Text>
          </XStack>
        ))}
      </XStack>
    </YStack>
  );
}
