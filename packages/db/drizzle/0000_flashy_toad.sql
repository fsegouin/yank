CREATE TABLE IF NOT EXISTS "chat_assignments" (
	"chat_id" uuid PRIMARY KEY NOT NULL,
	"workspace" text DEFAULT 'triage' NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chats" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"jid" text NOT NULL,
	"type" text NOT NULL,
	"subject" text,
	"last_message_at" timestamp with time zone,
	"last_message_preview" text,
	"archived" boolean DEFAULT false NOT NULL,
	"muted_until" timestamp with time zone,
	"pinned" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contacts" (
	"user_id" uuid NOT NULL,
	"jid" text NOT NULL,
	"display_name" text,
	"push_name" text,
	"business_name" text,
	"avatar_path" text,
	"last_seen_at" timestamp with time zone,
	CONSTRAINT "contacts_user_id_jid_pk" PRIMARY KEY("user_id","jid")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "directory_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id_owner" uuid NOT NULL,
	"chat_id" uuid NOT NULL,
	"visibility" text NOT NULL,
	"invite_link" text,
	"description" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "group_members" (
	"chat_id" uuid NOT NULL,
	"jid" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_members_chat_id_jid_pk" PRIMARY KEY("chat_id","jid")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "whatsapp_sessions" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"jid" text,
	"phone_number" text,
	"status" text DEFAULT 'unlinked' NOT NULL,
	"last_connected_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "push_subscriptions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"keys" jsonb NOT NULL,
	"ua" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"chat_id" uuid NOT NULL,
	"wa_message_id" text,
	"sender_jid" text NOT NULL,
	"ts" timestamp with time zone NOT NULL,
	"kind" text NOT NULL,
	"text" text,
	"reply_to_id" uuid,
	"edited_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"status" text DEFAULT 'sent' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "message_media" (
	"message_id" uuid PRIMARY KEY NOT NULL,
	"mime" text NOT NULL,
	"size_bytes" integer,
	"width" integer,
	"height" integer,
	"duration_ms" integer,
	"file_path" text,
	"thumbnail_path" text,
	"status" text DEFAULT 'queued' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reactions" (
	"message_id" uuid NOT NULL,
	"reactor_jid" text NOT NULL,
	"emoji" text NOT NULL,
	"ts" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reactions_message_id_reactor_jid_pk" PRIMARY KEY("message_id","reactor_jid")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "read_state" (
	"user_id" uuid NOT NULL,
	"chat_id" uuid NOT NULL,
	"last_read_message_id" uuid,
	"last_read_ts" timestamp with time zone,
	CONSTRAINT "read_state_user_id_chat_id_pk" PRIMARY KEY("user_id","chat_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stars" (
	"user_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"starred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stars_user_id_message_id_pk" PRIMARY KEY("user_id","message_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chat_assignments" ADD CONSTRAINT "chat_assignments_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chats" ADD CONSTRAINT "chats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contacts" ADD CONSTRAINT "contacts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "directory_entries" ADD CONSTRAINT "directory_entries_user_id_owner_users_id_fk" FOREIGN KEY ("user_id_owner") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "directory_entries" ADD CONSTRAINT "directory_entries_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "group_members" ADD CONSTRAINT "group_members_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "whatsapp_sessions" ADD CONSTRAINT "whatsapp_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "messages" ADD CONSTRAINT "messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "messages" ADD CONSTRAINT "messages_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "messages" ADD CONSTRAINT "messages_reply_to_id_messages_id_fk" FOREIGN KEY ("reply_to_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "message_media" ADD CONSTRAINT "message_media_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reactions" ADD CONSTRAINT "reactions_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "read_state" ADD CONSTRAINT "read_state_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "read_state" ADD CONSTRAINT "read_state_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "read_state" ADD CONSTRAINT "read_state_last_read_message_id_messages_id_fk" FOREIGN KEY ("last_read_message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stars" ADD CONSTRAINT "stars_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stars" ADD CONSTRAINT "stars_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "chats_user_jid_uq" ON "chats" USING btree ("user_id","jid");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chats_user_activity_idx" ON "chats" USING btree ("user_id","last_message_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "push_subscriptions_by_user" ON "push_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "messages_user_wa_uq" ON "messages" USING btree ("user_id","wa_message_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_chat_ts_idx" ON "messages" USING btree ("user_id","chat_id","ts");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_reply_to_idx" ON "messages" USING btree ("user_id","reply_to_id");

-- Extensions
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Generated tsvector column for full-text search on messages.text
ALTER TABLE "messages" ADD COLUMN "text_tsv" tsvector
  GENERATED ALWAYS AS (to_tsvector('english', coalesce("text", ''))) STORED;

-- FTS GIN index
CREATE INDEX "messages_text_tsv_idx" ON "messages" USING GIN ("text_tsv");

-- Trigram GIN for fuzzy / substring
CREATE INDEX "messages_text_trgm_idx" ON "messages" USING GIN ("text" gin_trgm_ops);

-- Partial index for recovery of pending sends
CREATE INDEX "messages_pending_idx" ON "messages" ("user_id") WHERE "status" = 'pending';
