import { expoClient } from "@better-auth/expo/client";
import { createAuthClient } from "better-auth/react";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { authUrl } from "./env";

/**
 * expo-secure-store is native-only (`ExpoSecureStore.web.ts` is an empty
 * module). On web, cookies and the session cache live in `localStorage`
 * instead. The Expo plugin itself skips SecureStore on web and relies on
 * browser cookies + `credentials: "include"` for `/api/auth/*`.
 */
const webStorage = {
  getItem(key: string): string | null {
    try {
      return globalThis.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string): void {
    globalThis.localStorage.setItem(key, value);
  },
  getItemAsync(key: string): Promise<string | null> {
    return Promise.resolve(webStorage.getItem(key));
  },
  setItemAsync(key: string, value: string): Promise<void> {
    webStorage.setItem(key, value);
    return Promise.resolve();
  },
};

export const authClient = createAuthClient({
  baseURL: authUrl,
  plugins: [
    expoClient({
      scheme: "openrouter-mobile",
      storagePrefix: "openrouter-mobile",
      storage: Platform.OS === "web" ? webStorage : SecureStore,
    }),
  ],
});
