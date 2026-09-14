import { Ionicons } from "@expo/vector-icons";
import { Image, Pressable } from "react-native";
import { Text, useTheme, XStack, YStack } from "tamagui";
import { pickImageDataUrl } from "./pick-image";

type ComposerAttachProps = {
  readonly images: ReadonlyArray<string>;
  readonly max: number;
  readonly disabled?: boolean;
  readonly onChange: (images: ReadonlyArray<string>) => void;
};

export function ComposerAttach({
  images,
  max,
  disabled,
  onChange,
}: ComposerAttachProps) {
  const theme = useTheme();
  const iconColor = theme.color?.val ?? "#111";
  const canAdd = !disabled && images.length < max;

  return (
    <XStack items="center" gap="$2" pb={8}>
      <Pressable
        accessibilityLabel="Attach photo"
        accessibilityRole="button"
        disabled={!canAdd}
        onPress={() => {
          void pickImageDataUrl().then((url) => {
            if (url !== undefined) {
              onChange([...images, url]);
            }
          });
        }}
      >
        <Ionicons
          color={canAdd ? iconColor : (theme.color8?.val ?? "#999")}
          name="attach"
          size={26}
        />
      </Pressable>
      {images.map((url) => (
        <Pressable
          accessibilityLabel="Remove attached photo"
          accessibilityRole="button"
          key={url}
          onPress={() => {
            onChange(images.filter((current) => current !== url));
          }}
        >
          <YStack>
            <Image
              accessibilityIgnoresInvertColors
              source={{ uri: url }}
              style={{ borderRadius: 6, height: 36, width: 36 }}
            />
            <Text
              color="$color10"
              fontSize={10}
              position="absolute"
              r={-4}
              t={-6}
            >
              ×
            </Text>
          </YStack>
        </Pressable>
      ))}
    </XStack>
  );
}
