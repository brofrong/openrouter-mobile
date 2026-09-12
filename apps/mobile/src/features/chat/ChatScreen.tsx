import type { Chat, ChatId, Message } from "@openrouter-mobile/domain";
import { Effect } from "effect";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Input,
  Paragraph,
  ScrollView,
  Text,
  XStack,
  YStack,
} from "tamagui";
import { withAfterSeq } from "../../shared/afterSeq";
import { formatRpcError } from "../../shared/errors";
import { RpcHttp, RpcWs } from "../../shared/rpc";
import { mobileRuntime } from "../../shared/runtime";
import { useRpcStream } from "../../shared/use-rpc-stream";

type ThreadItem = {
  readonly id: string;
  readonly role: "user" | "assistant" | "system";
  readonly content: string;
};

const toThreadItem = (message: Message): ThreadItem => ({
  id: message.id,
  role: message.role,
  content: message.content,
});

const commitDraft = (
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

export function ChatScreen() {
  const [chats, setChats] = useState<ReadonlyArray<Chat>>([]);
  const [selectedId, setSelectedId] = useState<ChatId | undefined>();
  const [messages, setMessages] = useState<ReadonlyArray<ThreadItem>>([]);
  const [draft, setDraft] = useState("");
  const [composer, setComposer] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const acceptTokensRef = useRef(false);
  const draftRef = useRef("");
  draftRef.current = draft;

  const loadChats = useCallback(() => {
    void mobileRuntime.runPromise(
      Effect.gen(function* () {
        const rpc = yield* RpcHttp;
        return yield* rpc.ChatList(undefined);
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

  useEffect(() => {
    loadChats();
  }, [loadChats]);

  const selectChat = (chatId: ChatId) => {
    acceptTokensRef.current = false;
    setSelectedId(chatId);
    setDraft("");
    setError(undefined);
    void mobileRuntime.runPromise(
      Effect.gen(function* () {
        const rpc = yield* RpcHttp;
        return yield* rpc.ChatMessages({ chatId });
      }).pipe(
        Effect.match({
          onFailure: (failure) => {
            setError(formatRpcError(failure));
          },
          onSuccess: (list) => {
            setMessages(list.map(toThreadItem));
          },
        }),
      ),
    );
  };

  const createChat = () => {
    setBusy(true);
    void mobileRuntime.runPromise(
      Effect.gen(function* () {
        const rpc = yield* RpcHttp;
        return yield* rpc.ChatCreate(undefined);
      }).pipe(
        Effect.match({
          onFailure: (failure) => {
            setError(formatRpcError(failure));
            setBusy(false);
          },
          onSuccess: (chat) => {
            setChats((current) => [chat, ...current]);
            acceptTokensRef.current = false;
            setSelectedId(chat.id);
            setMessages([]);
            setDraft("");
            setError(undefined);
            setBusy(false);
          },
        }),
      ),
    );
  };

  const send = () => {
    if (selectedId === undefined) {
      setError("Create or select a chat first.");
      return;
    }
    const content = composer.trim();
    if (content.length === 0) {
      return;
    }
    setComposer("");
    setBusy(true);
    setMessages((current) => commitDraft(current, draftRef.current));
    setDraft("");
    acceptTokensRef.current = true;
    void mobileRuntime.runPromise(
      Effect.gen(function* () {
        const rpc = yield* RpcHttp;
        return yield* rpc.ChatSend({ chatId: selectedId, content });
      }).pipe(
        Effect.match({
          onFailure: (failure) => {
            setError(formatRpcError(failure));
            setBusy(false);
            acceptTokensRef.current = false;
          },
          onSuccess: (message) => {
            setMessages((current) => [...current, toThreadItem(message)]);
            setError(undefined);
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

  const onToken = useCallback((chunk: { seq: number; text: string }) => {
    if (!acceptTokensRef.current || chunk.text.length === 0) {
      return;
    }
    setDraft((current) => current + chunk.text);
  }, []);

  const onStreamError = useCallback((message: string) => {
    setError(message);
  }, []);

  useRpcStream({
    enabled: selectedId !== undefined,
    key: selectedId ?? "",
    make: subscribeMake,
    onChunk: onToken,
    onError: onStreamError,
  });

  const visibleMessages = useMemo(() => {
    if (draft.length === 0) {
      return messages;
    }
    return [
      ...messages,
      {
        id: "draft",
        role: "assistant" as const,
        content: draft,
      },
    ];
  }, [draft, messages]);

  return (
    <YStack flex={1} bg="$background">
      <XStack p="$3" gap="$2" items="center">
        <Button size="$3" disabled={busy} onPress={createChat}>
          New chat
        </Button>
        <Button size="$3" chromeless onPress={loadChats}>
          Refresh
        </Button>
      </XStack>
      {error !== undefined ? (
        <Paragraph color="$red10" px="$3">
          {error}
        </Paragraph>
      ) : null}
      <ScrollView maxH={120} px="$3">
        {chats.length === 0 ? (
          <Paragraph color="$color10">No chats yet.</Paragraph>
        ) : (
          chats.map((chat) => (
            <Button
              key={chat.id}
              size="$3"
              chromeless
              bg={chat.id === selectedId ? "$color4" : undefined}
              onPress={() => {
                selectChat(chat.id);
              }}
            >
              {chat.title}
            </Button>
          ))
        )}
      </ScrollView>
      <ScrollView flex={1} p="$3">
        {selectedId === undefined ? (
          <Paragraph color="$color10">Select a chat to start.</Paragraph>
        ) : visibleMessages.length === 0 ? (
          <Paragraph color="$color10">No messages yet.</Paragraph>
        ) : (
          visibleMessages.map((message) => (
            <YStack
              key={message.id}
              mb="$3"
              p="$3"
              bg={message.role === "user" ? "$color4" : "$color3"}
              rounded="$3"
            >
              <Text fontWeight="700">{message.role}</Text>
              <Text>{message.content}</Text>
            </YStack>
          ))
        )}
      </ScrollView>
      <XStack p="$3" gap="$2">
        <Input
          flex={1}
          placeholder="Message"
          value={composer}
          onChangeText={setComposer}
          onSubmitEditing={send}
        />
        <Button disabled={busy} onPress={send}>
          Send
        </Button>
      </XStack>
    </YStack>
  );
}
