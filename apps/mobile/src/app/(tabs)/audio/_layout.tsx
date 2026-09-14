import { Slot } from "expo-router";
import { YStack } from "tamagui";
import { AudioScreen } from "../../../features/audio/AudioScreen";

export default function AudioLayout() {
  return (
    <YStack flex={1}>
      <AudioScreen />
      <YStack height={0} overflow="hidden">
        <Slot />
      </YStack>
    </YStack>
  );
}
