import { useEffect, useState } from "react";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { Text, XStack, YStack } from "tamagui";
import {
  nextThinkingIndex,
  THINKING_PHRASES,
  THINKING_ROTATE_MS,
} from "./thinking-phrases";

export function ThinkingIndicator() {
  const [index, setIndex] = useState(() =>
    Math.floor(Math.random() * THINKING_PHRASES.length),
  );
  const [dots, setDots] = useState(1);
  const pulse = useSharedValue(0.55);
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(10);
  const phrase = THINKING_PHRASES[index] ?? THINKING_PHRASES[0];

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: pulse.value,
  }));
  const morphStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  useEffect(() => {
    const advance = () => {
      setIndex((current) => nextThinkingIndex(current));
    };
    pulse.value = withRepeat(
      withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
    const rotate = () => {
      opacity.value = withTiming(0, { duration: 280 });
      translateY.value = withTiming(-8, { duration: 280 }, (finished) => {
        if (finished) {
          runOnJS(advance)();
        }
      });
    };
    const id = setInterval(rotate, THINKING_ROTATE_MS);
    return () => {
      clearInterval(id);
    };
  }, [opacity, pulse, translateY]);

  useEffect(() => {
    if (THINKING_PHRASES[index] === undefined) {
      return;
    }
    opacity.value = 0;
    translateY.value = 10;
    opacity.value = withTiming(1, { duration: 340 });
    translateY.value = withTiming(0, { duration: 340 });
  }, [index, opacity, translateY]);

  useEffect(() => {
    const id = setInterval(() => {
      setDots((current) => (current % 3) + 1);
    }, 420);
    return () => {
      clearInterval(id);
    };
  }, []);

  return (
    <YStack mb="$3" p="$3" bg="$color3" rounded="$3">
      <Text fontWeight="700">assistant</Text>
      <XStack items="center" gap="$2" mt="$1">
        <Animated.View style={pulseStyle}>
          <YStack width={7} height={7} rounded={99} bg="$color10" />
        </Animated.View>
        <Animated.View style={morphStyle}>
          <Text color="$color10" fontStyle="italic">
            {phrase}
            {".".repeat(dots)}
          </Text>
        </Animated.View>
      </XStack>
    </YStack>
  );
}
