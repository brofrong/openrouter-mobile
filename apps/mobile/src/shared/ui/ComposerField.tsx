import { Ionicons } from "@expo/vector-icons";
import { useLayoutEffect, useRef, useState } from "react";
import { Platform, Pressable } from "react-native";
import { TextArea, useTheme, YStack } from "tamagui";

const LINE_HEIGHT = 22;
const VERTICAL_PADDING = 26;
const MAX_LINES = 4;
const MIN_HEIGHT = 44;
const MAX_HEIGHT = VERTICAL_PADDING + LINE_HEIGHT * MAX_LINES;
const SEND_INSET = 10;

type ComposerFieldProps = {
  readonly value: string;
  readonly placeholder: string;
  readonly disabled?: boolean;
  readonly accessibilityLabel?: string;
  readonly onChange: (value: string) => void;
  readonly onSubmit: () => void;
};

const clampHeight = (contentHeight: number) =>
  Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, contentHeight));

type MeasurableField = {
  readonly scrollHeight: number;
  style: { height: string };
};

const isMeasurableField = (value: unknown): value is MeasurableField =>
  typeof value === "object" &&
  value !== null &&
  "scrollHeight" in value &&
  "style" in value;

const findTextArea = (root: unknown) => {
  if (
    root !== null &&
    typeof root === "object" &&
    "querySelector" in root &&
    typeof root.querySelector === "function"
  ) {
    return root.querySelector("textarea");
  }
  return null;
};

export function ComposerField({
  value,
  placeholder,
  disabled = false,
  accessibilityLabel = "Send",
  onChange,
  onSubmit,
}: ComposerFieldProps) {
  const theme = useTheme();
  const boxRef = useRef<unknown>(null);
  const [height, setHeight] = useState(MIN_HEIGHT);
  const iconColor = disabled
    ? (theme.color8?.val ?? "#999")
    : (theme.color?.val ?? "#111");

  useLayoutEffect(() => {
    if (Platform.OS !== "web") {
      return;
    }
    const area = findTextArea(boxRef.current);
    if (!isMeasurableField(area)) {
      return;
    }
    if (value.length === 0) {
      area.style.height = `${MIN_HEIGHT}px`;
      setHeight(MIN_HEIGHT);
      return;
    }
    area.style.height = "auto";
    const next = clampHeight(area.scrollHeight);
    area.style.height = `${next}px`;
    setHeight(next);
  }, [value]);

  return (
    <YStack
      ref={(node) => {
        boxRef.current = node;
      }}
      flex={1}
      position="relative"
      style={{ maxHeight: MAX_HEIGHT, minHeight: MIN_HEIGHT, height }}
    >
      <TextArea
        placeholder={placeholder}
        rows={1}
        style={{
          height,
          maxHeight: MAX_HEIGHT,
          minHeight: MIN_HEIGHT,
          overflow: "auto",
          paddingRight: 44,
          width: "100%",
          ...(Platform.OS === "web"
            ? { fieldSizing: "content", resize: "none" as const }
            : {}),
        }}
        value={value}
        onChangeText={onChange}
        onKeyDown={(event) => {
          if (
            event.nativeEvent.isComposing ||
            event.key !== "Enter" ||
            event.shiftKey
          ) {
            return;
          }
          event.preventDefault();
          if (!disabled) {
            onSubmit();
          }
        }}
        onContentSizeChange={(event) => {
          if (Platform.OS === "web") {
            return;
          }
          setHeight(clampHeight(event.nativeEvent.contentSize.height));
        }}
      />
      <YStack b={SEND_INSET} position="absolute" r={SEND_INSET}>
        <Pressable
          accessibilityLabel={accessibilityLabel}
          accessibilityRole="button"
          disabled={disabled}
          hitSlop={8}
          onPress={onSubmit}
        >
          <Ionicons color={iconColor} name="send" size={20} />
        </Pressable>
      </YStack>
    </YStack>
  );
}
