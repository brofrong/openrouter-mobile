import { GenerationPanel } from "../../shared/ui/GenerationPanel";

export function VideoScreen() {
  return (
    <GenerationPanel
      title="Video"
      description="Generate a video. Jobs report status and a result URL."
      inputLabel="Prompt"
      submitLabel="Generate"
      kind="video"
    />
  );
}
