# Live Chat Sync Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** The same chat in two tabs stays in sync (sent message + live model/job output), and reopening a chat resumes an in-progress generation.

**Architecture:** `ChatSubscribe` is the chat event bus (`user` / `token` / `title` / `error` / `done` / `job`). `ChatMessages` returns committed rows plus `headSeq`, `generating`, `inProgress`, and active `jobs`. Text `ChatSend` takes a `chats.generating` CAS lock. Media jobs persist `chatId` and mirror status onto the chat stream. The client loads the page, seeds `afterSeq = headSeq`, then subscribes.

**Tech Stack:** Effect Schema union, `effect/unstable/rpc`, drizzle-orm@rc, Expo + Tamagui. Skills: `.cursor/skills/effect-this-repo/SKILL.md`, `.cursor/skills/effect-rpc-streams/SKILL.md`, `.cursor/skills/drizzle-rqb2/SKILL.md`, `.cursor/skills/expo-tamagui/SKILL.md`, `.cursor/skills/fsd-monorepo/SKILL.md`.

See `docs/plans/2026-09-14-chat-live-sync-design.md` for the validated design.

---

### Task 1: Domain — `ChatStreamEvent` and `ChatMessagePage`

**Files:**
- Create: `packages/domain/src/ChatStreamEvent.ts`
- Create: `packages/domain/src/ChatStreamEvent.test.ts`
- Modify: `packages/domain/src/ChatMessagePage.ts`
- Modify: `packages/domain/src/GenerationJob.ts`
- Modify: `packages/domain/src/index.ts`
- Modify: `packages/rpc/src/ChatRpcs.ts`
- Delete after RPC compiles: `packages/domain/src/TokenChunk.ts` (replace usages first)

**Step 1: Write the failing domain test**

```ts
import { expect, test } from "bun:test";
import { Schema } from "effect";
import { ChatStreamEvent } from "./ChatStreamEvent";

test("ChatStreamEvent decodes tagged token and legacy { text } payloads", () => {
  const tagged = Schema.decodeUnknownSync(ChatStreamEvent)({
    _tag: "token",
    seq: 1,
    text: "Hi",
  });
  expect(tagged._tag).toBe("token");
  if (tagged._tag === "token") {
    expect(tagged.text).toBe("Hi");
  }
});
```

This fails until the union exists.

**Step 2: Implement the union**

Use Effect 4 `Schema.Class` + `Schema.Literal` + `Schema.Union([...] )`. Every variant has `seq`.

```ts
import { Schema } from "effect";
import { GenerationJobId } from "./ids";
import { Message } from "./Message";

export class ChatUserEvent extends Schema.Class<ChatUserEvent>("ChatUserEvent")({
  _tag: Schema.Literal("user"),
  seq: Schema.Number,
  message: Message,
}) {}

export class ChatTokenEvent extends Schema.Class<ChatTokenEvent>("ChatTokenEvent")({
  _tag: Schema.Literal("token"),
  seq: Schema.Number,
  text: Schema.String,
}) {}

export class ChatTitleEvent extends Schema.Class<ChatTitleEvent>("ChatTitleEvent")({
  _tag: Schema.Literal("title"),
  seq: Schema.Number,
  title: Schema.String,
}) {}

export class ChatErrorEvent extends Schema.Class<ChatErrorEvent>("ChatErrorEvent")({
  _tag: Schema.Literal("error"),
  seq: Schema.Number,
  error: Schema.String,
  code: Schema.Literals(["OPENROUTER", "STREAM_GONE", "VALIDATION"]),
}) {}

export class ChatDoneEvent extends Schema.Class<ChatDoneEvent>("ChatDoneEvent")({
  _tag: Schema.Literal("done"),
  seq: Schema.Number,
  message: Message,
}) {}

export class ChatJobEvent extends Schema.Class<ChatJobEvent>("ChatJobEvent")({
  _tag: Schema.Literal("job"),
  seq: Schema.Number,
  jobId: GenerationJobId,
  status: Schema.Literals(["queued", "running", "completed", "failed"]),
  url: Schema.optionalKey(Schema.String),
  error: Schema.optionalKey(Schema.String),
}) {}

export const ChatStreamEvent = Schema.Union([
  ChatUserEvent,
  ChatTokenEvent,
  ChatTitleEvent,
  ChatErrorEvent,
  ChatDoneEvent,
  ChatJobEvent,
]);
export type ChatStreamEvent = typeof ChatStreamEvent.Type;
```

Do **not** put legacy `{ text }` decoding in the Schema (RPC must emit tagged events). Legacy DB rows are mapped in `ChatLive` (Task 3).

Extend `ChatMessagePage`:

```ts
export class ChatMessagePage extends Schema.Class<ChatMessagePage>(
  "ChatMessagePage",
)({
  messages: Schema.Array(Message),
  hasMore: Schema.Boolean,
  headSeq: Schema.Number,
  generating: Schema.Boolean,
  inProgress: Schema.optionalKey(Schema.String),
  jobs: Schema.Array(GenerationJob),
}) {}
```

Add `chatId: Schema.optionalKey(ChatId)` to `GenerationJob`.

`ChatRpcs.ChatSubscribe.success` → `ChatStreamEvent`. Export the new module from `packages/domain/src/index.ts`. Keep exporting `TokenChunk` until Task 3 replaces `subscribeTokens`, then delete `TokenChunk.ts`.

**Step 3: Run tests**

```bash
bun test packages/domain/src/ChatStreamEvent.test.ts
```

Expected: PASS.

**Step 4: Commit**

```bash
git add packages/domain packages/rpc
git commit -m "$(cat <<'EOF'
Add ChatStreamEvent union and extend ChatMessagePage for live sync.

EOF
)"
```

---

### Task 2: Schema — `chats.generating` and `generation_jobs.chatId`

**Files:**
- Modify: `packages/db/src/schema/chats.ts`
- Modify: `packages/db/src/schema/generationJobs.ts`
- Modify: `packages/db/src/relations.ts`
- Generate: `packages/db/drizzle/<new migration>/`

**Step 1: Schema**

`chats`:

```ts
generating: boolean("generating").default(false).notNull(),
```

`generationJobs`:

```ts
import { chats } from "./chats";

chatId: uuid("chat_id").references(() => chats.id),
```

Relations: `chats.jobs = r.many.generationJobs()`, `generationJobs.chat = r.one.chats({ from: r.generationJobs.chatId, to: r.chats.id })`. Keep `chat` optional (nullable FK).

**Step 2: Generate and migrate**

```bash
bun run --filter @openrouter-mobile/db db:generate
bun run db:migrate
```

Expected: new SQL with `ALTER TABLE "chats" ADD COLUMN "generating"` and `generation_jobs.chat_id`.

Do not put `generating` on the `Chat` domain DTO.

**Step 3: Commit**

```bash
git add packages/db
git commit -m "$(cat <<'EOF'
Add chats.generating lock and generation_jobs.chatId.

EOF
)"
```

---

### Task 3: Server text bus — events, `ChatMessages`, one-in-flight lock

**Files:**
- Modify: `apps/server/src/features/chat/ChatLive.ts`
- Modify: `apps/server/test/chat.test.ts`
- Modify: `apps/server/src/shared/chats.ts` only if `toChat` breaks on the new column (it should ignore it)

Read `.cursor/skills/effect-rpc-streams/SKILL.md` and `.cursor/skills/effect-this-repo/SKILL.md` before editing.

**Step 1: Write failing tests in `apps/server/test/chat.test.ts`**

1. `ChatSend` appends a `user` event; two `subscribeTokens` both see `user` then tokens then `done`.
2. Mid-stream `listMessages` has `generating: true`, non-empty `inProgress`, `headSeq >=` last seen seq; `subscribeTokens(headSeq)` yields only later tokens.
3. After generation, `listMessages` has the assistant, `generating: false`, no `inProgress`.
4. Second `sendMessage` while the first is still streaming → `VALIDATION`.
5. Update existing filters: `chunk.text` / `chunk.error` become `event._tag === "token"` / `"error"`. Title chunks are `_tag === "title"`.

Helper:

```ts
const tokens = (events: ReadonlyArray<ChatStreamEvent>) =>
  events.filter((event) => event._tag === "token");
```

Run:

```bash
bun test apps/server/test/chat.test.ts
```

Expected: FAIL (still `TokenChunk`, no `user`/`done`, no lock).

**Step 2: Payload helpers in `ChatLive.ts`**

Write tagged payloads into `stream_events` (`kind: "token"`). Map both tagged and legacy shapes in `subscribeTokens`:

| payload | event |
| --- | --- |
| `{ _tag: "user", message }` | `ChatUserEvent` |
| `{ _tag: "token", text }` or `{ text }` (no `_tag`, no `error`/`title`) | `ChatTokenEvent` |
| `{ _tag: "title", title }` or `{ title }` | `ChatTitleEvent` |
| `{ _tag: "error", error, code }` or `{ error }` | `ChatErrorEvent` |
| `{ _tag: "done", message }` | `ChatDoneEvent` |
| `{ _tag: "job", ... }` | `ChatJobEvent` |

`tokenPayloads` / `runInto` should append `{ _tag: "token", text }` (and error payloads `{ _tag: "error", error, code }`).

**Step 3: `sendMessage` producer**

Order:

1. Validate kind + non-empty content (unchanged).
2. Persist model (unchanged).
3. CAS: `UPDATE chats SET generating = true WHERE id = ? AND generating = false`. Zero rows → `AppError({ code: "VALIDATION", message: "Already generating" })`.
4. Insert user row → `durable.append(chatId, "token", { _tag: "user", message: encoded Message })`.
5. `forkDetach` title (unchanged, but title append is `{ _tag: "title", title }`).
6. `forkDetach(runGeneration)`. Wrap `runGeneration` with `Effect.ensuring` that `UPDATE chats SET generating = false`.
7. Return the user `Message`.

**Step 4: `runGeneration` completion**

After joining tokens, if no error and content non-empty: insert assistant → append `{ _tag: "done", message }`. On error: append `{ _tag: "error", ... }` (already), no `done`.

**Step 5: `listMessages`**

After loading the message page:

- `headSeq`: `MAX(seq)` for `stream_events` where `streamId = chatId`, else `0`.
- Scan events from the end until `_tag` `done` or `error` (legacy `{ error }` counts as error). Concatenate token texts into `inProgress` (omit key if empty).
- `jobs`: `generationJobs` where `chatId` and `status` in `queued`/`running` (empty until Task 4).
- `generating`: `chats.generating || jobs.length > 0`.

Always pass `jobs: []` until Task 4 if the query is easier later — but the Schema field is required, so return `[]`.

**Step 6: Run tests**

```bash
bun test apps/server/test/chat.test.ts
```

Expected: PASS (Postgres via `DATABASE_URL` / compose).

**Step 7: Commit**

```bash
git add apps/server/src/features/chat/ChatLive.ts apps/server/test/chat.test.ts packages/domain
git commit -m "$(cat <<'EOF'
Broadcast chat user/token/done events and lock one in-flight text generation.

EOF
)"
```

---

### Task 4: Server media — persist `chatId`, mirror job events on the chat bus

**Files:**
- Modify: `apps/server/src/features/generation/GenerationLive.ts`
- Modify: `apps/server/test/generation.test.ts`
- Modify: user cleanup in `apps/server/test/chat.test.ts` / `generation.test.ts` to `delete generationJobs` by `userId` (and by `chatId` if needed)

**Step 1: Failing test**

```ts
test("ImageGenerate ChatMessages includes the running job and ChatSubscribe emits job events", async () => {
  // startImage, listMessages(chatId) before completion
  // expect page.jobs[0].id === job.id, page.generating === true
  // subscribeTokens(chat.id) take job events until completed
  // after complete: listMessages.jobs is [], assistant url in messages
});
```

Run `bun test apps/server/test/generation.test.ts` — FAIL (`chatId` null, no chat-bus job events).

**Step 2: Implement**

- `startJob` insert: set `chatId` when provided. `toJob` includes optional `chatId`.
- `appendJobEvent`: always append to `jobId` with `kind: "job"` (today). If `chatId` is set, also `append(chatId, "token", { _tag: "job", jobId, status, url?, error? })`.
- Thread `chatId` through `runGeneration` / `persistFailure` / `complete` so every status hits both streams.
- `generateInChat`: after inserting the user row, append `{ _tag: "user", message }` on the chat stream (same as text). Then `startJob`.

Do not use `chats.generating` for media.

**Step 3: `listMessages` jobs query** (if not done in Task 3)

```ts
db.query.generationJobs.findMany({
  where: {
    chatId: payload.chatId,
    status: { in: ["queued", "running"] },
  },
  orderBy: { createdAt: "asc" },
})
```

**Step 4: Run**

```bash
bun test apps/server/test/generation.test.ts apps/server/test/chat.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/server/src/features/generation/GenerationLive.ts apps/server/src/features/chat/ChatLive.ts apps/server/test
git commit -m "$(cat <<'EOF'
Attach generation jobs to chats and mirror job events on ChatSubscribe.

EOF
)"
```

---

### Task 5: Client thread reducers

**Files:**
- Modify: `apps/mobile/src/features/chat/thread.ts`
- Modify: `apps/mobile/src/features/chat/thread.test.ts`
- Modify: `apps/mobile/src/entities/chat/media-thread.ts`
- Modify: `apps/mobile/src/entities/chat/media-thread.test.ts`
- Modify: `apps/mobile/src/features/images/thread.ts`
- Modify: `apps/mobile/src/features/images/thread.test.ts`

**Step 1: Failing tests**

Text:

```ts
test("applyChatStreamEvent merges user/done by id and ignores token after done", () => {
  let state = emptyThread();
  state = applyChatStreamEvent(state, userEvent);
  state = applyChatStreamEvent(state, userEvent); // no dup
  state = applyChatStreamEvent(state, tokenEvent("Hel"));
  state = applyChatStreamEvent(state, doneEvent);
  state = applyChatStreamEvent(state, tokenEvent("nope"));
  expect(state.messages.filter((m) => m.role === "user")).toHaveLength(1);
  expect(state.draft).toBe("");
  expect(state.generating).toBe(false);
});
```

Media/images: `hydrateJobs(items, jobs)` appends a pending assistant bound to `jobId` when the user prompt is already in `items`; `applyChatJobEvent` updates by `jobId`.

**Step 2: Implement**

`ChatThreadState`: `{ messages, draft, generating, error?: string }`.

- `user`: append `toThreadItem(message)` if id unseen.
- `token`: `draft += text`, `generating = true` until first char then keep generating until done/error; thinking UI uses `generating && draft.length === 0`.
- `done`: append assistant message if id unseen, `draft = ""`, `generating = false`.
- `error`: set `error`, `generating = false`.
- `title`: return title via a side field or let the screen handle `title` events separately (screen already maps title). Reducer may ignore `title`/`job`.

`hydrateFromPage(page)`: messages → items, `draft = page.inProgress ?? ""`, `generating = page.generating`.

Media: `hydrateJobs(items, jobs)` — for each job, if no assistant with that `jobId`, append `{ role: "assistant", jobId, status: job.status }`.

**Step 3: Run**

```bash
bun test apps/mobile/src/features/chat/thread.test.ts \
  apps/mobile/src/entities/chat/media-thread.test.ts \
  apps/mobile/src/features/images/thread.test.ts
```

Expected: PASS.

**Step 4: Commit**

```bash
git add apps/mobile/src/features/chat/thread.ts apps/mobile/src/features/chat/thread.test.ts \
  apps/mobile/src/entities/chat/media-thread.ts apps/mobile/src/entities/chat/media-thread.test.ts \
  apps/mobile/src/features/images/thread.ts apps/mobile/src/features/images/thread.test.ts
git commit -m "$(cat <<'EOF'
Apply chat bus events to thread state without duplicate messages.

EOF
)"
```

---

### Task 6: Subscribe only after `headSeq`

**Files:**
- Modify: `apps/mobile/src/shared/afterSeq.ts` (only if a test needs `setAfterSeq` documented; existing API is enough)
- Modify: `apps/mobile/src/shared/use-rpc-stream.test.ts` — no React; instead test the rule in a small helper if you extract `streamEnabled(ready, id)`. Prefer keeping it in the screens: `enabled: selectedId !== undefined && streamReady`.
- Optional create: `apps/mobile/src/shared/chat-stream.ts` with `enableChatStream(chatId, headSeq)` that calls `setAfterSeq(chatId, headSeq)`.

**Step 1: Test `setAfterSeq` raises a stale cursor**

Already true (`seq <= current` is ignored; higher seq wins). Add:

```ts
test("seeding headSeq after hydrate wins over a lower stored cursor", async () => {
  resetAfterSeq();
  // hydrate storage seq 2, then setAfterSeq(headSeq=9)
  expect(getAfterSeq("chat-1")).toBe(9);
});
```

**Step 2: Run** `bun test apps/mobile/src/shared/afterSeq.test.ts`

**Step 3: Commit** if the test is new.

---

### Task 7: Wire `ChatScreen`

**Files:**
- Modify: `apps/mobile/src/features/chat/ChatScreen.tsx`

**Behavior:**

1. `streamReady` starts false. `activateChat` / route clear sets it false.
2. `ChatMessages` success (full load, not prepend): `hydrateFromPage`, `setAfterSeq(chatId, page.headSeq)`, `setStreamReady(true)`, paint `waitingReply` from `generating`.
3. `useRpcStream({ enabled: selectedId !== undefined && streamReady, key: selectedId, ... })`.
4. Remove `acceptTokensRef`. `onChunk` → `applyChatStreamEvent` + title handler.
5. `send`: keep clearing composer; `waitingReply true`; do **not** locally invent an assistant. On `ChatSend` success, merge the returned user message by id (bus `user` may already have arrived). On `VALIDATION` “Already generating”, show the error and do not clear waiting if the other tab owns the stream — still subscribed, so tokens will arrive.
6. Prepend older pages must not reset `draft` / `streamReady`.

No browser E2E required beyond existing unit tests; manually verify two web tabs if a server is running.

**Commit:**

```bash
git add apps/mobile/src/features/chat/ChatScreen.tsx
git commit -m "$(cat <<'EOF'
Resume ChatSubscribe after ChatMessages headSeq so every tab sees the live turn.

EOF
)"
```

---

### Task 8: Wire media + images screens

**Files:**
- Modify: `apps/mobile/src/entities/chat/MediaChatScreen.tsx`
- Modify: `apps/mobile/src/features/images/ImagesScreen.tsx`

Same `streamReady` + `headSeq` pattern. On full `ChatMessages` load: map messages, `hydrateJobs(page.jobs)`, seed `afterSeq`.

`useRpcStream` for `ChatSubscribe` handles `user` / `job` / `title`. Stop using `jobId` local state as the only subscription key. Keep `JobSubscribe` **off** these screens (RPC remains for tests/`JobGet`).

Optimistic `appendTurn` on the sending tab: on bus `user`, if a `local-*` user has the same content, replace that id with `message.id`. On `job` `queued`, `bindJob` / `applyJobEvent`.

`busy` follows any item with `status` queued/running (including jobs hydrated from the other tab).

**Commit:**

```bash
git add apps/mobile/src/entities/chat/MediaChatScreen.tsx apps/mobile/src/features/images/ImagesScreen.tsx
git commit -m "$(cat <<'EOF'
Hydrate in-flight media jobs from ChatMessages and follow them on ChatSubscribe.

EOF
)"
```

---

### Task 9: Skills, types, lint

**Files:**
- Modify: `.cursor/skills/effect-rpc-streams/SKILL.md` — `ChatSubscribe` maps to `ChatStreamEvent`; `ChatMessages` returns `headSeq` / `inProgress` / `jobs` / `generating`. Client: load page, `setAfterSeq(headSeq)`, then subscribe. `ChatSend` is still unary.
- Modify: `AGENTS.md` only if a sentence still says tokens-only.
- Delete `TokenChunk` if unused.

**Verify:**

```bash
bun test apps/server/test/chat.test.ts apps/server/test/generation.test.ts
bun test apps/mobile/src/features/chat/thread.test.ts \
  apps/mobile/src/entities/chat/media-thread.test.ts \
  apps/mobile/src/features/images/thread.test.ts \
  apps/mobile/src/shared/afterSeq.test.ts \
  apps/mobile/src/shared/use-rpc-stream.test.ts
bun run check
bun run check-types
```

Expected: all PASS.

**Commit:**

```bash
git add .cursor/skills/effect-rpc-streams/SKILL.md AGENTS.md packages/domain
git commit -m "$(cat <<'EOF'
Document ChatSubscribe as the chat event bus.

EOF
)"
```

---

## Manual check (after automated tests)

1. Web: open the same text chat in two tabs. Send from A → B shows the user line, thinking, then tokens. Send from B while A is idle → A updates.
2. Close the tab mid-reply. Reopen the chat URL → draft/`inProgress` is present and tokens continue (or the finished assistant is there).
3. Second Send from the other tab during generation → validation error; original stream keeps going.
4. Images/video/speech/audio: start generate in tab A, tab B shows pending job and the result when it completes. Reload mid-job → pending job comes back from `ChatMessages.jobs`.
