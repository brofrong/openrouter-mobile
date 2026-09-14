import { decodeStoredContent } from "@openrouter-mobile/domain";
import { Image } from "react-native";
import { XStack, YStack } from "tamagui";
import { CopyIconButton } from "../../shared/ui/CopyIconButton";
import { MarkdownText } from "../../shared/ui/MarkdownText";
import { SelectableText } from "../../shared/ui/SelectableText";
import { UserBubble } from "../../shared/ui/UserBubble";
import type { ThreadItem } from "./thread";

type ChatMessageProps = {
  readonly message: ThreadItem;
};

export function ChatMessage({ message }: ChatMessageProps) {
  const stored = decodeStoredContent(message.content);
  const images =
    stored.images.length > 0 ? (
      <XStack flexWrap="wrap" gap="$2" mt="$2">
        {stored.images.map((url) => (
          <Image
            accessibilityIgnoresInvertColors
            key={url}
            source={{ uri: url }}
            style={{ borderRadius: 8, height: 72, width: 72 }}
          />
        ))}
      </XStack>
    ) : null;

  if (message.role !== "assistant") {
    return (
      <UserBubble>
        {stored.text.length > 0 ? (
          <SelectableText>{stored.text}</SelectableText>
        ) : null}
        {images}
      </UserBubble>
    );
  }

  return (
    <YStack mb="$3" select="text">
      {stored.text.length > 0 ? (
        <>
          <MarkdownText content={stored.text} />
          <XStack justify="flex-end">
            <CopyIconButton
              accessibilityLabel="Copy reply"
              text={stored.text}
            />
          </XStack>
        </>
      ) : null}
      {images}
    </YStack>
  );
}
