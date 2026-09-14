const DATA_URL =
  /^data:((?:audio|video)\/[a-z0-9.+-]+)((?:;[a-z0-9.+-]+=[^;,]*)*);base64,([\s\S]+)$/i;

export type MediaKind = "audio" | "video";

export type ParsedMediaSource =
  | { readonly kind: "remote"; readonly uri: string }
  | {
      readonly kind: "data";
      readonly mime: string;
      readonly base64: string;
      readonly extension: string;
    };

export const audioExtensionForMime = (mime: string): string => {
  const normalized = mime.toLowerCase();
  if (normalized.includes("wav") || normalized.includes("wave")) {
    return "wav";
  }
  if (normalized.includes("flac")) {
    return "flac";
  }
  if (normalized.includes("ogg")) {
    return "ogg";
  }
  if (normalized.includes("opus")) {
    return "opus";
  }
  if (
    normalized.includes("aac") ||
    normalized.includes("mp4") ||
    normalized.includes("m4a")
  ) {
    return "m4a";
  }
  return "mp3";
};

export const videoExtensionForMime = (mime: string): string => {
  const normalized = mime.toLowerCase();
  if (normalized.includes("webm")) {
    return "webm";
  }
  if (normalized.includes("quicktime")) {
    return "mov";
  }
  if (normalized.includes("matroska") || normalized.includes("mkv")) {
    return "mkv";
  }
  if (normalized.includes("ogg")) {
    return "ogv";
  }
  return "mp4";
};

export const parseMediaSource = (
  url: string,
  media: MediaKind,
): ParsedMediaSource | undefined => {
  const trimmed = url.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  const data = DATA_URL.exec(trimmed);
  const mime = data?.[1];
  const payload = data?.[3];
  if (mime !== undefined && payload !== undefined) {
    if (!mime.toLowerCase().startsWith(`${media}/`)) {
      return undefined;
    }
    const base64 = payload.replace(/\s+/g, "");
    if (base64.length === 0) {
      return undefined;
    }
    return {
      kind: "data",
      mime: mime.toLowerCase(),
      base64,
      extension:
        media === "audio"
          ? audioExtensionForMime(mime)
          : videoExtensionForMime(mime),
    };
  }
  if (
    trimmed.startsWith("https://") ||
    trimmed.startsWith("http://") ||
    trimmed.startsWith("file://")
  ) {
    return { kind: "remote", uri: trimmed };
  }
  return undefined;
};

export const parseAudioSource = (url: string): ParsedMediaSource | undefined =>
  parseMediaSource(url, "audio");

export const parseVideoSource = (url: string): ParsedMediaSource | undefined =>
  parseMediaSource(url, "video");

export const mediaCacheFileName = (url: string, extension: string): string =>
  `${fnv1aHex(url)}.${extension}`;

export const audioCacheFileName = mediaCacheFileName;

export const formatPlaybackClock = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "0:00";
  }
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = (total % 60).toString().padStart(2, "0");
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs}`;
  }
  return `${minutes}:${secs}`;
};

const fnv1aHex = (value: string): string => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
};
