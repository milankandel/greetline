ALTER TABLE "agents" ADD COLUMN "public_id" text;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "public_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "calls" ADD COLUMN "via_public" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "agents_public_id_key" ON "agents" USING btree ("public_id");