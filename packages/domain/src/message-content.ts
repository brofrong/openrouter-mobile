export type StoredMessageContent = {
  readonly text: string;
  readonly images: ReadonlyArray<string>;
};

export const decodeStoredContent = (content: string): StoredMessageContent => {
  if (!content.startsWith("{")) {
    return { text: content, images: [] };
  }
  try {
    const parsed = JSON.parse(content) as unknown;
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      !("text" in parsed) ||
      typeof parsed.text !== "string"
    ) {
      return { text: content, images: [] };
    }
    const images = "images" in parsed ? parsed.images : undefined;
    return {
      text: parsed.text,
      images: Array.isArray(images)
        ? images.filter(
            (item): item is string =>
              typeof item === "string" && item.length > 0,
          )
        : [],
    };
  } catch {
    return { text: content, images: [] };
  }
};

export const encodeStoredContent = (
  text: string,
  images: ReadonlyArray<string>,
): string => (images.length === 0 ? text : JSON.stringify({ text, images }));
