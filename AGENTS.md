# AGENTS

Read before writing code.

## Stack
- Frontend: Expo SDK 57 (ios/android/web), Tamagui v5, Feature-Sliced Design
- RPC: @effect/rpc (NOT tRPC, NOT oRPC, NOT REST)
- Backend: Bun, Effect v4, @effect/platform-bun
- Auth: Better Auth 1.7 (email/password), `@better-auth/expo`, `@better-auth/drizzle-adapter/relations-v2`
- DB: PostgreSQL, drizzle-orm@rc, Relational Queries v2 (`defineRelations`)
- Lint/format: Biome only

## Skills (read the matching one before touching that area)
- Effect code → `.cursor/skills/effect-this-repo/SKILL.md` and `.cursor/rules/effect.mdc`
- RPC / streams / reconnect → `.cursor/skills/effect-rpc-streams/SKILL.md`
- Drizzle → `.cursor/skills/drizzle-rqb2/SKILL.md`
- Expo/Tamagui → `.cursor/skills/expo-tamagui/SKILL.md`
- Folder structure → `.cursor/skills/fsd-monorepo/SKILL.md`
- Auth → `.cursor/skills/better-auth/SKILL.md` and the official Better Auth skill pack at `.cursor/skills/better-auth-official/` (CLI copy also in `.agents/skills/`)

## Hard rules
- OpenRouter API key never leaves `apps/server`
- Every stream chunk is persisted to `stream_events` BEFORE PubSub publish
- Reconnect protocol: subscribe live → replay DB `seq > afterSeq` → tail live, dedup by seq
- Effect Schema only (no Zod)
- Auth is Better Auth only (no NextAuth, Clerk, custom JWT). RPC requires a session cookie.
