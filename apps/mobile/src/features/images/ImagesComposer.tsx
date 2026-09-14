import { XStack, YStack } from "tamagui";
import { ComposerAttach } from "../../shared/ui/ComposerAttach";
import { ComposerField } from "../../shared/ui/ComposerField";
import { ImageModelBar } from "./ImageModelBar";
import type { SelectedImageModelState } from "./use-selected-image-model";

type ImagesComposerProps = {
  readonly composer: string;
  readonly busy: boolean;
  readonly selected: SelectedImageModelState;
  readonly images: ReadonlyArray<string>;
  readonly onComposerChange: (value: string) => void;
  readonly onImagesChange: (images: ReadonlyArray<string>) => void;
  readonly onGenerate: () => void;
};

export function ImagesComposer({
  composer,
  busy,
  selected,
  images,
  onComposerChange,
  onImagesChange,
  onGenerate,
}: ImagesComposerProps) {
  return (
    <YStack>
      <XStack items="center" gap="$2" px="$3" pt="$2">
        <ImageModelBar selected={selected} />
      </XStack>
      <XStack items="flex-end" p="$3" gap="$2">
        <ComposerAttach
          disabled={busy}
          images={images}
          max={selected.model.maxInputReferences ?? 4}
          onChange={onImagesChange}
        />
        <ComposerField
          accessibilityLabel="Generate"
          disabled={busy}
          placeholder="Describe an image"
          value={composer}
          onChange={onComposerChange}
          onSubmit={onGenerate}
        />
      </XStack>
    </YStack>
  );
}
