# Live chat sync (tabs + reconnect)

Date: 2026-09-14

## Goal

The same chat open in two tabs stays in sync: a sent message and the live model/job output appear on the other tab immediately. Closing the page does not stop generation; reopening the chat continues the in-progress stream (or shows the finished turn).

Applies to all kinds: text, image, video, speech, audio.

## Out of scope

- Live composer typing across tabs
- Syncing model/effort picker or scroll position
- Multi-server PubSub (in-memory hub stays as today)
- Changing `ChatSend` into a stream (reconnect stays on `ChatSubscribe`)

## Why it fails today

Server generation already survives disconnect (`Effect.forkDetach` + persist-then-publish). The client does not:

- `ChatSubscribe` is tokens-only. User messages never go on the bus, so the other tab cannot append them.
- `acceptTokensRef` is true only on the tab that called Send, so the other tab drops tokens.
- Assistant rows are written only when generation finishes. The in-progress draft lives in React. `afterSeq` in AsyncStorage then skips those tokens on reload.
- Media `jobId` lives in the sending tab’s state. `generation_jobs` has no `chatId`, so `ChatMessages` cannot restore a running job.

## Event bus

`ChatSubscribe(chatId, afterSeq)` is the live bus for that chat. `streamId` stays `chatId`. DurableStream `kind` stays `"token"` for chat-bus payloads (job-id streams stay `"job"`).

Replace `TokenChunk` as the RPC success type with a tagged union `ChatStreamEvent` (`seq` on every variant):

| `_tag`  | When                         | Payload                                      |
| ------- | ---------------------------- | -------------------------------------------- |
| `user`  | User row persisted           | `message: Message`                           |
| `token` | Text delta                   | `text`                                       |
| `title` | Auto-title (unlocked chats)  | `title`                                      |
| `error` | Generation failure           | `error`, `code`                              |
| `done`  | Assistant row persisted      | `message: Message`                           |
| `job`   | Media job status             | `jobId`, `status`, `url?`, `error?`          |

Producer order:

1. `ChatSend` / media generate: insert user row → append `user` → (media) `startJob` → append `job` `{queued}` on the **chat** stream (and keep today’s job-id stream for `JobSubscribe`) → `forkDetach` work.
2. Text `runGeneration`: append `token`s → insert assistant → append `done`. On failure append `error`, no `done`.
3. Media `runGeneration`: append `job` `{running|completed|failed}` on the chat stream as well as the job stream. Completed still inserts the assistant URL row. No text `done` for media.

Mapper accepts legacy payloads `{ text }`, `{ title }`, `{ error }` so existing `stream_events` still decode.

`JobSubscribe` stays. Open media screens subscribe only to `ChatSubscribe`.

## ChatMessages

Extend `ChatMessagePage`:

```ts
{
  messages,           // committed rows, newest page as today
  hasMore,
  headSeq: number,    // MAX(seq) for this chat stream, else 0
  generating: boolean,
  inProgress?: string, // concatenated token texts after last `done`/`error`
  jobs: GenerationJob[] // this chat, status queued | running
}
```

`generating` is true when there is a `user` after the last `done`/`error` with no `done` yet, or when `jobs` is non-empty. Empty `inProgress` plus `generating` is the “waiting for first token” gap.

`headSeq` is computed (`MAX(seq)`), not stored on `chats`. Subscribe live, then replay `seq > headSeq` (existing DurableStream protocol).

Scan `stream_events` from the end until `done`/`error` to rebuild `inProgress`. Do not replay committed tokens to the client.

## Schema

- `generation_jobs.chatId` — nullable uuid FK → `chats.id`. Set on every in-chat generate. `ChatMessages` loads `queued`/`running` jobs by `chatId`.
- `chats.generating` — boolean, default false. Text `ChatSend` does `UPDATE … SET generating = true WHERE id = ? AND generating = false`. Zero rows → `AppError` `VALIDATION` (“Already generating”). Clear on `done` or `error`. Media does not use this flag (jobs are keyed by `jobId`).

## Client

Load `ChatMessages` **before** enabling `useRpcStream`. Then `setAfterSeq(chatId, headSeq)`.

- Paint `messages` + `inProgress` draft + pending media items from `jobs`.
- `waitingReply` / thinking indicator from `generating`.
- Remove `acceptTokensRef`. Every open tab applies the bus.
- Merge `user` / `done` by message id (Send response and the bus are duplicates).
- `token` → append draft; `done` → replace draft with the server message; `error` → show error, clear waiting; `job` → `applyJobEvent`.
- Same-tab WS drop: keep in-memory `afterSeq` (draft still in React). Reload / new tab: `ChatMessages` is source of truth; ignore stale AsyncStorage if it is below `headSeq`.

Do not start the stream until `headSeq` from this load is applied, or replayed tokens duplicate `inProgress`.

## Errors and races

- OpenRouter failure: `error` event, `generating = false`, no assistant row. Reload: `generating` false, user message without assistant.
- Failed media jobs are live-only (`job` `failed`). Reload does not reconstruct them in v1.
- Two tabs Send at once: the `generating` CAS allows one; the other gets `VALIDATION`.
- Title vs manual rename: unchanged (`titleLocked`).
- Tokens after `done`: ignore until the next `user`.

## Tests

Server:

- Two `ChatSubscribe`s on the same chat both see `user` → `token`+ → `done`.
- `ChatMessages` mid-stream returns `inProgress` + `generating` + `headSeq`; subscribe(`headSeq`) yields only later tokens.
- Kill the subscriber mid-stream; generation finishes; `ChatMessages` has the assistant and `generating` false.
- Second `ChatSend` while `generating` → `VALIDATION`.
- Media: generate → `ChatMessages.jobs` has the queued/running job; chat bus emits `job` events; after complete, assistant URL is in `messages` and `jobs` is empty.

Client:

- Stream hook stays disabled until `headSeq` is set.
- Applying `user`/`done` twice by id is a no-op.
- `token` after `done` does not reopen a draft.

## Files

- `packages/domain` — `ChatStreamEvent` union, extend `ChatMessagePage` / `GenerationJob`
- `packages/db` — `generation_jobs.chatId`, `chats.generating`, drizzle migrate
- `packages/rpc` — `ChatSubscribe` success = `ChatStreamEvent`
- `apps/server/src/features/chat/ChatLive.ts` — append bus events, lock, page fields
- `apps/server/src/features/generation/GenerationLive.ts` — persist `chatId`, mirror job events onto the chat stream
- `apps/mobile/src/features/chat/ChatScreen.tsx` and `thread.ts`
- `apps/mobile/src/entities/chat/MediaChatScreen.tsx` and `media-thread.ts`
- `apps/mobile/src/features/images/ImagesScreen.tsx`
- `apps/mobile/src/shared/use-rpc-stream.ts` / `afterSeq.ts` — subscribe only after `headSeq`
- `apps/server/test/chat.test.ts`, `generation.test.ts`; mobile thread/stream tests
