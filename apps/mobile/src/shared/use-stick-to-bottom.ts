import { useCallback, useRef } from "react";
import type {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from "react-native";
import type { ScrollView } from "tamagui";

const BOTTOM_THRESHOLD = 80;

type Scrollable = {
  scrollTo: (options: { y: number; animated?: boolean }) => void;
  scrollToEnd: (options?: { animated?: boolean }) => void;
};

export const useStickToBottom = () => {
  const scrollRef = useRef<ScrollView>(null);
  const stickRef = useRef(true);
  const contentHeightRef = useRef(0);
  const scrollYRef = useRef(0);
  const viewportRef = useRef(0);
  const restoreFromHeightRef = useRef<number | null>(null);
  const underfillRef = useRef<(() => void) | undefined>(undefined);

  const pinToBottom = useCallback(() => {
    stickRef.current = true;
  }, []);

  const markPrepend = useCallback(() => {
    restoreFromHeightRef.current = contentHeightRef.current;
  }, []);

  const maybeFill = useCallback((height: number) => {
    if (viewportRef.current > 0 && height <= viewportRef.current + 8) {
      underfillRef.current?.();
    }
  }, []);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    viewportRef.current = event.nativeEvent.layout.height;
  }, []);

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } =
        event.nativeEvent;
      scrollYRef.current = contentOffset.y;
      viewportRef.current = layoutMeasurement.height;
      const distanceFromBottom =
        contentSize.height - (contentOffset.y + layoutMeasurement.height);
      stickRef.current = distanceFromBottom <= BOTTOM_THRESHOLD;
    },
    [],
  );

  const onContentSizeChange = useCallback(
    (_width: number, height: number) => {
      const previousHeight = contentHeightRef.current;
      contentHeightRef.current = height;
      const node = scrollRef.current as Scrollable | null;
      if (node === null) {
        return;
      }
      const restoreFrom = restoreFromHeightRef.current;
      if (restoreFrom !== null) {
        restoreFromHeightRef.current = null;
        node.scrollTo({
          y: scrollYRef.current + (height - restoreFrom),
          animated: false,
        });
        maybeFill(height);
        return;
      }
      if (stickRef.current && height !== previousHeight) {
        node.scrollToEnd({ animated: false });
        maybeFill(height);
      }
    },
    [maybeFill],
  );

  const isNearTop = useCallback(() => scrollYRef.current < 72, []);

  return {
    scrollRef,
    stickRef,
    pinToBottom,
    markPrepend,
    onScroll,
    onLayout,
    onContentSizeChange,
    isNearTop,
    underfillRef,
  };
};
