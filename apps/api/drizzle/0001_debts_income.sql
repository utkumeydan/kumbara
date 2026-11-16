CREATE TABLE "debts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"balance" integer NOT NULL,
	"monthly_payment" integer DEFAULT 0 NOT NULL,
	"due_day" integer,
	"interest_rate" integer,
	"rate_period" text DEFAULT 'monthly' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "envelopes" ADD COLUMN "kind" text DEFAULT 'variable' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "income" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "avatar" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "debts" ADD CONSTRAINT "debts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;