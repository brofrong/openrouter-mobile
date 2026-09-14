import {
  type Chat,
  type ChatId,
  type ChatKind,
  type ChatStreamEvent,
  type MessageId,
  withChatTitle,
} from "@openrouter-mobile/domain";
import { Effect } from "effect";
import { useNavigation } from "expo-router";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Pressable } from "react-native";
import { Paragraph, ScrollView, Spinner, Text } from "tamagui";
import { setAfterSeq, withAfterSeq } from "../../shared/afterSeq";
import { formatRpcError } from "../../shared/errors";
import { randomLocalId } from "../../shared/random-id";
import { RpcHttp, RpcWs } from "../../shared/rpc";
import { mobileRuntime } from "../../shared/runtime";
import { KeyboardScreen } from "../../shared/ui/KeyboardScreen";
import { useChatRoute } from "../../shared/use-chat-route";
import { useRpcStream } from "../../shared/use-rpc-stream";
import { useStickToBottom } from "../../shared/use-stick-to-bottom";
import { useCategoryDefaultModel } from "../ai-config/use-ai-config";
import { useSelectedMediaModel } from "../model/use-selected-media-model";
import { ChatMenu, ChatMenuButton } from "./ChatMenu";
import { ChatRenameDialog } from "./ChatRenameDialog";
import { MediaComposer } from "./MediaComposer";
import { type MediaResultKind, MediaThread } from "./MediaThread";
import {
  appendTurn,
  applyChatJobEvent,
  applyChatUserEvent,
  bindJob,
  failTurn,
  hydrateJobs,
  MEDIA_MESSAGE_PAGE_SIZE,
  type MediaThreadItem,
  mergeOlderMessages,
  oldestServerMessageId,
  toMediaThreadItem,
} from "./media-thread";

export type MediaChatKind = Extract<ChatKind, "video" | "speech" | "audio">;

export type MediaChatScreenProps = {
  readonly kind: MediaChatKind;
  readonly defaultTitle: string;
  readonly emptyHint: string;
  readonly threadEmptyHint: string;
  readonly composerPlaceholder: string;
  readonly submitLabel: string;
  readonly generatingLabel: string;
  readonly resultKind: MediaResultKind;
};

const startMediaJob = (
  kind: MediaChatKind,
  chatId: ChatId,
  input: string,
  selected: {
    readonly model: { readonly id: string };
    readonly voice?: string;
    readonly options: {
      readonly aspectRatio?: string;
      readonly resolution?: string;
      readonly duration?: number;
      readonly generateAudio?: boolean;
      readonly voice?: string;
    };
  },
) =>
  Effect.gen(function* () {
    const rpc = yield* RpcHttp;
    switch (kind) {
      case "video":
        return yield* rpc.VideoGenerate({
          chatId,
          prompt: input,
          model: selected.model.id,
          ...(selected.options.aspectRatio === undefined
            ? {}
            : { aspectRatio: selected.options.aspectRatio }),
          ...(selected.options.resolution === undefined
            ? {}
            : { resolution: selected.options.resolution }),
          ...(selected.options.duration === undefined
            ? {}
            : { duration: selected.options.duration }),
          ...(selected.options.generateAudio === undefined
            ? {}
            : { generateAudio: selected.options.generateAudio }),
        });
      case "speech":
        return yield* rpc.SpeechSynthesize({
          chatId,
          text: input,
          model: selected.model.id,
          ...(selected.voice === undefined ? {} : { voice: selected.voice }),
        });
      case "audio":
        return yield* rpc.AudioGenerate({
          chatId,
          prompt: input,
          model: selected.model.id,
        });
    }
  });

export function MediaChatScreen({
  kind,
  defaultTitle,
  emptyHint,
  threadEmptyHint,
  composerPlaceholder,
  submitLabel,
  generatingLabel,
  resultKind,
}: MediaChatScreenProps) {
  const { belongsToKind, routeChatId, openChat } = useChatRoute(kind);
  const [chats, setChats] = useState<ReadonlyArray<Chat>>([]);
  const [selectedId, setSelectedId] = useState<ChatId | undefined>(routeChatId);
  const [items, setItems] = useState<ReadonlyArray<MediaThreadItem>>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const defaultModelId = useCategoryDefaultModel(kind);
  const selected = useSelectedMediaModel(kind, defaultModelId, selectedId);
  const [composer, setComposer] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [streamReady, setStreamReady] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState<Chat | undefined>();
  const [renameBusy, setRenameBusy] = useState(false);
  const [renameError, setRenameError] = useState<string | undefined>();
  const loadingOlderRef = useRef(false);
  const loadedIdRef = useRef<ChatId | undefined>(undefined);
  const restoredIdRef = useRef<ChatId | undefined>(undefined);
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;
  const navigation = useNavigation();
  const selectedChat = chats.find((chat) => chat.id === selectedId);
  const selectedTitle = selectedChat?.title;

  const applyChat = useCallback((next: Chat) => {
    setChats((current) => {
      const index = current.findIndex((chat) => chat.id === next.id);
      if (index === -1) {
        return [next, ...current];
      }
      return current.map((chat) => (chat.id === next.id ? next : chat));
    });
  }, []);

  const persistSelection = useCallback(
    (modelId: string) => {
      const chatId = selectedIdRef.current;
      if (chatId === undefined) {
        return;
      }
      void mobileRuntime.runPromise(
        Effect.gen(function* () {
          const rpc = yield* RpcHttp;
          return yield* rpc.ChatSetModel({ chatId, model: modelId });
        }).pipe(
          Effect.match({
            onFailure: (failure) => {
              setError(formatRpcError(failure));
            },
            onSuccess: (chat) => {
              applyChat(chat);
            },
          }),
        ),
      );
    },
    [applyChat],
  );

  const selectedForBar = useMemo(
    () => ({
      ...selected,
      selectModel: (next: Parameters<typeof selected.selectModel>[0]) => {
        selected.selectModel(next);
        persistSelection(typeof next === "string" ? next : next.id);
      },
    }),
    [persistSelection, selected],
  );

  const createChatPayload = () => ({
    kind,
    model: selected.model.id,
  });

  const loadChats = useCallback(() => {
    void mobileRuntime.runPromise(
      Effect.gen(function* () {
        const rpc = yield* RpcHttp;
        return yield* rpc.ChatList({ kind });
      }).pipe(
        Effect.match({
          onFailure: (failure) => {
            setError(formatRpcError(failure));
          },
          onSuccess: (list) => {
            setChats(list);
            setError(undefined);
          },
        }),
      ),
    );
  }, [kind]);

  const openRename = useCallback((chat: Chat) => {
    setMenuOpen(false);
    setRenameError(undefined);
    setRenaming(chat);
  }, []);

  const openMenu = useCallback(() => {
    loadChats();
    setMenuOpen(true);
  }, [loadChats]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerLeft: () => <ChatMenuButton onPress={openMenu} />,
      headerTitle:
        selectedTitle === undefined
          ? defaultTitle
          : () => (
              <Pressable
                accessibilityLabel="Rename chat"
                accessibilityRole="button"
                onPress={() => {
                  if (selectedChat !== undefined) {
                    openRename(selectedChat);
                  }
                }}
              >
                <Text numberOfLines={1}>{selectedTitle}</Text>
              </Pressable>
            ),
    });
  }, [
    defaultTitle,
    navigation,
    openMenu,
    openRename,
    selectedChat,
    selectedTitle,
  ]);

  const {
    scrollRef,
    pinToBottom,
    markPrepend,
    onScroll,
    onLayout,
    onContentSizeChange,
    isNearTop,
    underfillRef,
  } = useStickToBottom();

  useEffect(() => {
    loadChats();
  }, [loadChats]);

  const loadMessages = useCallback(
    (chatId: ChatId, before?: MessageId) => {
      const prepend = before !== undefined;
      if (prepend) {
        if (loadingOlderRef.current) {
          return;
        }
        loadingOlderRef.current = true;
        markPrepend();
        setLoadingOlder(true);
      } else {
        setLoadingThread(true);
        setHasMore(false);
      }
      void mobileRuntime.runPromise(
        Effect.gen(function* () {
          const rpc = yield* RpcHttp;
          return yield* rpc.ChatMessages({
            chatId,
            limit: MEDIA_MESSAGE_PAGE_SIZE,
            ...(before === undefined ? {} : { before }),
          });
        }).pipe(
          Effect.match({
            onFailure: (failure) => {
              if (selectedIdRef.current !== chatId) {
                return;
              }
              setError(formatRpcError(failure));
              if (prepend) {
                loadingOlderRef.current = false;
                setLoadingOlder(false);
              } else {
                setLoadingThread(false);
              }
            },
            onSuccess: (page) => {
              if (selectedIdRef.current !== chatId) {
                return;
              }
              const mapped = page.messages
                .filter((message) => message.role !== "system")
                .map(toMediaThreadItem);
              if (prepend) {
                setItems((current) => mergeOlderMessages(current, mapped));
                loadingOlderRef.current = false;
                setLoadingOlder(false);
              } else {
                pinToBottom();
                setItems(hydrateJobs(mapped, page.jobs));
                setAfterSeq(chatId, page.headSeq);
                setStreamReady(true);
                setLoadingThread(false);
              }
              setHasMore(page.hasMore);
            },
          }),
        ),
      );
    },
    [markPrepend, pinToBottom],
  );

  const activateChat = useCallback(
    (
      chatId: ChatId,
      options?: { readonly resetThread?: boolean; readonly load?: boolean },
    ) => {
      const resetThread = options?.resetThread ?? true;
      const load = options?.load ?? true;
      loadingOlderRef.current = false;
      setSelectedId(chatId);
      selectedIdRef.current = chatId;
      loadedIdRef.current = chatId;
      setStreamReady(false);
      if (resetThread) {
        setItems([]);
        setHasMore(false);
        setLoadingThread(load);
      }
      setError(undefined);
      setLoadingOlder(false);
      setMenuOpen(false);
      pinToBottom();
      if (load) {
        loadMessages(chatId);
      } else {
        // Empty newly created chats skip ChatMessages and seed afterSeq 0
        // so the first send can subscribe.
        setAfterSeq(chatId, 0);
        setStreamReady(true);
      }
    },
    [loadMessages, pinToBottom],
  );

  useEffect(() => {
    if (!belongsToKind) {
      return;
    }
    if (routeChatId === loadedIdRef.current) {
      if (routeChatId !== undefined) {
        setSelectedId(routeChatId);
      }
      return;
    }
    if (routeChatId === undefined) {
      loadingOlderRef.current = false;
      setStreamReady(false);
      setSelectedId(undefined);
      selectedIdRef.current = undefined;
      loadedIdRef.current = undefined;
      restoredIdRef.current = undefined;
      setItems([]);
      setHasMore(false);
      setError(undefined);
      setLoadingThread(false);
      setLoadingOlder(false);
      return;
    }
    activateChat(routeChatId);
  }, [activateChat, belongsToKind, routeChatId]);

  useEffect(() => {
    if (selectedId === undefined) {
      restoredIdRef.current = undefined;
      return;
    }
    if (restoredIdRef.current === selectedId) {
      return;
    }
    const chat = chats.find((item) => item.id === selectedId);
    if (chat === undefined) {
      return;
    }
    selected.restoreFromChat(chat);
    restoredIdRef.current = selectedId;
  }, [chats, selected, selectedId]);

  const selectChat = (chatId: ChatId) => {
    openChat(chatId);
  };

  const loadOlder = useCallback(() => {
    if (selectedId === undefined || !hasMore || loadingOlderRef.current) {
      return;
    }
    const before = oldestServerMessageId(items);
    if (before === undefined) {
      return;
    }
    loadMessages(selectedId, before as MessageId);
  }, [hasMore, loadMessages, items, selectedId]);

  const applyCreatedChat = (chat: Chat, resetThread = true) => {
    setChats((current) => [chat, ...current]);
    activateChat(chat.id, { resetThread, load: false });
    openChat(chat.id);
  };

  const createChat = () => {
    setBusy(true);
    void mobileRuntime.runPromise(
      Effect.gen(function* () {
        const rpc = yield* RpcHttp;
        return yield* rpc.ChatCreate(createChatPayload());
      }).pipe(
        Effect.match({
          onFailure: (failure) => {
            setError(formatRpcError(failure));
            setBusy(false);
          },
          onSuccess: (chat) => {
            applyCreatedChat(chat);
            setBusy(false);
          },
        }),
      ),
    );
  };

  const generate = () => {
    const prompt = composer.trim();
    if (prompt.length === 0) {
      return;
    }
    const localId = randomLocalId();
    setComposer("");
    setError(undefined);
    pinToBottom();
    setItems((current) => appendTurn(current, { prompt, localId }));
    void mobileRuntime.runPromise(
      Effect.gen(function* () {
        const rpc = yield* RpcHttp;
        let chatId = selectedId;
        if (chatId === undefined) {
          const chat = yield* rpc.ChatCreate(createChatPayload());
          applyCreatedChat(chat, false);
          chatId = chat.id;
        }
        return yield* startMediaJob(kind, chatId, prompt, selected);
      }).pipe(
        Effect.match({
          onFailure: (failure) => {
            const message = formatRpcError(failure);
            setError(message);
            setItems((current) => failTurn(current, localId, message));
          },
          onSuccess: (job) => {
            setItems((current) => bindJob(current, localId, job.id));
            pinToBottom();
          },
        }),
      ),
    );
  };

  const subscribeMake = useCallback(
    (afterSeq?: number) =>
      Effect.gen(function* () {
        const rpc = yield* RpcWs;
        return rpc.ChatSubscribe(
          withAfterSeq({ chatId: selectedId as ChatId }, afterSeq),
        );
      }),
    [selectedId],
  );

  const onChunk = useCallback(
    (event: ChatStreamEvent) => {
      if (event._tag === "title" && event.title.length > 0) {
        const chatId = selectedIdRef.current;
        if (chatId !== undefined) {
          setChats((current) =>
            current.map((chat) =>
              chat.id === chatId ? withChatTitle(chat, event.title) : chat,
            ),
          );
        }
      }
      if (event._tag === "user") {
        setItems((current) => applyChatUserEvent(current, event));
        pinToBottom();
        return;
      }
      if (event._tag === "job") {
        setItems((current) => applyChatJobEvent(current, event));
        if (event.status === "failed" && event.error !== undefined) {
          setError(event.error);
        }
        pinToBottom();
        return;
      }
      if (event._tag === "error") {
        setError(event.error);
      }
    },
    [pinToBottom],
  );

  const onStreamError = useCallback((message: string) => {
    setError(message);
  }, []);

  useRpcStream({
    enabled: selectedId !== undefined && streamReady,
    key: selectedId ?? "",
    make: subscribeMake,
    onChunk,
    onError: onStreamError,
  });

  const saveRename = (title: string) => {
    if (renaming === undefined) {
      return;
    }
    setRenameBusy(true);
    void mobileRuntime.runPromise(
      Effect.gen(function* () {
        const rpc = yield* RpcHttp;
        return yield* rpc.ChatRename({ chatId: renaming.id, title });
      }).pipe(
        Effect.match({
          onFailure: (failure) => {
            setRenameError(formatRpcError(failure));
            setRenameBusy(false);
          },
          onSuccess: (chat) => {
            applyChat(chat);
            setRenameBusy(false);
            setRenameError(undefined);
            setRenaming(undefined);
          },
        }),
      ),
    );
  };

  underfillRef.current = () => {
    if (hasMore && items.length > 0) {
      loadOlder();
    }
  };

  const handleThreadScroll = useCallback(
    (event: Parameters<typeof onScroll>[0]) => {
      onScroll(event);
      if (isNearTop()) {
        loadOlder();
      }
    },
    [isNearTop, loadOlder, onScroll],
  );

  const jobBusy = items.some(
    (item) =>
      item.role === "assistant" &&
      (item.status === "queued" || item.status === "running"),
  );
  const screenBusy = busy || jobBusy;

  return (
    <KeyboardScreen>
      <ChatMenu
        busy={screenBusy}
        chats={chats}
        error={error}
        onClose={() => {
          setMenuOpen(false);
        }}
        onCreate={createChat}
        onRename={openRename}
        onSelect={selectChat}
        open={menuOpen}
        selectedId={selectedId}
      />
      <ChatRenameDialog
        busy={renameBusy}
        error={renameError}
        onClose={() => {
          if (!renameBusy) {
            setRenaming(undefined);
            setRenameError(undefined);
          }
        }}
        onSave={saveRename}
        open={renaming !== undefined}
        title={renaming?.title ?? ""}
      />
      {error !== undefined && !menuOpen ? (
        <Paragraph color="$red10" px="$3" pt="$3">
          {error}
        </Paragraph>
      ) : null}
      <ScrollView
        ref={scrollRef}
        flex={1}
        p="$3"
        scrollEventThrottle={16}
        onLayout={onLayout}
        onScroll={handleThreadScroll}
        onContentSizeChange={onContentSizeChange}
      >
        {selectedId === undefined ? (
          <Paragraph color="$color10">{emptyHint}</Paragraph>
        ) : loadingThread && items.length === 0 ? (
          <Spinner />
        ) : items.length === 0 ? (
          <Paragraph color="$color10">{threadEmptyHint}</Paragraph>
        ) : (
          <>
            {loadingOlder ? <Spinner mb="$3" /> : null}
            {hasMore && !loadingOlder ? (
              <Paragraph color="$color10" mb="$3">
                Scroll up for older messages.
              </Paragraph>
            ) : null}
            <MediaThread
              generatingLabel={generatingLabel}
              items={items}
              resultKind={resultKind}
            />
          </>
        )}
      </ScrollView>
      <MediaComposer
        busy={screenBusy}
        composer={composer}
        kind={kind}
        placeholder={composerPlaceholder}
        selected={selectedForBar}
        submitLabel={submitLabel}
        onComposerChange={setComposer}
        onSubmit={generate}
      />
    </KeyboardScreen>
  );
}
