import { MediaChatScreen } from "../../entities/chat/MediaChatScreen";

export function VideoScreen() {
  return (
    <MediaChatScreen
      kind="video"
      defaultTitle="Video"
      emptyHint="Describe a video to start a new chat."
      threadEmptyHint="Describe a video to generate."
      composerPlaceholder="Describe a video"
      submitLabel="Generate"
      generatingLabel="Generating video…"
      resultKind="video"
    />
  );
}
