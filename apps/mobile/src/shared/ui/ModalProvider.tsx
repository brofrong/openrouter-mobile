import type { ReactNode } from "react";
import { Platform, useColorScheme } from "react-native";
import { TamaguiProvider, Theme } from "tamagui";
import { tamaguiConfig } from "../../../tamagui.config";

type ModalProviderProps = {
  readonly children: ReactNode;
};

export function ModalProvider({ children }: ModalProviderProps) {
  const colorScheme = useColorScheme();
  const themeName = colorScheme === "dark" ? "dark" : "light";
  const body = <Theme name={themeName}>{children}</Theme>;

  if (Platform.OS === "web") {
    return body;
  }

  return (
    <TamaguiProvider config={tamaguiConfig} defaultTheme={themeName}>
      {body}
    </TamaguiProvider>
  );
}
