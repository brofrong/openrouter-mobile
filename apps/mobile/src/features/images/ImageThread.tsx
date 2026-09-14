import { useState } from "react";
import { Image, Pressable } from "react-native";
import { Paragraph, Spinner, XStack, YStack } from "tamagui";
import { SelectableText } from "../../shared/ui/SelectableText";
import { ImagePreview } from "./ImagePreview";
import { containedImageSize, THREAD_IMAGE_MAX_HEIGHT } from "./image-layout";
import {
  aspectRatioValue,
  type ImageAssistantItem,
  type ImageThreadItem,
  splitImageUrls,
} from "./thread";

type ImageThreadProps = {
  readonly items: ReadonlyArray<ImageThreadItem>;
};

type PreviewState = {
  readonly url: string;
  readonly aspectRatio?: string;
};

export function ImageThread({ items }: ImageThreadProps) {
  const [preview, setPreview] = useState<PreviewState | undefined>();

  if (items.length === 0) {
    return null;
  }

  return (
    <>
      {items.map((item) =>
        item.role === "user" ? (
          <YStack
            key={item.id}
            mb="$3"
            p="$3"
            bg="$color4"
            rounded="$3"
            select="text"
          >
            <SelectableText fontWeight="700">user</SelectableText>
            <SelectableText>{item.content}</SelectableText>
            {item.images !== undefined && item.images.length > 0 ? (
              <XStack flexWrap="wrap" gap="$2" mt="$2">
                {item.images.map((url) => (
                  <Image
                    accessibilityIgnoresInvertColors
                    key={url}
                    source={{ uri: url }}
                    style={{ borderRadius: 8, height: 72, width: 72 }}
                  />
                ))}
              </XStack>
            ) : null}
          </YStack>
        ) : (
          <AssistantBubble
            key={item.id}
            item={item}
            onOpenPreview={setPreview}
          />
        ),
      )}
      {preview !== undefined ? (
        <ImagePreview
          aspectRatio={preview.aspectRatio}
          url={preview.url}
          onClose={() => {
            setPreview(undefined);
          }}
        />
      ) : null}
    </>
  );
}

function AssistantBubble({
  item,
  onOpenPreview,
}: {
  readonly item: ImageAssistantItem;
  readonly onOpenPreview: (preview: PreviewState) => void;
}) {
  const [maxWidth, setMaxWidth] = useState(320);
  const urls = splitImageUrls(item.url);
  const tileWidth = urls.length > 1 ? Math.min(maxWidth, 168) : maxWidth;
  const size = containedImageSize({
    aspectRatio: aspectRatioValue(item.aspectRatio),
    maxWidth: tileWidth,
    maxHeight: THREAD_IMAGE_MAX_HEIGHT,
  });

  return (
    <YStack
      mb="$3"
      p="$3"
      bg="$color3"
      rounded="$3"
      select="text"
      onLayout={(event) => {
        const width = event.nativeEvent.layout.width;
        setMaxWidth((current) =>
          Math.abs(current - width) < 1 ? current : width,
        );
      }}
    >
      <SelectableText fontWeight="700">assistant</SelectableText>
      {item.status === "failed" ? (
        <Paragraph color="$red10" mt="$2" select="text">
          {item.error ?? "Generation failed."}
        </Paragraph>
      ) : item.status === "completed" && urls.length > 0 ? (
        <XStack flexWrap="wrap" gap="$2" mt="$2">
          {urls.map((imageUrl) => (
            <Pressable
              accessibilityLabel="Open image preview"
              accessibilityRole="button"
              key={imageUrl}
              onPress={() => {
                onOpenPreview({
                  url: imageUrl,
                  ...(item.aspectRatio === undefined
                    ? {}
                    : { aspectRatio: item.aspectRatio }),
                });
              }}
            >
              <Image
                accessibilityIgnoresInvertColors
                accessibilityLabel="Generated image"
                resizeMode="contain"
                source={{ uri: imageUrl }}
                style={{
                  borderRadius: 8,
                  height: size.height,
                  width: size.width,
                }}
              />
            </Pressable>
          ))}
        </XStack>
      ) : (
        <XStack items="center" gap="$2" mt="$2">
          <Spinner />
          <Paragraph color="$color10">Generating image…</Paragraph>
        </XStack>
      )}
    </YStack>
  );
}
