import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const chats = pgTable("chats", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  title: text("title").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
