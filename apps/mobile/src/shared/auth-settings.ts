import type { AuthSettings } from "@openrouter-mobile/domain";
import { Effect } from "effect";
import { useCallback, useEffect, useState } from "react";
import { formatRpcError } from "./errors";
import { RpcHttp } from "./rpc";
import { mobileRuntime } from "./runtime";

export const useAuthSettings = () => {
  const [settings, setSettings] = useState<AuthSettings | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  const reload = useCallback(() => {
    setLoading(true);
    setError(undefined);
    void mobileRuntime
      .runPromise(
        Effect.gen(function* () {
          const rpc = yield* RpcHttp;
          return yield* rpc.AuthSettings();
        }),
      )
      .then((next) => {
        setSettings(next);
      })
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

  return { settings, loading, error, reload };
};
