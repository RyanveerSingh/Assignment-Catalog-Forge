CREATE TABLE "ai_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"import_id" uuid,
	"product_id" uuid,
	"purpose" text NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"request_hash" text NOT NULL,
	"batch_id" text,
	"custom_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cache_read_tokens" integer DEFAULT 0 NOT NULL,
	"cache_write_tokens" integer DEFAULT 0 NOT NULL,
	"cost_micros" bigint DEFAULT 0 NOT NULL,
	"latency_ms" integer,
	"error" text,
	"response" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"name" text NOT NULL,
	"prefix" text NOT NULL,
	"hash" text NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_keys_hash_unique" UNIQUE("hash")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"store_id" uuid NOT NULL,
	"actor_id" uuid,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"action" text NOT NULL,
	"diff" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"sha256" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"data" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eval_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid,
	"name" text NOT NULL,
	"prompt_version" text NOT NULL,
	"model" text NOT NULL,
	"sample" text NOT NULL,
	"metrics" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "import_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"import_id" uuid NOT NULL,
	"level" text DEFAULT 'info' NOT NULL,
	"message" text NOT NULL,
	"data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"blob_id" uuid NOT NULL,
	"sha256" text NOT NULL,
	"size" integer NOT NULL,
	"mime" text NOT NULL,
	"original_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_rows" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "import_rows_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"import_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"row_number" integer NOT NULL,
	"raw" jsonb NOT NULL,
	"cleaned" jsonb,
	"row_hash" text,
	"product_key" text,
	"product_id" uuid,
	"stage" text DEFAULT 'parsed' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"failure_reason" text,
	"issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"duplicate_of_row" integer,
	"locked_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'uploading' NOT NULL,
	"resume_status" text,
	"mode" text DEFAULT 'fast' NOT NULL,
	"file_hash" text,
	"total_rows" integer DEFAULT 0 NOT NULL,
	"counts" jsonb DEFAULT '{"pending":0,"processing":0,"done":0,"needs_review":0,"failed":0}'::jsonb NOT NULL,
	"product_count" integer DEFAULT 0 NOT NULL,
	"paused_until" timestamp with time zone,
	"pause_reason" text,
	"prompt_version" text DEFAULT 'v1' NOT NULL,
	"model_policy" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"budget_cents" integer DEFAULT 500 NOT NULL,
	"cost_micros" bigint DEFAULT 0 NOT NULL,
	"cost_summary" jsonb,
	"column_map" jsonb,
	"parse_meta" jsonb,
	"error" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "jobs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"key" text NOT NULL,
	"queue" text DEFAULT 'default' NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"locked_until" timestamp with time zone,
	"worker_id" text,
	"last_error" text,
	"store_id" uuid,
	"import_id" uuid,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jobs_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"import_id" uuid,
	"blob_id" uuid NOT NULL,
	"thumb_blob_id" uuid NOT NULL,
	"sha256" text NOT NULL,
	"phash" text,
	"original_name" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"product_id" uuid,
	"variant_id" uuid,
	"position" integer DEFAULT 0 NOT NULL,
	"match_method" text DEFAULT 'none' NOT NULL,
	"match_score" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'unmatched' NOT NULL,
	"reject_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"product_key" text NOT NULL,
	"handle" text NOT NULL,
	"status" text DEFAULT 'pending_ai' NOT NULL,
	"draft" jsonb,
	"published" jsonb,
	"manual_overrides" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"confidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"claims" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"review_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"group_data" jsonb,
	"source_rows" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"duplicate_rows" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_hash" text,
	"language" text DEFAULT 'und' NOT NULL,
	"ai_tier" text,
	"ai_model" text,
	"prompt_version" text,
	"ai_cost_micros" bigint DEFAULT 0 NOT NULL,
	"ai_latency_ms" integer,
	"version" integer DEFAULT 1 NOT NULL,
	"last_import_id" uuid,
	"missing_from_import_id" uuid,
	"source_changed_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "queue_state" (
	"queue" text PRIMARY KEY NOT NULL,
	"paused_until" timestamp with time zone,
	"pause_reason" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_members" (
	"store_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'editor' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "store_members_store_id_user_id_pk" PRIMARY KEY("store_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "storefront_products" (
	"product_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"locale" text NOT NULL,
	"handle" text NOT NULL,
	"title" text NOT NULL,
	"description_html" text,
	"category" text,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"variants" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"images" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"price_from_cents" integer,
	"currency" char(3),
	"seo" jsonb,
	"fallback_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "storefront_products_product_id_locale_pk" PRIMARY KEY("product_id","locale")
);
--> statement-breakpoint
CREATE TABLE "stores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"default_currency" char(3) DEFAULT 'EUR' NOT NULL,
	"locales" jsonb DEFAULT '["en","de","fr"]'::jsonb NOT NULL,
	"country_locale_map" jsonb DEFAULT '{"DE":"de","AT":"de","FR":"fr"}'::jsonb NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stores_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "translation_cache" (
	"source_hash" text NOT NULL,
	"locale" text NOT NULL,
	"text" text NOT NULL,
	"model" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "translation_cache_source_hash_locale_pk" PRIMARY KEY("source_hash","locale")
);
--> statement-breakpoint
CREATE TABLE "translations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"field" text NOT NULL,
	"locale" text NOT NULL,
	"source_hash" text NOT NULL,
	"text" text,
	"origin" text DEFAULT 'ai' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"model" text,
	"cost_micros" bigint DEFAULT 0 NOT NULL,
	"error" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"sku" text NOT NULL,
	"sku_display" text NOT NULL,
	"synthetic" boolean DEFAULT false NOT NULL,
	"options" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"price_cents" integer,
	"currency" char(3),
	"compare_at_cents" integer,
	"weight_grams" integer,
	"dimensions" jsonb,
	"image_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"quantity" integer,
	"barcode" text,
	"position" integer DEFAULT 0 NOT NULL,
	"source_rows" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"webhook_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"event_id" text NOT NULL,
	"event" text NOT NULL,
	"payload" jsonb NOT NULL,
	"attempt" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"response_code" integer,
	"error" text,
	"next_attempt_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"url" text NOT NULL,
	"secret" text NOT NULL,
	"events" jsonb DEFAULT '["import.completed"]'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_events" ADD CONSTRAINT "import_events_import_id_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."imports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_files" ADD CONSTRAINT "import_files_import_id_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."imports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_import_id_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."imports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imports" ADD CONSTRAINT "imports_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_members" ADD CONSTRAINT "store_members_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_members" ADD CONSTRAINT "store_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translations" ADD CONSTRAINT "translations_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variants" ADD CONSTRAINT "variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_webhook_id_webhooks_id_fk" FOREIGN KEY ("webhook_id") REFERENCES "public"."webhooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_requests_hash_idx" ON "ai_requests" USING btree ("request_hash","status");--> statement-breakpoint
CREATE INDEX "ai_requests_import_idx" ON "ai_requests" USING btree ("import_id");--> statement-breakpoint
CREATE INDEX "ai_requests_store_created_idx" ON "ai_requests" USING btree ("store_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_requests_batch_idx" ON "ai_requests" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "api_keys_store_idx" ON "api_keys" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("store_id","entity","entity_id");--> statement-breakpoint
CREATE INDEX "blobs_store_sha_idx" ON "blobs" USING btree ("store_id","sha256");--> statement-breakpoint
CREATE INDEX "import_events_import_idx" ON "import_events" USING btree ("import_id","id");--> statement-breakpoint
CREATE INDEX "import_files_import_idx" ON "import_files" USING btree ("import_id");--> statement-breakpoint
CREATE UNIQUE INDEX "import_rows_import_row_uq" ON "import_rows" USING btree ("import_id","row_number");--> statement-breakpoint
CREATE INDEX "import_rows_import_status_idx" ON "import_rows" USING btree ("import_id","status");--> statement-breakpoint
CREATE INDEX "import_rows_import_stage_idx" ON "import_rows" USING btree ("import_id","stage");--> statement-breakpoint
CREATE INDEX "import_rows_product_idx" ON "import_rows" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "imports_store_created_idx" ON "imports" USING btree ("store_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "imports_store_filehash_active_uq" ON "imports" USING btree ("store_id","file_hash") WHERE status in ('uploading','queued','parsing','cleaning','grouping','enriching','validating','translating','finalizing','paused');--> statement-breakpoint
CREATE INDEX "jobs_claim_idx" ON "jobs" USING btree ("queue","status","run_at","priority");--> statement-breakpoint
CREATE INDEX "jobs_import_idx" ON "jobs" USING btree ("import_id");--> statement-breakpoint
CREATE INDEX "jobs_locked_idx" ON "jobs" USING btree ("status","locked_until");--> statement-breakpoint
CREATE INDEX "photos_store_product_idx" ON "photos" USING btree ("store_id","product_id");--> statement-breakpoint
CREATE INDEX "photos_import_idx" ON "photos" USING btree ("import_id");--> statement-breakpoint
CREATE INDEX "photos_store_sha_idx" ON "photos" USING btree ("store_id","sha256");--> statement-breakpoint
CREATE UNIQUE INDEX "products_store_key_uq" ON "products" USING btree ("store_id","product_key");--> statement-breakpoint
CREATE UNIQUE INDEX "products_store_handle_uq" ON "products" USING btree ("store_id","handle");--> statement-breakpoint
CREATE INDEX "products_store_status_idx" ON "products" USING btree ("store_id","status");--> statement-breakpoint
CREATE INDEX "products_store_updated_idx" ON "products" USING btree ("store_id","updated_at");--> statement-breakpoint
CREATE INDEX "products_last_import_idx" ON "products" USING btree ("last_import_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "storefront_store_locale_handle_uq" ON "storefront_products" USING btree ("store_id","locale","handle");--> statement-breakpoint
CREATE INDEX "storefront_store_locale_category_idx" ON "storefront_products" USING btree ("store_id","locale","category");--> statement-breakpoint
CREATE UNIQUE INDEX "translations_product_field_locale_uq" ON "translations" USING btree ("product_id","field","locale");--> statement-breakpoint
CREATE INDEX "translations_store_status_idx" ON "translations" USING btree ("store_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "variants_store_sku_uq" ON "variants" USING btree ("store_id","sku");--> statement-breakpoint
CREATE INDEX "variants_product_idx" ON "variants" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_deliveries_event_uq" ON "webhook_deliveries" USING btree ("webhook_id","event_id");--> statement-breakpoint
CREATE INDEX "webhooks_store_idx" ON "webhooks" USING btree ("store_id");