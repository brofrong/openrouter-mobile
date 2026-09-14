import {
  type ChatJobEvent,
  decodeStoredContent,
  type GenerationJob,
} from "@openrouter-mobile/domain";

export type ImageJobStatus = "queued" | "running" | "completed" | "failed";

export type ImageUserItem = {
  readonly id: string;
  readonly role: "user";
  readonly content: string;
  readonly images?: ReadonlyArray<string>;
};

export type ImageAssistantItem = {
  readonly id: string;
  readonly role: "assistant";
  readonly jobId?: string;
  readonly status: ImageJobStatus;
  readonly url?: string;
  readonly error?: string;
  readonly aspectRatio?: string;
};

export type ImageThreadItem = ImageUserItem | ImageAssistantItem;

export const IMAGE_MESSAGE_PAGE_SIZE = 30;

export const isServerMessageId = (id: string): boolean =>
  !id.startsWith("local-");

export const oldestServerMessageId = (
  items: ReadonlyArray<ImageThreadItem>,
): string | undefined => items.find((item) => isServerMessageId(item.id))?.id;

export const mergeOlderMessages = (
  current: ReadonlyArray<ImageThreadItem>,
  older: ReadonlyArray<ImageThreadItem>,
): ReadonlyArray<ImageThreadItem> => {
  const seen = new Set(current.map((item) => item.id));
  return [...older.filter((item) => !seen.has(item.id)), ...current];
};

export const toImageThreadItem = (message: {
  readonly id: string;
  readonly role: "user" | "assistant" | "system";
  readonly content: string;
}): ImageThreadItem => {
  if (message.role === "user") {
    const stored = decodeStoredContent(message.content);
    return {
      id: message.id,
      role: "user",
      content: stored.text,
      ...(stored.images.length === 0 ? {} : { images: stored.images }),
    };
  }
  return {
    id: message.id,
    role: "assistant",
    status: "completed",
    url: message.content,
  };
};

export type AppendTurnOptions = {
  readonly prompt: string;
  readonly localId: string;
  readonly aspectRatio?: string;
  readonly images?: ReadonlyArray<string>;
};

export type JobEventPatch = {
  readonly status: ImageJobStatus;
  readonly url?: string;
  readonly error?: string;
};

const userId = (localId: string) => `local-${localId}`;
const assistantId = (localId: string) => `local-${localId}-assistant`;

const withAspect = (
  item: ImageAssistantItem,
  aspectRatio: string | undefined,
): ImageAssistantItem =>
  aspectRatio === undefined ? item : { ...item, aspectRatio };

export const appendTurn = (
  items: ReadonlyArray<ImageThreadItem>,
  options: AppendTurnOptions,
): ReadonlyArray<ImageThreadItem> => [
  ...items,
  {
    id: userId(options.localId),
    role: "user",
    content: options.prompt,
    ...(options.images === undefined || options.images.length === 0
      ? {}
      : { images: options.images }),
  },
  withAspect(
    {
      id: assistantId(options.localId),
      role: "assistant",
      status: "queued",
    },
    options.aspectRatio,
  ),
];

export const bindJob = (
  items: ReadonlyArray<ImageThreadItem>,
  localId: string,
  jobId: string,
): ReadonlyArray<ImageThreadItem> => {
  const id = assistantId(localId);
  return items.map((item) =>
    item.role === "assistant" && item.id === id ? { ...item, jobId } : item,
  );
};

export const applyJobEvent = (
  items: ReadonlyArray<ImageThreadItem>,
  jobId: string,
  event: JobEventPatch,
): ReadonlyArray<ImageThreadItem> =>
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

export const applyChatJobEvent = (
  items: ReadonlyArray<ImageThreadItem>,
  event: ChatJobEvent,
): ReadonlyArray<ImageThreadItem> =>
  applyJobEvent(items, event.jobId, {
    status: event.status,
    ...(event.url === undefined ? {} : { url: event.url }),
    ...(event.error === undefined ? {} : { error: event.error }),
  });

export const hydrateJobs = (
  items: ReadonlyArray<ImageThreadItem>,
  jobs: ReadonlyArray<GenerationJob>,
): ReadonlyArray<ImageThreadItem> => {
  const next: Array<ImageThreadItem> = [...items];
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
  items: ReadonlyArray<ImageThreadItem>,
  localId: string,
  error: string,
): ReadonlyArray<ImageThreadItem> => {
  const id = assistantId(localId);
  return items.map((item) =>
    item.role === "assistant" && item.id === id
      ? { ...item, status: "failed", error }
      : item,
  );
};

export const splitImageUrls = (
  value: string | undefined,
): ReadonlyArray<string> =>
  value === undefined ? [] : value.split("\n").filter((url) => url.length > 0);

export const aspectRatioValue = (value: string | undefined): number => {
  if (value === undefined) {
    return 1;
  }
  const [widthText, heightText] = value.split(":");
  const width = Number(widthText);
  const height = Number(heightText);
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return 1;
  }
  return width / height;
};
