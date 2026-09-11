---
name: better-auth
description: How this repo uses Better Auth 1.7 with Expo and Drizzle Relations v2. Use when writing auth, sessions, sign-in, sign-up, cookies, or RPC AuthMiddleware.
---

# Better Auth in this repo

- Packages: `better-auth`, `@better-auth/expo`, `@better-auth/drizzle-adapter`
- Adapter: `drizzleAdapter` from `@better-auth/drizzle-adapter/relations-v2`, provider `"pg"`
- Server plugin: `expo()` from `@better-auth/expo`
- Mount `auth.handler` on GET+POST `/api/auth/*` (Better Auth HTTP, not Effect RPC)
- Email/password enabled; do not require email verification for MVP
- Env: `BETTER_AUTH_SECRET` (>=32 chars), `BETTER_AUTH_URL`
- Expo client: `createAuthClient` from `better-auth/react` + `expoClient` from `@better-auth/expo/client` + `expo-secure-store`
- RPC: `headers: { Cookie: await authClient.getCookie() }`, `credentials: "omit"` on native
- Server session: `auth.api.getSession({ headers: requestHeaders })`
- Schema via `bun x auth@latest generate` then merge auth relations into `defineRelations` with `{ ...appRelations, ...authRelations }`
- Docs: https://better-auth.com/docs/integrations/expo and https://better-auth.com/docs/adapters/drizzle

Official Better Auth skill pack: `.cursor/skills/better-auth-official/` (also installed at `.agents/skills/`). Prefer this repo skill for stack choices (Expo + Drizzle RQB v2 + Effect RPC cookies); use the official pack for library API details.

## Later install tasks

T7.5 / T11 must patch this skill with real imports from the installed `better-auth` / `@better-auth/expo` / `@better-auth/drizzle-adapter` versions.
