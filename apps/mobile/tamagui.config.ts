import { createSystemFont, defaultConfig } from "@tamagui/config/v5";
import { animations } from "@tamagui/config/v5-rn";
import { createTamagui, isWeb } from "tamagui";

const family = isWeb
  ? 'Golos Text, -apple-system, system-ui, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
  : "GolosText-Regular";

const letterSpacing = {
  1: 0,
  2: 0,
  3: 0,
  4: 0,
  5: 0,
  6: 0,
  7: 0,
  8: 0,
  9: 0,
  10: 0,
  true: 0,
} as const;

const face = {
  400: { normal: "GolosText-Regular" },
  500: { normal: "GolosText-Medium" },
  600: { normal: "GolosText-SemiBold" },
  700: { normal: "GolosText-Bold" },
} as const;

export const tamaguiConfig = createTamagui({
  ...defaultConfig,
  animations,
  fonts: {
    body: createSystemFont({
      font: {
        family,
        letterSpacing,
        face,
        weight: {
          1: "400",
          4: "400",
          5: "500",
          6: "600",
          7: "700",
          true: "400",
        },
      },
    }),
    heading: createSystemFont({
      font: {
        family,
        letterSpacing,
        face,
        weight: {
          0: "600",
          1: "600",
          4: "600",
          6: "700",
          7: "700",
          9: "700",
          true: "600",
        },
      },
      sizeLineHeight: (size) => Math.round(size * 1.25),
    }),
  },
});

export default tamaguiConfig;

export type Conf = typeof tamaguiConfig;

declare module "tamagui" {
  interface TamaguiCustomConfig extends Conf {}
}
