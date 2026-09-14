import { decodeStoredContent } from "@openrouter-mobile/domain";
import { Image } from "react-native";
import { XStack, YStack } from "tamagui";
import { CopyIconButton } from "../../shared/ui/CopyIconButton";
import { MarkdownText } from "../../shared/ui/MarkdownText";
import { SelectableText } from "../../shared/ui/SelectableText";
import type { ThreadItem } from "./thread";

type ChatMessageProps = {
  readonly message: ThreadItem;
};

export function ChatMessage({ message }: ChatMessageProps) {
  const stored = decodeStoredContent(message.content);
  const isAssistant = message.role === "assistant";

  return (
    <YStack
      mb="$3"
      p="$3"
      bg={message.role === "user" ? "$color4" : "$color3"}
      rounded="$3"
      select="text"
    >
      <XStack items="center" justify="space-between">
        <SelectableText fontWeight="700">{message.role}</SelectableText>
        {isAssistant && stored.text.length > 0 ? (
          <CopyIconButton accessibilityLabel="Copy reply" text={stored.text} />
        ) : null}
      </XStack>
      {stored.text.length > 0 ? (
        isAssistant ? (
          <MarkdownText content={stored.text} />
        ) : (
          <SelectableText>{stored.text}</SelectableText>
        )
      ) : null}
      {stored.images.length > 0 ? (
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
      ) : null}
    </YStack>
  );
}
