import { Slot } from "expo-router";
import { YStack } from "tamagui";
import { VideoScreen } from "../../../features/video/VideoScreen";

export default function VideoLayout() {
  return (
    <YStack flex={1}>
      <VideoScreen />
      <YStack height={0} overflow="hidden">
        <Slot />
      </YStack>
    </YStack>
  );
}
