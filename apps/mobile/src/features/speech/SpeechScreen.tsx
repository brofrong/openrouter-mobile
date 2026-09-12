import { GenerationPanel } from "../../shared/ui/GenerationPanel";

export function SpeechScreen() {
  return (
    <GenerationPanel
      title="Speech"
      description="Synthesize speech from text. Jobs report status and a result URL."
      inputLabel="Text"
      submitLabel="Synthesize"
      kind="speech"
    />
  );
}
