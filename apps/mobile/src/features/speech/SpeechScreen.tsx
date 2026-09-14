import { MediaChatScreen } from "../../entities/chat/MediaChatScreen";

export function SpeechScreen() {
  return (
    <MediaChatScreen
      kind="speech"
      defaultTitle="Speech"
      emptyHint="Enter text to start a new chat."
      threadEmptyHint="Enter text to synthesize."
      composerPlaceholder="Text to speak"
      submitLabel="Synthesize"
      generatingLabel="Synthesizing speech…"
      resultKind="audio"
    />
  );
}
