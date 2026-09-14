import { expect, test } from "bun:test";
import { hrefForMarkdownLink } from "./markdown-link";

test("hrefForMarkdownLink keeps http(s) and mailto links", () => {
  expect(hrefForMarkdownLink("https://example.com/a")).toBe(
    "https://example.com/a",
  );
  expect(hrefForMarkdownLink("http://localhost:3000")).toBe(
    "http://localhost:3000",
  );
  expect(hrefForMarkdownLink("mailto:hi@example.com")).toBe(
    "mailto:hi@example.com",
  );
});

test("hrefForMarkdownLink upgrades protocol-relative and www links", () => {
  expect(hrefForMarkdownLink("//cdn.example.com/x")).toBe(
    "https://cdn.example.com/x",
  );
  expect(hrefForMarkdownLink("www.example.com")).toBe(
    "https://www.example.com",
  );
});

test("hrefForMarkdownLink rejects empty and unsafe hrefs", () => {
  expect(hrefForMarkdownLink("")).toBeUndefined();
  expect(hrefForMarkdownLink("javascript:alert(1)")).toBeUndefined();
  expect(hrefForMarkdownLink("/relative")).toBeUndefined();
});
