import type { ChatKind, OutputModality } from "@openrouter-mobile/domain";
import { useState } from "react";
import { Button, H3, Paragraph, ScrollView, Spinner, YStack } from "tamagui";
import {
  AI_CONFIG_CATEGORIES,
  resolveCategoryModel,
} from "../../entities/ai-config/defaults";
import { useAiConfig } from "../../entities/ai-config/use-ai-config";
import { loadCatalogPage } from "../../entities/model/load-catalog-page";
import { ModelChip } from "../../entities/model/ModelChip";
import { ModelPicker } from "../../entities/model/ModelPicker";
import { mediaModelsFor } from "../../entities/model/media-catalog";

const catalogModality = (kind: ChatKind): OutputModality | undefined => {
  switch (kind) {
    case "text":
      return "text";
    case "image":
      return "image";
    case "video":
      return "video";
    case "audio":
      return "audio";
    case "speech":
      return undefined;
  }
};

const loadForKind = (kind: ChatKind) => {
  const modality = catalogModality(kind);
  if (modality === undefined) {
    return undefined;
  }
  return (args: {
    readonly query: string;
    readonly offset: number;
    readonly limit: number;
  }) => loadCatalogPage(modality, args);
};

export function AiConfigTab() {
  const { config, loading, error, reload, setModel } = useAiConfig();
  const [picking, setPicking] = useState<ChatKind | undefined>();
  const [saving, setSaving] = useState(false);
  const selected =
    picking === undefined
      ? undefined
      : resolveCategoryModel(picking, config?.[picking]);
  const loadPage = picking === undefined ? undefined : loadForKind(picking);
  const pickingLabel =
    AI_CONFIG_CATEGORIES.find((item) => item.kind === picking)?.label ??
    "model";

  if (loading && config === undefined) {
    return (
      <YStack flex={1} items="center" justify="center" gap="$3">
        <Spinner />
        <Paragraph>Loading AI config…</Paragraph>
      </YStack>
    );
  }

  return (
    <ScrollView flex={1}>
      <YStack gap="$4" p="$4" pb="$8">
        <Paragraph color="$color10">
          Default model used for new chats in each category.
        </Paragraph>
        {error !== undefined ? (
          <YStack gap="$2">
            <Paragraph color="$red10">{error}</Paragraph>
            <Button onPress={reload}>Retry</Button>
          </YStack>
        ) : null}
        {AI_CONFIG_CATEGORIES.map(({ kind, label }) => {
          const model = resolveCategoryModel(kind, config?.[kind]);
          return (
            <YStack gap="$2" key={kind}>
              <H3>{label}</H3>
              <ModelChip
                model={model}
                onPress={() => {
                  setPicking(kind);
                }}
              />
            </YStack>
          );
        })}
        <ModelPicker
          {...(loadPage === undefined
            ? { models: mediaModelsFor("speech") }
            : { loadPage })}
          open={picking !== undefined}
          selectedId={selected?.id ?? ""}
          onClose={() => {
            setPicking(undefined);
          }}
          onSelect={(next) => {
            if (picking === undefined) {
              return;
            }
            const kind = picking;
            setSaving(true);
            void setModel(kind, next.id)
              .catch(() => undefined)
              .finally(() => {
                setSaving(false);
                setPicking(undefined);
              });
          }}
        />
        {saving ? (
          <Paragraph color="$color10">Saving {pickingLabel}…</Paragraph>
        ) : null}
      </YStack>
    </ScrollView>
  );
}
