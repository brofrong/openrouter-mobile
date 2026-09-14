import type {
  ChatMessagePage,
  ChatStreamEvent,
  Message,
} from "@openrouter-mobile/domain";

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

export type ChatThreadState = {
  readonly messages: ReadonlyArray<ThreadItem>;
  readonly draft: string;
  readonly generating: boolean;
  readonly error?: string;
};

export const emptyThread = (): ChatThreadState => ({
  messages: [],
  draft: "",
  generating: false,
});

const hasMessageId = (
  messages: ReadonlyArray<ThreadItem>,
  id: string,
): boolean => messages.some((item) => item.id === id);

const ignoreTokenAfterDone = (state: ChatThreadState): boolean =>
  !state.generating && state.messages.at(-1)?.role === "assistant";

export const applyChatStreamEvent = (
  state: ChatThreadState,
  event: ChatStreamEvent,
): ChatThreadState => {
  switch (event._tag) {
    case "user":
      return hasMessageId(state.messages, event.message.id)
        ? state
        : {
            ...state,
            messages: [...state.messages, toThreadItem(event.message)],
          };
    case "token":
      if (ignoreTokenAfterDone(state)) {
        return state;
      }
      return {
        ...state,
        draft: `${state.draft}${event.text}`,
        generating: true,
      };
    case "done":
      return {
        ...state,
        messages: hasMessageId(state.messages, event.message.id)
          ? state.messages
          : [...state.messages, toThreadItem(event.message)],
        draft: "",
        generating: false,
      };
    case "error":
      return {
        ...state,
        generating: false,
        error: event.error,
      };
    case "title":
    case "job":
      return state;
  }
};

export const hydrateFromPage = (page: ChatMessagePage): ChatThreadState => ({
  messages: page.messages.map(toThreadItem),
  draft: page.inProgress ?? "",
  generating: page.generating,
});
