CREATE TABLE "usage_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" text NOT NULL,
	"source" text NOT NULL,
	"model" text,
	"prompt_tokens" integer NOT NULL,
	"completion_tokens" integer NOT NULL,
	"total_tokens" integer NOT NULL,
	"cost_usd" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chats" ADD COLUMN "title_locked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "usage_events_user_id" ON "usage_events" ("user_id");--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id");