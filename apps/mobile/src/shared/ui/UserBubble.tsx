import type { ReactNode } from "react";
import { XStack, YStack } from "tamagui";

type UserBubbleProps = {
  readonly children: ReactNode;
};

export function UserBubble({ children }: UserBubbleProps) {
  return (
    <XStack justify="flex-end" mb="$3">
      <YStack
        width="80%"
        p="$3"
        bg="#122450"
        rounded="$4"
        select="text"
        color="#f8fafc"
      >
        {children}
      </YStack>
    </XStack>
  );
}
