import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useEffect, useRef, useState } from "react";
import { Pressable } from "react-native";
import { useTheme } from "tamagui";

type CopyIconButtonProps = {
  readonly text: string;
  readonly accessibilityLabel: string;
};

export function CopyIconButton({
  text,
  accessibilityLabel,
}: CopyIconButtonProps) {
  const theme = useTheme();
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const iconColor = theme.color10?.val ?? theme.color?.val ?? "#666";

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== undefined) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return (
    <Pressable
      accessibilityLabel={copied ? "Copied" : accessibilityLabel}
      accessibilityRole="button"
      disabled={text.length === 0}
      hitSlop={8}
      onPress={() => {
        if (text.length === 0) {
          return;
        }
        void Clipboard.setStringAsync(text).then(() => {
          setCopied(true);
          if (timeoutRef.current !== undefined) {
            clearTimeout(timeoutRef.current);
          }
          timeoutRef.current = setTimeout(() => {
            setCopied(false);
          }, 1500);
        });
      }}
      style={{ padding: 4 }}
    >
      <Ionicons
        color={iconColor}
        name={copied ? "checkmark" : "copy-outline"}
        size={16}
      />
    </Pressable>
  );
}
