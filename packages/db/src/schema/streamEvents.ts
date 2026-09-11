import {
  bigint,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const streamEvents = pgTable(
  "stream_events",
  {
    streamId: uuid("stream_id").notNull(),
    seq: bigint("seq", { mode: "number" }).generatedByDefaultAsIdentity(),
    kind: text("kind").notNull(),
    payload: jsonb("payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.streamId, t.seq] }),
    index("stream_events_stream_seq").on(t.streamId, t.seq),
  ],
);
