import type { ReactNode } from "react";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { Paragraph, Text, useTheme, XStack, YStack } from "tamagui";
import type {
  ImageAspectRatio,
  ImageBackground,
  ImageModel,
  ImageModelOptions,
  ImageQuality,
  ImageResolution,
} from "../../entities/model/image-catalog";
import { PickerShell } from "../../entities/model/ModelPicker";
import { containedImageSize } from "./image-layout";
import { aspectRatioValue } from "./thread";

const ASPECT_BOX = 40;
const RESOLUTION_BOX = 36;

type ImageOptionsSheetProps = {
  readonly open: boolean;
  readonly model: ImageModel;
  readonly options: ImageModelOptions;
  readonly onClose: () => void;
  readonly onChange: (patch: ImageModelOptions) => void;
};

export function ImageOptionsSheet({
  open,
  model,
  options,
  onClose,
  onChange,
}: ImageOptionsSheetProps) {
  const maxN = model.maxN ?? 1;
  const qualities = model.qualities ?? [];
  const backgrounds = model.backgrounds ?? [];

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
      {qualities.length > 1 ? (
        <QualitySlider
          onChange={onChange}
          qualities={qualities}
          selected={options.quality}
        />
      ) : null}
      {maxN > 1 ? (
        <DiscreteSlider
          count={maxN}
          index={Math.max(0, (options.n ?? 1) - 1)}
          label="Count"
          valueLabel={String(options.n ?? 1)}
          onChangeIndex={(index) => {
            onChange({ n: index + 1 });
          }}
        />
      ) : null}
      {backgrounds.length > 0 ? (
        <OptionCategory label="Background">
          {backgrounds.map((background) => (
            <BackgroundChoice
              key={background}
              onSelect={(value) => {
                onChange({ background: value });
              }}
              selected={options.background}
              value={background}
            />
          ))}
        </OptionCategory>
      ) : null}
    </PickerShell>
  );
}

function QualitySlider({
  qualities,
  selected,
  onChange,
}: {
  readonly qualities: ReadonlyArray<ImageQuality>;
  readonly selected: ImageModelOptions["quality"];
  readonly onChange: (patch: ImageModelOptions) => void;
}) {
  const current = selected ?? qualities[0];
  if (current === undefined) {
    return null;
  }
  return (
    <DiscreteSlider
      count={qualities.length}
      index={Math.max(0, qualities.indexOf(current))}
      label="Quality"
      valueLabel={current}
      onChangeIndex={(index) => {
        const quality = qualities[index];
        if (quality !== undefined) {
          onChange({ quality });
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
  readonly value: ImageAspectRatio;
  readonly selected: ImageAspectRatio | undefined;
  readonly onSelect: (value: ImageAspectRatio) => void;
};

function AspectChoice({ value, selected, onSelect }: AspectChoiceProps) {
  const stroke = useChoiceStroke(value === selected);
  const isAuto = value === "auto";
  const preview = containedImageSize({
    aspectRatio: aspectRatioValue(value),
    maxHeight: ASPECT_BOX,
    maxWidth: ASPECT_BOX,
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
              borderStyle: isAuto ? "dashed" : "solid",
              borderWidth: 2,
              height: isAuto ? ASPECT_BOX * 0.72 : preview.height,
              width: isAuto ? ASPECT_BOX * 0.72 : preview.width,
            }}
          />
        </YStack>
        <Text fontSize={12}>{value}</Text>
      </YStack>
    </Pressable>
  );
}

type ResolutionChoiceProps = {
  readonly value: ImageResolution;
  readonly selected: ImageResolution | undefined;
  readonly onSelect: (value: ImageResolution) => void;
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
            width: RESOLUTION_BOX,
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

type BackgroundChoiceProps = {
  readonly value: ImageBackground;
  readonly selected: ImageBackground | undefined;
  readonly onSelect: (value: ImageBackground) => void;
};

function BackgroundChoice({
  value,
  selected,
  onSelect,
}: BackgroundChoiceProps) {
  const stroke = useChoiceStroke(value === selected);
  const fill = useChoiceStroke(true);

  return (
    <Pressable
      accessibilityLabel={`Background ${value}`}
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
          <BackgroundIcon fill={fill} stroke={stroke} value={value} />
        </YStack>
        <Text fontSize={12}>{value}</Text>
      </YStack>
    </Pressable>
  );
}

function BackgroundIcon({
  value,
  stroke,
  fill,
}: {
  readonly value: ImageBackground;
  readonly stroke: string;
  readonly fill: string;
}) {
  if (value === "transparent") {
    return (
      <View
        style={{
          borderColor: stroke,
          borderRadius: 3,
          borderWidth: 2,
          flexDirection: "row",
          flexWrap: "wrap",
          height: 28,
          overflow: "hidden",
          width: 28,
        }}
      >
        {[0, 1, 2, 3].map((cell) => (
          <View
            key={cell}
            style={{
              backgroundColor: cell % 2 === 0 ? fill : "transparent",
              height: 12,
              width: 12,
            }}
          />
        ))}
      </View>
    );
  }

  return (
    <View
      style={{
        backgroundColor: value === "opaque" ? fill : "transparent",
        borderColor: stroke,
        borderRadius: 3,
        borderStyle: value === "auto" ? "dashed" : "solid",
        borderWidth: 2,
        height: 28,
        width: 28,
      }}
    />
  );
}

const useChoiceStroke = (selected: boolean): string => {
  const theme = useTheme();
  if (selected) {
    return theme.color?.val ?? "#111";
  }
  return theme.color10?.val ?? "#888";
};
