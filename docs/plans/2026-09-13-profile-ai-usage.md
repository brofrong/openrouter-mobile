# Profile AI Usage Dashboard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the profile AI cards with an OpenRouter Activity–style usage dashboard.

**Architecture:** `usage_events` stay the source of truth. `buildUsageSummary` aggregates rows into period totals, stacked daily buckets, source/model slices, and a 12‑month heatmap. Mobile renders the dashboard from one `UsageSummary` RPC.

**Tech Stack:** Effect Schema DTOs, `effect/unstable/rpc`, Drizzle, Expo + Tamagui stacked bars/heatmap (no extra chart native module).

See `docs/plans/2026-09-13-profile-ai-usage-design.md` for the validated design.
