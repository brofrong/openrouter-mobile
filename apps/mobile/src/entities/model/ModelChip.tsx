import type { ReasoningEffort } from "@openrouter-mobile/domain";
import { Pressable, View } from "react-native";
import { Text, XStack } from "tamagui";
import type { ModelIdentity } from "./identity";

type ProviderMarkProps = {
  readonly color: string;
  readonly letter: string;
};

export function ProviderMark({ color, letter }: ProviderMarkProps) {
  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: color,
        borderRadius: 4,
        height: 16,
        justifyContent: "center",
        width: 16,
      }}
    >
      <Text color="#fff" fontSize={9} fontWeight="700">
        {letter}
      </Text>
    </View>
  );
}

type ModelChipProps = {
  readonly model: ModelIdentity;
  readonly onPress: () => void;
};

export function ModelChip({ model, onPress }: ModelChipProps) {
  return (
    <Pressable
      accessibilityLabel={`${model.company} ${model.name}`}
      accessibilityRole="button"
      onPress={onPress}
    >
      <XStack
        items="center"
        gap="$1.5"
        px="$2"
        py="$1.5"
        bg="$color4"
        rounded="$10"
      >
        <ProviderMark
          color={model.iconColor}
          letter={model.company[0] ?? "?"}
        />
        <Text color="$color10" fontSize={12} numberOfLines={1}>
          {model.company}
        </Text>
        <Text fontSize={12} fontWeight="600" numberOfLines={1}>
          {model.name}
        </Text>
      </XStack>
    </Pressable>
  );
}

type LabeledChipProps = {
  readonly label: string;
  readonly value?: string;
  readonly onPress: () => void;
};

export function LabeledChip({ label, value, onPress }: LabeledChipProps) {
  return (
    <Pressable
      accessibilityLabel={value === undefined ? label : `${label} ${value}`}
      accessibilityRole="button"
      onPress={onPress}
    >
      <XStack
        items="center"
        gap="$1.5"
        px="$2"
        py="$1.5"
        bg="$color4"
        rounded="$10"
      >
        <Text color="$color10" fontSize={12}>
          {label}
        </Text>
        {value === undefined ? null : (
          <Text fontSize={12} fontWeight="600">
            {value}
          </Text>
        )}
      </XStack>
    </Pressable>
  );
}

type EffortChipProps = {
  readonly effort: ReasoningEffort;
  readonly onPress: () => void;
};

export function EffortChip({ effort, onPress }: EffortChipProps) {
  return <LabeledChip label="effort" onPress={onPress} value={effort} />;
}
