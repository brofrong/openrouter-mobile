import AsyncStorage from "@react-native-async-storage/async-storage";

const PREFIX = "@openrouter-mobile/afterSeq/";

export type AfterSeqStorage = {
  readonly getItem: (key: string) => Promise<string | null>;
  readonly setItem: (key: string, value: string) => Promise<void>;
};

const memory = new Map<string, number>();

const createMemoryStorage = (): AfterSeqStorage => {
  const data = new Map<string, string>();
  return {
    getItem: (key) => Promise.resolve(data.get(key) ?? null),
    setItem: (key, value) => {
      data.set(key, value);
      return Promise.resolve();
    },
  };
};

let storage: AfterSeqStorage = AsyncStorage;

const keyFor = (streamId: string): string => `${PREFIX}${streamId}`;

export const configureAfterSeqStorage = (next: AfterSeqStorage): void => {
  storage = next;
};

export const resetAfterSeq = (): void => {
  memory.clear();
  storage = createMemoryStorage();
};

export const getAfterSeq = (streamId: string): number | undefined =>
  memory.get(streamId);

export const setAfterSeq = (streamId: string, seq: number): void => {
  const current = memory.get(streamId);
  if (current !== undefined && seq <= current) {
    return;
  }
  memory.set(streamId, seq);
  void storage.setItem(keyFor(streamId), String(seq));
};

export const hydrateAfterSeq = async (
  streamId: string,
): Promise<number | undefined> => {
  try {
    const raw = await storage.getItem(keyFor(streamId));
    if (raw !== null) {
      const seq = Number(raw);
      if (Number.isFinite(seq)) {
        const current = memory.get(streamId);
        if (current === undefined || seq > current) {
          memory.set(streamId, seq);
        }
      }
    }
  } catch {
    // Persistence is best-effort; memory remains the reconnect source of truth.
  }
  return memory.get(streamId);
};

export const acceptSeq = (seen: Set<number>, seq: number): boolean => {
  if (seen.has(seq)) {
    return false;
  }
  seen.add(seq);
  return true;
};

export const withAfterSeq = <T extends object>(
  payload: T,
  afterSeq: number | undefined,
): T | (T & { readonly afterSeq: number }) =>
  afterSeq === undefined ? payload : { ...payload, afterSeq };
