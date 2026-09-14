import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { Paragraph, Text, useTheme, XStack, YStack } from "tamagui";
import { PickerShell } from "./ModelPicker";
import type { SpeechModel, SpeechModelOptions } from "./media-catalog";
import { speechVoiceLabel } from "./speech-voices";

type SpeechOptionsSheetProps = {
  readonly open: boolean;
  readonly model: SpeechModel;
  readonly options: SpeechModelOptions;
  readonly onClose: () => void;
  readonly onChange: (patch: SpeechModelOptions) => void;
};

export function SpeechOptionsSheet({
  open,
  model,
  options,
  onClose,
  onChange,
}: SpeechOptionsSheetProps) {
  const voices = model.voices ?? [];

  return (
    <PickerShell onClose={onClose} open={open} title="Options">
      {voices.length > 0 ? (
        <OptionCategory label="Voice">
          {voices.map((voice) => (
            <VoiceChoice
              key={voice}
              onSelect={(value) => {
                onChange({ voice: value });
              }}
              selected={options.voice}
              value={voice}
            />
          ))}
        </OptionCategory>
      ) : null}
    </PickerShell>
  );
}

type OptionCategoryProps = {
  readonly label: string;
  readonly children: ReactNode;
};

function OptionCategory({ label, children }: OptionCategoryProps) {
  return (
    <YStack mb="$4">
      <Paragraph color="$color10" mb="$2">
        {label}
      </Paragraph>
      <XStack flexWrap="wrap" gap="$2">
        {children}
      </XStack>
    </YStack>
  );
}

type VoiceChoiceProps = {
  readonly value: string;
  readonly selected: string | undefined;
  readonly onSelect: (value: string) => void;
};

function VoiceChoice({ value, selected, onSelect }: VoiceChoiceProps) {
  const isSelected = value === selected;
  const stroke = useChoiceStroke(isSelected);
  const label = speechVoiceLabel(value);

  return (
    <Pressable
      accessibilityLabel={`Voice ${label}`}
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      onPress={() => {
        onSelect(value);
      }}
    >
      <YStack
        bg={isSelected ? "$color4" : undefined}
        items="center"
        justify="center"
        px="$2"
        py="$2"
        rounded="$4"
      >
        <View
          style={{
            alignItems: "center",
            borderColor: stroke,
            borderRadius: 4,
            borderWidth: 2,
            justifyContent: "center",
            minHeight: 36,
            minWidth: 72,
            paddingHorizontal: 8,
            paddingVertical: 6,
          }}
        >
          <Text fontSize={12} fontWeight="600">
            {label}
          </Text>
        </View>
      </YStack>
    </Pressable>
  );
}

const useChoiceStroke = (selected: boolean): string => {
  const theme = useTheme();
  if (selected) {
    return theme.color?.val ?? "#111";
  }
  return theme.color10?.val ?? "#888";
};
