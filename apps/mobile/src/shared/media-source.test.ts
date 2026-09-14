import { expect, test } from "bun:test";
import {
  audioCacheFileName,
  audioExtensionForMime,
  formatPlaybackClock,
  mediaCacheFileName,
  parseAudioSource,
  parseVideoSource,
  videoExtensionForMime,
} from "./media-source";

test("parseAudioSource reads data urls used by speech and audio jobs", () => {
  expect(parseAudioSource("data:audio/mpeg;base64,QUJD")).toEqual({
    kind: "data",
    mime: "audio/mpeg",
    base64: "QUJD",
    extension: "mp3",
  });
  expect(parseAudioSource("data:audio/wav;base64,AAEC")).toEqual({
    kind: "data",
    mime: "audio/wav",
    base64: "AAEC",
    extension: "wav",
  });
  expect(parseAudioSource("data:audio/flac;base64,\nQ\nU\nJ\nD\n")).toEqual({
    kind: "data",
    mime: "audio/flac",
    base64: "QUJD",
    extension: "flac",
  });
});

test("parseVideoSource reads data urls used by video jobs", () => {
  expect(parseVideoSource("data:video/mp4;base64,AAAA")).toEqual({
    kind: "data",
    mime: "video/mp4",
    base64: "AAAA",
    extension: "mp4",
  });
  expect(parseVideoSource("data:video/webm;base64,QQ==")).toEqual({
    kind: "data",
    mime: "video/webm",
    base64: "QQ==",
    extension: "webm",
  });
});

test("parseMediaSource keeps http(s) and file urls as remote sources", () => {
  expect(parseAudioSource("https://cdn.example/clip.mp3")).toEqual({
    kind: "remote",
    uri: "https://cdn.example/clip.mp3",
  });
  expect(parseVideoSource("https://cdn.example/clip.mp4")).toEqual({
    kind: "remote",
    uri: "https://cdn.example/clip.mp4",
  });
  expect(parseAudioSource("http://localhost:3000/a.wav")).toEqual({
    kind: "remote",
    uri: "http://localhost:3000/a.wav",
  });
  expect(parseVideoSource("file:///tmp/clip.mp4")).toEqual({
    kind: "remote",
    uri: "file:///tmp/clip.mp4",
  });
});

test("parseMediaSource rejects empty, mismatched, and non-media urls", () => {
  expect(parseAudioSource("")).toBeUndefined();
  expect(parseAudioSource("   ")).toBeUndefined();
  expect(parseAudioSource("data:audio/mpeg;base64,")).toBeUndefined();
  expect(parseAudioSource("data:image/png;base64,QUJD")).toBeUndefined();
  expect(parseAudioSource("data:video/mp4;base64,AAAA")).toBeUndefined();
  expect(parseVideoSource("data:audio/mpeg;base64,QUJD")).toBeUndefined();
  expect(parseAudioSource("not-a-url")).toBeUndefined();
});

test("extension helpers map common OpenRouter formats", () => {
  expect(audioExtensionForMime("audio/mpeg")).toBe("mp3");
  expect(audioExtensionForMime("audio/wav")).toBe("wav");
  expect(audioExtensionForMime("audio/x-wav")).toBe("wav");
  expect(audioExtensionForMime("audio/flac")).toBe("flac");
  expect(audioExtensionForMime("audio/ogg")).toBe("ogg");
  expect(audioExtensionForMime("audio/opus")).toBe("opus");
  expect(audioExtensionForMime("audio/mp4")).toBe("m4a");
  expect(videoExtensionForMime("video/mp4")).toBe("mp4");
  expect(videoExtensionForMime("video/webm")).toBe("webm");
  expect(videoExtensionForMime("video/quicktime")).toBe("mov");
  expect(videoExtensionForMime("video/x-matroska")).toBe("mkv");
});

test("mediaCacheFileName is stable for the same url", () => {
  const url = "data:audio/mpeg;base64,QUJD";
  expect(audioCacheFileName(url, "mp3")).toBe(mediaCacheFileName(url, "mp3"));
  expect(mediaCacheFileName(url, "mp3")).not.toBe(
    mediaCacheFileName("data:audio/mpeg;base64,QUJE", "mp3"),
  );
  expect(mediaCacheFileName(url, "mp3").endsWith(".mp3")).toBe(true);
});

test("formatPlaybackClock formats seconds as m:ss or h:mm:ss", () => {
  expect(formatPlaybackClock(0)).toBe("0:00");
  expect(formatPlaybackClock(9.9)).toBe("0:09");
  expect(formatPlaybackClock(75)).toBe("1:15");
  expect(formatPlaybackClock(3661)).toBe("1:01:01");
  expect(formatPlaybackClock(Number.NaN)).toBe("0:00");
  expect(formatPlaybackClock(-3)).toBe("0:00");
});
