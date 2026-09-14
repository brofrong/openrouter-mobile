import { Schema } from "effect";

export const reasoningEffortValues = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;

export const ReasoningEffort = Schema.Literals(reasoningEffortValues);
export type ReasoningEffort = typeof ReasoningEffort.Type;
