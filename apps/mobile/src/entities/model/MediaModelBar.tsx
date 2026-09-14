import { useState } from "react";
import { XStack } from "tamagui";
import { loadCatalogPage } from "./load-catalog-page";
import { LabeledChip, ModelChip } from "./ModelChip";
import { ModelPicker } from "./ModelPicker";
import {
  type MediaModelKind,
  mediaModelsFor,
  speechModelFromPicker,
  speechModelHasOptions,
  videoModelFromPicker,
  videoModelHasOptions,
} from "./media-catalog";
import { SpeechOptionsSheet } from "./SpeechOptionsSheet";
import type { SelectedMediaModelState } from "./use-selected-media-model";
import { VideoOptionsSheet } from "./VideoOptionsSheet";

type MediaModelBarProps = {
  readonly kind: MediaModelKind;
  readonly selected: SelectedMediaModelState;
};

const loadVideoModels = (args: {
  readonly query: string;
  readonly offset: number;
  readonly limit: number;
}) => loadCatalogPage("video", args);

const loadAudioModels = (args: {
  readonly query: string;
  readonly offset: number;
  readonly limit: number;
}) => loadCatalogPage("audio", args);

export function MediaModelBar({ kind, selected }: MediaModelBarProps) {
  const { model, options, selectModel, patchOptions } = selected;
  const [modelOpen, setModelOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const videoModel = kind === "video" ? videoModelFromPicker(model) : undefined;
  const speechModel =
    kind === "speech" ? speechModelFromPicker(model) : undefined;
  const showOptions =
    (videoModel !== undefined && videoModelHasOptions(videoModel)) ||
    (speechModel !== undefined && speechModelHasOptions(speechModel));

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
        {...(kind === "video"
          ? { loadPage: loadVideoModels }
          : kind === "audio"
            ? { loadPage: loadAudioModels }
            : { models: mediaModelsFor(kind) })}
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
      {videoModel === undefined ? null : (
        <VideoOptionsSheet
          model={videoModel}
          open={optionsOpen}
          options={options}
          onChange={patchOptions}
          onClose={() => {
            setOptionsOpen(false);
          }}
        />
      )}
      {speechModel === undefined ? null : (
        <SpeechOptionsSheet
          model={speechModel}
          open={optionsOpen}
          options={options}
          onChange={patchOptions}
          onClose={() => {
            setOptionsOpen(false);
          }}
        />
      )}
    </XStack>
  );
}
