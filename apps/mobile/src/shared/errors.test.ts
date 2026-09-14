import { expect, test } from "bun:test";
import { formatRpcError } from "./errors";

test("formatRpcError maps browser fetch failures to a reachable-server message", () => {
  expect(formatRpcError(new TypeError("Failed to fetch"))).toBe(
    "Could not reach the server.",
  );
  expect(formatRpcError(new Error("Network request failed"))).toBe(
    "Could not reach the server.",
  );
});

test("formatRpcError maps Better Auth catchAllError payloads", () => {
  expect(
    formatRpcError({
      status: 500,
      statusText: "Fetch Error",
      message:
        "Fetch related error. Captured by catchAllError option. See error property for more details.",
      error: new TypeError("Failed to fetch"),
    }),
  ).toBe("Could not reach the server.");
});
