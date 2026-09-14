# AGENTS

Read before writing code.

## Stack
- Frontend: Expo SDK 57 (ios/android/web), Tamagui v5, Feature-Sliced Design
- RPC: `effect/unstable/rpc` (NOT tRPC, NOT oRPC, NOT REST). `@effect/rpc` is not published on Effect 4 rc.
- HTTP: `effect/unstable/http` (`HttpRouter`). Bun adapters: `BunHttpServer` / `BunRuntime` from `@effect/platform-bun`
- Auth: Better Auth 1.7 (email/password or OIDC SSO), `@better-auth/expo`, `@better-auth/drizzle-adapter/relations-v2`
- DB: PostgreSQL, drizzle-orm@rc (`1.0.0-rc.5-ab785fc`), Relational Queries v2 (`defineRelations`)
- Lint/format: Biome only — `bun run check` / `bun run check:fix`. Never ESLint or Prettier.

## Skills (read the matching one before touching that area)
- Effect code → `.cursor/skills/effect-this-repo/SKILL.md` and `.cursor/rules/effect.mdc`
- RPC / streams / reconnect → `.cursor/skills/effect-rpc-streams/SKILL.md`
- Drizzle → `.cursor/skills/drizzle-rqb2/SKILL.md`
- Expo/Tamagui → `.cursor/skills/expo-tamagui/SKILL.md`
- Folder structure → `.cursor/skills/fsd-monorepo/SKILL.md`
- Auth → `.cursor/skills/better-auth/SKILL.md` and the official Better Auth skill pack at `.cursor/skills/better-auth-official/`

## Hard rules
- OpenRouter API key never leaves `apps/server`
- Every stream chunk is persisted to `stream_events` BEFORE PubSub publish
- Reconnect protocol: subscribe live → replay DB `seq > afterSeq` → tail live, dedup by seq
- Effect Schema only (no Zod)
- Auth is Better Auth only (no NextAuth, Clerk, custom JWT). RPC requires a session cookie (except `Health`).
- Default auth: email/password. Optional OIDC SSO via `OIDC_ISSUER` + `OIDC_CLIENT_ID` + `OIDC_CLIENT_SECRET` (then OIDC is the only sign-in). `AUTH_DISABLE_SIGNUP` disables email/password registration; OIDC SSO can always create a user on first login. Do not require email verification; do not add extra OAuth providers, orgs, or 2FA. `.cursor/skills/better-auth/SKILL.md` overrides `.cursor/skills/better-auth-official/` on stack and MVP scope.
