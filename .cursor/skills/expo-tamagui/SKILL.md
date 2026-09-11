---
name: expo-tamagui
description: Expo SDK 57 and Tamagui v5 conventions for the mobile app — fetch, WebSocket, Router tabs, scheme. Use when writing apps/mobile UI, Tamagui config, or client HTTP/WS.
---

# Expo + Tamagui

Expo 57, `expo/fetch` for Effect FetchHttpClient, WebSocket `binaryType = "arraybuffer"`, Tamagui `createTamagui` from `@tamagui/config/v5`, Expo Router tabs, scheme `openrouter-mobile`, no nested `File` in RPC payloads (upload via HTTP then RPC id).

## Do
- Expo SDK 57, Expo Router tabs under `apps/mobile/src/app/(tabs)/`
- Scheme: `openrouter-mobile` (Better Auth deep links)
- Tamagui: `createTamagui` from `@tamagui/config/v5`
- Effect HTTP: `expo/fetch` for FetchHttpClient
- WebSocket: `binaryType = "arraybuffer"`
- Upload files via HTTP, then pass the returned id over RPC

## Do not
- Nested `File` in RPC payloads
- Import `apps/server` from `apps/mobile`

## Later install tasks

T4 / T11 must patch this skill with the exact Tamagui config import and FetchHttpClient + websocket wiring from the installed packages.
