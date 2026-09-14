import { Ionicons } from "@expo/vector-icons";
import {
  type AudioPlayer as ExpoAudioPlayer,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
} from "expo-audio";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { Paragraph, Spinner, Text, useTheme, XStack, YStack } from "tamagui";
import { formatPlaybackClock } from "../media-source";
import { resolvePlayableMediaUri } from "../resolve-media-uri";

type AudioPlayerProps = {
  readonly url: string;
};

let playbackMode: Promise<void> | undefined;
let activePlayer: ExpoAudioPlayer | undefined;

const ensurePlaybackMode = (): Promise<void> => {
  playbackMode ??= setAudioModeAsync({
    playsInSilentMode: true,
    interruptionMode: "doNotMix",
  }).then(() => undefined);
  return playbackMode;
};

const playExclusive = (player: ExpoAudioPlayer) => {
  if (activePlayer !== undefined && activePlayer !== player) {
    activePlayer.pause();
  }
  activePlayer = player;
  player.play();
};

export function AudioPlayer({ url }: AudioPlayerProps) {
  const [uri, setUri] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    let cancelled = false;
    setUri(undefined);
    setError(undefined);
    void resolvePlayableMediaUri(url, "audio").then(
      (next) => {
        if (!cancelled) {
          setUri(next);
        }
      },
      () => {
        if (!cancelled) {
          setError("Could not load audio.");
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
        <Paragraph color="$color10">Loading audio…</Paragraph>
      </XStack>
    );
  }

  return <LoadedAudioPlayer uri={uri} />;
}

function LoadedAudioPlayer({ uri }: { readonly uri: string }) {
  const player = useAudioPlayer({ uri }, { updateInterval: 200 });
  const status = useAudioPlayerStatus(player);
  const theme = useTheme();
  const [trackWidth, setTrackWidth] = useState(0);
  const duration = Number.isFinite(status.duration) ? status.duration : 0;
  const currentTime = Number.isFinite(status.currentTime)
    ? status.currentTime
    : 0;
  const progress =
    duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0;
  const iconColor = theme.background?.val ?? "#fff";
  const buttonColor = theme.color?.val ?? "#111";
  const track = theme.color5?.val ?? "#ddd";
  const fill = theme.color10?.val ?? "#888";
  const thumb = theme.color?.val ?? "#111";

  useEffect(() => {
    void ensurePlaybackMode();
    return () => {
      if (activePlayer === player) {
        activePlayer = undefined;
      }
    };
  }, [player]);

  useEffect(() => {
    if (!status.didJustFinish) {
      return;
    }
    player.pause();
    void player.seekTo(0);
    if (activePlayer === player) {
      activePlayer = undefined;
    }
  }, [player, status.didJustFinish]);

  const toggle = () => {
    if (status.playing) {
      player.pause();
      if (activePlayer === player) {
        activePlayer = undefined;
      }
      return;
    }
    const restart =
      status.didJustFinish || (duration > 0 && currentTime >= duration - 0.05);
    void ensurePlaybackMode().then(() => {
      if (restart) {
        void player.seekTo(0).then(() => {
          playExclusive(player);
        });
        return;
      }
      playExclusive(player);
    });
  };

  const seekTo = (x: number) => {
    if (duration <= 0 || trackWidth <= 0) {
      return;
    }
    const next = Math.min(1, Math.max(0, x / trackWidth)) * duration;
    void player.seekTo(next);
  };

  if (
    status.error !== null &&
    status.error !== undefined &&
    status.error.length > 0
  ) {
    return (
      <Paragraph color="$red10" mt="$2">
        {status.error}
      </Paragraph>
    );
  }

  return (
    <XStack items="center" gap="$3" mt="$2" p="$3" rounded="$4" bg="$color3">
      <Pressable
        accessibilityLabel={status.playing ? "Pause audio" : "Play audio"}
        accessibilityRole="button"
        disabled={!status.isLoaded}
        hitSlop={4}
        onPress={toggle}
        style={{
          alignItems: "center",
          backgroundColor: buttonColor,
          borderRadius: 20,
          height: 40,
          justifyContent: "center",
          opacity: status.isLoaded ? 1 : 0.5,
          width: 40,
        }}
      >
        {!status.isLoaded ? (
          <Spinner color={iconColor} size="small" />
        ) : (
          <Ionicons
            color={iconColor}
            name={status.playing ? "pause" : "play"}
            size={18}
            style={status.playing ? undefined : { marginLeft: 2 }}
          />
        )}
      </Pressable>
      <YStack flex={1} gap="$1">
        <View
          accessibilityLabel="Audio progress"
          accessibilityRole="adjustable"
          accessibilityValue={{
            min: 0,
            max: Math.round(duration),
            now: Math.round(currentTime),
          }}
          onLayout={(event) => {
            const width = event.nativeEvent.layout.width;
            setTrackWidth((current) =>
              Math.abs(current - width) < 1 ? current : width,
            );
          }}
          onMoveShouldSetResponder={() => duration > 0}
          onResponderGrant={(event) => {
            seekTo(event.nativeEvent.locationX);
          }}
          onResponderMove={(event) => {
            seekTo(event.nativeEvent.locationX);
          }}
          onStartShouldSetResponder={() => duration > 0}
          style={{ height: 28, justifyContent: "center" }}
        >
          <View
            style={{
              backgroundColor: track,
              borderRadius: 2,
              height: 4,
            }}
          >
            <View
              style={{
                backgroundColor: fill,
                borderRadius: 2,
                height: 4,
                width: `${progress * 100}%`,
              }}
            />
          </View>
          <View
            style={{
              backgroundColor: thumb,
              borderRadius: 7,
              height: 14,
              left: trackWidth * progress - 7,
              position: "absolute",
              width: 14,
            }}
          />
        </View>
        <XStack justify="space-between">
          <Text color="$color10" fontSize={12}>
            {formatPlaybackClock(currentTime)}
          </Text>
          <Text color="$color10" fontSize={12}>
            {formatPlaybackClock(duration)}
          </Text>
        </XStack>
      </YStack>
    </XStack>
  );
}
