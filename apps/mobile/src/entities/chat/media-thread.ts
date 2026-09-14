import type {
  ChatJobEvent,
  ChatUserEvent,
  GenerationJob,
} from "@openrouter-mobile/domain";

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

const jobPatch = (event: ChatJobEvent): JobEventPatch => ({
  status: event.status,
  ...(event.url === undefined ? {} : { url: event.url }),
  ...(event.error === undefined ? {} : { error: event.error }),
});

export const applyChatUserEvent = (
  items: ReadonlyArray<MediaThreadItem>,
  event: ChatUserEvent,
): ReadonlyArray<MediaThreadItem> => {
  const mapped = toMediaThreadItem(event.message);
  if (mapped.role !== "user") {
    return items;
  }
  if (items.some((item) => item.id === mapped.id)) {
    return items;
  }
  const localIndex = items.findIndex(
    (item) =>
      item.role === "user" &&
      item.id.startsWith("local-") &&
      item.content === mapped.content,
  );
  if (localIndex >= 0) {
    return items.map((item, index) => (index === localIndex ? mapped : item));
  }
  return [...items, mapped];
};

export const applyChatJobEvent = (
  items: ReadonlyArray<MediaThreadItem>,
  event: ChatJobEvent,
): ReadonlyArray<MediaThreadItem> => {
  const patch = jobPatch(event);
  if (
    items.some((item) => item.role === "assistant" && item.jobId === event.jobId)
  ) {
    return applyJobEvent(items, event.jobId, patch);
  }
  const unboundIndex = items.findIndex(
    (item) =>
      item.role === "assistant" &&
      item.jobId === undefined &&
      item.id.startsWith("local-"),
  );
  if (unboundIndex >= 0) {
    return applyJobEvent(
      items.map((item, index) =>
        index === unboundIndex && item.role === "assistant"
          ? { ...item, jobId: event.jobId }
          : item,
      ),
      event.jobId,
      patch,
    );
  }
  return [
    ...items,
    {
      id: `job-${event.jobId}`,
      role: "assistant",
      jobId: event.jobId,
      status: event.status,
      ...(event.url === undefined ? {} : { url: event.url }),
      ...(event.error === undefined ? {} : { error: event.error }),
    },
  ];
};

export const hydrateJobs = (
  items: ReadonlyArray<MediaThreadItem>,
  jobs: ReadonlyArray<GenerationJob>,
): ReadonlyArray<MediaThreadItem> => {
  const next: Array<MediaThreadItem> = [...items];
  for (const job of jobs) {
    if (
      next.some((item) => item.role === "assistant" && item.jobId === job.id)
    ) {
      continue;
    }
    next.push({
      id: `job-${job.id}`,
      role: "assistant",
      jobId: job.id,
      status: job.status,
      ...(job.resultUrl === undefined ? {} : { url: job.resultUrl }),
      ...(job.error === undefined ? {} : { error: job.error }),
    });
  }
  return next;
};

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
