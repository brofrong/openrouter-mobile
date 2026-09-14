import { useState } from "react";
import { XStack } from "tamagui";
import { imageModelHasOptions } from "../../entities/model/image-catalog";
import { loadCatalogPage } from "../../entities/model/load-catalog-page";
import { LabeledChip, ModelChip } from "../../entities/model/ModelChip";
import { ModelPicker } from "../../entities/model/ModelPicker";
import { ImageOptionsSheet } from "./ImageOptionsSheet";
import type { SelectedImageModelState } from "./use-selected-image-model";

type ImageModelBarProps = {
  readonly selected: SelectedImageModelState;
};

const loadImageModels = (args: {
  readonly query: string;
  readonly offset: number;
  readonly limit: number;
}) => loadCatalogPage("image", args);

export function ImageModelBar({ selected }: ImageModelBarProps) {
  const { model, options, selectModel, patchOptions } = selected;
  const [modelOpen, setModelOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const showOptions = imageModelHasOptions(model);

  return (
    <XStack items="center" flexWrap="wrap" gap="$2">
      <ModelChip
        model={model}
        onPress={() => {
          setModelOpen(true);
        }}
      />
      {showOptions ? (
        <LabeledChip
          label="options"
          onPress={() => {
            setOptionsOpen(true);
          }}
        />
      ) : null}
      <ModelPicker
        loadPage={loadImageModels}
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
      <ImageOptionsSheet
        model={model}
        open={optionsOpen}
        options={options}
        onChange={patchOptions}
        onClose={() => {
          setOptionsOpen(false);
        }}
      />
    </XStack>
  );
}
