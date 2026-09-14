import { expect, test } from "bun:test";
import { paginateModels } from "./paginate-models";

const models = [
  { id: "openai/gpt-4o", company: "OpenAI", name: "GPT-4o" },
  {
    id: "anthropic/claude-sonnet-4.6",
    company: "Anthropic",
    name: "Claude Sonnet 4.6",
  },
  {
    id: "google/gemini-2.5-flash",
    company: "Google",
    name: "Gemini 2.5 Flash",
  },
] as const;

test("paginateModels filters by name, company, or id", () => {
  expect(
    paginateModels(models, "claude", 0, 10).models.map((model) => model.id),
  ).toEqual(["anthropic/claude-sonnet-4.6"]);
  expect(
    paginateModels(models, "google", 0, 10).models.map((model) => model.id),
  ).toEqual(["google/gemini-2.5-flash"]);
  expect(
    paginateModels(models, "gpt-4o", 0, 10).models.map((model) => model.id),
  ).toEqual(["openai/gpt-4o"]);
});

test("paginateModels returns a page and hasMore", () => {
  const first = paginateModels(models, "", 0, 2);
  expect(first.models).toHaveLength(2);
  expect(first.hasMore).toBe(true);
  expect(first.total).toBe(3);

  const second = paginateModels(models, "", 2, 2);
  expect(second.models.map((model) => model.id)).toEqual([
    "google/gemini-2.5-flash",
  ]);
  expect(second.hasMore).toBe(false);
});
