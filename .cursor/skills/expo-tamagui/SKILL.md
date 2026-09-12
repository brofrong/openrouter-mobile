---
name: expo-tamagui
description: Expo SDK 57 and Tamagui v5 conventions for the mobile app — fetch, WebSocket, Router tabs, scheme. Use when writing apps/mobile UI, Tamagui config, or client HTTP/WS.
---

# Expo + Tamagui

Installed in `apps/mobile`: Expo SDK **57.0.22** (`expo@~57.0.22`, `expo-router@~57.0.21`), Tamagui **2.7.7** (`tamagui@^2.7.7`, `@tamagui/config@^2.7.7`). Config API is still **v5**. Pin `typescript@~6.0.3` in this package; do not typecheck Expo with root `typescript@7.0.2`.

## Do
- Expo SDK 57, Expo Router tabs under `apps/mobile/src/app/(tabs)/`
- Scheme: `openrouter-mobile` (Better Auth deep links)
- Tamagui: `createTamagui` from `tamagui`, `defaultConfig` from `@tamagui/config/v5`
- Effect HTTP: `expo/fetch` for FetchHttpClient (`apps/mobile/src/shared/http.ts`)
- WebSocket: `binaryType = "arraybuffer"` (`apps/mobile/src/shared/ws.ts`)

## Do not
- Nested `File` in RPC payloads (no HTTP upload route; media jobs are stubs; `AudioTranscribe` takes a string `assetId`)
- Import `apps/server` from `apps/mobile`
- Install TanStack Query
- Force root TypeScript 7 onto the Expo app

## Tamagui config (from `@tamagui/config@2.7.7`)

Package exports that exist: `.`, `./v3`, `./v4`, `./v5`, `./v5-css`, `./v5-rn`, `./v5-reanimated`, `./v5-motion`, `./v5-subtle`, `./reanimated`.

`defaultConfig` has **no animations**. This app uses the RN driver (works web + native without generated CSS):

```ts
import { defaultConfig } from "@tamagui/config/v5";
import { animations } from "@tamagui/config/v5-rn";
import { createTamagui } from "tamagui";

export const tamaguiConfig = createTamagui({
  ...defaultConfig,
  animations,
});

export default tamaguiConfig;

export type Conf = typeof tamaguiConfig;

declare module "tamagui" {
  interface TamaguiCustomConfig extends Conf {}
}
```

Provider (from `tamagui/types/views/TamaguiProvider.d.ts`):

```ts
import { TamaguiProvider } from "tamagui";
import { tamaguiConfig } from "../../tamagui.config";

<TamaguiProvider config={tamaguiConfig} defaultTheme={themeName}>
```

v5 `settings.onlyAllowShorthands` is `true`: use `p` not `padding`, `bg` not `backgroundColor`. `flex` and `gap` have no shorthand and stay as-is.

UI primitives from `tamagui`: `YStack`, `XStack`, `H1`/`H2`, `Paragraph`, `Text`.

## Expo Router file paths

`main` is `expo-router/entry`. Routes live in `src/app` (not repo-root `app/`).

| File | Role |
| --- | --- |
| `apps/mobile/src/app/_layout.tsx` | `TamaguiProvider` + `ThemeProvider` + session gate (`/sign-in` when logged out) |
| `apps/mobile/src/app/sign-in.tsx` | Email/password sign-in |
| `apps/mobile/src/app/sign-up.tsx` | Email/password sign-up |
| `apps/mobile/src/app/(tabs)/_layout.tsx` | Tabs: Chat, Images, Video, Speech, Audio + sign-out |
| `apps/mobile/src/app/(tabs)/index.tsx` | Chat (`ChatScreen`) |
| `apps/mobile/src/app/(tabs)/images.tsx` | Images (`GenerationPanel`, stub job URL) |
| `apps/mobile/src/app/(tabs)/video.tsx` | Video (`GenerationPanel`, stub job URL) |
| `apps/mobile/src/app/(tabs)/speech.tsx` | Speech (`GenerationPanel`, stub job URL) |
| `apps/mobile/src/app/(tabs)/audio.tsx` | Audio (`GenerationPanel`, stub job URL) |
| `apps/mobile/tamagui.config.ts` | `createTamagui` config |
| `apps/mobile/app.json` | `scheme: "openrouter-mobile"` |

SDK 57 deprecates `import { Tabs } from "expo-router"`. Use:

```ts
import { Tabs } from "expo-router/js-tabs";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
```

Start: `bun run --filter @openrouter-mobile/mobile dev` or `bun run --filter @openrouter-mobile/mobile start`. Web: `bun run --filter @openrouter-mobile/mobile web`.

## Metro / package-exports

- `apps/mobile/metro.config.js` is `getDefaultConfig(__dirname)` from `expo/metro-config`. SDK 52+ auto-detects Bun workspaces; do not set `watchFolders` / `nodeModulesPaths` unless something breaks.
- Bun 1.4 isolated linker stores packages under `node_modules/.bun`. Expo SDK 54+ supports that.
- Metro package exports are **on by default** in SDK 57. Keep them on: Better Auth imports `better-auth/react` and `@better-auth/expo/client`.
- If those subpaths fail, check `resolver.unstable_enablePackageExports` is true (default). Do not disable package exports to “fix” Tamagui.
- `@tamagui/config/v5` and `@tamagui/config/v5-rn` are conditional exports (`react-native` / `browser` / `import` / `require`). Metro must keep those conditions.

## Client wiring

Env (defaults `localhost:3000`): `EXPO_PUBLIC_AUTH_URL`, `EXPO_PUBLIC_RPC_HTTP_URL`, `EXPO_PUBLIC_RPC_WS_URL` in `apps/mobile/src/shared/env.ts`.

```ts
import { fetch as expoFetch } from "expo/fetch";
import { FetchHttpClient } from "effect/unstable/http";
import { Socket } from "effect/unstable/socket";

FetchHttpClient.layer
Layer.succeed(FetchHttpClient.Fetch, expoFetch)
Layer.succeed(FetchHttpClient.RequestInit, {
  credentials: Platform.OS === "web" ? "include" : "omit",
})

Socket.fromWebSocket(acquire) // sets binaryType = "arraybuffer"
```

- HTTP RPC: POST `EXPO_PUBLIC_RPC_HTTP_URL` (`/rpc`), NDJSON, `Cookie: await authClient.getCookie()`, native `credentials: "omit"`.
- Streams: WebSocket `EXPO_PUBLIC_RPC_WS_URL` (`/rpc/ws`). Native handshake headers `{ Cookie }`; web uses the browser cookie jar.
- `expo-secure-store` is native-only. Web auth storage is `localStorage`; the Expo plugin skips SecureStore on web and uses `credentials: "include"` for `/api/auth/*`.
- Files: `apps/mobile/src/shared/{http,ws,rpc,auth-client,runtime,afterSeq}.ts`
