import {
  decodeStoredContent,
  isVideoUrl,
  type StoredChatFile,
} from "@openrouter-mobile/domain";
import { createElement } from "react";
import { Image, Linking, Platform, Pressable } from "react-native";
import { Paragraph, Spinner, XStack, YStack } from "tamagui";
import { formatFileSize } from "../../shared/format-file-size";
import { CopyIconButton } from "../../shared/ui/CopyIconButton";
import { MarkdownText } from "../../shared/ui/MarkdownText";
import { SelectableText } from "../../shared/ui/SelectableText";
import { UserBubble } from "../../shared/ui/UserBubble";
import { VideoPlayer } from "../../shared/ui/VideoPlayer";
import type { ThreadItem } from "./thread";

type ChatMessageProps = {
  readonly message: ThreadItem;
};

const downloadUrl = (file: StoredChatFile): string => {
  const separator = file.url.includes("?") ? "&" : "?";
  return `${file.url}${separator}filename=${encodeURIComponent(file.name)}`;
};

const openFile = (file: StoredChatFile) => {
  const href = downloadUrl(file);
  if (Platform.OS === "web" && typeof document !== "undefined") {
    const link = document.createElement("a");
    link.href = href;
    link.download = file.name;
    link.rel = "noreferrer";
    link.click();
    return;
  }
  void Linking.openURL(href);
};

function FileChips({
  files,
}: {
  readonly files: ReadonlyArray<StoredChatFile>;
}) {
  if (files.length === 0) {
    return null;
  }
  return (
    <XStack flexWrap="wrap" gap="$2" mt="$2">
      {files.map((file) => (
        <Pressable
          accessibilityLabel={`Download ${file.name}`}
          accessibilityRole="link"
          key={file.url}
          onPress={() => {
            openFile(file);
          }}
        >
          <YStack bg="$color4" maxW={220} px="$2" py="$1.5" rounded="$3">
            <Paragraph fontSize={13} numberOfLines={1}>
              {file.name}
            </Paragraph>
            <Paragraph color="$color10" fontSize={11}>
              {formatFileSize(file.size)} · {file.mime}
            </Paragraph>
          </YStack>
        </Pressable>
      ))}
    </XStack>
  );
}

export function ChatMessage({ message }: ChatMessageProps) {
  const stored = decodeStoredContent(message.content);
  const videoUrl =
    message.url ?? (isVideoUrl(stored.text) ? stored.text : undefined);
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
  const files = <FileChips files={stored.files} />;
  const video =
    videoUrl === undefined ? null : <GeneratedVideo url={videoUrl} />;
  const jobStatus =
    message.status === "failed" ? (
      <Paragraph color="$red10" mt="$2">
        {message.error ?? "Video generation failed."}
      </Paragraph>
    ) : message.status === "queued" || message.status === "running" ? (
      <XStack items="center" gap="$2" mt="$2">
        <Spinner />
        <Paragraph color="$color10">Generating video…</Paragraph>
      </XStack>
    ) : null;

  if (message.role !== "assistant") {
    return (
      <UserBubble>
        {stored.text.length > 0 ? (
          <SelectableText>{stored.text}</SelectableText>
        ) : null}
        {images}
        {files}
        {video}
      </UserBubble>
    );
  }

  const text =
    stored.text.length > 0 && !isVideoUrl(stored.text) ? stored.text : "";

  if (
    text.length === 0 &&
    images === null &&
    video === null &&
    jobStatus === null &&
    stored.files.length === 0
  ) {
    return null;
  }

  return (
    <YStack mb="$3" select="text">
      {text.length > 0 ? (
        <>
          <MarkdownText content={text} />
          <XStack justify="flex-end">
            <CopyIconButton accessibilityLabel="Copy reply" text={text} />
          </XStack>
        </>
      ) : null}
      {images}
      {files}
      {jobStatus}
      {video}
    </YStack>
  );
}

function GeneratedVideo({ url }: { readonly url: string }) {
  if (Platform.OS === "web") {
    return createElement("video", {
      controls: true,
      src: url,
      style: {
        borderRadius: 8,
        marginTop: 8,
        maxHeight: 280,
        width: "100%",
      },
    });
  }
  return <VideoPlayer url={url} />;
}
