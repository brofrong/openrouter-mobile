import type { ReasoningEffort } from "@openrouter-mobile/domain";
import { Button, Text } from "tamagui";
import {
  type ChatModel,
  chatModelFromPicker,
} from "../../entities/model/catalog";
import { loadCatalogPage } from "../../entities/model/load-catalog-page";
import {
  ModelPicker as CatalogModelPicker,
  PickerShell,
} from "../../entities/model/ModelPicker";

type ModelPickerProps = {
  readonly open: boolean;
  readonly selectedId: string;
  readonly onClose: () => void;
  readonly onSelect: (model: ChatModel) => void;
};

const loadChatModels = (args: {
  readonly query: string;
  readonly offset: number;
  readonly limit: number;
}) => loadCatalogPage("text", args);

export function ModelPicker({
  open,
  selectedId,
  onClose,
  onSelect,
}: ModelPickerProps) {
  return (
    <CatalogModelPicker
      loadPage={loadChatModels}
      onClose={onClose}
      onSelect={(model) => {
        onSelect(chatModelFromPicker(model));
      }}
      open={open}
      selectedId={selectedId}
    />
  );
}

type EffortPickerProps = {
  readonly open: boolean;
  readonly model: ChatModel;
  readonly effort: ReasoningEffort | undefined;
  readonly onClose: () => void;
  readonly onSelect: (effort: ReasoningEffort) => void;
};

export function EffortPicker({
  open,
  model,
  effort,
  onClose,
  onSelect,
}: EffortPickerProps) {
  return (
    <PickerShell onClose={onClose} open={open} title="Effort">
      {(model.efforts ?? []).map((value) => (
        <Button
          bg={value === effort ? "$color4" : undefined}
          chromeless
          justify="flex-start"
          key={value}
          mb="$2"
          onPress={() => {
            onSelect(value);
          }}
          size="$4"
        >
          <Text>{value}</Text>
        </Button>
      ))}
    </PickerShell>
  );
}
