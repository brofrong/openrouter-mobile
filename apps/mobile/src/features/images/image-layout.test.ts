import { expect, test } from "bun:test";
import {
  clampZoom,
  containedImageSize,
  nextDoubleTapZoom,
} from "./image-layout";

test("containedImageSize shrinks tall images to the max height", () => {
  expect(
    containedImageSize({
      aspectRatio: 9 / 16,
      maxWidth: 400,
      maxHeight: 240,
    }),
  ).toEqual({ width: 135, height: 240 });
});

test("containedImageSize keeps wide images within max width", () => {
  expect(
    containedImageSize({
      aspectRatio: 16 / 9,
      maxWidth: 400,
      maxHeight: 240,
    }),
  ).toEqual({ width: 400, height: 225 });
});

test("clampZoom stays between 1 and 5", () => {
  expect(clampZoom(0.4)).toBe(1);
  expect(clampZoom(2.2)).toBe(2.2);
  expect(clampZoom(9)).toBe(5);
});

test("nextDoubleTapZoom toggles between fit and 2.5x", () => {
  expect(nextDoubleTapZoom(1)).toBe(2.5);
  expect(nextDoubleTapZoom(2.5)).toBe(1);
});
