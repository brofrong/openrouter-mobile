import { XStack, YStack } from "tamagui";
import { ComposerField } from "../../shared/ui/ComposerField";
import { MediaModelBar } from "../model/MediaModelBar";
import type { MediaModelKind } from "../model/media-catalog";
import type { SelectedMediaModelState } from "../model/use-selected-media-model";

type MediaComposerProps = {
  readonly kind: MediaModelKind;
  readonly selected: SelectedMediaModelState;
  readonly composer: string;
  readonly busy: boolean;
  readonly placeholder: string;
  readonly submitLabel: string;
  readonly onComposerChange: (value: string) => void;
  readonly onSubmit: () => void;
};

export function MediaComposer({
  kind,
  selected,
  composer,
  busy,
  placeholder,
  submitLabel,
  onComposerChange,
  onSubmit,
}: MediaComposerProps) {
  return (
    <YStack>
      <XStack items="center" gap="$2" px="$3" pt="$2">
        <MediaModelBar kind={kind} selected={selected} />
      </XStack>
      <XStack items="flex-end" p="$3" gap="$2">
        <ComposerField
          accessibilityLabel={submitLabel}
          disabled={busy}
          placeholder={placeholder}
          value={composer}
          onChange={onComposerChange}
          onSubmit={onSubmit}
        />
      </XStack>
    </YStack>
  );
}
