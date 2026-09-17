export const MEDIA_PATH_PREFIX = "/media/";

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
export const MAX_PERSIST_BYTES = 200 * 1024 * 1024;

const OBJECT_KEY = /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/;
const DATA_URL =
  /^data:([a-z0-9]+\/[a-z0-9.+-]+)((?:;[a-z0-9.+-]+=[^;,]*)*);base64,([\s\S]+)$/i;

export type ParsedDataUrl = {
  readonly mime: string;
  readonly bytes: Uint8Array;
};

export type ByteRange = {
  readonly start: number;
  readonly end: number;
};

export const isDataUrl = (url: string): boolean =>
  url.trim().toLowerCase().startsWith("data:");

export const isHttpUrl = (url: string): boolean => {
  const trimmed = url.trim();
  return trimmed.startsWith("https://") || trimmed.startsWith("http://");
};

export const parseDataUrl = (url: string): ParsedDataUrl | undefined => {
  const match = DATA_URL.exec(url.trim());
  const mime = match?.[1];
  const payload = match?.[3];
  if (mime === undefined || payload === undefined) {
    return undefined;
  }
  const base64 = payload.replace(/\s+/g, "");
  if (base64.length === 0) {
    return undefined;
  }
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length === 0) {
    return undefined;
  }
  return { mime: mime.toLowerCase(), bytes: new Uint8Array(bytes) };
};

export const toDataUrl = (bytes: Uint8Array, mime: string): string =>
  `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;

export const extensionForMime = (mime: string): string => {
  const normalized = mime.toLowerCase().split(";")[0]?.trim() ?? mime;
  switch (normalized) {
    case "image/jpeg":
    case "image/jpg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "image/svg+xml":
      return "svg";
    case "audio/mpeg":
    case "audio/mp3":
      return "mp3";
    case "audio/wav":
    case "audio/wave":
    case "audio/x-wav":
      return "wav";
    case "audio/flac":
      return "flac";
    case "audio/ogg":
      return "ogg";
    case "audio/opus":
      return "opus";
    case "audio/mp4":
    case "audio/aac":
      return "m4a";
    case "video/webm":
      return "webm";
    case "video/quicktime":
      return "mov";
    default:
      if (normalized.startsWith("video/")) {
        return "mp4";
      }
      if (normalized.startsWith("audio/")) {
        return "mp3";
      }
      if (normalized.startsWith("image/")) {
        return "bin";
      }
      return "bin";
  }
};

export const isAllowedMediaMime = (mime: string): boolean => {
  const normalized = mime.toLowerCase().split(";")[0]?.trim() ?? "";
  return (
    normalized.startsWith("image/") ||
    normalized.startsWith("audio/") ||
    normalized.startsWith("video/")
  );
};

export const isObjectKey = (key: string): boolean =>
  key.length > 0 &&
  key.length < 512 &&
  OBJECT_KEY.test(key) &&
  !key.includes("..");

export const sanitizeUserSegment = (userId: string): string => {
  const cleaned = userId.replace(/[^A-Za-z0-9_-]/g, "");
  return cleaned.length > 0 ? cleaned : "user";
};

export const makeObjectKey = (
  userId: string,
  mime: string,
  id: string = crypto.randomUUID(),
): string => `${sanitizeUserSegment(userId)}/${id}.${extensionForMime(mime)}`;

export const publicMediaUrl = (baseUrl: string, key: string): string =>
  `${baseUrl.replace(/\/+$/, "")}${MEDIA_PATH_PREFIX}${key}`;

export const objectKeyFromPathname = (pathname: string): string | undefined => {
  const path = pathname.split("?")[0] ?? "";
  const index = path.indexOf(MEDIA_PATH_PREFIX);
  if (index === -1) {
    return undefined;
  }
  const raw = path.slice(index + MEDIA_PATH_PREFIX.length);
  if (raw.length === 0) {
    return undefined;
  }
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return undefined;
  }
  return isObjectKey(decoded) ? decoded : undefined;
};

export const objectKeyFromUrl = (
  url: string,
  baseUrl: string,
): string | undefined => {
  const trimmed = url.trim();
  const origin = baseUrl.replace(/\/+$/, "");
  if (trimmed.startsWith(`${origin}${MEDIA_PATH_PREFIX}`)) {
    return objectKeyFromPathname(trimmed.slice(origin.length));
  }
  if (trimmed.startsWith(MEDIA_PATH_PREFIX)) {
    return objectKeyFromPathname(trimmed);
  }
  return undefined;
};

export const isOurMediaUrl = (url: string, baseUrl: string): boolean =>
  objectKeyFromUrl(url, baseUrl) !== undefined;

export const parseByteRange = (
  header: string | undefined,
  size: number,
): ByteRange | undefined => {
  if (header === undefined || size <= 0) {
    return undefined;
  }
  const match = /^bytes=(\d*)-(\d*)$/i.exec(header.trim());
  if (match === null) {
    return undefined;
  }
  const rawStart = match[1];
  const rawEnd = match[2];
  if (rawStart !== undefined && rawStart.length > 0) {
    const start = Number(rawStart);
    const end =
      rawEnd !== undefined && rawEnd.length > 0 ? Number(rawEnd) : size - 1;
    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < 0 ||
      start >= size ||
      end < start ||
      end >= size
    ) {
      return undefined;
    }
    return { start, end };
  }
  if (rawEnd === undefined || rawEnd.length === 0) {
    return undefined;
  }
  const suffix = Number(rawEnd);
  if (!Number.isInteger(suffix) || suffix <= 0) {
    return undefined;
  }
  const start = Math.max(0, size - suffix);
  return { start, end: size - 1 };
};
