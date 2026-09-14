import { useState } from "react";
import { XStack, YStack } from "tamagui";
import { modelHasEffort } from "../../entities/model/catalog";
import { EffortChip, ModelChip } from "../../entities/model/ModelChip";
import { ComposerAttach } from "../../shared/ui/ComposerAttach";
import { ComposerField } from "../../shared/ui/ComposerField";
import { EffortPicker, ModelPicker } from "./ModelPickers";
import type { SelectedModelState } from "./use-selected-model";

type ComposerBarProps = {
  readonly composer: string;
  readonly busy: boolean;
  readonly images: ReadonlyArray<string>;
  readonly onComposerChange: (value: string) => void;
  readonly onImagesChange: (images: ReadonlyArray<string>) => void;
  readonly onSend: () => void;
  readonly selectedModel: SelectedModelState;
};

export function ComposerBar({
  composer,
  busy,
  images,
  onComposerChange,
  onImagesChange,
  onSend,
  selectedModel,
}: ComposerBarProps) {
  const { model, effort, selectModel, setEffort } = selectedModel;
  const [modelOpen, setModelOpen] = useState(false);
  const [effortOpen, setEffortOpen] = useState(false);
  const showEffort = modelHasEffort(model) && effort !== undefined;

  return (
    <YStack>
      <XStack items="center" gap="$2" px="$3" pt="$2">
        <ModelChip
          model={model}
          onPress={() => {
            setModelOpen(true);
          }}
        />
        {showEffort ? (
          <EffortChip
            effort={effort}
            onPress={() => {
              setEffortOpen(true);
            }}
          />
        ) : null}
      </XStack>
      <XStack items="flex-end" p="$3" gap="$2">
        <ComposerAttach
          disabled={busy}
          images={images}
          max={4}
          onChange={onImagesChange}
        />
        <ComposerField
          accessibilityLabel="Send"
          disabled={busy}
          placeholder="Message"
          value={composer}
          onChange={onComposerChange}
          onSubmit={onSend}
        />
      </XStack>
      <ModelPicker
        open={modelOpen}
        selectedId={model.id}
        onClose={() => {
          setModelOpen(false);
        }}
        onSelect={(next) => {
          selectModel(next);
          setModelOpen(false);
        }}
      />
      <EffortPicker
        effort={effort}
        model={model}
        open={effortOpen}
        onClose={() => {
          setEffortOpen(false);
        }}
        onSelect={(value) => {
          setEffort(value);
          setEffortOpen(false);
        }}
      />
    </YStack>
  );
}
