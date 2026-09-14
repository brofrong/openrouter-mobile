import type { Message } from "@openrouter-mobile/domain";

export const CHAT_MESSAGE_PAGE_SIZE = 30;

export type ThreadItem = {
  readonly id: string;
  readonly role: "user" | "assistant" | "system";
  readonly content: string;
};

export const toThreadItem = (message: Message): ThreadItem => ({
  id: message.id,
  role: message.role,
  content: message.content,
});

export const isServerMessageId = (id: string): boolean =>
  id !== "draft" && !id.startsWith("local-");

export const oldestServerMessageId = (
  items: ReadonlyArray<ThreadItem>,
): string | undefined => items.find((item) => isServerMessageId(item.id))?.id;

export const mergeOlderMessages = (
  current: ReadonlyArray<ThreadItem>,
  older: ReadonlyArray<ThreadItem>,
): ReadonlyArray<ThreadItem> => {
  const seen = new Set(current.map((item) => item.id));
  return [...older.filter((item) => !seen.has(item.id)), ...current];
};

export const commitDraft = (
  current: ReadonlyArray<ThreadItem>,
  draft: string,
): ReadonlyArray<ThreadItem> => {
  if (draft.length === 0) {
    return current;
  }
  return [
    ...current,
    {
      id: `local-assistant-${current.length}-${draft.length}`,
      role: "assistant",
      content: draft,
    },
  ];
};
