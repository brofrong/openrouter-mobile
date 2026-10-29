import { expect, test } from "bun:test";

import { formatFileSize } from "./format-file-size";

test("formatFileSize uses bytes, KB, and MB", () => {
  expect(formatFileSize(12)).toBe("12 B");
  expect(formatFileSize(1536)).toBe("1.5 KB");
  expect(formatFileSize(12 * 1024)).toBe("12 KB");
  expect(formatFileSize(2.5 * 1024 * 1024)).toBe("2.5 MB");
  expect(formatFileSize(Number.NaN)).toBe("0 B");
});
