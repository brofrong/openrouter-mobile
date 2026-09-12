import {
  DarkTheme,
  DefaultTheme,
  type Href,
  Redirect,
  Stack,
  ThemeProvider,
  usePathname,
} from "expo-router";
import { StatusBar } from "expo-status-bar";
import type { ReactNode } from "react";
import { useColorScheme } from "react-native";
import { Paragraph, TamaguiProvider, YStack } from "tamagui";
import { tamaguiConfig } from "../../tamagui.config";
import { authClient } from "../shared/auth-client";

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const themeName = colorScheme === "dark" ? "dark" : "light";
  const pathname = usePathname();
  const { data: session, isPending } = authClient.useSession();
  const isAuthRoute = pathname === "/sign-in" || pathname === "/sign-up";

  let content: ReactNode = (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="sign-in" options={{ headerShown: false }} />
      <Stack.Screen name="sign-up" options={{ headerShown: false }} />
    </Stack>
  );

  if (isPending) {
    content = (
      <YStack flex={1} items="center" justify="center" bg="$background">
        <Paragraph>Loading session…</Paragraph>
      </YStack>
    );
  } else if (!session && !isAuthRoute) {
    content = <Redirect href={"/sign-in" as Href} />;
  } else if (session && isAuthRoute) {
    content = <Redirect href="/" />;
  }

  return (
    <TamaguiProvider config={tamaguiConfig} defaultTheme={themeName}>
      <ThemeProvider value={themeName === "dark" ? DarkTheme : DefaultTheme}>
        <StatusBar style="auto" />
        {content}
      </ThemeProvider>
    </TamaguiProvider>
  );
}
