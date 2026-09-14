export const THREAD_IMAGE_MAX_HEIGHT = 260;

export const containedImageSize = (options: {
  readonly aspectRatio: number;
  readonly maxWidth: number;
  readonly maxHeight: number;
}): { readonly width: number; readonly height: number } => {
  const height = Math.min(
    options.maxHeight,
    options.maxWidth / options.aspectRatio,
  );
  return {
    width: height * options.aspectRatio,
    height,
  };
};

export const clampZoom = (scale: number, min = 1, max = 5): number => {
  "worklet";
  return Math.min(max, Math.max(min, scale));
};

export const nextDoubleTapZoom = (scale: number): number => {
  "worklet";
  return scale < 1.75 ? 2.5 : 1;
};
