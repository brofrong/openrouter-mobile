import { Slot } from "expo-router";
import { YStack } from "tamagui";
import { ChatScreen } from "../../../features/chat/ChatScreen";

export default function ChatLayout() {
  return (
    <YStack flex={1}>
      <ChatScreen />
      <YStack height={0} overflow="hidden">
        <Slot />
      </YStack>
    </YStack>
  );
}
