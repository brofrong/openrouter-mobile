import type { ReactNode } from "react";
import {
  KeyboardAvoidingView,
  type KeyboardAvoidingViewProps,
} from "react-native-keyboard-controller";
import { YStack } from "tamagui";

type KeyboardScreenProps = {
  readonly children: ReactNode;
  readonly behavior?: KeyboardAvoidingViewProps["behavior"];
};

export function KeyboardScreen({
  children,
  behavior = "translate-with-padding",
}: KeyboardScreenProps) {
  return (
    <KeyboardAvoidingView
      automaticOffset
      behavior={behavior}
      style={{ flex: 1 }}
    >
      <YStack flex={1} bg="$background">
        {children}
      </YStack>
    </KeyboardAvoidingView>
  );
}
