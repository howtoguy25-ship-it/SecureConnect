import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean, integer, jsonb, index, primaryKey } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  phoneNumber: text("phone_number").notNull().unique(),
  displayName: text("display_name"),
  avatarIndex: integer("avatar_index").default(0),
  avatarUrl: text("avatar_url"),
  isVip: boolean("is_vip").default(false),
  vipStartedAt: timestamp("vip_started_at"),
  isAdFree: boolean("is_ad_free").default(false),
  adRemovalPurchasedAt: timestamp("ad_removal_purchased_at"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  lockerPin: text("locker_pin"),
  lockerSalt: text("locker_salt"),
  lockerFailedAttempts: integer("locker_failed_attempts").default(0),
  lockerLockedUntil: timestamp("locker_locked_until"),
  publicKey: text("public_key"),
  messageRequestSetting: text("message_request_setting").default("everyone"),
  preferredNumberType: text("preferred_number_type").default("personal"), // 'personal' | 'app'
  virtualNumberId: varchar("virtual_number_id"),
  chatBackgroundUrl: text("chat_background_url"),
  lastNameChangeAt: timestamp("last_name_change_at"),
  pushToken: text("push_token"),
  notificationsEnabled: boolean("notifications_enabled").default(true),
  lastSeenPrivacy: text("last_seen_privacy").default("everyone"), // 'everyone' | 'contacts' | 'vip' | 'nobody'
  readReceiptsEnabled: boolean("read_receipts_enabled").default(true),
  typingIndicatorsEnabled: boolean("typing_indicators_enabled").default(true),
  showNotificationPreview: boolean("show_notification_preview").default(true),
  defaultDisappearingTimer: integer("default_disappearing_timer").default(0),
  storiesEnabled: boolean("stories_enabled").default(true),
  storyPrivacyMode: text("story_privacy_mode").default("everyone"), // 'everyone' | 'contacts' | 'except' | 'only'
  storyPrivacyExceptIds: jsonb("story_privacy_except_ids").$type<string[]>().default([]),
  storyPrivacyOnlyIds: jsonb("story_privacy_only_ids").$type<string[]>().default([]),
  storyViewReceiptsEnabled: boolean("story_view_receipts_enabled").default(true),
  safeCodeHash: text("safe_code_hash"),
  safeCodeAcknowledged: boolean("safe_code_acknowledged").default(false),
  // Deterministic HMAC of the normalized Safe Code (Account ID), separate
  // from the bcrypt hash above. bcrypt is salted per-call so it can never be
  // looked up by value — this column exists solely so the unauthenticated
  // account-recovery flow can find the right user in O(1) before doing the
  // real (bcrypt) verification. Never used as a credential on its own.
  safeCodeLookupHash: text("safe_code_lookup_hash").unique(),
  // ── Security questions (account recovery second factor) ────────────────
  // Two fixed questions, both answers bcrypt-hashed — never stored or
  // logged in plaintext. Used (a) as a required step right after first-time
  // Account ID setup, (b) as a re-entry check on every fresh login, and
  // (c) combined with the Account ID for self-service recovery when the
  // user has lost access to their phone number.
  securityQ1Hash: text("security_q1_hash"),
  securityQ2Hash: text("security_q2_hash"),
  securityQuestionsSetAt: timestamp("security_questions_set_at"),
  securityQFailedAttempts: integer("security_q_failed_attempts").default(0),
  securityQLockedUntil: timestamp("security_q_locked_until"),
  tokenVersion: integer("token_version").default(0),
  isSuspended: boolean("is_suspended").default(false),
  suspendedAt: timestamp("suspended_at"),
  suspensionReason: text("suspension_reason"),
  // ── Account deletion (build 62) ─────────────────────────────────────────
  // Two-phase delete with 30-day grace + tombstone-on-execute:
  //   1. User confirms via OTP (+ biometric where available) → server sets
  //      pendingDeletionAt = now + 30d, deletionInitiatedAt = now, bumps
  //      tokenVersion. The row is still alive and the user can cancel.
  //   2. After pendingDeletionAt passes, the sweep job calls
  //      storage.executeHardDelete(userId) which hard-deletes per-user
  //      data (prekeys, devices, push tokens, contacts, friends, blocks,
  //      stories, locker, login events, conversation participations,
  //      backups, scheduled outgoing messages) and tombstones THIS row:
  //      phoneNumber → `deleted:<id>`, displayName → "Deleted user", all
  //      keys/avatars/etc nulled, isDeletedPlaceholder = true, deletedAt
  //      stamped. Messages they sent stay (recipient's data) and resolve
  //      to "Deleted user" via the tombstone row. Excluded from search,
  //      contact discovery, and new conversation creation.
  pendingDeletionAt: timestamp("pending_deletion_at"),
  deletionInitiatedAt: timestamp("deletion_initiated_at"),
  isDeletedPlaceholder: boolean("is_deleted_placeholder").default(false),
  deletedAt: timestamp("deleted_at"),
  // ── Sealed sender (build 63, Phase 3) ───────────────────────────────────
  // Recipient-side capability flag. Senders only use the sealed-sender path
  // when the recipient advertises this true. Old clients default to legacy
  // non-sealed delivery with senderId in payloads. See
  // docs/e2ee/sealed-sender.md §2.1 item 7.
  supportsSealedSender: boolean("supports_sealed_sender").default(true),
  // AI-moderation chat limits. When chatMessagesPerDay is set, the user can
  // only send that many messages per UTC day until chatLimitUntil expires.
  chatLimitUntil: timestamp("chat_limit_until"),
  chatLimitMessagesPerDay: integer("chat_limit_messages_per_day"),
  chatMessagesUsedToday: integer("chat_messages_used_today").default(0),
  chatLimitDayStart: timestamp("chat_limit_day_start"),
  createdAt: timestamp("created_at").defaultNow(),
  lastSeen: timestamp("last_seen").defaultNow(),
});

export const loginEvents = pgTable("login_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  deviceId: text("device_id"),
  deviceName: text("device_name"),
  platform: text("platform"), // 'ios' | 'android' | 'web'
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  isNewDevice: boolean("is_new_device").default(false),
  isCurrentSession: boolean("is_current_session").default(false),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_login_events_user_id").on(table.userId),
  index("idx_login_events_user_created").on(table.userId, table.createdAt),
]);

export type LoginEvent = typeof loginEvents.$inferSelect;

export const usersRelations = relations(users, ({ many }) => ({
  sentMessages: many(messages, { relationName: "sender" }),
  receivedMessages: many(messages, { relationName: "receiver" }),
  conversations: many(conversationParticipants),
  calls: many(calls),
}));

export const conversations = pgTable("conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  numberType: text("number_type").default("personal"), // 'personal' | 'virtual' - determines which number mode this conversation belongs to
  lastMessageAt: timestamp("last_message_at").defaultNow(),
  lastMessagePreview: text("last_message_preview"),
  disappearingTimer: integer("disappearing_timer").default(0), // seconds; 0 = off
  pinnedMessageId: varchar("pinned_message_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const conversationsRelations = relations(conversations, ({ many }) => ({
  participants: many(conversationParticipants),
  messages: many(messages),
}));

export const conversationParticipants = pgTable("conversation_participants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  unreadCount: integer("unread_count").default(0),
  isArchived: boolean("is_archived").default(false),
  folder: text("folder").default("none"), // 'none' | 'randoms' | 'friends' | 'family'
  joinedAt: timestamp("joined_at").defaultNow(),
}, (table) => [
  index("idx_conv_participants_conv_id").on(table.conversationId),
  index("idx_conv_participants_user_id").on(table.userId),
  index("idx_conv_participants_conv_user").on(table.conversationId, table.userId),
]);

export const conversationParticipantsRelations = relations(conversationParticipants, ({ one }) => ({
  conversation: one(conversations, {
    fields: [conversationParticipants.conversationId],
    references: [conversations.id],
  }),
  user: one(users, {
    fields: [conversationParticipants.userId],
    references: [users.id],
  }),
}));

export const messages = pgTable("messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  senderId: varchar("sender_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  receiverId: varchar("receiver_id").references(() => users.id, { onDelete: "cascade" }),
  content: text("content"),
  mediaUrl: text("media_url"),
  mediaType: text("media_type"),
  transcription: text("transcription"),
  isEncrypted: boolean("is_encrypted").default(true),
  encryptionVersion: text("encryption_version").default("v2-signal"), // 'none' | 'v1-nacl' | 'v2-signal'
  e2eeInitEnvelope: jsonb("e2ee_init_envelope"),
  isHidden: boolean("is_hidden").default(false),
  status: text("status").default("sent"),
  reactions: jsonb("reactions").$type<Record<string, string[]>>().default({}),
  replyToMessageId: varchar("reply_to_message_id"),
  replyToPreview: text("reply_to_preview"),
  replyToSenderId: varchar("reply_to_sender_id"),
  forwarded: boolean("forwarded").default(false),
  forwardedFromUserId: varchar("forwarded_from_user_id"),
  deletedForEveryone: boolean("deleted_for_everyone").default(false),
  deletedForUserIds: jsonb("deleted_for_user_ids").$type<string[]>().default([]),
  expiresAt: timestamp("expires_at"),
  // ── Sealed sender (build 63, Phase 3) ───────────────────────────────────
  // outerSenderVirtualNumberId is the ONLY sender-identifying field that
  // travels in recipient payloads when sealedSender = true. The real
  // senderId column above stays populated for abuse-handling
  // (docs/e2ee/sealed-sender.md §1.5) but the route layer strips it from
  // every recipient-facing surface (REST, socket, push). See
  // server/sealedSender.ts for the sanitizer.
  outerSenderVirtualNumberId: varchar("outer_sender_virtual_number_id")
    .references(() => virtualNumbers.id, { onDelete: "set null" }),
  sealedSender: boolean("sealed_sender").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  deliveredAt: timestamp("delivered_at"),
  readAt: timestamp("read_at"),
  readBy: varchar("read_by").references(() => users.id, { onDelete: "set null" }),
}, (table) => [
  index("idx_messages_conv_id").on(table.conversationId),
  index("idx_messages_conv_created").on(table.conversationId, table.createdAt),
  index("idx_messages_sender_id").on(table.senderId),
  index("idx_messages_receiver_status").on(table.receiverId, table.status),
  index("idx_messages_expires_at").on(table.expiresAt),
]);

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
  sender: one(users, {
    fields: [messages.senderId],
    references: [users.id],
    relationName: "sender",
  }),
  receiver: one(users, {
    fields: [messages.receiverId],
    references: [users.id],
    relationName: "receiver",
  }),
}));

export const hiddenLockerItems = pgTable("hidden_locker_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  messageId: varchar("message_id").references(() => messages.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  content: text("content"),
  mediaUrl: text("media_url"),
  // Encryption-at-rest (Phase 1).  When `encryptedV2=true`, `ciphertext` +
  // `nonce` hold a tweetnacl secretbox of the full plaintext payload
  // (`{type, content, mediaUrl, messageId}`) under a key derived from the
  // user's PIN via scrypt.  The legacy `content`/`mediaUrl` columns are
  // null on v2 rows.  The server cannot decrypt these — the key never
  // leaves the device.
  ciphertext: text("ciphertext"),
  nonce: text("nonce"),
  encryptedV2: boolean("encrypted_v2").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const hiddenLockerItemsRelations = relations(hiddenLockerItems, ({ one }) => ({
  user: one(users, {
    fields: [hiddenLockerItems.userId],
    references: [users.id],
  }),
  message: one(messages, {
    fields: [hiddenLockerItems.messageId],
    references: [messages.id],
  }),
}));

export const calls = pgTable("calls", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  callerId: varchar("caller_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  receiverId: varchar("receiver_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  status: text("status").default("pending"),
  startedAt: timestamp("started_at"),
  endedAt: timestamp("ended_at"),
  duration: integer("duration"),
  hiddenForCaller: boolean("hidden_for_caller").default(false),
  hiddenForReceiver: boolean("hidden_for_receiver").default(false),
  // Sealed-call signaling (Phase C.1). When `sealedCall=true` the recipient's
  // socket payload, push notification, and call-history response have
  // `callerId` redacted; the only identifier they see is the virtual-number
  // phone string carried by `outerCallerVirtualNumberId`. Mirrors the
  // sealed-sender pattern on `messages`.
  sealedCall: boolean("sealed_call").default(false),
  outerCallerVirtualNumberId: varchar("outer_caller_virtual_number_id")
    .references(() => virtualNumbers.id, { onDelete: "set null" }),
  // Phase C.3: ephemeral X25519 public keys posted by each participant
  // for media-frame E2EE. The server stores both halves so each side can
  // fetch the peer's pubkey and locally derive a shared secret. The
  // server never sees the shared secret because it never holds the
  // private scalars. Base64-encoded raw 32-byte pubkeys.
  callerE2eePubkey: text("caller_e2ee_pubkey"),
  receiverE2eePubkey: text("receiver_e2ee_pubkey"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const callsRelations = relations(calls, ({ one }) => ({
  caller: one(users, {
    fields: [calls.callerId],
    references: [users.id],
  }),
  receiver: one(users, {
    fields: [calls.receiverId],
    references: [users.id],
  }),
}));

export const verificationCodes = pgTable("verification_codes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  phoneNumber: text("phone_number").notNull(),
  code: text("code").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  verified: boolean("verified").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const pendingContacts = pgTable("pending_contacts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  addedByUserId: varchar("added_by_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  pendingPhoneNumber: text("pending_phone_number").notNull(),
  notified: boolean("notified").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const pendingContactsRelations = relations(pendingContacts, ({ one }) => ({
  addedBy: one(users, {
    fields: [pendingContacts.addedByUserId],
    references: [users.id],
  }),
}));

export const joinNotifications = pgTable("join_notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  newUserPhoneNumber: text("new_user_phone_number").notNull(),
  newUserName: text("new_user_name"),
  isRead: boolean("is_read").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const joinNotificationsRelations = relations(joinNotifications, ({ one }) => ({
  user: one(users, {
    fields: [joinNotifications.userId],
    references: [users.id],
  }),
}));

export const messageRequests = pgTable("message_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  senderId: varchar("sender_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  receiverId: varchar("receiver_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  conversationId: varchar("conversation_id").references(() => conversations.id, { onDelete: "cascade" }),
  status: text("status").default("pending"),
  messagePreview: text("message_preview"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const messageRequestsRelations = relations(messageRequests, ({ one }) => ({
  sender: one(users, {
    fields: [messageRequests.senderId],
    references: [users.id],
    relationName: "requestSender",
  }),
  receiver: one(users, {
    fields: [messageRequests.receiverId],
    references: [users.id],
    relationName: "requestReceiver",
  }),
  conversation: one(conversations, {
    fields: [messageRequests.conversationId],
    references: [conversations.id],
  }),
}));

export type MessageRequest = typeof messageRequests.$inferSelect;

// Status/Story feature tables
export const statuses = pgTable("statuses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  // Plaintext path — used only when the poster's story audience is
  // unbounded ('everyone' mode reaches any user on the platform, including
  // people with no key-exchange relationship to the poster, so there is no
  // fixed recipient set to encrypt to). Null on encrypted rows.
  mediaUrl: text("media_url"),
  mediaType: text("media_type"), // 'image' | 'video'
  caption: text("caption"),
  // E2EE (Stories phase 1) — used whenever the poster's audience is a
  // closed set (storyPrivacyMode 'contacts' | 'except' | 'only', or a
  // per-post 'friends'/'custom' override). mediaUrl above still holds the
  // object path, but the bytes there are an SCM1 ciphertext (the same
  // chunked-media format chat attachments use) under `mediaKey` — a fresh
  // random key generated per story. `mediaKeyWraps` holds one nacl.box of
  // that key per eligible viewer (computed client-side at post time),
  // keyed by viewerId, sealed with each viewer's identity public key —
  // the poster's own id is always included so they can re-view their own
  // story after an app restart. Caption is sealed under the same media
  // key via nacl.secretbox. The server only ever stores/relays opaque
  // blobs for encrypted rows.
  isEncrypted: boolean("is_encrypted").default(false),
  encryptedCaption: text("encrypted_caption"),
  captionNonce: text("caption_nonce"),
  mediaKeyWraps: jsonb("media_key_wraps").$type<Record<string, { wrappedKey: string; nonce: string }>>(),
  privacy: text("privacy").default("everyone"), // 'everyone' | 'friends' | 'custom'
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_statuses_user_id").on(table.userId),
  index("idx_statuses_user_created").on(table.userId, table.createdAt),
  index("idx_statuses_expires").on(table.expiresAt),
]);

export const statusesRelations = relations(statuses, ({ one, many }) => ({
  user: one(users, {
    fields: [statuses.userId],
    references: [users.id],
  }),
  views: many(statusViews),
  allowedViewers: many(statusAllowedViewers),
}));

export const statusViews = pgTable("status_views", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  statusId: varchar("status_id").notNull().references(() => statuses.id, { onDelete: "cascade" }),
  viewerId: varchar("viewer_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  viewedAt: timestamp("viewed_at").defaultNow(),
  // Story analytics (added v1.0.6). watchDurationMs is the cumulative time the
  // viewer kept the story on screen across opens; `completed` flips true once
  // they reach >=90% of media duration (or the 5s image timeout) at least once.
  watchDurationMs: integer("watch_duration_ms").notNull().default(0),
  completed: boolean("completed").notNull().default(false),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_status_views_status_id").on(table.statusId),
  index("idx_status_views_viewer_id").on(table.viewerId),
]);

export const statusViewsRelations = relations(statusViews, ({ one }) => ({
  status: one(statuses, {
    fields: [statusViews.statusId],
    references: [statuses.id],
  }),
  viewer: one(users, {
    fields: [statusViews.viewerId],
    references: [users.id],
  }),
}));

export const statusAllowedViewers = pgTable("status_allowed_viewers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  statusId: varchar("status_id").notNull().references(() => statuses.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
});

export const statusAllowedViewersRelations = relations(statusAllowedViewers, ({ one }) => ({
  status: one(statuses, {
    fields: [statusAllowedViewers.statusId],
    references: [statuses.id],
  }),
  user: one(users, {
    fields: [statusAllowedViewers.userId],
    references: [users.id],
  }),
}));

// Status mutes: per-viewer hide of another user's stories from the feed.
// Composite PK (muterId, mutedUserId) keeps inserts idempotent and avoids
// orphan rows on FK-cascade deletes. Scoped to the status feed only — does
// not block messaging or calls.
export const statusMutes = pgTable("status_mutes", {
  muterId: varchar("muter_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  mutedUserId: varchar("muted_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.muterId, table.mutedUserId] }),
  index("idx_status_mutes_muter").on(table.muterId),
]);

export const statusMutesRelations = relations(statusMutes, ({ one }) => ({
  muter: one(users, { fields: [statusMutes.muterId], references: [users.id], relationName: "statusMuter" }),
  mutedUser: one(users, { fields: [statusMutes.mutedUserId], references: [users.id], relationName: "statusMutedUser" }),
}));

// Friends table for privacy control
// A row is created by the REQUESTER (userId -> friendId) with status
// 'pending'; the recipient (friendId) accepting flips it to 'accepted'.
// getFriends() reads accepted rows in EITHER direction so friendship is
// mutual once accepted, regardless of who sent the original request.
export const friends = pgTable("friends", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  friendId: varchar("friend_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("accepted"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const friendsRelations = relations(friends, ({ one }) => ({
  user: one(users, {
    fields: [friends.userId],
    references: [users.id],
    relationName: "userFriends",
  }),
  friend: one(users, {
    fields: [friends.friendId],
    references: [users.id],
    relationName: "friendOf",
  }),
}));

// Personal, per-user "Save" bookmark on a message (hold-menu action).
// Deliberately not shared with the other party — unlike Pin, which is a
// single conversation-wide field, a save is private to whoever tapped it.
export const messageSaves = pgTable("message_saves", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  messageId: varchar("message_id").notNull().references(() => messages.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow(),
});

// Location sharing tables (VIP only)
export const locationShares = pgTable("location_shares", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  // Legacy plaintext columns — no longer written by current clients (see
  // encryptedLocations below). Kept only so old rows don't error on read;
  // safe to drop once no pre-E2EE-location client build is in the wild.
  latitude: text("latitude"),
  longitude: text("longitude"),
  // E2EE (location-sharing phase 1). One entry per currently-approved
  // viewer: viewerId -> a nacl.box (X25519) of {lat, lng} sealed to that
  // viewer's identity public key with the sharer's identity secret key.
  // The server only ever stores/relays these opaque blobs — it cannot
  // read coordinates. Recomputed and replaced wholesale on every location
  // tick (the approved-viewer set is small, so re-boxing per tick is
  // cheap) rather than merged, so a removed friend's old ciphertext
  // doesn't linger.
  encryptedLocations: jsonb("encrypted_locations").$type<Record<string, { ciphertext: string; nonce: string }>>().default({}),
  isSharing: boolean("is_sharing").default(false),
  lastUpdated: timestamp("last_updated").defaultNow(),
});

export const locationSharesRelations = relations(locationShares, ({ one }) => ({
  user: one(users, {
    fields: [locationShares.userId],
    references: [users.id],
  }),
}));

export const locationRequests = pgTable("location_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  requesterId: varchar("requester_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  targetId: varchar("target_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  status: text("status").default("pending"), // 'pending' | 'accepted' | 'declined'
  createdAt: timestamp("created_at").defaultNow(),
});

export const locationRequestsRelations = relations(locationRequests, ({ one }) => ({
  requester: one(users, {
    fields: [locationRequests.requesterId],
    references: [users.id],
    relationName: "locationRequester",
  }),
  target: one(users, {
    fields: [locationRequests.targetId],
    references: [users.id],
    relationName: "locationTarget",
  }),
}));

// Virtual phone numbers for encrypted app-only communication (VIP feature)
export const virtualNumbers = pgTable("virtual_numbers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  phoneNumber: text("phone_number").notNull().unique(), // E.164 format
  countryCode: text("country_code").notNull(), // ISO 3166-1 alpha-2
  twilioSid: text("twilio_sid").notNull(), // Twilio phone number SID
  capabilities: jsonb("capabilities").$type<{ voice: boolean; sms: boolean; mms: boolean }>(),
  status: text("status").default("active"), // 'active' | 'released' | 'suspended'
  assignedUserId: varchar("assigned_user_id").references(() => users.id, { onDelete: "set null" }),
  assignedAt: timestamp("assigned_at"),
  releasedAt: timestamp("released_at"),
  // VN Recycling (30-day quarantine). Set to `releasedAt + 30 days` when a
  // user releases their number. The row stays status='released' and the
  // Twilio number stays in OUR account (we deliberately do not release at
  // Twilio during quarantine — otherwise stale SMS / 2FA codes addressed
  // to that E.164 would reach the next global owner of the number).
  // Once `recyclableAt <= now()`, the row is eligible to be reassigned to
  // a new user during their next /provision call.
  recyclableAt: timestamp("recyclable_at"),
  // Prior-owner correlation defense. Set during `releaseVirtualNumber` to
  // the user who was assigned at the time of release. `getRecyclableNumber`
  // excludes rows where `previousAssignedUserId === forUserId` so a user
  // can't release → wait 30d → re-provision and reclaim the same E.164,
  // which would preserve identity correlation across the "fresh number"
  // boundary the recycling is supposed to provide.
  previousAssignedUserId: varchar("previous_assigned_user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const virtualNumbersRelations = relations(virtualNumbers, ({ one }) => ({
  assignedUser: one(users, {
    fields: [virtualNumbers.assignedUserId],
    references: [users.id],
  }),
}));

// ── external_sms (build 63, Phase 3) ─────────────────────────────────────
// Carrier-SMS landing zone. NOT end-to-end encrypted; the body arrived
// over the carrier network as plaintext and has always been visible to the
// carrier and to us. This table is deliberately separate from `messages`
// so the E2EE claim on `messages` remains true: NO plaintext payload ever
// lands in `messages.content`. The client renders external_sms rows in the
// same inbox view but with a clear "SMS — not end-to-end encrypted" label
// and the composer is read-only for them in this PR.
// See docs/e2ee/sealed-sender.md §2.1 item 4 and §7.
//
// At-rest hardening: `body` is encrypted server-side (AES-256-GCM, see
// server/smsEncryption.ts) before insert whenever `isEncrypted` is true.
// This is NOT E2EE — we hold the key — but it does mean a raw DB
// dump/leak can't recover SMS content, which can carry 2FA codes and other
// sensitive material despite arriving over a non-E2EE channel. Older rows
// written before this column existed have isEncrypted=false and hold
// genuine plaintext; readers must branch on the flag.
export const externalSms = pgTable("external_sms", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  virtualNumberId: varchar("virtual_number_id")
    .notNull()
    .references(() => virtualNumbers.id, { onDelete: "cascade" }),
  fromPhoneE164: text("from_phone_e164").notNull(),
  body: text("body").notNull(), // encrypted at rest when isEncrypted=true — see header comment
  isEncrypted: boolean("is_encrypted").default(false).notNull(),
  deliveredToUserId: varchar("delivered_to_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  receivedAt: timestamp("received_at").defaultNow(),
}, (table) => [
  index("idx_external_sms_user_received").on(table.deliveredToUserId, table.receivedAt),
  index("idx_external_sms_vn").on(table.virtualNumberId),
]);

export type ExternalSms = typeof externalSms.$inferSelect;

// User blocks table
export const userBlocks = pgTable("user_blocks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  blockerId: varchar("blocker_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  blockedId: varchar("blocked_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const userBlocksRelations = relations(userBlocks, ({ one }) => ({
  blocker: one(users, {
    fields: [userBlocks.blockerId],
    references: [users.id],
    relationName: "blocker",
  }),
  blocked: one(users, {
    fields: [userBlocks.blockedId],
    references: [users.id],
    relationName: "blocked",
  }),
}));

// User reports table — App Store Guideline 1.2 (UGC abuse reporting)
export const userReports = pgTable("user_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  reporterId: varchar("reporter_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  reportedUserId: varchar("reported_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  reportedMessageId: varchar("reported_message_id"),
  reason: text("reason").notNull(),
  details: text("details"),
  status: text("status").notNull().default("pending"),
  reviewedAt: timestamp("reviewed_at"),
  reviewedBy: varchar("reviewed_by"),
  actionTaken: text("action_taken"),
  // AI moderator verdict — populated within seconds of report creation.
  aiVerdict: text("ai_verdict"), // 'approve' | 'decline' | 'insufficient_evidence' | 'error'
  aiVerdictReason: text("ai_verdict_reason"),
  aiAction: text("ai_action"), // 'none' | 'warn' | 'chat_limit' | 'suspend_24h' | 'suspend_7d' | 'suspend_30d' | 'suspend_permanent'
  aiSeverity: integer("ai_severity"),
  aiConfidence: integer("ai_confidence"),
  aiEvaluatedAt: timestamp("ai_evaluated_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_user_reports_reporter").on(table.reporterId),
  index("idx_user_reports_reported").on(table.reportedUserId),
  index("idx_user_reports_status").on(table.status),
]);

export const userReportsRelations = relations(userReports, ({ one }) => ({
  reporter: one(users, {
    fields: [userReports.reporterId],
    references: [users.id],
    relationName: "reporter",
  }),
  reported: one(users, {
    fields: [userReports.reportedUserId],
    references: [users.id],
    relationName: "reported",
  }),
}));

// ─── E2EE Signal-protocol tables ─────────────────────────────────────────────

export const userDevices = pgTable("user_devices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  deviceId: text("device_id").notNull(),
  identityPublicKey: text("identity_public_key").notNull(),
  signingPublicKey: text("signing_public_key").notNull(),
  registeredAt: timestamp("registered_at").defaultNow(),
  lastSeenAt: timestamp("last_seen_at").defaultNow(),
}, (table) => [
  index("idx_user_devices_user_id").on(table.userId),
  index("idx_user_devices_device_id").on(table.deviceId),
]);

export const userDevicesRelations = relations(userDevices, ({ one }) => ({
  user: one(users, { fields: [userDevices.userId], references: [users.id] }),
}));

export const signedPrekeys = pgTable("signed_prekeys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  keyId: text("key_id").notNull(),
  publicKey: text("public_key").notNull(),
  signature: text("signature").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_signed_prekeys_user_id").on(table.userId),
]);

export const signedPrekeysRelations = relations(signedPrekeys, ({ one }) => ({
  user: one(users, { fields: [signedPrekeys.userId], references: [users.id] }),
}));

export const oneTimePrekeys = pgTable("one_time_prekeys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  keyId: text("key_id").notNull(),
  publicKey: text("public_key").notNull(),
  used: boolean("used").default(false),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_one_time_prekeys_user_id").on(table.userId),
  index("idx_one_time_prekeys_user_unused").on(table.userId, table.used),
]);

export const oneTimePrekeysRelations = relations(oneTimePrekeys, ({ one }) => ({
  user: one(users, { fields: [oneTimePrekeys.userId], references: [users.id] }),
}));

// ─── Scheduled messages table ──────────────────────────────────────────────

export const scheduledMessages = pgTable("scheduled_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  senderId: varchar("sender_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  receiverId: varchar("receiver_id").references(() => users.id, { onDelete: "cascade" }),
  content: text("content"),
  mediaUrl: text("media_url"),
  mediaType: text("media_type"), // 'image' | 'video' | 'gif' | 'voice'
  scheduledFor: timestamp("scheduled_for").notNull(),
  status: text("status").default("pending"), // 'pending' | 'sent' | 'failed' | 'cancelled'
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_scheduled_messages_sender").on(table.senderId),
  index("idx_scheduled_messages_scheduled").on(table.scheduledFor),
]);

export const scheduledMessagesRelations = relations(scheduledMessages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [scheduledMessages.conversationId],
    references: [conversations.id],
  }),
  sender: one(users, {
    fields: [scheduledMessages.senderId],
    references: [users.id],
  }),
  receiver: one(users, {
    fields: [scheduledMessages.receiverId],
    references: [users.id],
  }),
}));

// ─── Encrypted backups (E2EE key recovery) ────────────────────────────────

export const encryptedBackups = pgTable("encrypted_backups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  deviceId: text("device_id").notNull(),
  encryptedBlob: text("encrypted_blob").notNull(),
  salt: text("salt").notNull(),
  nonce: text("nonce").notNull(),
  version: integer("version").default(1),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_encrypted_backups_user_id").on(table.userId),
]);

export type EncryptedBackup = typeof encryptedBackups.$inferSelect;

// Small durable key/value store for process-wide toggles (currently just
// App Store Review Mode) that previously lived in a plain in-memory
// module variable in server/routes.ts and silently reset to the env-var
// default on every server restart/redeploy.
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type AppSetting = typeof appSettings.$inferSelect;

export const insertUserSchema = createInsertSchema(users).pick({
  phoneNumber: true,
  displayName: true,
  avatarIndex: true,
});

export const insertMessageSchema = createInsertSchema(messages).pick({
  conversationId: true,
  senderId: true,
  receiverId: true,
  content: true,
  mediaUrl: true,
  mediaType: true,
  isHidden: true,
});

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Conversation = typeof conversations.$inferSelect;
export type Call = typeof calls.$inferSelect;
export type HiddenLockerItem = typeof hiddenLockerItems.$inferSelect;
export type VerificationCode = typeof verificationCodes.$inferSelect;
export type PendingContact = typeof pendingContacts.$inferSelect;
export type JoinNotification = typeof joinNotifications.$inferSelect;
export type Status = typeof statuses.$inferSelect;
export type StatusView = typeof statusViews.$inferSelect;
export type Friend = typeof friends.$inferSelect;
export type LocationShare = typeof locationShares.$inferSelect;
export type LocationRequest = typeof locationRequests.$inferSelect;
export type VirtualNumber = typeof virtualNumbers.$inferSelect;
export type UserBlock = typeof userBlocks.$inferSelect;
export type UserReport = typeof userReports.$inferSelect;
export type InsertUserReport = typeof userReports.$inferInsert;
export type ScheduledMessage = typeof scheduledMessages.$inferSelect;
export type UserDevice = typeof userDevices.$inferSelect;
export type SignedPrekey = typeof signedPrekeys.$inferSelect;
export type OneTimePrekey = typeof oneTimePrekeys.$inferSelect;
