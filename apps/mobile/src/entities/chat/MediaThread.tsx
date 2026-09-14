import { createElement } from "react";
import { Platform } from "react-native";
import { Paragraph, Spinner, XStack, YStack } from "tamagui";
import { AudioPlayer } from "../../shared/ui/AudioPlayer";
import { SelectableText } from "../../shared/ui/SelectableText";
import { UserBubble } from "../../shared/ui/UserBubble";
import { VideoPlayer } from "../../shared/ui/VideoPlayer";
import type { MediaAssistantItem, MediaThreadItem } from "./media-thread";

export type MediaResultKind = "video" | "audio";

type MediaThreadProps = {
  readonly items: ReadonlyArray<MediaThreadItem>;
  readonly generatingLabel: string;
  readonly resultKind: MediaResultKind;
};

export function MediaThread({
  items,
  generatingLabel,
  resultKind,
}: MediaThreadProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <>
      {items.map((item) =>
        item.role === "user" ? (
          <UserBubble key={item.id}>
            <SelectableText>{item.content}</SelectableText>
          </UserBubble>
        ) : (
          <AssistantResult
            key={item.id}
            generatingLabel={generatingLabel}
            item={item}
            resultKind={resultKind}
          />
        ),
      )}
    </>
  );
}

function AssistantResult({
  item,
  generatingLabel,
  resultKind,
}: {
  readonly item: MediaAssistantItem;
  readonly generatingLabel: string;
  readonly resultKind: MediaResultKind;
}) {
  return (
    <YStack mb="$3" select="text">
      {item.status === "failed" ? (
        <Paragraph color="$red10" select="text">
          {item.error ?? "Generation failed."}
        </Paragraph>
      ) : item.status === "completed" && item.url !== undefined ? (
        <ResultMedia resultKind={resultKind} url={item.url} />
      ) : (
        <XStack items="center" gap="$2">
          <Spinner />
          <Paragraph color="$color10">{generatingLabel}</Paragraph>
        </XStack>
      )}
    </YStack>
  );
}

function ResultMedia({
  resultKind,
  url,
}: {
  readonly resultKind: MediaResultKind;
  readonly url: string;
}) {
  if (resultKind === "audio") {
    if (Platform.OS === "web") {
      return createElement("audio", {
        controls: true,
        src: url,
        style: { marginTop: 8, width: "100%" },
      });
    }
    return <AudioPlayer url={url} />;
  }

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
