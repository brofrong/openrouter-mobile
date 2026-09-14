import type { ReactNode } from "react";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { Paragraph, Text, useTheme, XStack, YStack } from "tamagui";
import { PickerShell } from "./ModelPicker";
import type {
  VideoAspectRatio,
  VideoModel,
  VideoModelOptions,
  VideoResolution,
} from "./media-catalog";

const ASPECT_BOX = 40;
const RESOLUTION_BOX = 40;

type VideoOptionsSheetProps = {
  readonly open: boolean;
  readonly model: VideoModel;
  readonly options: VideoModelOptions;
  readonly onClose: () => void;
  readonly onChange: (patch: VideoModelOptions) => void;
};

export function VideoOptionsSheet({
  open,
  model,
  options,
  onClose,
  onChange,
}: VideoOptionsSheetProps) {
  const durations = model.durations ?? [];

  return (
    <PickerShell onClose={onClose} open={open} title="Options">
      {model.aspectRatios !== undefined && model.aspectRatios.length > 0 ? (
        <OptionCategory label="Aspect">
          {model.aspectRatios.map((aspectRatio) => (
            <AspectChoice
              key={aspectRatio}
              onSelect={(value) => {
                onChange({ aspectRatio: value });
              }}
              selected={options.aspectRatio}
              value={aspectRatio}
            />
          ))}
        </OptionCategory>
      ) : null}
      {model.resolutions !== undefined && model.resolutions.length > 0 ? (
        <OptionCategory label="Resolution">
          {model.resolutions.map((resolution) => (
            <ResolutionChoice
              key={resolution}
              onSelect={(value) => {
                onChange({ resolution: value });
              }}
              selected={options.resolution}
              value={resolution}
            />
          ))}
        </OptionCategory>
      ) : null}
      {durations.length > 1 ? (
        <DurationSlider
          durations={durations}
          onChange={onChange}
          selected={options.duration}
        />
      ) : null}
      {model.generateAudio === true ? (
        <OptionCategory label="Audio">
          <AudioChoice
            onSelect={(value) => {
              onChange({ generateAudio: value });
            }}
            selected={options.generateAudio}
            value={true}
          />
          <AudioChoice
            onSelect={(value) => {
              onChange({ generateAudio: value });
            }}
            selected={options.generateAudio}
            value={false}
          />
        </OptionCategory>
      ) : null}
    </PickerShell>
  );
}

function DurationSlider({
  durations,
  selected,
  onChange,
}: {
  readonly durations: ReadonlyArray<number>;
  readonly selected: VideoModelOptions["duration"];
  readonly onChange: (patch: VideoModelOptions) => void;
}) {
  const current = selected ?? durations[0];
  if (current === undefined) {
    return null;
  }
  return (
    <DiscreteSlider
      count={durations.length}
      index={Math.max(0, durations.indexOf(current))}
      label="Duration"
      valueLabel={`${current}s`}
      onChangeIndex={(index) => {
        const duration = durations[index];
        if (duration !== undefined) {
          onChange({ duration });
        }
      }}
    />
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

type DiscreteSliderProps = {
  readonly label: string;
  readonly valueLabel: string;
  readonly index: number;
  readonly count: number;
  readonly onChangeIndex: (index: number) => void;
};

function DiscreteSlider({
  label,
  valueLabel,
  index,
  count,
  onChangeIndex,
}: DiscreteSliderProps) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const last = Math.max(1, count - 1);
  const ratio = index / last;
  const track = theme.color5?.val ?? "#ddd";
  const fill = theme.color10?.val ?? "#888";
  const thumb = theme.color?.val ?? "#111";

  const pick = (x: number) => {
    if (width <= 0) {
      return;
    }
    const next = Math.round(Math.min(1, Math.max(0, x / width)) * last);
    onChangeIndex(next);
  };

  return (
    <YStack mb="$4">
      <XStack items="center" justify="space-between" mb="$2">
        <Paragraph color="$color10">{label}</Paragraph>
        <Text fontWeight="600">{valueLabel}</Text>
      </XStack>
      <View
        accessibilityLabel={`${label} ${valueLabel}`}
        accessibilityRole="adjustable"
        onLayout={(event) => {
          setWidth(event.nativeEvent.layout.width);
        }}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(event) => {
          pick(event.nativeEvent.locationX);
        }}
        onResponderMove={(event) => {
          pick(event.nativeEvent.locationX);
        }}
        onStartShouldSetResponder={() => true}
        style={{ height: 36, justifyContent: "center" }}
      >
        <View
          style={{
            backgroundColor: track,
            borderRadius: 2,
            height: 4,
          }}
        >
          <View
            style={{
              backgroundColor: fill,
              borderRadius: 2,
              height: 4,
              width: `${ratio * 100}%`,
            }}
          />
        </View>
        <View
          style={{
            backgroundColor: thumb,
            borderRadius: 8,
            height: 16,
            left: width * ratio - 8,
            position: "absolute",
            width: 16,
          }}
        />
      </View>
    </YStack>
  );
}

type AspectChoiceProps = {
  readonly value: VideoAspectRatio;
  readonly selected: VideoAspectRatio | undefined;
  readonly onSelect: (value: VideoAspectRatio) => void;
};

function AspectChoice({ value, selected, onSelect }: AspectChoiceProps) {
  const stroke = useChoiceStroke(value === selected);
  const preview = containedBox({
    aspectRatio: aspectRatioValue(value),
    max: ASPECT_BOX,
  });

  return (
    <Pressable
      accessibilityLabel={`Aspect ${value}`}
      accessibilityRole="button"
      accessibilityState={{ selected: value === selected }}
      onPress={() => {
        onSelect(value);
      }}
    >
      <YStack
        bg={value === selected ? "$color4" : undefined}
        gap="$1.5"
        items="center"
        minW={56}
        px="$2"
        py="$2"
        rounded="$4"
      >
        <YStack
          height={ASPECT_BOX}
          items="center"
          justify="center"
          width={ASPECT_BOX}
        >
          <View
            style={{
              borderColor: stroke,
              borderRadius: 3,
              borderWidth: 2,
              height: preview.height,
              width: preview.width,
            }}
          />
        </YStack>
        <Text fontSize={12}>{value}</Text>
      </YStack>
    </Pressable>
  );
}

type ResolutionChoiceProps = {
  readonly value: VideoResolution;
  readonly selected: VideoResolution | undefined;
  readonly onSelect: (value: VideoResolution) => void;
};

function ResolutionChoice({
  value,
  selected,
  onSelect,
}: ResolutionChoiceProps) {
  const stroke = useChoiceStroke(value === selected);

  return (
    <Pressable
      accessibilityLabel={`Resolution ${value}`}
      accessibilityRole="button"
      accessibilityState={{ selected: value === selected }}
      onPress={() => {
        onSelect(value);
      }}
    >
      <YStack
        bg={value === selected ? "$color4" : undefined}
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
            height: RESOLUTION_BOX,
            justifyContent: "center",
            minWidth: RESOLUTION_BOX,
            paddingHorizontal: 4,
          }}
        >
          <Text fontSize={11} fontWeight="700">
            {value}
          </Text>
        </View>
      </YStack>
    </Pressable>
  );
}

type AudioChoiceProps = {
  readonly value: boolean;
  readonly selected: boolean | undefined;
  readonly onSelect: (value: boolean) => void;
};

function AudioChoice({ value, selected, onSelect }: AudioChoiceProps) {
  const isSelected = selected === value;
  const stroke = useChoiceStroke(isSelected);
  const fill = useChoiceStroke(true);
  const label = value ? "on" : "off";

  return (
    <Pressable
      accessibilityLabel={`Audio ${label}`}
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      onPress={() => {
        onSelect(value);
      }}
    >
      <YStack
        bg={isSelected ? "$color4" : undefined}
        gap="$1.5"
        items="center"
        minW={72}
        px="$2"
        py="$2"
        rounded="$4"
      >
        <YStack
          height={ASPECT_BOX}
          items="center"
          justify="center"
          width={ASPECT_BOX}
        >
          <View
            style={{
              alignItems: "center",
              backgroundColor: value ? fill : "transparent",
              borderColor: stroke,
              borderRadius: 3,
              borderStyle: value ? "solid" : "dashed",
              borderWidth: 2,
              height: 28,
              justifyContent: "center",
              width: 28,
            }}
          >
            <Text
              color={value ? "$background" : "$color10"}
              fontSize={10}
              fontWeight="700"
            >
              {value ? "♪" : "–"}
            </Text>
          </View>
        </YStack>
        <Text fontSize={12}>{label}</Text>
      </YStack>
    </Pressable>
  );
}

const aspectRatioValue = (value: string): number => {
  const [widthText, heightText] = value.split(":");
  const width = Number(widthText);
  const height = Number(heightText);
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return 1;
  }
  return width / height;
};

const containedBox = (options: {
  readonly aspectRatio: number;
  readonly max: number;
}): { readonly width: number; readonly height: number } => {
  if (options.aspectRatio >= 1) {
    return {
      width: options.max,
      height: options.max / options.aspectRatio,
    };
  }
  return {
    width: options.max * options.aspectRatio,
    height: options.max,
  };
};

const useChoiceStroke = (selected: boolean): string => {
  const theme = useTheme();
  if (selected) {
    return theme.color?.val ?? "#111";
  }
  return theme.color10?.val ?? "#888";
};
