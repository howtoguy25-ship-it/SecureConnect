CREATE TABLE "calls" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"caller_id" varchar NOT NULL,
	"receiver_id" varchar NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'pending',
	"started_at" timestamp,
	"ended_at" timestamp,
	"duration" integer,
	"hidden_for_caller" boolean DEFAULT false,
	"hidden_for_receiver" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "conversation_participants" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"unread_count" integer DEFAULT 0,
	"is_archived" boolean DEFAULT false,
	"folder" text DEFAULT 'none',
	"joined_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number_type" text DEFAULT 'personal',
	"last_message_at" timestamp DEFAULT now(),
	"last_message_preview" text,
	"disappearing_timer" integer DEFAULT 0,
	"pinned_message_id" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "encrypted_backups" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"device_id" text NOT NULL,
	"encrypted_blob" text NOT NULL,
	"salt" text NOT NULL,
	"nonce" text NOT NULL,
	"version" integer DEFAULT 1,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "external_sms" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"virtual_number_id" varchar NOT NULL,
	"from_phone_e164" text NOT NULL,
	"body" text NOT NULL,
	"delivered_to_user_id" varchar NOT NULL,
	"received_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "friends" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"friend_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "hidden_locker_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"message_id" varchar,
	"type" text NOT NULL,
	"content" text,
	"media_url" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "join_notifications" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"new_user_phone_number" text NOT NULL,
	"new_user_name" text,
	"is_read" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "location_requests" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requester_id" varchar NOT NULL,
	"target_id" varchar NOT NULL,
	"status" text DEFAULT 'pending',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "location_shares" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"latitude" text,
	"longitude" text,
	"is_sharing" boolean DEFAULT false,
	"last_updated" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "login_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"device_id" text,
	"device_name" text,
	"platform" text,
	"ip_address" text,
	"user_agent" text,
	"is_new_device" boolean DEFAULT false,
	"is_current_session" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "message_requests" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sender_id" varchar NOT NULL,
	"receiver_id" varchar NOT NULL,
	"conversation_id" varchar,
	"status" text DEFAULT 'pending',
	"message_preview" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" varchar NOT NULL,
	"sender_id" varchar NOT NULL,
	"receiver_id" varchar,
	"content" text,
	"media_url" text,
	"media_type" text,
	"transcription" text,
	"is_encrypted" boolean DEFAULT true,
	"encryption_version" text DEFAULT 'v2-signal',
	"e2ee_init_envelope" jsonb,
	"is_hidden" boolean DEFAULT false,
	"status" text DEFAULT 'sent',
	"reactions" jsonb DEFAULT '{}'::jsonb,
	"reply_to_message_id" varchar,
	"reply_to_preview" text,
	"reply_to_sender_id" varchar,
	"forwarded" boolean DEFAULT false,
	"forwarded_from_user_id" varchar,
	"deleted_for_everyone" boolean DEFAULT false,
	"deleted_for_user_ids" jsonb DEFAULT '[]'::jsonb,
	"expires_at" timestamp,
	"outer_sender_virtual_number_id" varchar,
	"sealed_sender" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"delivered_at" timestamp,
	"read_at" timestamp,
	"read_by" varchar
);
--> statement-breakpoint
CREATE TABLE "one_time_prekeys" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"key_id" text NOT NULL,
	"public_key" text NOT NULL,
	"used" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "pending_contacts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"added_by_user_id" varchar NOT NULL,
	"pending_phone_number" text NOT NULL,
	"notified" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "scheduled_messages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" varchar NOT NULL,
	"sender_id" varchar NOT NULL,
	"receiver_id" varchar,
	"content" text,
	"media_url" text,
	"media_type" text,
	"scheduled_for" timestamp NOT NULL,
	"status" text DEFAULT 'pending',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "signed_prekeys" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"key_id" text NOT NULL,
	"public_key" text NOT NULL,
	"signature" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "status_allowed_viewers" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status_id" varchar NOT NULL,
	"user_id" varchar NOT NULL
);
--> statement-breakpoint
CREATE TABLE "status_views" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status_id" varchar NOT NULL,
	"viewer_id" varchar NOT NULL,
	"viewed_at" timestamp DEFAULT now(),
	"watch_duration_ms" integer DEFAULT 0 NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "statuses" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"media_url" text,
	"media_type" text,
	"caption" text,
	"privacy" text DEFAULT 'everyone',
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_blocks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"blocker_id" varchar NOT NULL,
	"blocked_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_devices" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"device_id" text NOT NULL,
	"identity_public_key" text NOT NULL,
	"signing_public_key" text NOT NULL,
	"registered_at" timestamp DEFAULT now(),
	"last_seen_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_reports" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_id" varchar NOT NULL,
	"reported_user_id" varchar NOT NULL,
	"reported_message_id" varchar,
	"reason" text NOT NULL,
	"details" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"reviewed_at" timestamp,
	"reviewed_by" varchar,
	"action_taken" text,
	"ai_verdict" text,
	"ai_verdict_reason" text,
	"ai_action" text,
	"ai_severity" integer,
	"ai_confidence" integer,
	"ai_evaluated_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone_number" text NOT NULL,
	"display_name" text,
	"avatar_index" integer DEFAULT 0,
	"avatar_url" text,
	"is_vip" boolean DEFAULT false,
	"vip_started_at" timestamp,
	"is_ad_free" boolean DEFAULT false,
	"ad_removal_purchased_at" timestamp,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"locker_pin" text,
	"public_key" text,
	"message_request_setting" text DEFAULT 'everyone',
	"preferred_number_type" text DEFAULT 'personal',
	"virtual_number_id" varchar,
	"chat_background_url" text,
	"last_name_change_at" timestamp,
	"push_token" text,
	"notifications_enabled" boolean DEFAULT true,
	"last_seen_privacy" text DEFAULT 'everyone',
	"read_receipts_enabled" boolean DEFAULT true,
	"typing_indicators_enabled" boolean DEFAULT true,
	"show_notification_preview" boolean DEFAULT true,
	"default_disappearing_timer" integer DEFAULT 0,
	"stories_enabled" boolean DEFAULT true,
	"story_privacy_mode" text DEFAULT 'everyone',
	"story_privacy_except_ids" jsonb DEFAULT '[]'::jsonb,
	"story_privacy_only_ids" jsonb DEFAULT '[]'::jsonb,
	"story_view_receipts_enabled" boolean DEFAULT true,
	"safe_code_hash" text,
	"safe_code_acknowledged" boolean DEFAULT false,
	"token_version" integer DEFAULT 0,
	"is_suspended" boolean DEFAULT false,
	"suspended_at" timestamp,
	"suspension_reason" text,
	"pending_deletion_at" timestamp,
	"deletion_initiated_at" timestamp,
	"is_deleted_placeholder" boolean DEFAULT false,
	"deleted_at" timestamp,
	"supports_sealed_sender" boolean DEFAULT true,
	"chat_limit_until" timestamp,
	"chat_limit_messages_per_day" integer,
	"chat_messages_used_today" integer DEFAULT 0,
	"chat_limit_day_start" timestamp,
	"created_at" timestamp DEFAULT now(),
	"last_seen" timestamp DEFAULT now(),
	CONSTRAINT "users_phone_number_unique" UNIQUE("phone_number")
);
--> statement-breakpoint
CREATE TABLE "verification_codes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone_number" text NOT NULL,
	"code" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"verified" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "virtual_numbers" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone_number" text NOT NULL,
	"country_code" text NOT NULL,
	"twilio_sid" text NOT NULL,
	"capabilities" jsonb,
	"status" text DEFAULT 'active',
	"assigned_user_id" varchar,
	"assigned_at" timestamp,
	"released_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "virtual_numbers_phone_number_unique" UNIQUE("phone_number")
);
--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_caller_id_users_id_fk" FOREIGN KEY ("caller_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_receiver_id_users_id_fk" FOREIGN KEY ("receiver_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "encrypted_backups" ADD CONSTRAINT "encrypted_backups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_sms" ADD CONSTRAINT "external_sms_virtual_number_id_virtual_numbers_id_fk" FOREIGN KEY ("virtual_number_id") REFERENCES "public"."virtual_numbers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_sms" ADD CONSTRAINT "external_sms_delivered_to_user_id_users_id_fk" FOREIGN KEY ("delivered_to_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friends" ADD CONSTRAINT "friends_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friends" ADD CONSTRAINT "friends_friend_id_users_id_fk" FOREIGN KEY ("friend_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hidden_locker_items" ADD CONSTRAINT "hidden_locker_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hidden_locker_items" ADD CONSTRAINT "hidden_locker_items_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "join_notifications" ADD CONSTRAINT "join_notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_requests" ADD CONSTRAINT "location_requests_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_requests" ADD CONSTRAINT "location_requests_target_id_users_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_shares" ADD CONSTRAINT "location_shares_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "login_events" ADD CONSTRAINT "login_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_requests" ADD CONSTRAINT "message_requests_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_requests" ADD CONSTRAINT "message_requests_receiver_id_users_id_fk" FOREIGN KEY ("receiver_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_requests" ADD CONSTRAINT "message_requests_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_receiver_id_users_id_fk" FOREIGN KEY ("receiver_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_outer_sender_virtual_number_id_virtual_numbers_id_fk" FOREIGN KEY ("outer_sender_virtual_number_id") REFERENCES "public"."virtual_numbers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_read_by_users_id_fk" FOREIGN KEY ("read_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "one_time_prekeys" ADD CONSTRAINT "one_time_prekeys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_contacts" ADD CONSTRAINT "pending_contacts_added_by_user_id_users_id_fk" FOREIGN KEY ("added_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_messages" ADD CONSTRAINT "scheduled_messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_messages" ADD CONSTRAINT "scheduled_messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_messages" ADD CONSTRAINT "scheduled_messages_receiver_id_users_id_fk" FOREIGN KEY ("receiver_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signed_prekeys" ADD CONSTRAINT "signed_prekeys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_allowed_viewers" ADD CONSTRAINT "status_allowed_viewers_status_id_statuses_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."statuses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_allowed_viewers" ADD CONSTRAINT "status_allowed_viewers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_views" ADD CONSTRAINT "status_views_status_id_statuses_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."statuses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_views" ADD CONSTRAINT "status_views_viewer_id_users_id_fk" FOREIGN KEY ("viewer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statuses" ADD CONSTRAINT "statuses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocker_id_users_id_fk" FOREIGN KEY ("blocker_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocked_id_users_id_fk" FOREIGN KEY ("blocked_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_devices" ADD CONSTRAINT "user_devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_reports" ADD CONSTRAINT "user_reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_reports" ADD CONSTRAINT "user_reports_reported_user_id_users_id_fk" FOREIGN KEY ("reported_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "virtual_numbers" ADD CONSTRAINT "virtual_numbers_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_conv_participants_conv_id" ON "conversation_participants" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "idx_conv_participants_user_id" ON "conversation_participants" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_conv_participants_conv_user" ON "conversation_participants" USING btree ("conversation_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_encrypted_backups_user_id" ON "encrypted_backups" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_external_sms_user_received" ON "external_sms" USING btree ("delivered_to_user_id","received_at");--> statement-breakpoint
CREATE INDEX "idx_external_sms_vn" ON "external_sms" USING btree ("virtual_number_id");--> statement-breakpoint
CREATE INDEX "idx_login_events_user_id" ON "login_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_login_events_user_created" ON "login_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_messages_conv_id" ON "messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "idx_messages_conv_created" ON "messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_messages_sender_id" ON "messages" USING btree ("sender_id");--> statement-breakpoint
CREATE INDEX "idx_messages_receiver_status" ON "messages" USING btree ("receiver_id","status");--> statement-breakpoint
CREATE INDEX "idx_messages_expires_at" ON "messages" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_one_time_prekeys_user_id" ON "one_time_prekeys" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_one_time_prekeys_user_unused" ON "one_time_prekeys" USING btree ("user_id","used");--> statement-breakpoint
CREATE INDEX "idx_scheduled_messages_sender" ON "scheduled_messages" USING btree ("sender_id");--> statement-breakpoint
CREATE INDEX "idx_scheduled_messages_scheduled" ON "scheduled_messages" USING btree ("scheduled_for");--> statement-breakpoint
CREATE INDEX "idx_signed_prekeys_user_id" ON "signed_prekeys" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_status_views_status_id" ON "status_views" USING btree ("status_id");--> statement-breakpoint
CREATE INDEX "idx_status_views_viewer_id" ON "status_views" USING btree ("viewer_id");--> statement-breakpoint
CREATE INDEX "idx_statuses_user_id" ON "statuses" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_statuses_user_created" ON "statuses" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_statuses_expires" ON "statuses" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_user_devices_user_id" ON "user_devices" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_user_devices_device_id" ON "user_devices" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX "idx_user_reports_reporter" ON "user_reports" USING btree ("reporter_id");--> statement-breakpoint
CREATE INDEX "idx_user_reports_reported" ON "user_reports" USING btree ("reported_user_id");--> statement-breakpoint
CREATE INDEX "idx_user_reports_status" ON "user_reports" USING btree ("status");