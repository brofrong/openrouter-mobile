import { Cause, Effect, Stream } from "effect";
import { useEffect, useRef } from "react";
import { formatRpcError } from "./errors";
import type { RpcHttp, RpcWs } from "./rpc";
import { mobileRuntime } from "./runtime";

type RpcServices = RpcHttp | RpcWs;

type UseRpcStreamOptions<A, E> = {
  readonly enabled: boolean;
  readonly key: string;
  readonly make: () => Effect.Effect<Stream.Stream<A, E>, never, RpcServices>;
  readonly onChunk: (chunk: A) => void;
  readonly onError: (message: string) => void;
};

/**
 * Tiny stream hook. `@effect/atom-react` was skipped (YAGNI / Expo 57 + Effect 4).
 * Last `seq` stays in React state in the caller (T12 persists it).
 */
export const useRpcStream = <A, E>(options: UseRpcStreamOptions<A, E>) => {
  const { enabled, key } = options;
  const onChunkRef = useRef(options.onChunk);
  const onErrorRef = useRef(options.onError);
  const makeRef = useRef(options.make);
  onChunkRef.current = options.onChunk;
  onErrorRef.current = options.onError;
  makeRef.current = options.make;

  useEffect(() => {
    if (!enabled) {
      return;
    }
    void key;
    const cancel = mobileRuntime.runCallback(
      Effect.flatMap(makeRef.current(), (stream) =>
        Stream.runForEach(stream, (chunk) =>
          Effect.sync(() => {
            onChunkRef.current(chunk);
          }),
        ),
      ).pipe(
        Effect.catchCause((cause) =>
          Effect.sync(() => {
            onErrorRef.current(formatRpcError(Cause.squash(cause)));
          }),
        ),
      ),
    );
    return () => {
      cancel();
    };
  }, [enabled, key]);
};
