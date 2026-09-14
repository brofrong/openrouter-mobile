import { Ionicons } from "@expo/vector-icons";
import type { Chat, ChatId } from "@openrouter-mobile/domain";
import { Modal, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Button,
  H2,
  Paragraph,
  ScrollView,
  Text,
  useTheme,
  XStack,
  YStack,
} from "tamagui";
import { ModalProvider } from "../../shared/ui/ModalProvider";

type ChatMenuButtonProps = {
  readonly onPress: () => void;
};

export function ChatMenuButton({ onPress }: ChatMenuButtonProps) {
  const theme = useTheme();
  const color = theme.color?.val ?? "#111";

  return (
    <Pressable
      accessibilityLabel="Open chats"
      accessibilityRole="button"
      hitSlop={8}
      onPress={onPress}
      style={{ paddingHorizontal: 8 }}
    >
      <Ionicons color={color} name="menu" size={28} />
    </Pressable>
  );
}

type ChatMenuProps = {
  readonly open: boolean;
  readonly chats: ReadonlyArray<Chat>;
  readonly selectedId: ChatId | undefined;
  readonly busy: boolean;
  readonly error: string | undefined;
  readonly onClose: () => void;
  readonly onCreate: () => void;
  readonly onRename: (chat: Chat) => void;
  readonly onSelect: (chatId: ChatId) => void;
};

export function ChatMenu({
  open,
  chats,
  selectedId,
  busy,
  error,
  onClose,
  onCreate,
  onRename,
  onSelect,
}: ChatMenuProps) {
  if (!open) {
    return null;
  }

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="fullScreen"
      visible
    >
      <ModalProvider>
        <ChatMenuBody
          busy={busy}
          chats={chats}
          error={error}
          onClose={onClose}
          onCreate={onCreate}
          onRename={onRename}
          onSelect={onSelect}
          selectedId={selectedId}
        />
      </ModalProvider>
    </Modal>
  );
}

type ChatMenuBodyProps = Omit<ChatMenuProps, "open">;

function ChatMenuBody({
  chats,
  selectedId,
  busy,
  error,
  onClose,
  onCreate,
  onRename,
  onSelect,
}: ChatMenuBodyProps) {
  const theme = useTheme();
  const iconColor = theme.color?.val ?? "#111";
  const background = theme.background?.val;

  return (
    <SafeAreaView style={{ backgroundColor: background, flex: 1 }}>
      <YStack bg="$background" flex={1}>
        <XStack gap="$2" items="center" p="$3">
          <Pressable
            accessibilityLabel="Close chats"
            accessibilityRole="button"
            hitSlop={8}
            onPress={onClose}
          >
            <Ionicons color={iconColor} name="close" size={28} />
          </Pressable>
          <H2>Chats</H2>
        </XStack>
        <YStack pb="$3" px="$3">
          <Button disabled={busy} onPress={onCreate}>
            New chat
          </Button>
        </YStack>
        {error !== undefined ? (
          <Paragraph color="$red10" px="$3" pb="$2">
            {error}
          </Paragraph>
        ) : null}
        <ScrollView flex={1} px="$3">
          {chats.length === 0 ? (
            <Paragraph color="$color10">No chats yet.</Paragraph>
          ) : (
            chats.map((chat) => (
              <XStack gap="$1" items="center" key={chat.id} mb="$2">
                <Button
                  bg={chat.id === selectedId ? "$color4" : undefined}
                  chromeless
                  flex={1}
                  justify="flex-start"
                  onPress={() => {
                    onSelect(chat.id);
                  }}
                  size="$4"
                >
                  <Text numberOfLines={1}>{chat.title}</Text>
                </Button>
                <Pressable
                  accessibilityLabel={`Rename ${chat.title}`}
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={() => {
                    onRename(chat);
                  }}
                  style={{ padding: 8 }}
                >
                  <Ionicons color={iconColor} name="pencil-outline" size={20} />
                </Pressable>
              </XStack>
            ))
          )}
        </ScrollView>
      </YStack>
    </SafeAreaView>
  );
}
