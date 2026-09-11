import { streamEvents } from "@openrouter-mobile/db";
import { StreamEvent } from "@openrouter-mobile/domain";
import type { EffectDrizzleQueryError } from "drizzle-orm/effect-core";
import {
  Context,
  DateTime,
  Effect,
  PubSub,
  Schema,
  Semaphore,
  Stream,
} from "effect";
import { AppDb } from "../../shared/db";

export type StreamKind = "token" | "job";
export type DurableStreamError = EffectDrizzleQueryError | Schema.SchemaError;

export interface DurableStreamService {
  readonly append: (
    streamId: string,
    kind: StreamKind,
    payload: unknown,
  ) => Effect.Effect<StreamEvent, DurableStreamError>;
  readonly subscribe: (
    streamId: string,
    afterSeq?: number,
  ) => Stream.Stream<StreamEvent, DurableStreamError>;
  readonly runInto: (
    streamId: string,
    kind: StreamKind,
    source: Stream.Stream<unknown>,
  ) => Stream.Stream<StreamEvent, DurableStreamError>;
}

export class DurableStream extends Context.Service<
  DurableStream,
  DurableStreamService
>()("@openrouter-mobile/server/DurableStream") {}

const toStreamEvent = (row: typeof streamEvents.$inferSelect) =>
  Schema.decodeUnknownEffect(StreamEvent)({
    streamId: row.streamId,
    seq: row.seq,
    kind: row.kind,
    payload: row.payload,
    createdAt: DateTime.fromDateUnsafe(row.createdAt),
  });

export const makeDurableStream = Effect.gen(function* () {
  const db = yield* AppDb;
  const pubsub = yield* Effect.acquireRelease(
    PubSub.unbounded<StreamEvent>(),
    (hub) => PubSub.shutdown(hub),
  );
  const appendLock = yield* Semaphore.make(1);

  const append: DurableStreamService["append"] = (streamId, kind, payload) =>
    appendLock.withPermits(1)(
      Effect.gen(function* () {
        const rows = yield* db
          .insert(streamEvents)
          .values({ streamId, kind, payload })
          .returning();
        const row = rows[0];
        if (row === undefined) {
          return yield* Effect.die("durable stream insert returned no row");
        }
        const event = yield* toStreamEvent(row);
        yield* PubSub.publish(pubsub, event);
        return event;
      }),
    );

  const subscribe: DurableStreamService["subscribe"] = (streamId, afterSeq) =>
    Stream.unwrap(
      Effect.gen(function* () {
        const live = yield* PubSub.subscribe(pubsub);
        const cursor = afterSeq ?? 0;
        const replay = yield* db.query.streamEvents.findMany({
          where: {
            streamId,
            seq: { gt: cursor },
          },
          orderBy: { seq: "asc" },
        });
        const events = yield* Effect.all(replay.map(toStreamEvent));
        const watermark = events.at(-1)?.seq ?? cursor;
        const seen = new Set<number>();
        const dedup = (event: StreamEvent) => {
          if (seen.has(event.seq)) {
            return false;
          }
          seen.add(event.seq);
          return true;
        };
        return Stream.concat(
          Stream.fromIterable(events),
          Stream.fromSubscription(live).pipe(
            Stream.filter(
              (event) => event.streamId === streamId && event.seq > watermark,
            ),
          ),
        ).pipe(Stream.filter(dedup));
      }),
    );

  const runInto: DurableStreamService["runInto"] = (streamId, kind, source) =>
    source.pipe(
      Stream.mapEffect((payload) => append(streamId, kind, payload), {
        concurrency: 1,
      }),
    );

  return { append, subscribe, runInto } satisfies DurableStreamService;
});
