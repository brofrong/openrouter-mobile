import { Slot } from "expo-router";
import { YStack } from "tamagui";
import { ImagesScreen } from "../../../features/images/ImagesScreen";

export default function ImagesLayout() {
  return (
    <YStack flex={1}>
      <ImagesScreen />
      <YStack height={0} overflow="hidden">
        <Slot />
      </YStack>
    </YStack>
  );
}
