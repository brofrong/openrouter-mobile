import {
  AppError,
  type Chat,
  type ChatId,
  type ChatStreamEvent,
  ChatUserEvent,
  type MessageId,
  type ReasoningEffort,
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
import { useCategoryDefaultModel } from "../../entities/ai-config/use-ai-config";
import { ChatMenu, ChatMenuButton } from "../../entities/chat/ChatMenu";
import { ChatRenameDialog } from "../../entities/chat/ChatRenameDialog";
import { resolveEffort } from "../../entities/model/catalog";
import { setAfterSeq, withAfterSeq } from "../../shared/afterSeq";
import { formatRpcError } from "../../shared/errors";
import { RpcHttp, RpcWs } from "../../shared/rpc";
import { mobileRuntime } from "../../shared/runtime";
import { KeyboardScreen } from "../../shared/ui/KeyboardScreen";
import { useChatRoute } from "../../shared/use-chat-route";
import { useRpcStream } from "../../shared/use-rpc-stream";
import { useStickToBottom } from "../../shared/use-stick-to-bottom";
import { ChatMessage } from "./ChatMessage";
import { ComposerBar } from "./ComposerBar";
import { ThinkingIndicator } from "./ThinkingIndicator";
import {
  applyChatStreamEvent,
  CHAT_MESSAGE_PAGE_SIZE,
  type ChatThreadState,
  emptyThread,
  hydrateFromPage,
  mergeOlderMessages,
  oldestServerMessageId,
  toThreadItem,
} from "./thread";
import { useSelectedModel } from "./use-selected-model";

const isAlreadyGenerating = (failure: unknown): boolean => {
  if (failure instanceof AppError) {
    return (
      failure.code === "VALIDATION" && failure.message === "Already generating"
    );
  }
  if (typeof failure === "object" && failure !== null) {
    const record = failure as { code?: unknown; message?: unknown };
    return (
      record.code === "VALIDATION" && record.message === "Already generating"
    );
  }
  return false;
};

const withThreadError = (
  state: ChatThreadState,
  error: string | undefined,
): ChatThreadState =>
  error === undefined
    ? {
        messages: state.messages,
        draft: state.draft,
        generating: state.generating,
      }
    : { ...state, error };

export function ChatScreen() {
  const { belongsToKind, routeChatId, openChat } = useChatRoute("text");
  const [chats, setChats] = useState<ReadonlyArray<Chat>>([]);
  const [selectedId, setSelectedId] = useState<ChatId | undefined>(routeChatId);
  const [thread, setThread] = useState<ChatThreadState>(emptyThread);
  const [hasMore, setHasMore] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [composer, setComposer] = useState("");
  const [attachments, setAttachments] = useState<ReadonlyArray<string>>([]);
  const [busy, setBusy] = useState(false);
  const [streamReady, setStreamReady] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState<Chat | undefined>();
  const [renameBusy, setRenameBusy] = useState(false);
  const [renameError, setRenameError] = useState<string | undefined>();
  const defaultModelId = useCategoryDefaultModel("text");
  const selectedModel = useSelectedModel(defaultModelId, selectedId);
  const loadingOlderRef = useRef(false);
  const loadedIdRef = useRef<ChatId | undefined>(undefined);
  const restoredIdRef = useRef<ChatId | undefined>(undefined);
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;
  const navigation = useNavigation();
  const selectedChat = chats.find((chat) => chat.id === selectedId);
  const selectedTitle = selectedChat?.title;
  const waitingReply = thread.generating && thread.draft.length === 0;

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
    (modelId: string, effort?: ReasoningEffort) => {
      const chatId = selectedIdRef.current;
      if (chatId === undefined) {
        return;
      }
      void mobileRuntime.runPromise(
        Effect.gen(function* () {
          const rpc = yield* RpcHttp;
          return yield* rpc.ChatSetModel({
            chatId,
            model: modelId,
            ...(effort === undefined ? {} : { effort }),
          });
        }).pipe(
          Effect.match({
            onFailure: (failure) => {
              setThread((current) =>
                withThreadError(current, formatRpcError(failure)),
              );
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

  const selectedModelForBar = useMemo(
    () => ({
      model: selectedModel.model,
      effort: selectedModel.effort,
      selectModel: (next: (typeof selectedModel)["model"]) => {
        selectedModel.selectModel(next);
        persistSelection(next.id, resolveEffort(next, selectedModel.effort));
      },
      setEffort: (value?: ReasoningEffort) => {
        selectedModel.setEffort(value);
        persistSelection(selectedModel.model.id, value);
      },
      restoreFromChat: selectedModel.restoreFromChat,
    }),
    [persistSelection, selectedModel],
  );

  const createChatPayload = () => ({
    kind: "text" as const,
    model: selectedModel.model.id,
    ...(selectedModel.effort === undefined
      ? {}
      : { effort: selectedModel.effort }),
  });

  const loadChats = useCallback(() => {
    void mobileRuntime.runPromise(
      Effect.gen(function* () {
        const rpc = yield* RpcHttp;
        return yield* rpc.ChatList({ kind: "text" });
      }).pipe(
        Effect.match({
          onFailure: (failure) => {
            setThread((current) =>
              withThreadError(current, formatRpcError(failure)),
            );
          },
          onSuccess: (list) => {
            setChats(list);
            setThread((current) => withThreadError(current, undefined));
          },
        }),
      ),
    );
  }, []);

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
          ? "Chat"
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
  }, [navigation, openMenu, openRename, selectedChat, selectedTitle]);

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
            limit: CHAT_MESSAGE_PAGE_SIZE,
            ...(before === undefined ? {} : { before }),
          });
        }).pipe(
          Effect.match({
            onFailure: (failure) => {
              if (selectedIdRef.current !== chatId) {
                return;
              }
              setThread((current) =>
                withThreadError(current, formatRpcError(failure)),
              );
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
              if (prepend) {
                setThread((current) => ({
                  ...current,
                  messages: mergeOlderMessages(
                    current.messages,
                    page.messages.map(toThreadItem),
                  ),
                }));
                loadingOlderRef.current = false;
                setLoadingOlder(false);
              } else {
                pinToBottom();
                setThread(hydrateFromPage(page));
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
        setThread(emptyThread());
        setHasMore(false);
        setLoadingThread(load);
      } else {
        setThread((current) => withThreadError(current, undefined));
      }
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
      setThread(emptyThread());
      setHasMore(false);
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
    selectedModel.restoreFromChat(chat);
    restoredIdRef.current = selectedId;
  }, [chats, selectedId, selectedModel]);

  const selectChat = (chatId: ChatId) => {
    openChat(chatId);
  };

  const loadOlder = useCallback(() => {
    if (selectedId === undefined || !hasMore || loadingOlderRef.current) {
      return;
    }
    const before = oldestServerMessageId(thread.messages);
    if (before === undefined) {
      return;
    }
    loadMessages(selectedId, before as MessageId);
  }, [hasMore, loadMessages, selectedId, thread.messages]);

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
            setThread((current) =>
              withThreadError(current, formatRpcError(failure)),
            );
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

  const send = () => {
    const content = composer.trim();
    if (content.length === 0 && attachments.length === 0) {
      return;
    }
    const images = attachments;
    setComposer("");
    setAttachments([]);
    setBusy(true);
    pinToBottom();
    setThread((current) => ({
      messages: current.messages,
      draft: current.draft,
      generating: true,
    }));
    void mobileRuntime.runPromise(
      Effect.gen(function* () {
        const rpc = yield* RpcHttp;
        let chatId = selectedId;
        if (chatId === undefined) {
          const chat = yield* rpc.ChatCreate(createChatPayload());
          applyCreatedChat(chat, false);
          chatId = chat.id;
        }
        return yield* rpc.ChatSend({
          chatId,
          content,
          model: selectedModel.model.id,
          ...(selectedModel.effort === undefined
            ? {}
            : { effort: selectedModel.effort }),
          ...(images.length === 0 ? {} : { images }),
        });
      }).pipe(
        Effect.match({
          onFailure: (failure) => {
            setBusy(false);
            const alreadyGenerating = isAlreadyGenerating(failure);
            setThread((current) => ({
              ...withThreadError(current, formatRpcError(failure)),
              generating: alreadyGenerating,
            }));
          },
          onSuccess: (message) => {
            pinToBottom();
            setThread((current) =>
              applyChatStreamEvent(
                current,
                new ChatUserEvent({
                  _tag: "user",
                  seq: 0,
                  message,
                }),
              ),
            );
            setBusy(false);
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

  const onChunk = useCallback((event: ChatStreamEvent) => {
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
    setThread((current) => applyChatStreamEvent(current, event));
  }, []);

  const onStreamError = useCallback((message: string) => {
    setThread((current) => ({
      ...withThreadError(current, message),
      generating: false,
    }));
  }, []);

  useRpcStream({
    enabled: selectedId !== undefined && streamReady,
    key: selectedId ?? "",
    make: subscribeMake,
    onChunk,
    onError: onStreamError,
  });

  const visibleMessages = useMemo(() => {
    if (thread.draft.length === 0) {
      return thread.messages;
    }
    return [
      ...thread.messages,
      {
        id: "draft",
        role: "assistant" as const,
        content: thread.draft,
      },
    ];
  }, [thread.draft, thread.messages]);

  underfillRef.current = () => {
    if (hasMore && thread.messages.length > 0) {
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

  return (
    <KeyboardScreen>
      <ChatMenu
        busy={busy}
        chats={chats}
        error={thread.error}
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
      {thread.error !== undefined && !menuOpen ? (
        <Paragraph color="$red10" px="$3" pt="$3">
          {thread.error}
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
        {selectedId === undefined && !thread.generating ? (
          <Paragraph color="$color10">
            Send a message to start a new chat.
          </Paragraph>
        ) : loadingThread &&
          visibleMessages.length === 0 &&
          !thread.generating ? (
          <Spinner />
        ) : visibleMessages.length === 0 && !thread.generating ? (
          <Paragraph color="$color10">No messages yet.</Paragraph>
        ) : (
          <>
            {loadingOlder ? <Spinner mb="$3" /> : null}
            {hasMore && !loadingOlder ? (
              <Paragraph color="$color10" mb="$3">
                Scroll up for older messages.
              </Paragraph>
            ) : null}
            {visibleMessages.map((message) => (
              <ChatMessage key={message.id} message={message} />
            ))}
            {waitingReply ? <ThinkingIndicator /> : null}
          </>
        )}
      </ScrollView>
      <ComposerBar
        busy={busy}
        composer={composer}
        images={attachments}
        selectedModel={selectedModelForBar}
        onComposerChange={setComposer}
        onImagesChange={setAttachments}
        onSend={send}
      />
    </KeyboardScreen>
  );
}
