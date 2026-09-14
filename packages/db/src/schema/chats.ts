import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";

export const chats = pgTable("chats", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id),
  kind: text("kind").default("text").notNull(),
  title: text("title").notNull(),
  titleLocked: boolean("title_locked").default(false).notNull(),
  model: text("model"),
  effort: text("effort"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
