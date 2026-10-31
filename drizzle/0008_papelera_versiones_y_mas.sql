CREATE TABLE "login_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "song_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"song_id" uuid NOT NULL,
	"title" text NOT NULL,
	"artist" text NOT NULL,
	"original_key" text NOT NULL,
	"body" text NOT NULL,
	"saved_by" text NOT NULL,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reason" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "setlists" ADD COLUMN "service_date" date;--> statement-breakpoint
ALTER TABLE "setlists" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "songs" ADD COLUMN "bpm" integer;--> statement-breakpoint
ALTER TABLE "songs" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "songs" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "login_attempts_key_at_idx" ON "login_attempts" USING btree ("key","at");--> statement-breakpoint
CREATE INDEX "song_versions_song_idx" ON "song_versions" USING btree ("song_id","saved_at");