ALTER TABLE "products" ADD COLUMN "ai_batch_key" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "failure_reason" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "translated_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "products_import_batch_idx" ON "products" USING btree ("last_import_id","ai_batch_key");