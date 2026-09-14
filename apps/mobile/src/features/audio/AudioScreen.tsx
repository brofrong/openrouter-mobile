import { MediaChatScreen } from "../../entities/chat/MediaChatScreen";

export function AudioScreen() {
  return (
    <MediaChatScreen
      kind="audio"
      defaultTitle="Audio"
      emptyHint="Describe a track to start a new chat."
      threadEmptyHint="Describe the music you want."
      composerPlaceholder="A lo-fi beat with warm piano"
      submitLabel="Generate"
      generatingLabel="Generating music…"
      resultKind="audio"
    />
  );
}
