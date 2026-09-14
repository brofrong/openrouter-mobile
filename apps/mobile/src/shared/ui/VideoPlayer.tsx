import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect, useState } from "react";
import { Paragraph, Spinner, XStack, YStack } from "tamagui";
import { resolvePlayableMediaUri } from "../resolve-media-uri";

const VIDEO_HEIGHT = 280;

type VideoPlayerProps = {
  readonly url: string;
};

export function VideoPlayer({ url }: VideoPlayerProps) {
  const [uri, setUri] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    let cancelled = false;
    setUri(undefined);
    setError(undefined);
    void resolvePlayableMediaUri(url, "video").then(
      (next) => {
        if (!cancelled) {
          setUri(next);
        }
      },
      () => {
        if (!cancelled) {
          setError("Could not load video.");
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (error !== undefined) {
    return (
      <Paragraph color="$red10" mt="$2">
        {error}
      </Paragraph>
    );
  }
  if (uri === undefined) {
    return (
      <XStack items="center" gap="$2" mt="$2">
        <Spinner />
        <Paragraph color="$color10">Loading video…</Paragraph>
      </XStack>
    );
  }

  return <LoadedVideoPlayer uri={uri} />;
}

function LoadedVideoPlayer({ uri }: { readonly uri: string }) {
  const player = useVideoPlayer({ uri }, (next) => {
    next.loop = false;
  });

  return (
    <YStack mt="$2" overflow="hidden" rounded="$4">
      <VideoView
        accessibilityLabel="Generated video"
        contentFit="contain"
        fullscreenOptions={{ enable: true }}
        nativeControls
        player={player}
        style={{
          backgroundColor: "#000",
          height: VIDEO_HEIGHT,
          width: "100%",
        }}
      />
    </YStack>
  );
}
