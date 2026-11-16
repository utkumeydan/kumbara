CREATE TABLE "account_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"day" date NOT NULL,
	"net" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "due_date" date;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "due_amount" integer;--> statement-breakpoint
ALTER TABLE "debts" ADD COLUMN "account_id" uuid;--> statement-breakpoint
ALTER TABLE "debts" ADD COLUMN "schedule_source" text;--> statement-breakpoint
ALTER TABLE "scheduled_payments" ADD COLUMN "transaction_id" uuid;--> statement-breakpoint
ALTER TABLE "account_snapshots" ADD CONSTRAINT "account_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_snapshots" ADD CONSTRAINT "account_snapshots_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_snapshots_day_idx" ON "account_snapshots" USING btree ("account_id","day");--> statement-breakpoint
CREATE INDEX "account_snapshots_user_idx" ON "account_snapshots" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "scheduled_payments" ADD CONSTRAINT "scheduled_payments_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;