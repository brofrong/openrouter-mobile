CREATE TABLE "user_ai_configs" (
	"user_id" text PRIMARY KEY,
	"text_model" text,
	"image_model" text,
	"video_model" text,
	"speech_model" text,
	"audio_model" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_ai_configs" ADD CONSTRAINT "user_ai_configs_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id");