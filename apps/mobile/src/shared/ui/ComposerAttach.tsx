import { Ionicons } from "@expo/vector-icons";
import type { StoredChatFile } from "@openrouter-mobile/domain";
import { Image, Pressable } from "react-native";
import { Text, useTheme, XStack, YStack } from "tamagui";
import { formatFileSize } from "../format-file-size";
import { pickAndUploadChatFile } from "./pick-file";
import { pickAndUploadImage } from "./pick-image";

type ComposerAttachProps = {
  readonly images: ReadonlyArray<string>;
  readonly max: number;
  readonly disabled?: boolean;
  readonly files?: ReadonlyArray<StoredChatFile>;
  readonly allowFiles?: boolean;
  readonly onChange: (images: ReadonlyArray<string>) => void;
  readonly onFilesChange?: (files: ReadonlyArray<StoredChatFile>) => void;
};

export function ComposerAttach({
  images,
  max,
  disabled,
  files = [],
  allowFiles = false,
  onChange,
  onFilesChange,
}: ComposerAttachProps) {
  const theme = useTheme();
  const iconColor = theme.color?.val ?? "#111";
  const total = images.length + files.length;
  const canAdd = !disabled && total < max;

  return (
    <XStack items="center" gap="$2" pb={8} flexWrap="wrap">
      <Pressable
        accessibilityLabel={allowFiles ? "Attach file" : "Attach photo"}
        accessibilityRole="button"
        disabled={!canAdd}
        onPress={() => {
          if (allowFiles) {
            void pickAndUploadChatFile().then((file) => {
              if (file === undefined) {
                return;
              }
              if (file.mime.startsWith("image/")) {
                onChange([...images, file.url]);
                return;
              }
              onFilesChange?.([...files, file]);
            });
            return;
          }
          void pickAndUploadImage().then((url) => {
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
      {files.map((file) => (
        <Pressable
          accessibilityLabel={`Remove ${file.name}`}
          accessibilityRole="button"
          key={file.url}
          onPress={() => {
            onFilesChange?.(
              files.filter((current) => current.url !== file.url),
            );
          }}
        >
          <YStack bg="$color4" px="$2" py="$1" rounded="$2" maxW={120}>
            <Text fontSize={11} numberOfLines={1}>
              {file.name}
            </Text>
            <Text color="$color10" fontSize={10}>
              {formatFileSize(file.size)}
            </Text>
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
