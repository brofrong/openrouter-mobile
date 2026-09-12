import { Cause, Effect, Schedule, Stream } from "effect";
import {
  acceptSeq,
  getAfterSeq,
  hydrateAfterSeq,
  setAfterSeq,
} from "./afterSeq";
import { formatRpcError, isFatalStreamError } from "./errors";

type StreamChunk = {
  readonly seq: number;
};

export type ResumeRpcStreamOptions<A extends StreamChunk, E, R> = {
  readonly streamId: string;
  readonly make: (
    afterSeq?: number,
  ) => Effect.Effect<Stream.Stream<A, E>, never, R>;
  readonly onChunk: (chunk: A) => void;
  readonly onError: (message: string) => void;
  readonly seen?: Set<number>;
  readonly schedule?: Schedule.Schedule<unknown, E>;
};

const defaultReconnectSchedule = Schedule.min([
  Schedule.exponential(200, 1.5),
  Schedule.spaced(5000),
]);

/**
 * Subscribe, persist each `seq`, and resubscribe with `afterSeq` after
 * transient WS/RPC failures. STREAM_GONE and other AppErrors stop retry.
 */
export const resumeRpcStream = <A extends StreamChunk, E, R>(
  options: ResumeRpcStreamOptions<A, E, R>,
): Effect.Effect<void, never, R> => {
  const seen = options.seen ?? new Set<number>();
  const schedule = options.schedule ?? defaultReconnectSchedule;

  const attempt = Effect.suspend(() => {
    const afterSeq = getAfterSeq(options.streamId);
    return Effect.flatMap(options.make(afterSeq), (stream) =>
      Stream.runForEach(stream, (chunk) =>
        Effect.sync(() => {
          if (!acceptSeq(seen, chunk.seq)) {
            return;
          }
          setAfterSeq(options.streamId, chunk.seq);
          options.onChunk(chunk);
        }),
      ),
    );
  });

  return Effect.gen(function* () {
    yield* Effect.promise(() => hydrateAfterSeq(options.streamId));
    yield* attempt.pipe(
      Effect.retry({
        schedule,
        while: (error) => !isFatalStreamError(error),
      }),
      Effect.catchCauseIf(Cause.hasInterruptsOnly, () => Effect.void),
      Effect.match({
        onFailure: (error) => {
          options.onError(formatRpcError(error));
        },
        onSuccess: () => undefined,
      }),
    );
  });
};
