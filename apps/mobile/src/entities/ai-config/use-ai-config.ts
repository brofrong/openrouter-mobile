import type { AiConfig, ChatKind } from "@openrouter-mobile/domain";
import { Effect } from "effect";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { formatRpcError } from "../../shared/errors";
import { RpcHttp } from "../../shared/rpc";
import { mobileRuntime } from "../../shared/runtime";
import { modelIdForKind } from "./defaults";

let cached: AiConfig | undefined;
let inflight: Promise<AiConfig> | undefined;
const listeners = new Set<() => void>();

const emit = () => {
  for (const listener of listeners) {
    listener();
  }
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const loadAiConfig = (): Promise<AiConfig> => {
  if (inflight !== undefined) {
    return inflight;
  }
  inflight = mobileRuntime
    .runPromise(
      Effect.gen(function* () {
        const rpc = yield* RpcHttp;
        return yield* rpc.AiConfigGet();
      }),
    )
    .then((next) => {
      cached = next;
      emit();
      return next;
    })
    .finally(() => {
      inflight = undefined;
    });
  return inflight;
};

export const useAiConfig = () => {
  const config = useSyncExternalStore(
    subscribe,
    () => cached,
    () => cached,
  );
  const [loading, setLoading] = useState(cached === undefined);
  const [error, setError] = useState<string | undefined>();

  const reload = useCallback(() => {
    setLoading(cached === undefined);
    setError(undefined);
    void loadAiConfig()
      .catch((failure: unknown) => {
        setError(formatRpcError(failure));
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const setModel = useCallback((kind: ChatKind, model: string) => {
    setError(undefined);
    return mobileRuntime
      .runPromise(
        Effect.gen(function* () {
          const rpc = yield* RpcHttp;
          return yield* rpc.AiConfigSet({ kind, model });
        }),
      )
      .then((next) => {
        cached = next;
        emit();
        return next;
      })
      .catch((failure: unknown) => {
        setError(formatRpcError(failure));
        throw failure;
      });
  }, []);

  return { config, loading, error, reload, setModel };
};

export const useCategoryDefaultModel = (kind: ChatKind): string => {
  const { config } = useAiConfig();
  return modelIdForKind(kind, config);
};
