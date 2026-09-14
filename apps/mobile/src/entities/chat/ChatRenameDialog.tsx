import { CHAT_TITLE_MAX_LENGTH } from "@openrouter-mobile/domain";
import { useEffect, useState } from "react";
import { Modal } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Button,
  H2,
  Input,
  Paragraph,
  useTheme,
  XStack,
  YStack,
} from "tamagui";
import { ModalProvider } from "../../shared/ui/ModalProvider";

type ChatRenameDialogProps = {
  readonly open: boolean;
  readonly title: string;
  readonly busy: boolean;
  readonly error: string | undefined;
  readonly onClose: () => void;
  readonly onSave: (title: string) => void;
};

export function ChatRenameDialog({
  open,
  title,
  busy,
  error,
  onClose,
  onSave,
}: ChatRenameDialogProps) {
  if (!open) {
    return null;
  }

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      visible
    >
      <ModalProvider>
        <ChatRenameBody
          busy={busy}
          error={error}
          onClose={onClose}
          onSave={onSave}
          title={title}
        />
      </ModalProvider>
    </Modal>
  );
}

type ChatRenameBodyProps = Omit<ChatRenameDialogProps, "open">;

function ChatRenameBody({
  title,
  busy,
  error,
  onClose,
  onSave,
}: ChatRenameBodyProps) {
  const theme = useTheme();
  const background = theme.background?.val;
  const [value, setValue] = useState(title);

  useEffect(() => {
    setValue(title);
  }, [title]);

  const trimmed = value.trim();
  const canSave = trimmed.length > 0 && !busy;

  return (
    <SafeAreaView style={{ backgroundColor: background, flex: 1 }}>
      <YStack bg="$background" flex={1} gap="$3" p="$3">
        <H2>Rename chat</H2>
        <Input
          autoFocus
          maxLength={CHAT_TITLE_MAX_LENGTH}
          onChangeText={setValue}
          onSubmitEditing={() => {
            if (canSave) {
              onSave(trimmed);
            }
          }}
          placeholder="Chat title"
          value={value}
        />
        <Paragraph color="$color10">
          {value.trim().length}/{CHAT_TITLE_MAX_LENGTH}
        </Paragraph>
        {error !== undefined ? (
          <Paragraph color="$red10">{error}</Paragraph>
        ) : null}
        <XStack gap="$2">
          <Button disabled={busy} flex={1} onPress={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!canSave}
            flex={1}
            onPress={() => {
              onSave(trimmed);
            }}
          >
            Save
          </Button>
        </XStack>
      </YStack>
    </SafeAreaView>
  );
}
