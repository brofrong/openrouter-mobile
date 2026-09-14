export type MediaJobStatus = "queued" | "running" | "completed" | "failed";

export type MediaUserItem = {
  readonly id: string;
  readonly role: "user";
  readonly content: string;
};

export type MediaAssistantItem = {
  readonly id: string;
  readonly role: "assistant";
  readonly jobId?: string;
  readonly status: MediaJobStatus;
  readonly url?: string;
  readonly error?: string;
};

export type MediaThreadItem = MediaUserItem | MediaAssistantItem;

export const MEDIA_MESSAGE_PAGE_SIZE = 30;

export const isServerMessageId = (id: string): boolean =>
  !id.startsWith("local-");

export const oldestServerMessageId = (
  items: ReadonlyArray<MediaThreadItem>,
): string | undefined => items.find((item) => isServerMessageId(item.id))?.id;

export const mergeOlderMessages = (
  current: ReadonlyArray<MediaThreadItem>,
  older: ReadonlyArray<MediaThreadItem>,
): ReadonlyArray<MediaThreadItem> => {
  const seen = new Set(current.map((item) => item.id));
  return [...older.filter((item) => !seen.has(item.id)), ...current];
};

export const toMediaThreadItem = (message: {
  readonly id: string;
  readonly role: "user" | "assistant" | "system";
  readonly content: string;
}): MediaThreadItem =>
  message.role === "user"
    ? { id: message.id, role: "user", content: message.content }
    : {
        id: message.id,
        role: "assistant",
        status: "completed",
        url: message.content,
      };

export type AppendTurnOptions = {
  readonly prompt: string;
  readonly localId: string;
};

export type JobEventPatch = {
  readonly status: MediaJobStatus;
  readonly url?: string;
  readonly error?: string;
};

const userId = (localId: string) => `local-${localId}`;
const assistantId = (localId: string) => `local-${localId}-assistant`;

export const appendTurn = (
  items: ReadonlyArray<MediaThreadItem>,
  options: AppendTurnOptions,
): ReadonlyArray<MediaThreadItem> => [
  ...items,
  { id: userId(options.localId), role: "user", content: options.prompt },
  {
    id: assistantId(options.localId),
    role: "assistant",
    status: "queued",
  },
];

export const bindJob = (
  items: ReadonlyArray<MediaThreadItem>,
  localId: string,
  jobId: string,
): ReadonlyArray<MediaThreadItem> => {
  const id = assistantId(localId);
  return items.map((item) =>
    item.role === "assistant" && item.id === id ? { ...item, jobId } : item,
  );
};

export const applyJobEvent = (
  items: ReadonlyArray<MediaThreadItem>,
  jobId: string,
  event: JobEventPatch,
): ReadonlyArray<MediaThreadItem> =>
  items.map((item) => {
    if (item.role !== "assistant" || item.jobId !== jobId) {
      return item;
    }
    return {
      ...item,
      status: event.status,
      ...(event.url === undefined ? {} : { url: event.url }),
      ...(event.error === undefined ? {} : { error: event.error }),
    };
  });

export const failTurn = (
  items: ReadonlyArray<MediaThreadItem>,
  localId: string,
  error: string,
): ReadonlyArray<MediaThreadItem> => {
  const id = assistantId(localId);
  return items.map((item) =>
    item.role === "assistant" && item.id === id
      ? { ...item, status: "failed", error }
      : item,
  );
};
