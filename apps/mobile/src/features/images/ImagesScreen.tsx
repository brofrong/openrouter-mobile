import {
  type Chat,
  type ChatId,
  type GenerationJobId,
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
import { useCategoryDefaultModel } from "../../entities/ai-config/use-ai-config";
import { ChatMenu, ChatMenuButton } from "../../entities/chat/ChatMenu";
import { ChatRenameDialog } from "../../entities/chat/ChatRenameDialog";
import { withAfterSeq } from "../../shared/afterSeq";
import { formatRpcError } from "../../shared/errors";
import { RpcHttp, RpcWs } from "../../shared/rpc";
import { mobileRuntime } from "../../shared/runtime";
import { KeyboardScreen } from "../../shared/ui/KeyboardScreen";
import { useChatRoute } from "../../shared/use-chat-route";
import { useRpcStream } from "../../shared/use-rpc-stream";
import { useStickToBottom } from "../../shared/use-stick-to-bottom";
import { ImagesComposer } from "./ImagesComposer";
import { ImageThread } from "./ImageThread";
import {
  appendTurn,
  applyJobEvent,
  bindJob,
  failTurn,
  IMAGE_MESSAGE_PAGE_SIZE,
  type ImageThreadItem,
  mergeOlderMessages,
  oldestServerMessageId,
  toImageThreadItem,
} from "./thread";
import { useSelectedImageModel } from "./use-selected-image-model";

export function ImagesScreen() {
  const { belongsToKind, routeChatId, openChat } = useChatRoute("images");
  const [chats, setChats] = useState<ReadonlyArray<Chat>>([]);
  const [selectedId, setSelectedId] = useState<ChatId | undefined>(routeChatId);
  const [items, setItems] = useState<ReadonlyArray<ImageThreadItem>>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const defaultModelId = useCategoryDefaultModel("image");
  const selected = useSelectedImageModel(defaultModelId, selectedId);
  const [composer, setComposer] = useState("");
  const [attachments, setAttachments] = useState<ReadonlyArray<string>>([]);
  const [jobId, setJobId] = useState<GenerationJobId | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState<Chat | undefined>();
  const [renameBusy, setRenameBusy] = useState(false);
  const [renameError, setRenameError] = useState<string | undefined>();
  const jobIdRef = useRef<GenerationJobId | undefined>(undefined);
  const loadingOlderRef = useRef(false);
  const loadedIdRef = useRef<ChatId | undefined>(undefined);
  const restoredIdRef = useRef<ChatId | undefined>(undefined);
  const selectedIdRef = useRef(selectedId);
  jobIdRef.current = jobId;
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
    kind: "image" as const,
    model: selected.model.id,
  });

  const loadChats = useCallback(() => {
    void mobileRuntime.runPromise(
      Effect.gen(function* () {
        const rpc = yield* RpcHttp;
        return yield* rpc.ChatList({ kind: "image" });
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
          ? "Images"
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
            limit: IMAGE_MESSAGE_PAGE_SIZE,
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
              const next = page.messages
                .filter((message) => message.role !== "system")
                .map(toImageThreadItem);
              if (prepend) {
                setItems((current) => mergeOlderMessages(current, next));
                loadingOlderRef.current = false;
                setLoadingOlder(false);
              } else {
                pinToBottom();
                setItems(next);
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
      if (resetThread) {
        setItems([]);
        setJobId(undefined);
        jobIdRef.current = undefined;
        setHasMore(false);
        setLoadingThread(load);
      }
      setError(undefined);
      setLoadingOlder(false);
      setMenuOpen(false);
      pinToBottom();
      if (load) {
        loadMessages(chatId);
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
      setSelectedId(undefined);
      selectedIdRef.current = undefined;
      loadedIdRef.current = undefined;
      restoredIdRef.current = undefined;
      setItems([]);
      setJobId(undefined);
      jobIdRef.current = undefined;
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
    if (prompt.length === 0 && attachments.length === 0) {
      return;
    }
    const localId = crypto.randomUUID();
    const { options } = selected;
    const inputReferences = attachments;
    setComposer("");
    setAttachments([]);
    setBusy(true);
    setError(undefined);
    pinToBottom();
    setItems((current) =>
      appendTurn(current, {
        prompt: prompt.length > 0 ? prompt : "Edit this image.",
        localId,
        ...(options.aspectRatio === undefined
          ? {}
          : { aspectRatio: options.aspectRatio }),
        ...(inputReferences.length === 0 ? {} : { images: inputReferences }),
      }),
    );
    void mobileRuntime.runPromise(
      Effect.gen(function* () {
        const rpc = yield* RpcHttp;
        let chatId = selectedId;
        if (chatId === undefined) {
          const chat = yield* rpc.ChatCreate(createChatPayload());
          applyCreatedChat(chat, false);
          chatId = chat.id;
        }
        return yield* rpc.ImageGenerate({
          chatId,
          prompt: prompt.length > 0 ? prompt : "Edit this image.",
          model: selected.model.id,
          ...(options.aspectRatio === undefined
            ? {}
            : { aspectRatio: options.aspectRatio }),
          ...(options.resolution === undefined
            ? {}
            : { resolution: options.resolution }),
          ...(options.quality === undefined
            ? {}
            : { quality: options.quality }),
          ...(options.background === undefined
            ? {}
            : { background: options.background }),
          ...(options.n === undefined ? {} : { n: options.n }),
          ...(inputReferences.length === 0 ? {} : { inputReferences }),
        });
      }).pipe(
        Effect.match({
          onFailure: (failure) => {
            const message = formatRpcError(failure);
            setError(message);
            setItems((current) => failTurn(current, localId, message));
            setBusy(false);
          },
          onSuccess: (job) => {
            jobIdRef.current = job.id;
            setJobId(job.id);
            setItems((current) => bindJob(current, localId, job.id));
            pinToBottom();
          },
        }),
      ),
    );
  };

  const subscribeJobMake = useCallback(
    (afterSeq?: number) =>
      Effect.gen(function* () {
        if (jobId === undefined) {
          return yield* Effect.die("Image stream started without a job");
        }
        const rpc = yield* RpcWs;
        return rpc.JobSubscribe(withAfterSeq({ jobId }, afterSeq));
      }),
    [jobId],
  );

  const onJobEvent = useCallback(
    (event: {
      status: "queued" | "running" | "completed" | "failed";
      url?: string;
      error?: string;
    }) => {
      const activeJobId = jobIdRef.current;
      if (activeJobId === undefined) {
        return;
      }
      setItems((current) => applyJobEvent(current, activeJobId, event));
      if (event.status === "completed" || event.status === "failed") {
        setBusy(false);
        if (event.error !== undefined && event.error.length > 0) {
          setError(event.error);
        }
      }
      pinToBottom();
    },
    [pinToBottom],
  );

  const onJobStreamError = useCallback((message: string) => {
    const activeJobId = jobIdRef.current;
    setError(message);
    setBusy(false);
    if (activeJobId !== undefined) {
      setItems((current) =>
        applyJobEvent(current, activeJobId, {
          status: "failed",
          error: message,
        }),
      );
    }
  }, []);

  useRpcStream({
    enabled: jobId !== undefined,
    key: jobId ?? "",
    make: subscribeJobMake,
    onChunk: onJobEvent,
    onError: onJobStreamError,
  });

  const subscribeTitleMake = useCallback(
    (afterSeq?: number) =>
      Effect.gen(function* () {
        const rpc = yield* RpcWs;
        return rpc.ChatSubscribe(
          withAfterSeq({ chatId: selectedId as ChatId }, afterSeq),
        );
      }),
    [selectedId],
  );

  const onTitleChunk = useCallback((chunk: { title?: string }) => {
    if (chunk.title === undefined || chunk.title.length === 0) {
      return;
    }
    const chatId = selectedIdRef.current;
    if (chatId === undefined) {
      return;
    }
    setChats((current) =>
      current.map((chat) =>
        chat.id === chatId ? withChatTitle(chat, chunk.title as string) : chat,
      ),
    );
  }, []);

  useRpcStream({
    enabled: selectedId !== undefined,
    key: selectedId === undefined ? "" : `image-title-${selectedId}`,
    make: subscribeTitleMake,
    onChunk: onTitleChunk,
    onError: useCallback((message: string) => {
      setError(message);
    }, []),
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

  return (
    <KeyboardScreen>
      <ChatMenu
        busy={busy}
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
          <Paragraph color="$color10">
            Describe an image to start a new chat.
          </Paragraph>
        ) : loadingThread && items.length === 0 ? (
          <Spinner />
        ) : items.length === 0 ? (
          <Paragraph color="$color10">Describe an image to generate.</Paragraph>
        ) : (
          <>
            {loadingOlder ? <Spinner mb="$3" /> : null}
            {hasMore && !loadingOlder ? (
              <Paragraph color="$color10" mb="$3">
                Scroll up for older messages.
              </Paragraph>
            ) : null}
            <ImageThread items={items} />
          </>
        )}
      </ScrollView>
      <ImagesComposer
        busy={busy}
        composer={composer}
        images={attachments}
        selected={selectedForBar}
        onComposerChange={setComposer}
        onGenerate={generate}
        onImagesChange={setAttachments}
      />
    </KeyboardScreen>
  );
}
