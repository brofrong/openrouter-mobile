import { Ionicons } from "@expo/vector-icons";
import type { ComponentType, ReactNode } from "react";
import {
  Modal,
  Platform,
  Pressable,
  useWindowDimensions,
  View,
} from "react-native";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  clampZoom,
  containedImageSize,
  nextDoubleTapZoom,
} from "./image-layout";
import { aspectRatioValue } from "./thread";

type ImagePreviewProps = {
  readonly url: string;
  readonly aspectRatio?: string;
  readonly onClose: () => void;
};

type WheelViewProps = {
  readonly style: { readonly flex: number };
  readonly children: ReactNode;
  readonly onWheel?: (event: { nativeEvent: { deltaY: number } }) => void;
};

const WheelView = View as unknown as ComponentType<WheelViewProps>;

const overlayStyle = {
  backgroundColor: "#000",
  flex: 1,
  ...(Platform.OS === "web"
    ? {
        bottom: 0,
        left: 0,
        position: "fixed" as const,
        right: 0,
        top: 0,
        zIndex: 10000,
      }
    : {}),
};

export function ImagePreview({ url, aspectRatio, onClose }: ImagePreviewProps) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const size = containedImageSize({
    aspectRatio: aspectRatioValue(aspectRatio),
    maxWidth: screenWidth,
    maxHeight: Math.max(160, screenHeight - 96),
  });
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);

  const resetTranslation = () => {
    "worklet";
    translateX.value = withTiming(0);
    translateY.value = withTiming(0);
    savedX.value = 0;
    savedY.value = 0;
  };

  const pinch = Gesture.Pinch()
    .onUpdate((event) => {
      scale.value = clampZoom(savedScale.value * event.scale);
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (scale.value <= 1) {
        scale.value = withTiming(1);
        savedScale.value = 1;
        resetTranslation();
      }
    });

  const pan = Gesture.Pan()
    .onUpdate((event) => {
      if (scale.value <= 1) {
        return;
      }
      translateX.value = savedX.value + event.translationX;
      translateY.value = savedY.value + event.translationY;
    })
    .onEnd(() => {
      savedX.value = translateX.value;
      savedY.value = translateY.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      const next = nextDoubleTapZoom(scale.value);
      scale.value = withTiming(next);
      savedScale.value = next;
      if (next === 1) {
        resetTranslation();
      }
    });

  const composed = Gesture.Exclusive(
    doubleTap,
    Gesture.Simultaneous(pinch, pan),
  );
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      presentationStyle="fullScreen"
      visible
    >
      <GestureHandlerRootView style={overlayStyle}>
        <SafeAreaView style={{ backgroundColor: "#000", flex: 1 }}>
          <View style={{ padding: 12 }}>
            <Pressable
              accessibilityLabel="Close preview"
              accessibilityRole="button"
              hitSlop={8}
              onPress={onClose}
            >
              <Ionicons color="#fff" name="close" size={28} />
            </Pressable>
          </View>
          <WheelView
            style={{ flex: 1 }}
            onWheel={(event) => {
              const next = clampZoom(
                scale.value * (event.nativeEvent.deltaY < 0 ? 1.1 : 0.9),
              );
              scale.value = next;
              savedScale.value = next;
              if (next <= 1) {
                translateX.value = 0;
                translateY.value = 0;
                savedX.value = 0;
                savedY.value = 0;
              }
            }}
          >
            <View
              style={{
                alignItems: "center",
                flex: 1,
                justifyContent: "center",
              }}
            >
              <GestureDetector gesture={composed}>
                <Animated.Image
                  accessibilityIgnoresInvertColors
                  accessibilityLabel="Zoomable generated image"
                  resizeMode="contain"
                  source={{ uri: url }}
                  style={[
                    {
                      height: size.height,
                      width: size.width,
                    },
                    animatedStyle,
                  ]}
                />
              </GestureDetector>
            </View>
          </WheelView>
        </SafeAreaView>
      </GestureHandlerRootView>
    </Modal>
  );
}
