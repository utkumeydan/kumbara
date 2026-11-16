ALTER TABLE "envelopes" ADD COLUMN "system" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "auto_allocate" boolean DEFAULT true NOT NULL;