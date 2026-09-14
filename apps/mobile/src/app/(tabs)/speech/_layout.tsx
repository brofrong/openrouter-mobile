import { Slot } from "expo-router";
import { YStack } from "tamagui";
import { SpeechScreen } from "../../../features/speech/SpeechScreen";

export default function SpeechLayout() {
  return (
    <YStack flex={1}>
      <SpeechScreen />
      <YStack height={0} overflow="hidden">
        <Slot />
      </YStack>
    </YStack>
  );
}
