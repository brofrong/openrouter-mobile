import type { StoredChatFile } from "./StoredChatFile";

export type StoredMessageContent = {
  readonly text: string;
  readonly images: ReadonlyArray<string>;
  readonly files: ReadonlyArray<StoredChatFile>;
};

const asFile = (value: unknown): StoredChatFile | undefined => {
  if (value === null || typeof value !== "object") {
    return undefined;
  }
  const record = value as { readonly [key: string]: unknown };
  if (
    typeof record.url !== "string" ||
    record.url.length === 0 ||
    typeof record.name !== "string" ||
    record.name.length === 0 ||
    typeof record.mime !== "string" ||
    record.mime.length === 0 ||
    typeof record.size !== "number" ||
    !Number.isFinite(record.size)
  ) {
    return undefined;
  }
  return {
    url: record.url,
    name: record.name,
    mime: record.mime,
    size: record.size,
  };
};

const filesFromUnknown = (value: unknown): ReadonlyArray<StoredChatFile> => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    const file = asFile(item);
    return file === undefined ? [] : [file];
  });
};

export const decodeStoredContent = (content: string): StoredMessageContent => {
  if (!content.startsWith("{")) {
    return { text: content, images: [], files: [] };
  }
  try {
    const parsed = JSON.parse(content) as unknown;
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      !("text" in parsed) ||
      typeof parsed.text !== "string"
    ) {
      return { text: content, images: [], files: [] };
    }
    const images = "images" in parsed ? parsed.images : undefined;
    const files = "files" in parsed ? parsed.files : undefined;
    return {
      text: parsed.text,
      images: Array.isArray(images)
        ? images.filter(
            (item): item is string =>
              typeof item === "string" && item.length > 0,
          )
        : [],
      files: filesFromUnknown(files),
    };
  } catch {
    return { text: content, images: [], files: [] };
  }
};

export const encodeStoredContent = (
  text: string,
  images: ReadonlyArray<string>,
  files: ReadonlyArray<StoredChatFile> = [],
): string =>
  images.length === 0 && files.length === 0
    ? text
    : JSON.stringify({
        text,
        ...(images.length === 0 ? {} : { images }),
        ...(files.length === 0 ? {} : { files }),
      });

const VIDEO_FILE = /\.(mp4|webm|mov)(\?|#|$)/i;

export const isVideoUrl = (value: string): boolean => {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return false;
  }
  if (trimmed.startsWith("data:video/")) {
    return true;
  }
  return VIDEO_FILE.test(trimmed);
};
