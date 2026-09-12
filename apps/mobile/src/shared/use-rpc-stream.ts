import type { Effect, Stream } from "effect";
import { useEffect, useRef } from "react";
import { resumeRpcStream } from "./resume-rpc-stream";
import type { RpcHttp, RpcWs } from "./rpc";
import { mobileRuntime } from "./runtime";

type RpcServices = RpcHttp | RpcWs;

type StreamChunk = {
  readonly seq: number;
};

type UseRpcStreamOptions<A extends StreamChunk, E> = {
  readonly enabled: boolean;
  readonly key: string;
  readonly make: (
    afterSeq?: number,
  ) => Effect.Effect<Stream.Stream<A, E>, never, RpcServices>;
  readonly onChunk: (chunk: A) => void;
  readonly onError: (message: string) => void;
};

export const useRpcStream = <A extends StreamChunk, E>(
  options: UseRpcStreamOptions<A, E>,
) => {
  const { enabled, key } = options;
  const onChunkRef = useRef(options.onChunk);
  const onErrorRef = useRef(options.onError);
  const makeRef = useRef(options.make);
  onChunkRef.current = options.onChunk;
  onErrorRef.current = options.onError;
  makeRef.current = options.make;

  useEffect(() => {
    if (!enabled || key.length === 0) {
      return;
    }
    const seen = new Set<number>();
    const cancel = mobileRuntime.runCallback(
      resumeRpcStream({
        streamId: key,
        make: (afterSeq) => makeRef.current(afterSeq),
        onChunk: (chunk) => {
          onChunkRef.current(chunk);
        },
        onError: (message) => {
          onErrorRef.current(message);
        },
        seen,
      }),
    );
    return () => {
      cancel();
    };
  }, [enabled, key]);
};
