import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const generationJobs = pgTable("generation_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  kind: text("kind").notNull(),
  status: text("status").notNull(),
  prompt: text("prompt").notNull(),
  resultUrl: text("result_url"),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
