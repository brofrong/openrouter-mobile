import {
  DarkTheme,
  DefaultTheme,
  type Href,
  Redirect,
  Stack,
  ThemeProvider,
  usePathname,
} from "expo-router";
import Head from "expo-router/head";
import { StatusBar } from "expo-status-bar";
import { type ReactNode, useRef } from "react";
import { Platform, useColorScheme } from "react-native";
import { Paragraph, TamaguiProvider, YStack } from "tamagui";
import { tamaguiConfig } from "../../tamagui.config";
import { APP_SANS, APP_SANS_NATIVE, useAppFonts } from "../shared/app-fonts";
import { authClient } from "../shared/auth-client";

const navigationFonts = {
  regular: {
    fontFamily: Platform.OS === "web" ? APP_SANS : APP_SANS_NATIVE.regular,
    fontWeight: "400" as const,
  },
  medium: {
    fontFamily: Platform.OS === "web" ? APP_SANS : APP_SANS_NATIVE.medium,
    fontWeight: "500" as const,
  },
  bold: {
    fontFamily: Platform.OS === "web" ? APP_SANS : APP_SANS_NATIVE.semiBold,
    fontWeight: "600" as const,
  },
  heavy: {
    fontFamily: Platform.OS === "web" ? APP_SANS : APP_SANS_NATIVE.bold,
    fontWeight: "700" as const,
  },
};

export default function RootLayout() {
  useAppFonts();
  const colorScheme = useColorScheme();
  const themeName = colorScheme === "dark" ? "dark" : "light";
  const pathname = usePathname();
  const { data: session, isPending } = authClient.useSession();
  const sessionReady = useRef(false);
  if (!isPending) {
    sessionReady.current = true;
  }
  const isAuthRoute = pathname === "/sign-in" || pathname === "/sign-up";
  const navigationTheme = {
    ...(themeName === "dark" ? DarkTheme : DefaultTheme),
    fonts: navigationFonts,
  };

  let content: ReactNode = (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="profile" options={{ title: "Profile" }} />
      <Stack.Screen name="sign-in" options={{ headerShown: false }} />
      <Stack.Screen name="sign-up" options={{ headerShown: false }} />
    </Stack>
  );

  if (!sessionReady.current) {
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
      <Head>
        <title>OpenRouter</title>
      </Head>
      <ThemeProvider value={navigationTheme}>
        <StatusBar style="auto" />
        {content}
      </ThemeProvider>
    </TamaguiProvider>
  );
}
