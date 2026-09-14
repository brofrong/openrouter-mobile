import type { ChatId } from "@openrouter-mobile/domain";
export type ChatRouteKind = "text" | "images" | "video" | "speech" | "audio";

const bases: Record<ChatRouteKind, string> = {
  text: "",
  images: "/images",
  video: "/video",
  speech: "/speech",
  audio: "/audio",
};

const reservedTextSegments = new Set([
  "images",
  "video",
  "speech",
  "audio",
  "profile",
  "sign-in",
  "sign-up",
]);

export const chatHref = (kind: ChatRouteKind, chatId?: ChatId): string => {
  const base = bases[kind];
  if (chatId === undefined) {
    return base.length === 0 ? "/" : base;
  }
  return `${base}/${chatId}`;
};

export const parseRouteChatId = (
  value: string | string[] | undefined,
  kind: ChatRouteKind = "text",
): ChatId | undefined => {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === undefined || raw.length === 0) {
    return undefined;
  }
  if (kind === "text" && reservedTextSegments.has(raw)) {
    return undefined;
  }
  return raw as ChatId;
};

export const pathnameBelongsToKind = (
  kind: ChatRouteKind,
  pathname: string,
): boolean => {
  if (kind === "text") {
    if (pathname === "/" || pathname.length === 0) {
      return true;
    }
    const segment = pathname.startsWith("/") ? pathname.slice(1) : pathname;
    return !segment.includes("/") && !reservedTextSegments.has(segment);
  }
  const base = bases[kind];
  return pathname === base || pathname.startsWith(`${base}/`);
};

export const chatIdFromPathname = (
  kind: ChatRouteKind,
  pathname: string,
): ChatId | undefined => {
  if (!pathnameBelongsToKind(kind, pathname)) {
    return undefined;
  }
  if (kind === "text") {
    if (pathname === "/" || pathname.length === 0) {
      return undefined;
    }
    return parseRouteChatId(pathname.slice(1), kind);
  }
  const base = bases[kind];
  if (pathname === base) {
    return undefined;
  }
  return parseRouteChatId(pathname.slice(base.length + 1), kind);
};
