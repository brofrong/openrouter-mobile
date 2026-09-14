# Profile AI usage dashboard

Date: 2026-09-13

## Goal

The profile **AI** tab answers “where did my money go?” with an OpenRouter Activity–style dashboard: period totals, a stacked daily chart by model, top models, source share, and a 12‑month activity heatmap.

Per-user numbers come only from our `usage_events`. The server OpenRouter key is shared — do **not** show OpenRouter account credits, BYOK, or Analytics API totals.

## Out of scope

- Billing, user credits, or a “view full activity” page
- `chatId` / `generation_id` (no per-chat drill-down)
- Fake usage rows for stub video / speech / audio
- OpenRouter `/credits` or `/analytics/*`

## Data

`usage_events` already has `source`, `model`, tokens, `costUsd`, `createdAt`.

`source` is one of: `chat` | `image` | `video` | `speech` | `audio`.

Writes:

- Chat completions: as today, `source: "chat"`.
- Title generation: same `chat` source (today that OpenRouter call is discarded).
- Successful image jobs: `source: "image"`, model, tokens/cost from the image response `usage` when present, otherwise cost `0` so the event still shows up by type and model.
- Video / speech / audio: schema and UI ready; no rows while those jobs are stubs.

Add index `(user_id, created_at)` for period scans. No new columns in this pass.

## RPC

Keep a single authenticated `UsageSummary`. Payload:

```ts
{ range: "7d" | "30d" | "all" }  // default "30d"
```

Success (Effect Schema classes in `packages/domain`):

- `current` / `previous`: `{ costUsd, promptTokens, completionTokens, totalTokens, requestCount }` for the selected range and the equal-length window before it (`previous` is zeros when `range === "all"`).
- `byDay`: one bucket per calendar day (UTC) in the range; for `all`, one bucket per calendar month. Each bucket: date, the three metrics, and `byModel[]` for stacked bars.
- `bySource`: always all five sources, including zeros.
- `byModel`: models in the range, sorted by `costUsd` desc.
- `activity`: all-time `longestStreakDays`, `avgPerDay`, `avgPerWeek`, `total` (lifetime spend), and `heatmap[]` of `{ date, value }` for the last 12 months (daily request count).

The Tokens / Spend / Requests toggle is **client-only**. The RPC always returns all three measures so changing the toggle does not refetch.

## UI

Reference: OpenRouter Activity (usage summary + daily stacked bars + top models + activity heatmap).

Header: period control (`7d` / `30d` / `All`) and metric segmented control.

Hero: selected metric (default spend, e.g. `$0.355`) plus `% vs previous period`.

**Daily by model:** stacked bar chart with Y-axis in the selected metric, X-axis dates. Tap a bar for date + per-model values. Empty days stay on the axis.

**Top models:** ranked list, colored dot, model slug, provider parsed from the slug (`openai/gpt-4o-mini` → `openai`), value in the selected metric.

**Source share:** replaces Credits / BYOK. One bar for the period split across the five sources, with a legend. Zero sources stay visible and muted.

**Activity:** longest streak, avg/day, avg/week, lifetime total. Heatmap is last 12 months, GitHub-style (weekday × week), horizontally scrollable. Intensity follows the selected metric’s daily values from `heatmap` (request count; if we later want spend intensity, extend `heatmap` — not required now).

Layout: two columns on web (chart | top models), matching the reference. One column on native.

## Charts library

No chart code exists today. Use a real chart lib so the daily stacked bars have axes and tooltips:

- `react-native-svg` (Expo-compatible pin)
- `react-native-gifted-charts` for the stacked daily chart

Heatmap and horizontal source/model chrome stay Tamagui. After install, update `.cursor/skills/expo-tamagui/SKILL.md` with the actual imported API.

## Files

- `packages/domain` — extend `UsageSummary` (+ small row classes)
- `packages/rpc` — `UsageSummary` payload
- `packages/db` — index migration
- `apps/server` — `UsageLive` aggregations; persist title + image usage
- `apps/mobile/src/features/profile/` — replace the four cards in `AiTab`
- Tests: `apps/server/test/usage.test.ts` (range, previous window, five sources, image write); keep `format-usage` tests; add period/`%` helpers

## Error handling

Existing AI-tab pattern: spinner on first load, inline error + Retry, stale data stays visible on refresh failure. Empty usage is zeros and empty stacks, not an error.

## Success criteria

A signed-in user on `/profile` → AI sees period spend, a stacked daily chart, top models, a five-source share bar, and a 12‑month heatmap. Chat (and title) usage is counted; images appear as `image` after a real generation; stub media stay `$0`.
