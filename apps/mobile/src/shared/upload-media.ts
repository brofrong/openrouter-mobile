import { fetch as expoFetch } from "expo/fetch";
import { Platform } from "react-native";
import { authClient } from "./auth-client";
import { authUrl } from "./env";

export type NativeUploadFile = {
  readonly uri: string;
  readonly name: string;
  readonly type: string;
};

export const uploadMediaFile = async (
  file: Blob | NativeUploadFile,
): Promise<string | undefined> => {
  const body = new FormData();
  body.append("file", file as Blob);
  const cookie = await authClient.getCookie();
  const headers = new Headers();
  if (Platform.OS !== "web" && cookie.length > 0) {
    headers.set("Cookie", cookie);
  }
  try {
    const response = await expoFetch(`${authUrl}/media`, {
      method: "POST",
      body,
      headers,
      credentials: Platform.OS === "web" ? "include" : "omit",
    });
    if (!response.ok) {
      return undefined;
    }
    const json = (await response.json()) as { readonly url?: unknown };
    return typeof json.url === "string" && json.url.length > 0
      ? json.url
      : undefined;
  } catch {
    return undefined;
  }
};
