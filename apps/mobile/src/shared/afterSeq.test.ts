import { expect, test } from "bun:test";
import {
  acceptSeq,
  configureAfterSeqStorage,
  getAfterSeq,
  hydrateAfterSeq,
  resetAfterSeq,
  setAfterSeq,
  withAfterSeq,
} from "./afterSeq";

test("getAfterSeq is empty until a chunk is saved", () => {
  resetAfterSeq();
  expect(getAfterSeq("chat-1")).toBeUndefined();
  expect(withAfterSeq({ chatId: "chat-1" }, getAfterSeq("chat-1"))).toEqual({
    chatId: "chat-1",
  });
});

test("setAfterSeq persists the last seq and omits it until the first chunk", async () => {
  resetAfterSeq();
  const data = new Map<string, string>();
  configureAfterSeqStorage({
    getItem: (key) => Promise.resolve(data.get(key) ?? null),
    setItem: (key, value) => {
      data.set(key, value);
      return Promise.resolve();
    },
  });

  setAfterSeq("chat-1", 3);
  expect(getAfterSeq("chat-1")).toBe(3);
  expect(withAfterSeq({ chatId: "chat-1" }, getAfterSeq("chat-1"))).toEqual({
    chatId: "chat-1",
    afterSeq: 3,
  });

  setAfterSeq("chat-1", 2);
  expect(getAfterSeq("chat-1")).toBe(3);

  resetAfterSeq();
  configureAfterSeqStorage({
    getItem: (key) => Promise.resolve(data.get(key) ?? null),
    setItem: (key, value) => {
      data.set(key, value);
      return Promise.resolve();
    },
  });
  expect(getAfterSeq("chat-1")).toBeUndefined();
  await hydrateAfterSeq("chat-1");
  expect(getAfterSeq("chat-1")).toBe(3);
});

test("seeding headSeq after hydrate wins over a lower stored cursor", async () => {
  resetAfterSeq();
  const data = new Map<string, string>();
  configureAfterSeqStorage({
    getItem: (key) => Promise.resolve(data.get(key) ?? null),
    setItem: (key, value) => {
      data.set(key, value);
      return Promise.resolve();
    },
  });

  setAfterSeq("chat-1", 2);
  resetAfterSeq();
  configureAfterSeqStorage({
    getItem: (key) => Promise.resolve(data.get(key) ?? null),
    setItem: (key, value) => {
      data.set(key, value);
      return Promise.resolve();
    },
  });
  await hydrateAfterSeq("chat-1");
  expect(getAfterSeq("chat-1")).toBe(2);

  setAfterSeq("chat-1", 9);
  expect(getAfterSeq("chat-1")).toBe(9);
});

test("setAfterSeq keeps memory even if storage write rejects", () => {
  resetAfterSeq();
  configureAfterSeqStorage({
    getItem: () => Promise.resolve(null),
    setItem: () => Promise.reject(new Error("quota")),
  });
  setAfterSeq("chat-1", 1);
  expect(getAfterSeq("chat-1")).toBe(1);
});

test("acceptSeq skips duplicate seqs", () => {
  const seen = new Set<number>();
  expect(acceptSeq(seen, 1)).toBe(true);
  expect(acceptSeq(seen, 1)).toBe(false);
  expect(acceptSeq(seen, 2)).toBe(true);
});
