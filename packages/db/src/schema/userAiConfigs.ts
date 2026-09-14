import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth";

export const userAiConfigs = pgTable("user_ai_configs", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id),
  textModel: text("text_model"),
  imageModel: text("image_model"),
  videoModel: text("video_model"),
  speechModel: text("speech_model"),
  audioModel: text("audio_model"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
