ALTER TABLE "chats" ADD COLUMN "generating" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD COLUMN "chat_id" uuid;--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_chat_id_chats_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "chats"("id");