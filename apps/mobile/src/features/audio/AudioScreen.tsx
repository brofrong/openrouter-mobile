import { GenerationPanel } from "../../shared/ui/GenerationPanel";

export function AudioScreen() {
  return (
    <GenerationPanel
      title="Audio"
      description="Transcribe an audio asset. Pass an asset id from a prior upload."
      inputLabel="Asset ID"
      submitLabel="Transcribe"
      kind="audio"
    />
  );
}
