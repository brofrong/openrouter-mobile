import { GenerationPanel } from "../../shared/ui/GenerationPanel";

export function ImagesScreen() {
  return (
    <GenerationPanel
      title="Images"
      description="Generate an image. The stub job completes with a result URL."
      inputLabel="Prompt"
      submitLabel="Generate"
      kind="image"
    />
  );
}
