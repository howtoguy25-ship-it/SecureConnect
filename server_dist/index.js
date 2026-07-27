"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc3) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc3 = __getOwnPropDesc(from, key)) || desc3.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// shared/schema.ts
var schema_exports = {};
__export(schema_exports, {
  calls: () => calls,
  callsRelations: () => callsRelations,
  conversationParticipants: () => conversationParticipants,
  conversationParticipantsRelations: () => conversationParticipantsRelations,
  conversations: () => conversations,
  conversationsRelations: () => conversationsRelations,
  encryptedBackups: () => encryptedBackups,
  friends: () => friends,
  friendsRelations: () => friendsRelations,
  hiddenLockerItems: () => hiddenLockerItems,
  hiddenLockerItemsRelations: () => hiddenLockerItemsRelations,
  insertMessageSchema: () => insertMessageSchema,
  insertUserSchema: () => insertUserSchema,
  joinNotifications: () => joinNotifications,
  joinNotificationsRelations: () => joinNotificationsRelations,
  locationRequests: () => locationRequests,
  locationRequestsRelations: () => locationRequestsRelations,
  locationShares: () => locationShares,
  locationSharesRelations: () => locationSharesRelations,
  loginEvents: () => loginEvents,
  messageRequests: () => messageRequests,
  messageRequestsRelations: () => messageRequestsRelations,
  messages: () => messages,
  messagesRelations: () => messagesRelations,
  oneTimePrekeys: () => oneTimePrekeys,
  oneTimePrekeysRelations: () => oneTimePrekeysRelations,
  pendingContacts: () => pendingContacts,
  pendingContactsRelations: () => pendingContactsRelations,
  scheduledMessages: () => scheduledMessages,
  scheduledMessagesRelations: () => scheduledMessagesRelations,
  signedPrekeys: () => signedPrekeys,
  signedPrekeysRelations: () => signedPrekeysRelations,
  statusAllowedViewers: () => statusAllowedViewers,
  statusAllowedViewersRelations: () => statusAllowedViewersRelations,
  statusViews: () => statusViews,
  statusViewsRelations: () => statusViewsRelations,
  statuses: () => statuses,
  statusesRelations: () => statusesRelations,
  userBlocks: () => userBlocks,
  userBlocksRelations: () => userBlocksRelations,
  userDevices: () => userDevices,
  userDevicesRelations: () => userDevicesRelations,
  userReports: () => userReports,
  userReportsRelations: () => userReportsRelations,
  users: () => users,
  usersRelations: () => usersRelations,
  verificationCodes: () => verificationCodes,
  virtualNumbers: () => virtualNumbers,
  virtualNumbersRelations: () => virtualNumbersRelations
});
var import_drizzle_orm, import_pg_core, import_drizzle_zod, users, loginEvents, usersRelations, conversations, conversationsRelations, conversationParticipants, conversationParticipantsRelations, messages, messagesRelations, hiddenLockerItems, hiddenLockerItemsRelations, calls, callsRelations, verificationCodes, pendingContacts, pendingContactsRelations, joinNotifications, joinNotificationsRelations, messageRequests, messageRequestsRelations, statuses, statusesRelations, statusViews, statusViewsRelations, statusAllowedViewers, statusAllowedViewersRelations, friends, friendsRelations, locationShares, locationSharesRelations, locationRequests, locationRequestsRelations, virtualNumbers, virtualNumbersRelations, userBlocks, userBlocksRelations, userReports, userReportsRelations, userDevices, userDevicesRelations, signedPrekeys, signedPrekeysRelations, oneTimePrekeys, oneTimePrekeysRelations, scheduledMessages, scheduledMessagesRelations, encryptedBackups, insertUserSchema, insertMessageSchema;
var init_schema = __esm({
  "shared/schema.ts"() {
    "use strict";
    import_drizzle_orm = require("drizzle-orm");
    import_pg_core = require("drizzle-orm/pg-core");
    import_drizzle_zod = require("drizzle-zod");
    users = (0, import_pg_core.pgTable)("users", {
      id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
      phoneNumber: (0, import_pg_core.text)("phone_number").notNull().unique(),
      displayName: (0, import_pg_core.text)("display_name"),
      avatarIndex: (0, import_pg_core.integer)("avatar_index").default(0),
      avatarUrl: (0, import_pg_core.text)("avatar_url"),
      isVip: (0, import_pg_core.boolean)("is_vip").default(false),
      vipStartedAt: (0, import_pg_core.timestamp)("vip_started_at"),
      isAdFree: (0, import_pg_core.boolean)("is_ad_free").default(false),
      adRemovalPurchasedAt: (0, import_pg_core.timestamp)("ad_removal_purchased_at"),
      stripeCustomerId: (0, import_pg_core.text)("stripe_customer_id"),
      stripeSubscriptionId: (0, import_pg_core.text)("stripe_subscription_id"),
      lockerPin: (0, import_pg_core.text)("locker_pin"),
      publicKey: (0, import_pg_core.text)("public_key"),
      messageRequestSetting: (0, import_pg_core.text)("message_request_setting").default("everyone"),
      preferredNumberType: (0, import_pg_core.text)("preferred_number_type").default("personal"),
      // 'personal' | 'app'
      virtualNumberId: (0, import_pg_core.varchar)("virtual_number_id"),
      chatBackgroundUrl: (0, import_pg_core.text)("chat_background_url"),
      lastNameChangeAt: (0, import_pg_core.timestamp)("last_name_change_at"),
      pushToken: (0, import_pg_core.text)("push_token"),
      notificationsEnabled: (0, import_pg_core.boolean)("notifications_enabled").default(true),
      lastSeenPrivacy: (0, import_pg_core.text)("last_seen_privacy").default("everyone"),
      // 'everyone' | 'contacts' | 'vip' | 'nobody'
      readReceiptsEnabled: (0, import_pg_core.boolean)("read_receipts_enabled").default(true),
      typingIndicatorsEnabled: (0, import_pg_core.boolean)("typing_indicators_enabled").default(true),
      showNotificationPreview: (0, import_pg_core.boolean)("show_notification_preview").default(true),
      defaultDisappearingTimer: (0, import_pg_core.integer)("default_disappearing_timer").default(0),
      storiesEnabled: (0, import_pg_core.boolean)("stories_enabled").default(true),
      storyPrivacyMode: (0, import_pg_core.text)("story_privacy_mode").default("everyone"),
      // 'everyone' | 'contacts' | 'except' | 'only'
      storyPrivacyExceptIds: (0, import_pg_core.jsonb)("story_privacy_except_ids").$type().default([]),
      storyPrivacyOnlyIds: (0, import_pg_core.jsonb)("story_privacy_only_ids").$type().default([]),
      storyViewReceiptsEnabled: (0, import_pg_core.boolean)("story_view_receipts_enabled").default(true),
      safeCodeHash: (0, import_pg_core.text)("safe_code_hash"),
      safeCodeAcknowledged: (0, import_pg_core.boolean)("safe_code_acknowledged").default(false),
      tokenVersion: (0, import_pg_core.integer)("token_version").default(0),
      isSuspended: (0, import_pg_core.boolean)("is_suspended").default(false),
      suspendedAt: (0, import_pg_core.timestamp)("suspended_at"),
      suspensionReason: (0, import_pg_core.text)("suspension_reason"),
      // AI-moderation chat limits. When chatMessagesPerDay is set, the user can
      // only send that many messages per UTC day until chatLimitUntil expires.
      chatLimitUntil: (0, import_pg_core.timestamp)("chat_limit_until"),
      chatLimitMessagesPerDay: (0, import_pg_core.integer)("chat_limit_messages_per_day"),
      chatMessagesUsedToday: (0, import_pg_core.integer)("chat_messages_used_today").default(0),
      chatLimitDayStart: (0, import_pg_core.timestamp)("chat_limit_day_start"),
      createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow(),
      lastSeen: (0, import_pg_core.timestamp)("last_seen").defaultNow()
    });
    loginEvents = (0, import_pg_core.pgTable)("login_events", {
      id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
      userId: (0, import_pg_core.varchar)("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
      deviceId: (0, import_pg_core.text)("device_id"),
      deviceName: (0, import_pg_core.text)("device_name"),
      platform: (0, import_pg_core.text)("platform"),
      // 'ios' | 'android' | 'web'
      ipAddress: (0, import_pg_core.text)("ip_address"),
      userAgent: (0, import_pg_core.text)("user_agent"),
      isNewDevice: (0, import_pg_core.boolean)("is_new_device").default(false),
      isCurrentSession: (0, import_pg_core.boolean)("is_current_session").default(false),
      createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow()
    }, (table) => [
      (0, import_pg_core.index)("idx_login_events_user_id").on(table.userId),
      (0, import_pg_core.index)("idx_login_events_user_created").on(table.userId, table.createdAt)
    ]);
    usersRelations = (0, import_drizzle_orm.relations)(users, ({ many }) => ({
      sentMessages: many(messages, { relationName: "sender" }),
      receivedMessages: many(messages, { relationName: "receiver" }),
      conversations: many(conversationParticipants),
      calls: many(calls)
    }));
    conversations = (0, import_pg_core.pgTable)("conversations", {
      id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
      numberType: (0, import_pg_core.text)("number_type").default("personal"),
      // 'personal' | 'virtual' - determines which number mode this conversation belongs to
      lastMessageAt: (0, import_pg_core.timestamp)("last_message_at").defaultNow(),
      lastMessagePreview: (0, import_pg_core.text)("last_message_preview"),
      disappearingTimer: (0, import_pg_core.integer)("disappearing_timer").default(0),
      // seconds; 0 = off
      pinnedMessageId: (0, import_pg_core.varchar)("pinned_message_id"),
      createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow()
    });
    conversationsRelations = (0, import_drizzle_orm.relations)(conversations, ({ many }) => ({
      participants: many(conversationParticipants),
      messages: many(messages)
    }));
    conversationParticipants = (0, import_pg_core.pgTable)("conversation_participants", {
      id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
      conversationId: (0, import_pg_core.varchar)("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
      userId: (0, import_pg_core.varchar)("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
      unreadCount: (0, import_pg_core.integer)("unread_count").default(0),
      isArchived: (0, import_pg_core.boolean)("is_archived").default(false),
      folder: (0, import_pg_core.text)("folder").default("none"),
      // 'none' | 'randoms' | 'friends' | 'family'
      joinedAt: (0, import_pg_core.timestamp)("joined_at").defaultNow()
    }, (table) => [
      (0, import_pg_core.index)("idx_conv_participants_conv_id").on(table.conversationId),
      (0, import_pg_core.index)("idx_conv_participants_user_id").on(table.userId),
      (0, import_pg_core.index)("idx_conv_participants_conv_user").on(table.conversationId, table.userId)
    ]);
    conversationParticipantsRelations = (0, import_drizzle_orm.relations)(conversationParticipants, ({ one }) => ({
      conversation: one(conversations, {
        fields: [conversationParticipants.conversationId],
        references: [conversations.id]
      }),
      user: one(users, {
        fields: [conversationParticipants.userId],
        references: [users.id]
      })
    }));
    messages = (0, import_pg_core.pgTable)("messages", {
      id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
      conversationId: (0, import_pg_core.varchar)("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
      senderId: (0, import_pg_core.varchar)("sender_id").notNull().references(() => users.id, { onDelete: "cascade" }),
      receiverId: (0, import_pg_core.varchar)("receiver_id").references(() => users.id, { onDelete: "cascade" }),
      content: (0, import_pg_core.text)("content"),
      mediaUrl: (0, import_pg_core.text)("media_url"),
      mediaType: (0, import_pg_core.text)("media_type"),
      transcription: (0, import_pg_core.text)("transcription"),
      isEncrypted: (0, import_pg_core.boolean)("is_encrypted").default(true),
      encryptionVersion: (0, import_pg_core.text)("encryption_version").default("v2-signal"),
      // 'none' | 'v1-nacl' | 'v2-signal'
      e2eeInitEnvelope: (0, import_pg_core.jsonb)("e2ee_init_envelope"),
      isHidden: (0, import_pg_core.boolean)("is_hidden").default(false),
      status: (0, import_pg_core.text)("status").default("sent"),
      reactions: (0, import_pg_core.jsonb)("reactions").$type().default({}),
      replyToMessageId: (0, import_pg_core.varchar)("reply_to_message_id"),
      replyToPreview: (0, import_pg_core.text)("reply_to_preview"),
      replyToSenderId: (0, import_pg_core.varchar)("reply_to_sender_id"),
      forwarded: (0, import_pg_core.boolean)("forwarded").default(false),
      forwardedFromUserId: (0, import_pg_core.varchar)("forwarded_from_user_id"),
      deletedForEveryone: (0, import_pg_core.boolean)("deleted_for_everyone").default(false),
      deletedForUserIds: (0, import_pg_core.jsonb)("deleted_for_user_ids").$type().default([]),
      expiresAt: (0, import_pg_core.timestamp)("expires_at"),
      createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow(),
      deliveredAt: (0, import_pg_core.timestamp)("delivered_at"),
      readAt: (0, import_pg_core.timestamp)("read_at"),
      readBy: (0, import_pg_core.varchar)("read_by").references(() => users.id, { onDelete: "set null" })
    }, (table) => [
      (0, import_pg_core.index)("idx_messages_conv_id").on(table.conversationId),
      (0, import_pg_core.index)("idx_messages_conv_created").on(table.conversationId, table.createdAt),
      (0, import_pg_core.index)("idx_messages_sender_id").on(table.senderId),
      (0, import_pg_core.index)("idx_messages_receiver_status").on(table.receiverId, table.status),
      (0, import_pg_core.index)("idx_messages_expires_at").on(table.expiresAt)
    ]);
    messagesRelations = (0, import_drizzle_orm.relations)(messages, ({ one }) => ({
      conversation: one(conversations, {
        fields: [messages.conversationId],
        references: [conversations.id]
      }),
      sender: one(users, {
        fields: [messages.senderId],
        references: [users.id],
        relationName: "sender"
      }),
      receiver: one(users, {
        fields: [messages.receiverId],
        references: [users.id],
        relationName: "receiver"
      })
    }));
    hiddenLockerItems = (0, import_pg_core.pgTable)("hidden_locker_items", {
      id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
      userId: (0, import_pg_core.varchar)("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
      messageId: (0, import_pg_core.varchar)("message_id").references(() => messages.id, { onDelete: "cascade" }),
      type: (0, import_pg_core.text)("type").notNull(),
      content: (0, import_pg_core.text)("content"),
      mediaUrl: (0, import_pg_core.text)("media_url"),
      createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow()
    });
    hiddenLockerItemsRelations = (0, import_drizzle_orm.relations)(hiddenLockerItems, ({ one }) => ({
      user: one(users, {
        fields: [hiddenLockerItems.userId],
        references: [users.id]
      }),
      message: one(messages, {
        fields: [hiddenLockerItems.messageId],
        references: [messages.id]
      })
    }));
    calls = (0, import_pg_core.pgTable)("calls", {
      id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
      callerId: (0, import_pg_core.varchar)("caller_id").notNull().references(() => users.id, { onDelete: "cascade" }),
      receiverId: (0, import_pg_core.varchar)("receiver_id").notNull().references(() => users.id, { onDelete: "cascade" }),
      type: (0, import_pg_core.text)("type").notNull(),
      status: (0, import_pg_core.text)("status").default("pending"),
      startedAt: (0, import_pg_core.timestamp)("started_at"),
      endedAt: (0, import_pg_core.timestamp)("ended_at"),
      duration: (0, import_pg_core.integer)("duration"),
      hiddenForCaller: (0, import_pg_core.boolean)("hidden_for_caller").default(false),
      hiddenForReceiver: (0, import_pg_core.boolean)("hidden_for_receiver").default(false),
      createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow()
    });
    callsRelations = (0, import_drizzle_orm.relations)(calls, ({ one }) => ({
      caller: one(users, {
        fields: [calls.callerId],
        references: [users.id]
      }),
      receiver: one(users, {
        fields: [calls.receiverId],
        references: [users.id]
      })
    }));
    verificationCodes = (0, import_pg_core.pgTable)("verification_codes", {
      id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
      phoneNumber: (0, import_pg_core.text)("phone_number").notNull(),
      code: (0, import_pg_core.text)("code").notNull(),
      expiresAt: (0, import_pg_core.timestamp)("expires_at").notNull(),
      verified: (0, import_pg_core.boolean)("verified").default(false),
      createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow()
    });
    pendingContacts = (0, import_pg_core.pgTable)("pending_contacts", {
      id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
      addedByUserId: (0, import_pg_core.varchar)("added_by_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
      pendingPhoneNumber: (0, import_pg_core.text)("pending_phone_number").notNull(),
      notified: (0, import_pg_core.boolean)("notified").default(false),
      createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow()
    });
    pendingContactsRelations = (0, import_drizzle_orm.relations)(pendingContacts, ({ one }) => ({
      addedBy: one(users, {
        fields: [pendingContacts.addedByUserId],
        references: [users.id]
      })
    }));
    joinNotifications = (0, import_pg_core.pgTable)("join_notifications", {
      id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
      userId: (0, import_pg_core.varchar)("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
      newUserPhoneNumber: (0, import_pg_core.text)("new_user_phone_number").notNull(),
      newUserName: (0, import_pg_core.text)("new_user_name"),
      isRead: (0, import_pg_core.boolean)("is_read").default(false),
      createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow()
    });
    joinNotificationsRelations = (0, import_drizzle_orm.relations)(joinNotifications, ({ one }) => ({
      user: one(users, {
        fields: [joinNotifications.userId],
        references: [users.id]
      })
    }));
    messageRequests = (0, import_pg_core.pgTable)("message_requests", {
      id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
      senderId: (0, import_pg_core.varchar)("sender_id").notNull().references(() => users.id, { onDelete: "cascade" }),
      receiverId: (0, import_pg_core.varchar)("receiver_id").notNull().references(() => users.id, { onDelete: "cascade" }),
      conversationId: (0, import_pg_core.varchar)("conversation_id").references(() => conversations.id, { onDelete: "cascade" }),
      status: (0, import_pg_core.text)("status").default("pending"),
      messagePreview: (0, import_pg_core.text)("message_preview"),
      createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow()
    });
    messageRequestsRelations = (0, import_drizzle_orm.relations)(messageRequests, ({ one }) => ({
      sender: one(users, {
        fields: [messageRequests.senderId],
        references: [users.id],
        relationName: "requestSender"
      }),
      receiver: one(users, {
        fields: [messageRequests.receiverId],
        references: [users.id],
        relationName: "requestReceiver"
      }),
      conversation: one(conversations, {
        fields: [messageRequests.conversationId],
        references: [conversations.id]
      })
    }));
    statuses = (0, import_pg_core.pgTable)("statuses", {
      id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
      userId: (0, import_pg_core.varchar)("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
      mediaUrl: (0, import_pg_core.text)("media_url"),
      mediaType: (0, import_pg_core.text)("media_type"),
      // 'image' | 'video'
      caption: (0, import_pg_core.text)("caption"),
      privacy: (0, import_pg_core.text)("privacy").default("everyone"),
      // 'everyone' | 'friends' | 'custom'
      expiresAt: (0, import_pg_core.timestamp)("expires_at").notNull(),
      createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow()
    }, (table) => [
      (0, import_pg_core.index)("idx_statuses_user_id").on(table.userId),
      (0, import_pg_core.index)("idx_statuses_user_created").on(table.userId, table.createdAt),
      (0, import_pg_core.index)("idx_statuses_expires").on(table.expiresAt)
    ]);
    statusesRelations = (0, import_drizzle_orm.relations)(statuses, ({ one, many }) => ({
      user: one(users, {
        fields: [statuses.userId],
        references: [users.id]
      }),
      views: many(statusViews),
      allowedViewers: many(statusAllowedViewers)
    }));
    statusViews = (0, import_pg_core.pgTable)("status_views", {
      id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
      statusId: (0, import_pg_core.varchar)("status_id").notNull().references(() => statuses.id, { onDelete: "cascade" }),
      viewerId: (0, import_pg_core.varchar)("viewer_id").notNull().references(() => users.id, { onDelete: "cascade" }),
      viewedAt: (0, import_pg_core.timestamp)("viewed_at").defaultNow()
    }, (table) => [
      (0, import_pg_core.index)("idx_status_views_status_id").on(table.statusId),
      (0, import_pg_core.index)("idx_status_views_viewer_id").on(table.viewerId)
    ]);
    statusViewsRelations = (0, import_drizzle_orm.relations)(statusViews, ({ one }) => ({
      status: one(statuses, {
        fields: [statusViews.statusId],
        references: [statuses.id]
      }),
      viewer: one(users, {
        fields: [statusViews.viewerId],
        references: [users.id]
      })
    }));
    statusAllowedViewers = (0, import_pg_core.pgTable)("status_allowed_viewers", {
      id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
      statusId: (0, import_pg_core.varchar)("status_id").notNull().references(() => statuses.id, { onDelete: "cascade" }),
      userId: (0, import_pg_core.varchar)("user_id").notNull().references(() => users.id, { onDelete: "cascade" })
    });
    statusAllowedViewersRelations = (0, import_drizzle_orm.relations)(statusAllowedViewers, ({ one }) => ({
      status: one(statuses, {
        fields: [statusAllowedViewers.statusId],
        references: [statuses.id]
      }),
      user: one(users, {
        fields: [statusAllowedViewers.userId],
        references: [users.id]
      })
    }));
    friends = (0, import_pg_core.pgTable)("friends", {
      id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
      userId: (0, import_pg_core.varchar)("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
      friendId: (0, import_pg_core.varchar)("friend_id").notNull().references(() => users.id, { onDelete: "cascade" }),
      createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow()
    });
    friendsRelations = (0, import_drizzle_orm.relations)(friends, ({ one }) => ({
      user: one(users, {
        fields: [friends.userId],
        references: [users.id],
        relationName: "userFriends"
      }),
      friend: one(users, {
        fields: [friends.friendId],
        references: [users.id],
        relationName: "friendOf"
      })
    }));
    locationShares = (0, import_pg_core.pgTable)("location_shares", {
      id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
      userId: (0, import_pg_core.varchar)("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
      latitude: (0, import_pg_core.text)("latitude"),
      longitude: (0, import_pg_core.text)("longitude"),
      isSharing: (0, import_pg_core.boolean)("is_sharing").default(false),
      lastUpdated: (0, import_pg_core.timestamp)("last_updated").defaultNow()
    });
    locationSharesRelations = (0, import_drizzle_orm.relations)(locationShares, ({ one }) => ({
      user: one(users, {
        fields: [locationShares.userId],
        references: [users.id]
      })
    }));
    locationRequests = (0, import_pg_core.pgTable)("location_requests", {
      id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
      requesterId: (0, import_pg_core.varchar)("requester_id").notNull().references(() => users.id, { onDelete: "cascade" }),
      targetId: (0, import_pg_core.varchar)("target_id").notNull().references(() => users.id, { onDelete: "cascade" }),
      status: (0, import_pg_core.text)("status").default("pending"),
      // 'pending' | 'accepted' | 'declined'
      createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow()
    });
    locationRequestsRelations = (0, import_drizzle_orm.relations)(locationRequests, ({ one }) => ({
      requester: one(users, {
        fields: [locationRequests.requesterId],
        references: [users.id],
        relationName: "locationRequester"
      }),
      target: one(users, {
        fields: [locationRequests.targetId],
        references: [users.id],
        relationName: "locationTarget"
      })
    }));
    virtualNumbers = (0, import_pg_core.pgTable)("virtual_numbers", {
      id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
      phoneNumber: (0, import_pg_core.text)("phone_number").notNull().unique(),
      // E.164 format
      countryCode: (0, import_pg_core.text)("country_code").notNull(),
      // ISO 3166-1 alpha-2
      twilioSid: (0, import_pg_core.text)("twilio_sid").notNull(),
      // Twilio phone number SID
      capabilities: (0, import_pg_core.jsonb)("capabilities").$type(),
      status: (0, import_pg_core.text)("status").default("active"),
      // 'active' | 'released' | 'suspended'
      assignedUserId: (0, import_pg_core.varchar)("assigned_user_id").references(() => users.id, { onDelete: "set null" }),
      assignedAt: (0, import_pg_core.timestamp)("assigned_at"),
      releasedAt: (0, import_pg_core.timestamp)("released_at"),
      createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow()
    });
    virtualNumbersRelations = (0, import_drizzle_orm.relations)(virtualNumbers, ({ one }) => ({
      assignedUser: one(users, {
        fields: [virtualNumbers.assignedUserId],
        references: [users.id]
      })
    }));
    userBlocks = (0, import_pg_core.pgTable)("user_blocks", {
      id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
      blockerId: (0, import_pg_core.varchar)("blocker_id").notNull().references(() => users.id, { onDelete: "cascade" }),
      blockedId: (0, import_pg_core.varchar)("blocked_id").notNull().references(() => users.id, { onDelete: "cascade" }),
      createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow()
    });
    userBlocksRelations = (0, import_drizzle_orm.relations)(userBlocks, ({ one }) => ({
      blocker: one(users, {
        fields: [userBlocks.blockerId],
        references: [users.id],
        relationName: "blocker"
      }),
      blocked: one(users, {
        fields: [userBlocks.blockedId],
        references: [users.id],
        relationName: "blocked"
      })
    }));
    userReports = (0, import_pg_core.pgTable)("user_reports", {
      id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
      reporterId: (0, import_pg_core.varchar)("reporter_id").notNull().references(() => users.id, { onDelete: "cascade" }),
      reportedUserId: (0, import_pg_core.varchar)("reported_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
      reportedMessageId: (0, import_pg_core.varchar)("reported_message_id"),
      reason: (0, import_pg_core.text)("reason").notNull(),
      details: (0, import_pg_core.text)("details"),
      status: (0, import_pg_core.text)("status").notNull().default("pending"),
      reviewedAt: (0, import_pg_core.timestamp)("reviewed_at"),
      reviewedBy: (0, import_pg_core.varchar)("reviewed_by"),
      actionTaken: (0, import_pg_core.text)("action_taken"),
      // AI moderator verdict — populated within seconds of report creation.
      aiVerdict: (0, import_pg_core.text)("ai_verdict"),
      // 'approve' | 'decline' | 'insufficient_evidence' | 'error'
      aiVerdictReason: (0, import_pg_core.text)("ai_verdict_reason"),
      aiAction: (0, import_pg_core.text)("ai_action"),
      // 'none' | 'warn' | 'chat_limit' | 'suspend_24h' | 'suspend_7d' | 'suspend_30d' | 'suspend_permanent'
      aiSeverity: (0, import_pg_core.integer)("ai_severity"),
      aiConfidence: (0, import_pg_core.integer)("ai_confidence"),
      aiEvaluatedAt: (0, import_pg_core.timestamp)("ai_evaluated_at"),
      createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow()
    }, (table) => [
      (0, import_pg_core.index)("idx_user_reports_reporter").on(table.reporterId),
      (0, import_pg_core.index)("idx_user_reports_reported").on(table.reportedUserId),
      (0, import_pg_core.index)("idx_user_reports_status").on(table.status)
    ]);
    userReportsRelations = (0, import_drizzle_orm.relations)(userReports, ({ one }) => ({
      reporter: one(users, {
        fields: [userReports.reporterId],
        references: [users.id],
        relationName: "reporter"
      }),
      reported: one(users, {
        fields: [userReports.reportedUserId],
        references: [users.id],
        relationName: "reported"
      })
    }));
    userDevices = (0, import_pg_core.pgTable)("user_devices", {
      id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
      userId: (0, import_pg_core.varchar)("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
      deviceId: (0, import_pg_core.text)("device_id").notNull(),
      identityPublicKey: (0, import_pg_core.text)("identity_public_key").notNull(),
      signingPublicKey: (0, import_pg_core.text)("signing_public_key").notNull(),
      registeredAt: (0, import_pg_core.timestamp)("registered_at").defaultNow(),
      lastSeenAt: (0, import_pg_core.timestamp)("last_seen_at").defaultNow()
    }, (table) => [
      (0, import_pg_core.index)("idx_user_devices_user_id").on(table.userId),
      (0, import_pg_core.index)("idx_user_devices_device_id").on(table.deviceId)
    ]);
    userDevicesRelations = (0, import_drizzle_orm.relations)(userDevices, ({ one }) => ({
      user: one(users, { fields: [userDevices.userId], references: [users.id] })
    }));
    signedPrekeys = (0, import_pg_core.pgTable)("signed_prekeys", {
      id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
      userId: (0, import_pg_core.varchar)("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
      keyId: (0, import_pg_core.text)("key_id").notNull(),
      publicKey: (0, import_pg_core.text)("public_key").notNull(),
      signature: (0, import_pg_core.text)("signature").notNull(),
      createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow()
    }, (table) => [
      (0, import_pg_core.index)("idx_signed_prekeys_user_id").on(table.userId)
    ]);
    signedPrekeysRelations = (0, import_drizzle_orm.relations)(signedPrekeys, ({ one }) => ({
      user: one(users, { fields: [signedPrekeys.userId], references: [users.id] })
    }));
    oneTimePrekeys = (0, import_pg_core.pgTable)("one_time_prekeys", {
      id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
      userId: (0, import_pg_core.varchar)("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
      keyId: (0, import_pg_core.text)("key_id").notNull(),
      publicKey: (0, import_pg_core.text)("public_key").notNull(),
      used: (0, import_pg_core.boolean)("used").default(false),
      createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow()
    }, (table) => [
      (0, import_pg_core.index)("idx_one_time_prekeys_user_id").on(table.userId),
      (0, import_pg_core.index)("idx_one_time_prekeys_user_unused").on(table.userId, table.used)
    ]);
    oneTimePrekeysRelations = (0, import_drizzle_orm.relations)(oneTimePrekeys, ({ one }) => ({
      user: one(users, { fields: [oneTimePrekeys.userId], references: [users.id] })
    }));
    scheduledMessages = (0, import_pg_core.pgTable)("scheduled_messages", {
      id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
      conversationId: (0, import_pg_core.varchar)("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
      senderId: (0, import_pg_core.varchar)("sender_id").notNull().references(() => users.id, { onDelete: "cascade" }),
      receiverId: (0, import_pg_core.varchar)("receiver_id").references(() => users.id, { onDelete: "cascade" }),
      content: (0, import_pg_core.text)("content"),
      mediaUrl: (0, import_pg_core.text)("media_url"),
      mediaType: (0, import_pg_core.text)("media_type"),
      // 'image' | 'video' | 'gif' | 'voice'
      scheduledFor: (0, import_pg_core.timestamp)("scheduled_for").notNull(),
      status: (0, import_pg_core.text)("status").default("pending"),
      // 'pending' | 'sent' | 'failed' | 'cancelled'
      createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow()
    }, (table) => [
      (0, import_pg_core.index)("idx_scheduled_messages_sender").on(table.senderId),
      (0, import_pg_core.index)("idx_scheduled_messages_scheduled").on(table.scheduledFor)
    ]);
    scheduledMessagesRelations = (0, import_drizzle_orm.relations)(scheduledMessages, ({ one }) => ({
      conversation: one(conversations, {
        fields: [scheduledMessages.conversationId],
        references: [conversations.id]
      }),
      sender: one(users, {
        fields: [scheduledMessages.senderId],
        references: [users.id]
      }),
      receiver: one(users, {
        fields: [scheduledMessages.receiverId],
        references: [users.id]
      })
    }));
    encryptedBackups = (0, import_pg_core.pgTable)("encrypted_backups", {
      id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
      userId: (0, import_pg_core.varchar)("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
      deviceId: (0, import_pg_core.text)("device_id").notNull(),
      encryptedBlob: (0, import_pg_core.text)("encrypted_blob").notNull(),
      salt: (0, import_pg_core.text)("salt").notNull(),
      nonce: (0, import_pg_core.text)("nonce").notNull(),
      version: (0, import_pg_core.integer)("version").default(1),
      createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow(),
      updatedAt: (0, import_pg_core.timestamp)("updated_at").defaultNow()
    }, (table) => [
      (0, import_pg_core.index)("idx_encrypted_backups_user_id").on(table.userId)
    ]);
    insertUserSchema = (0, import_drizzle_zod.createInsertSchema)(users).pick({
      phoneNumber: true,
      displayName: true,
      avatarIndex: true
    });
    insertMessageSchema = (0, import_drizzle_zod.createInsertSchema)(messages).pick({
      conversationId: true,
      senderId: true,
      receiverId: true,
      content: true,
      mediaUrl: true,
      mediaType: true,
      isHidden: true
    });
  }
});

// server/db.ts
var import_node_postgres, import_pg, Pool, pool, db;
var init_db = __esm({
  "server/db.ts"() {
    "use strict";
    import_node_postgres = require("drizzle-orm/node-postgres");
    import_pg = __toESM(require("pg"));
    init_schema();
    ({ Pool } = import_pg.default);
    if (!process.env.DATABASE_URL) {
      throw new Error(
        "DATABASE_URL must be set. Did you forget to provision a database?"
      );
    }
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    db = (0, import_node_postgres.drizzle)(pool, { schema: schema_exports });
  }
});

// server/storage.ts
var import_drizzle_orm2, import_drizzle_orm3, DatabaseStorage, storage;
var init_storage = __esm({
  "server/storage.ts"() {
    "use strict";
    init_schema();
    import_drizzle_orm2 = require("drizzle-orm");
    init_db();
    import_drizzle_orm3 = require("drizzle-orm");
    DatabaseStorage = class {
      async getUser(id) {
        const [user] = await db.select().from(users).where((0, import_drizzle_orm3.eq)(users.id, id));
        return user || void 0;
      }
      async getUserByPhone(phoneNumber) {
        const [user] = await db.select().from(users).where((0, import_drizzle_orm3.eq)(users.phoneNumber, phoneNumber));
        return user || void 0;
      }
      async createUser(insertUser) {
        const [user] = await db.insert(users).values(insertUser).returning();
        return user;
      }
      async updateUser(id, data) {
        const [user] = await db.update(users).set(data).where((0, import_drizzle_orm3.eq)(users.id, id)).returning();
        return user || void 0;
      }
      async createVerificationCode(phoneNumber, code, expiresAt) {
        const [verificationCode] = await db.insert(verificationCodes).values({
          phoneNumber,
          code,
          expiresAt
        }).returning();
        return verificationCode;
      }
      async getVerificationCode(phoneNumber, code) {
        const [verificationCode] = await db.select().from(verificationCodes).where((0, import_drizzle_orm3.and)(
          (0, import_drizzle_orm3.eq)(verificationCodes.phoneNumber, phoneNumber),
          (0, import_drizzle_orm3.eq)(verificationCodes.code, code),
          (0, import_drizzle_orm3.eq)(verificationCodes.verified, false)
        ));
        return verificationCode || void 0;
      }
      async markCodeVerified(id) {
        await db.update(verificationCodes).set({ verified: true }).where((0, import_drizzle_orm3.eq)(verificationCodes.id, id));
      }
      async getConversations(userId, numberType = "personal") {
        const myParticipations = await db.select({
          conversationId: conversationParticipants.conversationId,
          unreadCount: conversationParticipants.unreadCount,
          convId: conversations.id,
          convNumberType: conversations.numberType,
          convLastMessageAt: conversations.lastMessageAt,
          convLastMessagePreview: conversations.lastMessagePreview,
          convCreatedAt: conversations.createdAt
        }).from(conversationParticipants).innerJoin(conversations, (0, import_drizzle_orm3.eq)(conversationParticipants.conversationId, conversations.id)).where((0, import_drizzle_orm3.eq)(conversationParticipants.userId, userId));
        if (myParticipations.length === 0) return [];
        const filteredParticipations = myParticipations.filter(
          (p) => (p.convNumberType || "personal") === numberType
        );
        if (filteredParticipations.length === 0) return [];
        const conversationIds = filteredParticipations.map((p) => p.conversationId);
        const allOtherParticipants = await db.select({
          conversationId: conversationParticipants.conversationId,
          participantUserId: conversationParticipants.userId,
          userId: users.id,
          phoneNumber: users.phoneNumber,
          displayName: users.displayName,
          avatarIndex: users.avatarIndex,
          avatarUrl: users.avatarUrl,
          isVip: users.isVip,
          lastSeen: users.lastSeen
        }).from(conversationParticipants).innerJoin(users, (0, import_drizzle_orm3.eq)(conversationParticipants.userId, users.id)).where((0, import_drizzle_orm3.and)(
          (0, import_drizzle_orm3.inArray)(conversationParticipants.conversationId, conversationIds),
          (0, import_drizzle_orm3.ne)(conversationParticipants.userId, userId)
        ));
        const otherUserMap = /* @__PURE__ */ new Map();
        for (const p of allOtherParticipants) {
          otherUserMap.set(p.conversationId, {
            id: p.userId,
            phoneNumber: p.phoneNumber,
            displayName: p.displayName,
            avatarIndex: p.avatarIndex,
            avatarUrl: p.avatarUrl,
            isVip: p.isVip,
            lastSeen: p.lastSeen
          });
        }
        const results = filteredParticipations.map((p) => ({
          id: p.convId,
          numberType: p.convNumberType,
          lastMessageAt: p.convLastMessageAt,
          lastMessagePreview: p.convLastMessagePreview,
          createdAt: p.convCreatedAt,
          otherUser: otherUserMap.get(p.conversationId) || null,
          unreadCount: p.unreadCount || 0
        }));
        return results.sort(
          (a, b) => new Date(b.lastMessageAt || 0).getTime() - new Date(a.lastMessageAt || 0).getTime()
        );
      }
      async getOrCreateConversation(userId1, userId2, numberType = "personal") {
        const user1Convs = await db.select().from(conversationParticipants).where((0, import_drizzle_orm3.eq)(conversationParticipants.userId, userId1));
        for (const conv of user1Convs) {
          const [user2Part] = await db.select().from(conversationParticipants).where((0, import_drizzle_orm3.and)(
            (0, import_drizzle_orm3.eq)(conversationParticipants.conversationId, conv.conversationId),
            (0, import_drizzle_orm3.eq)(conversationParticipants.userId, userId2)
          ));
          if (user2Part) {
            const [conversation] = await db.select().from(conversations).where((0, import_drizzle_orm3.eq)(conversations.id, conv.conversationId));
            const convNumberType = conversation?.numberType || "personal";
            if (convNumberType === numberType) {
              return conversation;
            }
          }
        }
        const [newConversation] = await db.insert(conversations).values({ numberType }).returning();
        await db.insert(conversationParticipants).values([
          { conversationId: newConversation.id, userId: userId1 },
          { conversationId: newConversation.id, userId: userId2 }
        ]);
        return newConversation;
      }
      async getConversationById(conversationId) {
        const [row] = await db.select().from(conversations).where((0, import_drizzle_orm3.eq)(conversations.id, conversationId)).limit(1);
        return row;
      }
      async getConversationMessages(conversationId, limit = 50, viewerUserId) {
        const messagesList = await db.select().from(messages).where((0, import_drizzle_orm3.eq)(messages.conversationId, conversationId)).orderBy((0, import_drizzle_orm3.desc)(messages.createdAt)).limit(limit);
        const filtered = viewerUserId ? messagesList.filter((m) => {
          const list = m.deletedForUserIds ?? [];
          return !list.includes(viewerUserId);
        }) : messagesList;
        return filtered.reverse();
      }
      async createMessage(insertMessage, extra) {
        const encVer = extra?.encryptionVersion ?? "v2-signal";
        let expiresAt = extra?.expiresAt ?? null;
        if (!expiresAt) {
          const [conv] = await db.select({ t: conversations.disappearingTimer }).from(conversations).where((0, import_drizzle_orm3.eq)(conversations.id, insertMessage.conversationId)).limit(1);
          if (conv?.t && conv.t > 0) {
            expiresAt = new Date(Date.now() + conv.t * 1e3);
          }
        }
        const [message] = await db.insert(messages).values({
          ...insertMessage,
          isEncrypted: true,
          encryptionVersion: encVer,
          e2eeInitEnvelope: extra?.e2eeInitEnvelope ?? null,
          replyToMessageId: extra?.replyToMessageId ?? null,
          replyToPreview: extra?.replyToPreview ?? null,
          replyToSenderId: extra?.replyToSenderId ?? null,
          forwarded: extra?.forwarded ?? false,
          forwardedFromUserId: extra?.forwardedFromUserId ?? null,
          expiresAt
        }).returning();
        let preview;
        if (encVer === "v2-signal" || encVer === "v1-nacl") {
          if (insertMessage.mediaType === "audio") preview = "Sent a voice message";
          else if (insertMessage.mediaType === "image") preview = "Sent a photo";
          else if (insertMessage.mediaType === "video") preview = "Sent a video";
          else preview = "Encrypted message";
        } else {
          if (!insertMessage.content) preview = insertMessage.mediaType ? `Sent a ${insertMessage.mediaType}` : "[Media]";
          else preview = insertMessage.content.substring(0, 50);
        }
        await db.update(conversations).set({ lastMessageAt: /* @__PURE__ */ new Date(), lastMessagePreview: preview }).where((0, import_drizzle_orm3.eq)(conversations.id, insertMessage.conversationId));
        if (insertMessage.receiverId) {
          await db.update(conversationParticipants).set({ unreadCount: import_drizzle_orm3.sql`${conversationParticipants.unreadCount} + 1` }).where((0, import_drizzle_orm3.and)(
            (0, import_drizzle_orm3.eq)(conversationParticipants.conversationId, insertMessage.conversationId),
            (0, import_drizzle_orm3.eq)(conversationParticipants.userId, insertMessage.receiverId)
          ));
        }
        return message;
      }
      async updateMessageStatus(id, status) {
        await db.update(messages).set({ status }).where((0, import_drizzle_orm3.eq)(messages.id, id));
      }
      // Mark a single message as delivered. Only the real receiver can do this.
      // Returns the updated message (with senderId so caller can notify the sender).
      async markMessageDelivered(messageId, receiverUserId) {
        const [existing] = await db.select().from(messages).where((0, import_drizzle_orm3.eq)(messages.id, messageId)).limit(1);
        if (!existing) return void 0;
        if (existing.receiverId !== receiverUserId) return void 0;
        if (existing.status === "read" || existing.status === "delivered") return existing;
        const [updated] = await db.update(messages).set({ status: "delivered", deliveredAt: /* @__PURE__ */ new Date() }).where((0, import_drizzle_orm3.and)((0, import_drizzle_orm3.eq)(messages.id, messageId), (0, import_drizzle_orm3.eq)(messages.receiverId, receiverUserId), (0, import_drizzle_orm3.eq)(messages.status, "sent"))).returning();
        return updated ?? existing;
      }
      // Mark a single message as read. Only the real receiver can do this.
      async markMessageRead(messageId, receiverUserId) {
        const [existing] = await db.select().from(messages).where((0, import_drizzle_orm3.eq)(messages.id, messageId)).limit(1);
        if (!existing) return void 0;
        if (existing.receiverId !== receiverUserId) return void 0;
        if (existing.status === "read") return existing;
        const now = /* @__PURE__ */ new Date();
        const [updated] = await db.update(messages).set({ status: "read", readAt: now, readBy: receiverUserId, deliveredAt: existing.deliveredAt ?? now }).where((0, import_drizzle_orm3.and)((0, import_drizzle_orm3.eq)(messages.id, messageId), (0, import_drizzle_orm3.eq)(messages.receiverId, receiverUserId))).returning();
        return updated ?? existing;
      }
      // Returns true if user is a participant in this conversation.
      async isConversationParticipant(conversationId, userId) {
        const [row] = await db.select({ id: conversationParticipants.userId }).from(conversationParticipants).where((0, import_drizzle_orm3.and)(
          (0, import_drizzle_orm3.eq)(conversationParticipants.conversationId, conversationId),
          (0, import_drizzle_orm3.eq)(conversationParticipants.userId, userId)
        )).limit(1);
        return !!row;
      }
      async addMessageReaction(messageId, userId, emoji) {
        const msg = await db.select().from(messages).where((0, import_drizzle_orm3.eq)(messages.id, messageId)).limit(1);
        if (!msg[0]) return void 0;
        const current = msg[0].reactions || {};
        const updated = { ...current };
        if (updated[emoji]?.includes(userId)) {
          updated[emoji] = updated[emoji].filter((id) => id !== userId);
          if (updated[emoji].length === 0) delete updated[emoji];
        } else {
          for (const key of Object.keys(updated)) {
            updated[key] = updated[key].filter((id) => id !== userId);
            if (updated[key].length === 0) delete updated[key];
          }
          updated[emoji] = [...updated[emoji] || [], userId];
        }
        const [result] = await db.update(messages).set({ reactions: updated }).where((0, import_drizzle_orm3.eq)(messages.id, messageId)).returning();
        return result;
      }
      async updateMessageTranscription(id, transcription) {
        await db.update(messages).set({ transcription }).where((0, import_drizzle_orm3.eq)(messages.id, id));
      }
      async getMessage(id) {
        const [message] = await db.select().from(messages).where((0, import_drizzle_orm3.eq)(messages.id, id));
        return message || void 0;
      }
      async deleteMessage(id) {
        await db.delete(messages).where((0, import_drizzle_orm3.eq)(messages.id, id));
      }
      // ─── Build 59: privacy + chat actions ────────────────────────────────────
      async updateUserPrivacy(userId, patch) {
        const set = {};
        if (typeof patch.readReceiptsEnabled === "boolean") set.readReceiptsEnabled = patch.readReceiptsEnabled;
        if (typeof patch.typingIndicatorsEnabled === "boolean") set.typingIndicatorsEnabled = patch.typingIndicatorsEnabled;
        if (typeof patch.showNotificationPreview === "boolean") set.showNotificationPreview = patch.showNotificationPreview;
        if (typeof patch.defaultDisappearingTimer === "number" && patch.defaultDisappearingTimer >= 0) {
          set.defaultDisappearingTimer = patch.defaultDisappearingTimer;
        }
        if (Object.keys(set).length === 0) return await this.getUser(userId);
        const [updated] = await db.update(users).set(set).where((0, import_drizzle_orm3.eq)(users.id, userId)).returning();
        return updated || void 0;
      }
      async setConversationTimer(conversationId, userId, seconds) {
        const isParticipant = await this.isConversationParticipant(conversationId, userId);
        if (!isParticipant) return false;
        if (seconds < 0) return false;
        await db.update(conversations).set({ disappearingTimer: seconds }).where((0, import_drizzle_orm3.eq)(conversations.id, conversationId));
        return true;
      }
      async pinMessage(conversationId, messageId, userId) {
        const isParticipant = await this.isConversationParticipant(conversationId, userId);
        if (!isParticipant) return false;
        const msg = await this.getMessage(messageId);
        if (!msg || msg.conversationId !== conversationId) return false;
        if (msg.deletedForEveryone) return false;
        if (msg.expiresAt && msg.expiresAt.getTime() <= Date.now()) return false;
        await db.update(conversations).set({ pinnedMessageId: messageId }).where((0, import_drizzle_orm3.eq)(conversations.id, conversationId));
        return true;
      }
      async unpinMessage(conversationId, userId) {
        const isParticipant = await this.isConversationParticipant(conversationId, userId);
        if (!isParticipant) return false;
        await db.update(conversations).set({ pinnedMessageId: null }).where((0, import_drizzle_orm3.eq)(conversations.id, conversationId));
        return true;
      }
      async deleteMessageForMe(messageId, userId) {
        const msg = await this.getMessage(messageId);
        if (!msg) return false;
        const isParticipant = await this.isConversationParticipant(msg.conversationId, userId);
        if (!isParticipant) return false;
        const current = msg.deletedForUserIds ?? [];
        if (current.includes(userId)) return true;
        const next = [...current, userId];
        await db.update(messages).set({ deletedForUserIds: next }).where((0, import_drizzle_orm3.eq)(messages.id, messageId));
        return true;
      }
      async deleteMessageForEveryone(messageId, userId) {
        const msg = await this.getMessage(messageId);
        if (!msg) return void 0;
        if (msg.senderId !== userId) return void 0;
        const created = msg.createdAt ? new Date(msg.createdAt).getTime() : 0;
        if (Date.now() - created > 60 * 60 * 1e3) return void 0;
        const [updated] = await db.update(messages).set({
          deletedForEveryone: true,
          content: null,
          mediaUrl: null,
          mediaType: null,
          e2eeInitEnvelope: null,
          replyToPreview: null
        }).where((0, import_drizzle_orm3.eq)(messages.id, messageId)).returning();
        await db.update(conversations).set({ pinnedMessageId: null }).where((0, import_drizzle_orm3.and)((0, import_drizzle_orm3.eq)(conversations.id, msg.conversationId), (0, import_drizzle_orm3.eq)(conversations.pinnedMessageId, messageId)));
        return updated;
      }
      async forwardMessage(originalMessageId, targetConversationId, senderId, receiverId) {
        const original = await this.getMessage(originalMessageId);
        if (!original) return null;
        if (original.deletedForEveryone) return null;
        const canSeeOriginal = await this.isConversationParticipant(original.conversationId, senderId);
        if (!canSeeOriginal) return null;
        const canSendInTarget = await this.isConversationParticipant(targetConversationId, senderId);
        if (!canSendInTarget) return null;
        return await this.createMessage(
          {
            conversationId: targetConversationId,
            senderId,
            receiverId: receiverId ?? null,
            content: original.content ?? null,
            mediaUrl: original.mediaUrl ?? null,
            mediaType: original.mediaType ?? null
          },
          {
            encryptionVersion: original.encryptionVersion ?? "v2-signal",
            e2eeInitEnvelope: null,
            // forwarded messages re-establish E2EE on the target session
            forwarded: true,
            forwardedFromUserId: original.senderId
          }
        );
      }
      async sweepExpiredMessages() {
        const now = /* @__PURE__ */ new Date();
        const expired = await db.select({ id: messages.id, conversationId: messages.conversationId }).from(messages).where((0, import_drizzle_orm3.and)(
          import_drizzle_orm3.sql`${messages.expiresAt} IS NOT NULL`,
          (0, import_drizzle_orm2.lt)(messages.expiresAt, now),
          (0, import_drizzle_orm3.eq)(messages.deletedForEveryone, false)
        )).limit(500);
        if (expired.length === 0) return [];
        const ids = expired.map((e) => e.id);
        await db.delete(messages).where((0, import_drizzle_orm3.inArray)(messages.id, ids));
        for (const e of expired) {
          await db.update(conversations).set({ pinnedMessageId: null }).where((0, import_drizzle_orm3.and)((0, import_drizzle_orm3.eq)(conversations.id, e.conversationId), (0, import_drizzle_orm3.eq)(conversations.pinnedMessageId, e.id)));
        }
        return expired;
      }
      // Bulk-mark all unread messages in a conversation as read for the given user.
      // Returns the rows that were actually updated so callers can broadcast a socket event.
      async markMessagesRead(conversationId, userId) {
        const now = /* @__PURE__ */ new Date();
        const updated = await db.update(messages).set({ status: "read", readAt: now, readBy: userId, deliveredAt: import_drizzle_orm3.sql`COALESCE(${messages.deliveredAt}, ${now})` }).where((0, import_drizzle_orm3.and)(
          (0, import_drizzle_orm3.eq)(messages.conversationId, conversationId),
          (0, import_drizzle_orm3.eq)(messages.receiverId, userId),
          (0, import_drizzle_orm3.ne)(messages.status, "read")
        )).returning({ id: messages.id, senderId: messages.senderId, readAt: messages.readAt });
        await db.update(conversationParticipants).set({ unreadCount: 0 }).where((0, import_drizzle_orm3.and)(
          (0, import_drizzle_orm3.eq)(conversationParticipants.conversationId, conversationId),
          (0, import_drizzle_orm3.eq)(conversationParticipants.userId, userId)
        ));
        return updated.map((r) => ({ id: r.id, senderId: r.senderId, readAt: r.readAt ?? now }));
      }
      async getCalls(userId) {
        return db.select().from(calls).where(
          (0, import_drizzle_orm3.or)(
            (0, import_drizzle_orm3.and)((0, import_drizzle_orm3.eq)(calls.callerId, userId), (0, import_drizzle_orm3.eq)(calls.hiddenForCaller, false)),
            (0, import_drizzle_orm3.and)((0, import_drizzle_orm3.eq)(calls.receiverId, userId), (0, import_drizzle_orm3.eq)(calls.hiddenForReceiver, false))
          )
        ).orderBy((0, import_drizzle_orm3.desc)(calls.createdAt)).limit(50);
      }
      async getCall(id) {
        const [call] = await db.select().from(calls).where((0, import_drizzle_orm3.eq)(calls.id, id));
        return call || void 0;
      }
      async createCall(callerId, receiverId, type) {
        const [call] = await db.insert(calls).values({
          callerId,
          receiverId,
          type,
          status: "pending"
        }).returning();
        return call;
      }
      async deleteCall(id, userId) {
        const [call] = await db.select().from(calls).where((0, import_drizzle_orm3.eq)(calls.id, id));
        if (!call) return false;
        if (call.callerId !== userId && call.receiverId !== userId) return false;
        if (call.callerId === userId) {
          await db.update(calls).set({ hiddenForCaller: true }).where((0, import_drizzle_orm3.eq)(calls.id, id));
        } else {
          await db.update(calls).set({ hiddenForReceiver: true }).where((0, import_drizzle_orm3.eq)(calls.id, id));
        }
        return true;
      }
      async clearCallHistory(userId) {
        await db.update(calls).set({ hiddenForCaller: true }).where((0, import_drizzle_orm3.eq)(calls.callerId, userId));
        await db.update(calls).set({ hiddenForReceiver: true }).where((0, import_drizzle_orm3.eq)(calls.receiverId, userId));
      }
      async updateCall(id, data) {
        const [call] = await db.update(calls).set(data).where((0, import_drizzle_orm3.eq)(calls.id, id)).returning();
        return call || void 0;
      }
      async getHiddenLockerItems(userId) {
        return db.select().from(hiddenLockerItems).where((0, import_drizzle_orm3.eq)(hiddenLockerItems.userId, userId)).orderBy((0, import_drizzle_orm3.desc)(hiddenLockerItems.createdAt));
      }
      async addToLocker(userId, data) {
        const [item] = await db.insert(hiddenLockerItems).values({
          userId,
          type: data.type || "message",
          content: data.content,
          mediaUrl: data.mediaUrl,
          messageId: data.messageId
        }).returning();
        return item;
      }
      async removeFromLocker(id, userId) {
        await db.delete(hiddenLockerItems).where((0, import_drizzle_orm3.and)((0, import_drizzle_orm3.eq)(hiddenLockerItems.id, id), (0, import_drizzle_orm3.eq)(hiddenLockerItems.userId, userId)));
      }
      async setLockerPin(userId, pin) {
        await db.update(users).set({ lockerPin: pin }).where((0, import_drizzle_orm3.eq)(users.id, userId));
      }
      async verifyLockerPin(userId, pin) {
        const [user] = await db.select().from(users).where((0, import_drizzle_orm3.eq)(users.id, userId));
        return user?.lockerPin === pin;
      }
      async resetLocker(userId) {
        await db.delete(hiddenLockerItems).where((0, import_drizzle_orm3.eq)(hiddenLockerItems.userId, userId));
        await db.update(users).set({ lockerPin: null }).where((0, import_drizzle_orm3.eq)(users.id, userId));
      }
      async getAnnouncementStats() {
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1e3);
        const [totalResult] = await db.select({ count: import_drizzle_orm3.sql`count(*)` }).from(users);
        const [activeResult] = await db.select({ count: import_drizzle_orm3.sql`count(*)` }).from(users).where(import_drizzle_orm3.sql`${users.lastSeen} > ${fiveMinutesAgo}`);
        const messages2 = [
          "Secure messaging for everyone",
          "Join thousands of secure users",
          "Your privacy matters to us",
          "End-to-end encrypted by default"
        ];
        const randomMessage = messages2[Math.floor(Math.random() * messages2.length)];
        return {
          activeUsers: Number(activeResult?.count || 0),
          totalUsers: Number(totalResult?.count || 0),
          recentMessage: randomMessage
        };
      }
      async addPendingContact(addedByUserId, phoneNumber) {
        const [existing] = await db.select().from(pendingContacts).where((0, import_drizzle_orm3.and)(
          (0, import_drizzle_orm3.eq)(pendingContacts.addedByUserId, addedByUserId),
          (0, import_drizzle_orm3.eq)(pendingContacts.pendingPhoneNumber, phoneNumber)
        ));
        if (existing) {
          return existing;
        }
        const [contact] = await db.insert(pendingContacts).values({
          addedByUserId,
          pendingPhoneNumber: phoneNumber
        }).returning();
        return contact;
      }
      async getPendingContactsForPhone(phoneNumber) {
        return db.select().from(pendingContacts).where((0, import_drizzle_orm3.and)(
          (0, import_drizzle_orm3.eq)(pendingContacts.pendingPhoneNumber, phoneNumber),
          (0, import_drizzle_orm3.eq)(pendingContacts.notified, false)
        ));
      }
      async markPendingContactsNotified(phoneNumber) {
        await db.update(pendingContacts).set({ notified: true }).where((0, import_drizzle_orm3.eq)(pendingContacts.pendingPhoneNumber, phoneNumber));
      }
      async createJoinNotification(userId, newUserPhone, newUserName) {
        const [notification] = await db.insert(joinNotifications).values({
          userId,
          newUserPhoneNumber: newUserPhone,
          newUserName: newUserName || null
        }).returning();
        return notification;
      }
      async getJoinNotifications(userId) {
        return db.select().from(joinNotifications).where((0, import_drizzle_orm3.eq)(joinNotifications.userId, userId)).orderBy((0, import_drizzle_orm3.desc)(joinNotifications.createdAt));
      }
      async markJoinNotificationRead(id) {
        await db.update(joinNotifications).set({ isRead: true }).where((0, import_drizzle_orm3.eq)(joinNotifications.id, id));
      }
      async processNewUserJoined(newUserPhone, newUserName) {
        const pendingContacts2 = await this.getPendingContactsForPhone(newUserPhone);
        for (const contact of pendingContacts2) {
          await this.createJoinNotification(contact.addedByUserId, newUserPhone, newUserName);
          const newUser = await this.getUserByPhone(newUserPhone);
          if (newUser) {
            await this.getOrCreateConversation(contact.addedByUserId, newUser.id);
          }
        }
        await this.markPendingContactsNotified(newUserPhone);
      }
      async getMessageRequests(userId) {
        const requests = await db.select().from(messageRequests).where((0, import_drizzle_orm3.and)(
          (0, import_drizzle_orm3.eq)(messageRequests.receiverId, userId),
          (0, import_drizzle_orm3.eq)(messageRequests.status, "pending")
        )).orderBy((0, import_drizzle_orm3.desc)(messageRequests.createdAt));
        const requestsWithSenders = await Promise.all(
          requests.map(async (req) => {
            const sender = await this.getUser(req.senderId);
            return {
              id: req.id,
              senderId: req.senderId,
              senderName: sender?.displayName || "Unknown",
              senderAvatarIndex: sender?.avatarIndex || 0,
              messagePreview: req.messagePreview,
              createdAt: req.createdAt,
              conversationId: req.conversationId
            };
          })
        );
        return requestsWithSenders;
      }
      async getPendingMessageRequestCount(userId) {
        const [result] = await db.select({ count: import_drizzle_orm3.sql`count(*)` }).from(messageRequests).where((0, import_drizzle_orm3.and)(
          (0, import_drizzle_orm3.eq)(messageRequests.receiverId, userId),
          (0, import_drizzle_orm3.eq)(messageRequests.status, "pending")
        ));
        return Number(result?.count || 0);
      }
      async createMessageRequest(senderId, receiverId, messagePreview) {
        const [existing] = await db.select().from(messageRequests).where((0, import_drizzle_orm3.and)(
          (0, import_drizzle_orm3.eq)(messageRequests.senderId, senderId),
          (0, import_drizzle_orm3.eq)(messageRequests.receiverId, receiverId),
          (0, import_drizzle_orm3.eq)(messageRequests.status, "pending")
        ));
        if (existing) {
          return existing;
        }
        const [request] = await db.insert(messageRequests).values({
          senderId,
          receiverId,
          messagePreview
        }).returning();
        return request;
      }
      async acceptMessageRequest(requestId, userId) {
        const [request] = await db.select().from(messageRequests).where((0, import_drizzle_orm3.and)(
          (0, import_drizzle_orm3.eq)(messageRequests.id, requestId),
          (0, import_drizzle_orm3.eq)(messageRequests.receiverId, userId)
        ));
        if (!request) return null;
        await db.update(messageRequests).set({ status: "accepted" }).where((0, import_drizzle_orm3.eq)(messageRequests.id, requestId));
        const conversation = await this.getOrCreateConversation(userId, request.senderId);
        return { conversationId: conversation.id };
      }
      async declineMessageRequest(requestId, userId) {
        await db.update(messageRequests).set({ status: "declined" }).where((0, import_drizzle_orm3.and)(
          (0, import_drizzle_orm3.eq)(messageRequests.id, requestId),
          (0, import_drizzle_orm3.eq)(messageRequests.receiverId, userId)
        ));
      }
      async findUsersByPhoneNumbers(phoneNumbers, excludeUserId) {
        if (phoneNumbers.length === 0) return [];
        const normalizedNumbers = phoneNumbers.map((p) => {
          const digits = p.replace(/\D/g, "");
          return digits.length > 10 ? digits.slice(-10) : digits;
        }).filter((p) => p.length >= 10);
        if (normalizedNumbers.length === 0) return [];
        const foundUsers = await db.select().from(users).where((0, import_drizzle_orm3.ne)(users.id, excludeUserId));
        return foundUsers.filter((user) => {
          const userDigits = user.phoneNumber.replace(/\D/g, "");
          const userLast10 = userDigits.length > 10 ? userDigits.slice(-10) : userDigits;
          return normalizedNumbers.some((n) => n === userLast10 || userDigits.endsWith(n) || n.endsWith(userDigits));
        });
      }
      async listAllUsers() {
        const allUsers = await db.select({
          id: users.id,
          phoneNumber: users.phoneNumber,
          displayName: users.displayName,
          createdAt: users.createdAt
        }).from(users).orderBy((0, import_drizzle_orm3.desc)(users.createdAt));
        return allUsers;
      }
      // Status methods
      async updateStoryPrivacy(userId, patch) {
        const set = {};
        if (typeof patch.storiesEnabled === "boolean") set.storiesEnabled = patch.storiesEnabled;
        if (typeof patch.storyPrivacyMode === "string") set.storyPrivacyMode = patch.storyPrivacyMode;
        if (Array.isArray(patch.storyPrivacyExceptIds)) set.storyPrivacyExceptIds = patch.storyPrivacyExceptIds;
        if (Array.isArray(patch.storyPrivacyOnlyIds)) set.storyPrivacyOnlyIds = patch.storyPrivacyOnlyIds;
        if (typeof patch.storyViewReceiptsEnabled === "boolean") set.storyViewReceiptsEnabled = patch.storyViewReceiptsEnabled;
        if (Object.keys(set).length === 0) {
          const [u] = await db.select().from(users).where((0, import_drizzle_orm3.eq)(users.id, userId));
          return u;
        }
        const [updated] = await db.update(users).set(set).where((0, import_drizzle_orm3.eq)(users.id, userId)).returning();
        return updated;
      }
      async createStatus(userId, data) {
        const [me] = await db.select().from(users).where((0, import_drizzle_orm3.eq)(users.id, userId));
        if (me && me.storiesEnabled === false) {
          throw new Error("STORIES_DISABLED");
        }
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1e3);
        const [status] = await db.insert(statuses).values({
          userId,
          mediaUrl: data.mediaUrl,
          mediaType: data.mediaType,
          caption: data.caption,
          privacy: data.privacy,
          expiresAt
        }).returning();
        if (data.privacy === "custom" && data.customViewers?.length) {
          await Promise.all(data.customViewers.map(
            (viewerId) => db.insert(statusAllowedViewers).values({ statusId: status.id, userId: viewerId })
          ));
        }
        return status;
      }
      // ---------- Story visibility helpers (shared by feed, view-record, and viewers list) ----------
      async _getStoryViewerContext(viewerId) {
        const [viewer] = await db.select().from(users).where((0, import_drizzle_orm3.eq)(users.id, viewerId));
        const out = await db.select().from(friends).where((0, import_drizzle_orm3.eq)(friends.userId, viewerId));
        const inn = await db.select().from(friends).where((0, import_drizzle_orm3.eq)(friends.friendId, viewerId));
        const outSet = new Set(out.map((f) => f.friendId));
        const inSet = new Set(inn.map((f) => f.userId));
        const mutualFriendIds = new Set(Array.from(outSet).filter((id) => inSet.has(id)));
        const blocksOut = await db.select().from(userBlocks).where((0, import_drizzle_orm3.eq)(userBlocks.blockerId, viewerId));
        const blocksIn = await db.select().from(userBlocks).where((0, import_drizzle_orm3.eq)(userBlocks.blockedId, viewerId));
        const blockedSet = /* @__PURE__ */ new Set([
          ...blocksOut.map((b) => b.blockedId),
          ...blocksIn.map((b) => b.blockerId)
        ]);
        return { viewer, mutualFriendIds, blockedSet };
      }
      _canViewerSeeStatusSync(viewerId, status, poster, ctx) {
        if (!ctx.viewer || ctx.viewer.storiesEnabled === false) return false;
        if (!poster) return false;
        if (poster.storiesEnabled === false) return false;
        if (status.userId === viewerId) return false;
        if (status.expiresAt && status.expiresAt <= /* @__PURE__ */ new Date()) return false;
        if (ctx.blockedSet.has(status.userId)) return false;
        const mode = poster.storyPrivacyMode || "everyone";
        const exceptIds = Array.isArray(poster.storyPrivacyExceptIds) ? poster.storyPrivacyExceptIds : [];
        const onlyIds = Array.isArray(poster.storyPrivacyOnlyIds) ? poster.storyPrivacyOnlyIds : [];
        let allowed = false;
        if (mode === "everyone") {
          allowed = true;
        } else if (mode === "contacts") {
          allowed = ctx.mutualFriendIds.has(status.userId);
        } else if (mode === "except") {
          allowed = ctx.mutualFriendIds.has(status.userId) && !exceptIds.includes(viewerId);
        } else if (mode === "only") {
          allowed = onlyIds.includes(viewerId);
        }
        if (!allowed) return false;
        if (status.privacy === "friends" && !ctx.mutualFriendIds.has(status.userId)) return false;
        return true;
      }
      async getStatuses(viewerId) {
        const ctx = await this._getStoryViewerContext(viewerId);
        if (!ctx.viewer || ctx.viewer.storiesEnabled === false) return [];
        const now = /* @__PURE__ */ new Date();
        const allStatuses = await db.select().from(statuses).where(import_drizzle_orm3.sql`${statuses.expiresAt} > ${now}`).orderBy((0, import_drizzle_orm3.desc)(statuses.createdAt));
        const posterIds = Array.from(new Set(allStatuses.map((s) => s.userId).filter((id) => id !== viewerId)));
        const posterRows = posterIds.length ? await db.select().from(users).where((0, import_drizzle_orm3.inArray)(users.id, posterIds)) : [];
        const posterMap = new Map(posterRows.map((u) => [u.id, u]));
        const result = [];
        for (const status of allStatuses) {
          const poster = posterMap.get(status.userId);
          if (!this._canViewerSeeStatusSync(viewerId, status, poster, ctx)) continue;
          if (status.privacy === "custom") {
            const [row] = await db.select().from(statusAllowedViewers).where((0, import_drizzle_orm3.and)(
              (0, import_drizzle_orm3.eq)(statusAllowedViewers.statusId, status.id),
              (0, import_drizzle_orm3.eq)(statusAllowedViewers.userId, viewerId)
            ));
            if (!row) continue;
          }
          result.push({ ...status, user: { id: poster.id, displayName: poster.displayName, avatarUrl: poster.avatarUrl } });
        }
        return result;
      }
      async getMyStatuses(userId) {
        const now = /* @__PURE__ */ new Date();
        const myStatuses = await db.select().from(statuses).where((0, import_drizzle_orm3.and)((0, import_drizzle_orm3.eq)(statuses.userId, userId), import_drizzle_orm3.sql`${statuses.expiresAt} > ${now}`)).orderBy((0, import_drizzle_orm3.desc)(statuses.createdAt));
        return Promise.all(myStatuses.map(async (status) => {
          const views = await db.select().from(statusViews).where((0, import_drizzle_orm3.eq)(statusViews.statusId, status.id));
          return { ...status, viewCount: views.length };
        }));
      }
      async viewStatus(statusId, viewerId) {
        const [status] = await db.select().from(statuses).where((0, import_drizzle_orm3.eq)(statuses.id, statusId));
        if (!status) throw new Error("STATUS_NOT_FOUND");
        if (status.userId === viewerId) return;
        const [owner] = await db.select().from(users).where((0, import_drizzle_orm3.eq)(users.id, status.userId));
        const ctx = await this._getStoryViewerContext(viewerId);
        if (!this._canViewerSeeStatusSync(viewerId, status, owner, ctx)) return;
        if (status.privacy === "custom") {
          const [row] = await db.select().from(statusAllowedViewers).where((0, import_drizzle_orm3.and)(
            (0, import_drizzle_orm3.eq)(statusAllowedViewers.statusId, status.id),
            (0, import_drizzle_orm3.eq)(statusAllowedViewers.userId, viewerId)
          ));
          if (!row) return;
        }
        if (!ctx.viewer || ctx.viewer.storyViewReceiptsEnabled === false) return;
        if (!owner || owner.storyViewReceiptsEnabled === false) return;
        const [existing] = await db.select().from(statusViews).where((0, import_drizzle_orm3.and)((0, import_drizzle_orm3.eq)(statusViews.statusId, statusId), (0, import_drizzle_orm3.eq)(statusViews.viewerId, viewerId)));
        if (!existing) {
          await db.insert(statusViews).values({ statusId, viewerId });
        }
      }
      async deleteStatus(statusId, userId) {
        const [status] = await db.select().from(statuses).where((0, import_drizzle_orm3.eq)(statuses.id, statusId));
        if (!status) throw new Error("STATUS_NOT_FOUND");
        if (status.userId !== userId) throw new Error("NOT_AUTHORIZED");
        await db.delete(statuses).where((0, import_drizzle_orm3.eq)(statuses.id, statusId));
      }
      // Friends methods
      async getFriends(userId) {
        const userFriends = await db.select().from(friends).where((0, import_drizzle_orm3.eq)(friends.userId, userId));
        return Promise.all(userFriends.map(async (f) => {
          const [friend] = await db.select().from(users).where((0, import_drizzle_orm3.eq)(users.id, f.friendId));
          return { id: friend?.id, displayName: friend?.displayName, avatarUrl: friend?.avatarUrl };
        }));
      }
      async addFriend(userId, friendId) {
        const [existing] = await db.select().from(friends).where((0, import_drizzle_orm3.and)((0, import_drizzle_orm3.eq)(friends.userId, userId), (0, import_drizzle_orm3.eq)(friends.friendId, friendId)));
        if (existing) return existing;
        const [friend] = await db.insert(friends).values({ userId, friendId }).returning();
        return friend;
      }
      async removeFriend(userId, friendId) {
        await db.delete(friends).where((0, import_drizzle_orm3.and)((0, import_drizzle_orm3.eq)(friends.userId, userId), (0, import_drizzle_orm3.eq)(friends.friendId, friendId)));
      }
      // Location methods (VIP only)
      async getLocationShare(userId) {
        const [share] = await db.select().from(locationShares).where((0, import_drizzle_orm3.eq)(locationShares.userId, userId));
        return share;
      }
      async updateLocationShare(userId, data) {
        const [existing] = await db.select().from(locationShares).where((0, import_drizzle_orm3.eq)(locationShares.userId, userId));
        if (existing) {
          const [updated] = await db.update(locationShares).set({ ...data, lastUpdated: /* @__PURE__ */ new Date() }).where((0, import_drizzle_orm3.eq)(locationShares.userId, userId)).returning();
          return updated;
        }
        const [created] = await db.insert(locationShares).values({
          userId,
          latitude: data.latitude,
          longitude: data.longitude,
          isSharing: data.isSharing ?? false
        }).returning();
        return created;
      }
      async getLocationRequests(userId) {
        const requests = await db.select().from(locationRequests).where((0, import_drizzle_orm3.eq)(locationRequests.targetId, userId)).orderBy((0, import_drizzle_orm3.desc)(locationRequests.createdAt));
        return Promise.all(requests.map(async (r) => {
          const [requester] = await db.select().from(users).where((0, import_drizzle_orm3.eq)(users.id, r.requesterId));
          return { ...r, requester: { id: requester?.id, displayName: requester?.displayName, avatarUrl: requester?.avatarUrl } };
        }));
      }
      async createLocationRequest(requesterId, targetId) {
        const [existing] = await db.select().from(locationRequests).where((0, import_drizzle_orm3.and)(
          (0, import_drizzle_orm3.eq)(locationRequests.requesterId, requesterId),
          (0, import_drizzle_orm3.eq)(locationRequests.targetId, targetId),
          (0, import_drizzle_orm3.eq)(locationRequests.status, "pending")
        ));
        if (existing) return existing;
        const [request] = await db.insert(locationRequests).values({ requesterId, targetId }).returning();
        return request;
      }
      async respondToLocationRequest(requestId, userId, accept) {
        await db.update(locationRequests).set({ status: accept ? "accepted" : "declined" }).where((0, import_drizzle_orm3.and)((0, import_drizzle_orm3.eq)(locationRequests.id, requestId), (0, import_drizzle_orm3.eq)(locationRequests.targetId, userId)));
      }
      async getLocationRequestById(requestId) {
        const [request] = await db.select().from(locationRequests).where((0, import_drizzle_orm3.eq)(locationRequests.id, requestId));
        return request;
      }
      async getApprovedFriendIds(userId) {
        const acceptedRequests = await db.select().from(locationRequests).where((0, import_drizzle_orm3.and)((0, import_drizzle_orm3.eq)(locationRequests.targetId, userId), (0, import_drizzle_orm3.eq)(locationRequests.status, "accepted")));
        const acceptedByMe = await db.select().from(locationRequests).where((0, import_drizzle_orm3.and)((0, import_drizzle_orm3.eq)(locationRequests.requesterId, userId), (0, import_drizzle_orm3.eq)(locationRequests.status, "accepted")));
        const friendIds = [...acceptedRequests.map((r) => r.requesterId), ...acceptedByMe.map((r) => r.targetId)];
        return [...new Set(friendIds)];
      }
      async getFriendLocations(userId) {
        const acceptedRequests = await db.select().from(locationRequests).where((0, import_drizzle_orm3.and)((0, import_drizzle_orm3.eq)(locationRequests.targetId, userId), (0, import_drizzle_orm3.eq)(locationRequests.status, "accepted")));
        const acceptedByMe = await db.select().from(locationRequests).where((0, import_drizzle_orm3.and)((0, import_drizzle_orm3.eq)(locationRequests.requesterId, userId), (0, import_drizzle_orm3.eq)(locationRequests.status, "accepted")));
        const friendIds = [...acceptedRequests.map((r) => r.requesterId), ...acceptedByMe.map((r) => r.targetId)];
        const uniqueFriendIds = [...new Set(friendIds)];
        if (uniqueFriendIds.length === 0) return [];
        const locations = await db.select().from(locationShares).where((0, import_drizzle_orm3.and)(
          (0, import_drizzle_orm3.inArray)(locationShares.userId, uniqueFriendIds),
          (0, import_drizzle_orm3.eq)(locationShares.isSharing, true)
        ));
        return Promise.all(locations.map(async (loc) => {
          const [user] = await db.select().from(users).where((0, import_drizzle_orm3.eq)(users.id, loc.userId));
          return { ...loc, user: { id: user?.id, displayName: user?.displayName, avatarUrl: user?.avatarUrl } };
        }));
      }
      // Virtual Number Management
      async getVirtualNumber(id) {
        const [number] = await db.select().from(virtualNumbers).where((0, import_drizzle_orm3.eq)(virtualNumbers.id, id));
        return number || void 0;
      }
      async getVirtualNumberByPhone(phoneNumber) {
        const [number] = await db.select().from(virtualNumbers).where((0, import_drizzle_orm3.eq)(virtualNumbers.phoneNumber, phoneNumber));
        return number || void 0;
      }
      async createVirtualNumber(data) {
        const [number] = await db.insert(virtualNumbers).values({
          phoneNumber: data.phoneNumber,
          countryCode: data.countryCode,
          twilioSid: data.twilioSid,
          capabilities: data.capabilities,
          status: "active",
          assignedUserId: data.assignedUserId,
          assignedAt: /* @__PURE__ */ new Date()
        }).returning();
        return number;
      }
      async releaseVirtualNumber(id) {
        await db.update(virtualNumbers).set({
          status: "released",
          assignedUserId: null,
          releasedAt: /* @__PURE__ */ new Date()
        }).where((0, import_drizzle_orm3.eq)(virtualNumbers.id, id));
      }
      // Status viewers
      async getStatusViewers(statusId, ownerId) {
        const [status] = await db.select().from(statuses).where((0, import_drizzle_orm3.eq)(statuses.id, statusId));
        if (!status || status.userId !== ownerId) {
          return [];
        }
        if (status.expiresAt && status.expiresAt <= /* @__PURE__ */ new Date()) {
          return [];
        }
        const [owner] = await db.select().from(users).where((0, import_drizzle_orm3.eq)(users.id, ownerId));
        if (!owner || owner.storyViewReceiptsEnabled === false) {
          return [];
        }
        const views = await db.select().from(statusViews).where((0, import_drizzle_orm3.eq)(statusViews.statusId, statusId));
        const viewerIds = views.map((v) => v.viewerId);
        if (viewerIds.length === 0) return [];
        const viewerRows = await db.select().from(users).where((0, import_drizzle_orm3.inArray)(users.id, viewerIds));
        const viewerMap = new Map(viewerRows.map((u) => [u.id, u]));
        const out = [];
        for (const view of views) {
          const viewer = viewerMap.get(view.viewerId);
          if (!viewer || viewer.storyViewReceiptsEnabled === false) continue;
          out.push({
            id: view.id,
            viewedAt: view.viewedAt,
            viewer: { id: viewer.id, displayName: viewer.displayName, avatarUrl: viewer.avatarUrl }
          });
        }
        return out;
      }
      // User blocking methods
      async blockUser(blockerId, blockedId) {
        const [existing] = await db.select().from(userBlocks).where((0, import_drizzle_orm3.and)((0, import_drizzle_orm3.eq)(userBlocks.blockerId, blockerId), (0, import_drizzle_orm3.eq)(userBlocks.blockedId, blockedId)));
        if (existing) return existing;
        const [block] = await db.insert(userBlocks).values({ blockerId, blockedId }).returning();
        return block;
      }
      async unblockUser(blockerId, blockedId) {
        await db.delete(userBlocks).where((0, import_drizzle_orm3.and)((0, import_drizzle_orm3.eq)(userBlocks.blockerId, blockerId), (0, import_drizzle_orm3.eq)(userBlocks.blockedId, blockedId)));
      }
      async isBlocked(blockerId, blockedId) {
        const [block] = await db.select().from(userBlocks).where((0, import_drizzle_orm3.and)((0, import_drizzle_orm3.eq)(userBlocks.blockerId, blockerId), (0, import_drizzle_orm3.eq)(userBlocks.blockedId, blockedId)));
        return !!block;
      }
      async getBlockedUsers(userId) {
        const blocks = await db.select().from(userBlocks).where((0, import_drizzle_orm3.eq)(userBlocks.blockerId, userId));
        return Promise.all(blocks.map(async (block) => {
          const [user] = await db.select().from(users).where((0, import_drizzle_orm3.eq)(users.id, block.blockedId));
          return {
            id: block.id,
            blockedAt: block.createdAt,
            user: {
              id: user?.id,
              displayName: user?.displayName,
              avatarUrl: user?.avatarUrl,
              phoneNumber: user?.phoneNumber
            }
          };
        }));
      }
      async isBlockedByEither(userId1, userId2) {
        const [block] = await db.select().from(userBlocks).where((0, import_drizzle_orm3.or)(
          (0, import_drizzle_orm3.and)((0, import_drizzle_orm3.eq)(userBlocks.blockerId, userId1), (0, import_drizzle_orm3.eq)(userBlocks.blockedId, userId2)),
          (0, import_drizzle_orm3.and)((0, import_drizzle_orm3.eq)(userBlocks.blockerId, userId2), (0, import_drizzle_orm3.eq)(userBlocks.blockedId, userId1))
        ));
        return !!block;
      }
      // User reporting (App Store Guideline 1.2 — UGC abuse moderation)
      async createUserReport(data) {
        const [report] = await db.insert(userReports).values(data).returning();
        return report;
      }
      async hasRecentReport(reporterId, reportedUserId, reportedMessageId) {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1e3);
        const conditions = [
          (0, import_drizzle_orm3.eq)(userReports.reporterId, reporterId),
          (0, import_drizzle_orm3.eq)(userReports.reportedUserId, reportedUserId),
          (0, import_drizzle_orm2.gt)(userReports.createdAt, oneHourAgo)
        ];
        if (reportedMessageId) {
          conditions.push((0, import_drizzle_orm3.eq)(userReports.reportedMessageId, reportedMessageId));
        }
        const [recent] = await db.select().from(userReports).where((0, import_drizzle_orm3.and)(...conditions));
        return !!recent;
      }
      async listReports(filter) {
        const limit = Math.min(filter.limit ?? 100, 500);
        const conditions = filter.status ? [(0, import_drizzle_orm3.eq)(userReports.status, filter.status)] : [];
        const rows = await db.select().from(userReports).where(conditions.length ? (0, import_drizzle_orm3.and)(...conditions) : void 0).orderBy((0, import_drizzle_orm3.desc)(userReports.createdAt)).limit(limit);
        if (!rows.length) return [];
        const userIds = Array.from(/* @__PURE__ */ new Set([
          ...rows.map((r) => r.reporterId),
          ...rows.map((r) => r.reportedUserId)
        ]));
        const userRows = await db.select({
          id: users.id,
          phoneNumber: users.phoneNumber,
          displayName: users.displayName,
          isSuspended: users.isSuspended
        }).from(users).where((0, import_drizzle_orm3.inArray)(users.id, userIds));
        const byId = new Map(userRows.map((u) => [u.id, u]));
        return rows.map((r) => ({
          ...r,
          reporter: byId.get(r.reporterId) ? { id: r.reporterId, phoneNumber: byId.get(r.reporterId).phoneNumber, displayName: byId.get(r.reporterId).displayName } : null,
          reported: byId.get(r.reportedUserId) ? {
            id: r.reportedUserId,
            phoneNumber: byId.get(r.reportedUserId).phoneNumber,
            displayName: byId.get(r.reportedUserId).displayName,
            isSuspended: byId.get(r.reportedUserId).isSuspended
          } : null
        }));
      }
      async getReport(id) {
        const [row] = await db.select().from(userReports).where((0, import_drizzle_orm3.eq)(userReports.id, id));
        return row || void 0;
      }
      async updateReport(id, patch) {
        const [row] = await db.update(userReports).set(patch).where((0, import_drizzle_orm3.eq)(userReports.id, id)).returning();
        return row || void 0;
      }
      async suspendUser(userId, reason) {
        const cur = await db.select({ tv: users.tokenVersion }).from(users).where((0, import_drizzle_orm3.eq)(users.id, userId));
        const nextTv = (cur[0]?.tv ?? 0) + 1;
        await db.update(users).set({
          isSuspended: true,
          suspendedAt: /* @__PURE__ */ new Date(),
          suspensionReason: reason,
          tokenVersion: nextTv
        }).where((0, import_drizzle_orm3.eq)(users.id, userId));
      }
      async unsuspendUser(userId) {
        await db.update(users).set({
          isSuspended: false,
          suspendedAt: null,
          suspensionReason: null
        }).where((0, import_drizzle_orm3.eq)(users.id, userId));
      }
      // Archive/Unarchive conversation
      async archiveConversation(conversationId, userId) {
        await db.update(conversationParticipants).set({ isArchived: true }).where((0, import_drizzle_orm3.and)(
          (0, import_drizzle_orm3.eq)(conversationParticipants.conversationId, conversationId),
          (0, import_drizzle_orm3.eq)(conversationParticipants.userId, userId)
        ));
      }
      async unarchiveConversation(conversationId, userId) {
        await db.update(conversationParticipants).set({ isArchived: false }).where((0, import_drizzle_orm3.and)(
          (0, import_drizzle_orm3.eq)(conversationParticipants.conversationId, conversationId),
          (0, import_drizzle_orm3.eq)(conversationParticipants.userId, userId)
        ));
      }
      // Update chat folder
      async updateChatFolder(conversationId, userId, folder) {
        await db.update(conversationParticipants).set({ folder }).where((0, import_drizzle_orm3.and)(
          (0, import_drizzle_orm3.eq)(conversationParticipants.conversationId, conversationId),
          (0, import_drizzle_orm3.eq)(conversationParticipants.userId, userId)
        ));
      }
      // Scheduled messages
      async getScheduledMessages(userId) {
        const result = await db.select().from(scheduledMessages).where((0, import_drizzle_orm3.and)(
          (0, import_drizzle_orm3.eq)(scheduledMessages.senderId, userId),
          (0, import_drizzle_orm3.eq)(scheduledMessages.status, "pending")
        )).orderBy(scheduledMessages.scheduledFor);
        return result;
      }
      async createScheduledMessage(data) {
        const [scheduled] = await db.insert(scheduledMessages).values(data).returning();
        return scheduled;
      }
      async cancelScheduledMessage(id, userId) {
        await db.update(scheduledMessages).set({ status: "cancelled" }).where((0, import_drizzle_orm3.and)(
          (0, import_drizzle_orm3.eq)(scheduledMessages.id, id),
          (0, import_drizzle_orm3.eq)(scheduledMessages.senderId, userId)
        ));
      }
      async getPendingScheduledMessages() {
        const now = /* @__PURE__ */ new Date();
        const result = await db.select().from(scheduledMessages).where((0, import_drizzle_orm3.and)(
          (0, import_drizzle_orm3.eq)(scheduledMessages.status, "pending"),
          (0, import_drizzle_orm2.lt)(scheduledMessages.scheduledFor, now)
        ));
        return result;
      }
      async markScheduledMessageSent(id) {
        await db.update(scheduledMessages).set({ status: "sent" }).where((0, import_drizzle_orm3.eq)(scheduledMessages.id, id));
      }
      // Search messages in conversation
      async searchMessages(conversationId, query) {
        const result = await db.select().from(messages).where((0, import_drizzle_orm3.and)(
          (0, import_drizzle_orm3.eq)(messages.conversationId, conversationId),
          (0, import_drizzle_orm3.eq)(messages.isHidden, false),
          (0, import_drizzle_orm2.ilike)(messages.content, `%${query}%`)
        )).orderBy((0, import_drizzle_orm3.desc)(messages.createdAt)).limit(50);
        return result;
      }
      // Check if user can see another user's last seen
      async canSeeLastSeen(viewerId, targetId) {
        const target = await this.getUser(targetId);
        if (!target) return false;
        const privacy = target.lastSeenPrivacy || "everyone";
        if (privacy === "everyone") return true;
        if (privacy === "nobody") return false;
        if (privacy === "contacts") {
          const [friend] = await db.select().from(friends).where((0, import_drizzle_orm3.or)(
            (0, import_drizzle_orm3.and)((0, import_drizzle_orm3.eq)(friends.userId, targetId), (0, import_drizzle_orm3.eq)(friends.friendId, viewerId)),
            (0, import_drizzle_orm3.and)((0, import_drizzle_orm3.eq)(friends.userId, viewerId), (0, import_drizzle_orm3.eq)(friends.friendId, targetId))
          ));
          return !!friend;
        }
        if (privacy === "vip") {
          const viewer = await this.getUser(viewerId);
          return viewer?.isVip === true;
        }
        return true;
      }
      // ─── E2EE: Device registration ──────────────────────────────────────────
      async registerDevice(userId, deviceId, identityPublicKey, signingPublicKey) {
        const existing = await db.select().from(userDevices).where((0, import_drizzle_orm3.and)((0, import_drizzle_orm3.eq)(userDevices.userId, userId), (0, import_drizzle_orm3.eq)(userDevices.deviceId, deviceId)));
        if (existing.length > 0) {
          const [updated] = await db.update(userDevices).set({ identityPublicKey, signingPublicKey, lastSeenAt: /* @__PURE__ */ new Date() }).where((0, import_drizzle_orm3.and)((0, import_drizzle_orm3.eq)(userDevices.userId, userId), (0, import_drizzle_orm3.eq)(userDevices.deviceId, deviceId))).returning();
          return updated;
        }
        const [device] = await db.insert(userDevices).values({ userId, deviceId, identityPublicKey, signingPublicKey }).returning();
        return device;
      }
      async getDeviceForUser(userId) {
        const [device] = await db.select().from(userDevices).where((0, import_drizzle_orm3.eq)(userDevices.userId, userId)).orderBy((0, import_drizzle_orm3.desc)(userDevices.lastSeenAt)).limit(1);
        return device;
      }
      // ─── E2EE: Signed prekeys ───────────────────────────────────────────────
      async upsertSignedPrekey(userId, keyId, publicKey, signature) {
        await db.delete(signedPrekeys).where((0, import_drizzle_orm3.eq)(signedPrekeys.userId, userId));
        const [row] = await db.insert(signedPrekeys).values({ userId, keyId, publicKey, signature }).returning();
        return row;
      }
      async getSignedPrekey(userId) {
        const [row] = await db.select().from(signedPrekeys).where((0, import_drizzle_orm3.eq)(signedPrekeys.userId, userId)).orderBy((0, import_drizzle_orm3.desc)(signedPrekeys.createdAt)).limit(1);
        return row;
      }
      // ─── E2EE: One-time prekeys ─────────────────────────────────────────────
      async addOneTimePrekeys(userId, keys) {
        if (keys.length === 0) return;
        await db.insert(oneTimePrekeys).values(keys.map((k) => ({ userId, keyId: k.keyId, publicKey: k.publicKey })));
      }
      async consumeOneTimePrekey(userId) {
        const [row] = await db.select().from(oneTimePrekeys).where((0, import_drizzle_orm3.and)((0, import_drizzle_orm3.eq)(oneTimePrekeys.userId, userId), (0, import_drizzle_orm3.eq)(oneTimePrekeys.used, false))).orderBy(oneTimePrekeys.createdAt).limit(1);
        if (!row) return void 0;
        await db.update(oneTimePrekeys).set({ used: true }).where((0, import_drizzle_orm3.eq)(oneTimePrekeys.id, row.id));
        return row;
      }
      async countUnusedOneTimePrekeys(userId) {
        const rows = await db.select().from(oneTimePrekeys).where((0, import_drizzle_orm3.and)((0, import_drizzle_orm3.eq)(oneTimePrekeys.userId, userId), (0, import_drizzle_orm3.eq)(oneTimePrekeys.used, false)));
        return rows.length;
      }
      // ─── E2EE: Prekey bundle ────────────────────────────────────────────────
      async getPreKeyBundle(userId) {
        const device = await this.getDeviceForUser(userId);
        if (!device) return null;
        const spk = await this.getSignedPrekey(userId);
        if (!spk) return null;
        const otpk = await this.consumeOneTimePrekey(userId);
        return {
          userId,
          identityPublicKey: device.identityPublicKey,
          signingPublicKey: device.signingPublicKey,
          signedPreKey: { id: spk.keyId, publicKey: spk.publicKey, signature: spk.signature },
          oneTimePreKey: otpk ? { id: otpk.keyId, publicKey: otpk.publicKey } : null
        };
      }
      // ─── E2EE: Device management ────────────────────────────────────────────
      async listDevices(userId) {
        return db.select().from(userDevices).where((0, import_drizzle_orm3.eq)(userDevices.userId, userId)).orderBy((0, import_drizzle_orm3.desc)(userDevices.lastSeenAt));
      }
      async revokeDevice(userId, deviceId) {
        const result = await db.delete(userDevices).where((0, import_drizzle_orm3.and)((0, import_drizzle_orm3.eq)(userDevices.userId, userId), (0, import_drizzle_orm3.eq)(userDevices.deviceId, deviceId))).returning();
        return result.length > 0;
      }
      // ─── E2EE: Encrypted backups ─────────────────────────────────────────────
      async upsertBackup(userId, deviceId, encryptedBlob, salt, nonce) {
        const existing = await db.select().from(encryptedBackups).where((0, import_drizzle_orm3.and)((0, import_drizzle_orm3.eq)(encryptedBackups.userId, userId), (0, import_drizzle_orm3.eq)(encryptedBackups.deviceId, deviceId)));
        if (existing.length > 0) {
          await db.update(encryptedBackups).set({ encryptedBlob, salt, nonce, updatedAt: /* @__PURE__ */ new Date() }).where((0, import_drizzle_orm3.and)((0, import_drizzle_orm3.eq)(encryptedBackups.userId, userId), (0, import_drizzle_orm3.eq)(encryptedBackups.deviceId, deviceId)));
        } else {
          await db.insert(encryptedBackups).values({ userId, deviceId, encryptedBlob, salt, nonce });
        }
      }
      async getBackup(userId) {
        const [row] = await db.select().from(encryptedBackups).where((0, import_drizzle_orm3.eq)(encryptedBackups.userId, userId)).orderBy((0, import_drizzle_orm3.desc)(encryptedBackups.updatedAt)).limit(1);
        if (!row) return null;
        return { encryptedBlob: row.encryptedBlob, salt: row.salt, nonce: row.nonce };
      }
      async deleteUserAccount(userId) {
        const user = await this.getUser(userId);
        if (!user) return;
        await db.transaction(async (tx) => {
          await tx.delete(verificationCodes).where((0, import_drizzle_orm3.eq)(verificationCodes.phoneNumber, user.phoneNumber));
          if (user.virtualNumberId) {
            await tx.update(virtualNumbers).set({ assignedUserId: null }).where((0, import_drizzle_orm3.eq)(virtualNumbers.id, user.virtualNumberId));
          }
          const userConvIds = await tx.select({ conversationId: conversationParticipants.conversationId }).from(conversationParticipants).where((0, import_drizzle_orm3.eq)(conversationParticipants.userId, userId));
          await tx.delete(users).where((0, import_drizzle_orm3.eq)(users.id, userId));
          for (const { conversationId } of userConvIds) {
            const remaining = await tx.select({ id: conversationParticipants.id }).from(conversationParticipants).where((0, import_drizzle_orm3.eq)(conversationParticipants.conversationId, conversationId)).limit(1);
            if (remaining.length === 0) {
              await tx.delete(messages).where((0, import_drizzle_orm3.eq)(messages.conversationId, conversationId));
              await tx.delete(conversations).where((0, import_drizzle_orm3.eq)(conversations.id, conversationId));
            }
          }
        });
      }
      async recordLoginEvent(data) {
        if (data.deviceId) {
          await db.update(loginEvents).set({ isCurrentSession: false }).where((0, import_drizzle_orm3.and)(
            (0, import_drizzle_orm3.eq)(loginEvents.userId, data.userId),
            (0, import_drizzle_orm3.eq)(loginEvents.deviceId, data.deviceId),
            (0, import_drizzle_orm3.eq)(loginEvents.isCurrentSession, true)
          ));
        }
        const [event] = await db.insert(loginEvents).values({
          userId: data.userId,
          deviceId: data.deviceId ?? null,
          deviceName: data.deviceName ?? null,
          platform: data.platform ?? null,
          ipAddress: data.ipAddress ?? null,
          userAgent: data.userAgent ?? null,
          isNewDevice: data.isNewDevice ?? false,
          isCurrentSession: true
        }).returning();
        return event;
      }
      async getLoginEvents(userId, limit = 50) {
        return await db.select().from(loginEvents).where((0, import_drizzle_orm3.eq)(loginEvents.userId, userId)).orderBy((0, import_drizzle_orm3.desc)(loginEvents.createdAt)).limit(limit);
      }
      async bumpTokenVersion(userId, currentDeviceId) {
        const [updated] = await db.update(users).set({ tokenVersion: import_drizzle_orm3.sql`COALESCE(${users.tokenVersion}, 0) + 1` }).where((0, import_drizzle_orm3.eq)(users.id, userId)).returning({ tokenVersion: users.tokenVersion });
        if (currentDeviceId) {
          await db.update(loginEvents).set({ isCurrentSession: false }).where((0, import_drizzle_orm3.and)(
            (0, import_drizzle_orm3.eq)(loginEvents.userId, userId),
            (0, import_drizzle_orm3.or)(
              (0, import_drizzle_orm3.isNull)(loginEvents.deviceId),
              (0, import_drizzle_orm3.ne)(loginEvents.deviceId, currentDeviceId)
            )
          ));
        } else {
          await db.update(loginEvents).set({ isCurrentSession: false }).where((0, import_drizzle_orm3.eq)(loginEvents.userId, userId));
        }
        return updated?.tokenVersion ?? 0;
      }
    };
    storage = new DatabaseStorage();
  }
});

// server/twilioClient.ts
var twilioClient_exports = {};
__export(twilioClient_exports, {
  generateVerificationCode: () => generateVerificationCode,
  getEnabledSmsCountries: () => getEnabledSmsCountries,
  getTwilioClient: () => getTwilioClient,
  isTwilioConfigured: () => isTwilioConfigured,
  provisionPhoneNumber: () => provisionPhoneNumber,
  releasePhoneNumber: () => releasePhoneNumber,
  searchAvailableNumbers: () => searchAvailableNumbers,
  sendInviteSMS: () => sendInviteSMS,
  sendVerificationSMS: () => sendVerificationSMS,
  validateTwilioWebhookSignature: () => validateTwilioWebhookSignature
});
function isTwilioConfigured() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID || process.env.Twilio_Account_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN || process.env.Twilio_Auth_Token;
  return !!(accountSid && authToken);
}
function getTwilioClient() {
  if (!twilioClient) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID || process.env.Twilio_Account_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN || process.env.Twilio_Auth_Token;
    if (!accountSid || !authToken) {
      throw new Error("Twilio credentials must be set");
    }
    twilioClient = (0, import_twilio.default)(accountSid, authToken);
  }
  return twilioClient;
}
function getEnabledSmsCountries() {
  const allowedCountriesEnv = process.env.ALLOWED_COUNTRIES || process.env.Allowed_Countries || "";
  const currentConfigValue = allowedCountriesEnv.trim();
  const currentTwilioConfigured = isTwilioConfigured();
  if (geoPermissionsCache && geoPermissionsCache.configuredValue === currentConfigValue && geoPermissionsCache.twilioConfigured === currentTwilioConfigured && Date.now() - geoPermissionsCache.timestamp < GEO_CACHE_TTL) {
    return {
      countries: geoPermissionsCache.countries,
      configured: geoPermissionsCache.configured,
      message: geoPermissionsCache.message
    };
  }
  if (currentConfigValue) {
    const codes = currentConfigValue.split(",").map((c) => c.trim().toUpperCase());
    const enabledCountries = [];
    const invalidCodes = [];
    for (const code of codes) {
      const dialCode = COUNTRY_DIAL_CODES[code];
      const name = COUNTRY_NAMES[code];
      if (dialCode && name) {
        enabledCountries.push({ isoCode: code, name, dialCode });
      } else if (code.length > 0) {
        invalidCodes.push(code);
      }
    }
    if (invalidCodes.length > 0) {
      console.warn(`Invalid country codes in ALLOWED_COUNTRIES: ${invalidCodes.join(", ")}`);
    }
    if (enabledCountries.length > 0) {
      enabledCountries.sort((a, b) => a.name.localeCompare(b.name));
      geoPermissionsCache = {
        countries: enabledCountries,
        configuredValue: currentConfigValue,
        twilioConfigured: currentTwilioConfigured,
        configured: true,
        timestamp: Date.now()
      };
      console.log(`Loaded ${enabledCountries.length} allowed countries from ALLOWED_COUNTRIES: ${enabledCountries.map((c) => c.isoCode).join(", ")}`);
      return { countries: enabledCountries, configured: true };
    } else {
      console.error("ALLOWED_COUNTRIES is set but contains no valid country codes");
    }
  } else {
    console.log("ALLOWED_COUNTRIES not set, using defaults (US, CA)");
  }
  const defaultCountries = [
    { isoCode: "US", name: "United States", dialCode: "+1" },
    { isoCode: "CA", name: "Canada", dialCode: "+1" }
  ];
  const fallbackMessage = "Set ALLOWED_COUNTRIES environment variable to customize available countries";
  geoPermissionsCache = {
    countries: defaultCountries,
    configuredValue: "",
    twilioConfigured: currentTwilioConfigured,
    configured: false,
    message: fallbackMessage,
    timestamp: Date.now()
  };
  return {
    countries: defaultCountries,
    configured: false,
    message: fallbackMessage
  };
}
async function sendVerificationSMS(phoneNumber, code) {
  try {
    const client = getTwilioClient();
    const fromNumber = process.env.TWILIO_PHONE_NUMBER || process.env.Twilio_Phone_Number;
    if (!fromNumber) {
      return {
        success: false,
        error: "TWILIO_PHONE_NUMBER not set",
        userMessage: "SMS service is not configured. Please contact support."
      };
    }
    await client.messages.create({
      body: `Your SecureConnect verification code is: ${code}. This code expires in 10 minutes.`,
      from: fromNumber,
      to: phoneNumber
    });
    return { success: true };
  } catch (error) {
    console.error("Failed to send SMS:", error);
    const twilioCode = error?.code;
    let userMessage = "Failed to send verification code. Please try again.";
    if (twilioCode === 21211 || twilioCode === 21614) {
      userMessage = "Please enter a valid phone number with the correct country code.";
    } else if (twilioCode === 21612 || twilioCode === 21408) {
      userMessage = "This phone number cannot receive SMS. Please use a mobile number.";
    } else if (twilioCode === 21610) {
      userMessage = "This number has been blocked. Please try a different number.";
    } else if (twilioCode === 21606 || twilioCode === 21607) {
      userMessage = "SMS service is temporarily unavailable. Please try again later.";
    } else if (twilioCode === 21608) {
      userMessage = "SMS verification is not available for this region. Please contact support.";
    } else if (twilioCode === 21219) {
      userMessage = "Unable to send to this phone number. Please verify your number is correct.";
    } else if (twilioCode === 21617) {
      userMessage = "Message too long. Please contact support.";
    } else if (twilioCode === 20003 || twilioCode === 20404) {
      userMessage = "SMS service is temporarily unavailable. Please try again later.";
    }
    return {
      success: false,
      error: error?.message || "Unknown error",
      userMessage
    };
  }
}
function generateVerificationCode() {
  return Math.floor(1e5 + Math.random() * 9e5).toString();
}
async function sendInviteSMS(phoneNumber, senderName) {
  try {
    const client = getTwilioClient();
    const fromNumber = process.env.TWILIO_PHONE_NUMBER || process.env.Twilio_Phone_Number;
    if (!fromNumber) {
      throw new Error("TWILIO_PHONE_NUMBER must be set");
    }
    await client.messages.create({
      body: `${senderName} wants to message you on SecureChat! Download the app to start chatting securely.`,
      from: fromNumber,
      to: phoneNumber
    });
    return true;
  } catch (error) {
    console.error("Failed to send invite SMS:", error);
    return false;
  }
}
async function searchAvailableNumbers(countryCode, areaCode) {
  try {
    const client = getTwilioClient();
    const searchParams = {
      voiceEnabled: true,
      smsEnabled: true,
      limit: 10
    };
    if (areaCode) {
      searchParams.areaCode = areaCode;
    }
    let allNumbers = [];
    try {
      console.log(`Searching for local numbers in ${countryCode}...`);
      const localNumbers = await client.availablePhoneNumbers(countryCode).local.list(searchParams);
      allNumbers = localNumbers.map((num) => ({
        phoneNumber: num.phoneNumber,
        friendlyName: num.friendlyName,
        locality: num.locality || "",
        region: num.region || "",
        capabilities: {
          voice: !!num.capabilities.voice,
          sms: !!num.capabilities.sms,
          mms: !!num.capabilities.mms
        }
      }));
      console.log(`Found ${allNumbers.length} local numbers`);
    } catch (localErr) {
      console.log(`No local numbers available: ${localErr.message}`);
    }
    if (allNumbers.length === 0 && ["US", "CA", "GB"].includes(countryCode)) {
      try {
        console.log(`Searching for toll-free numbers in ${countryCode}...`);
        const tollFreeNumbers = await client.availablePhoneNumbers(countryCode).tollFree.list({ voiceEnabled: true, smsEnabled: true, limit: 10 });
        allNumbers = tollFreeNumbers.map((num) => ({
          phoneNumber: num.phoneNumber,
          friendlyName: num.friendlyName,
          locality: "Toll-Free",
          region: countryCode,
          capabilities: {
            voice: !!num.capabilities.voice,
            sms: !!num.capabilities.sms,
            mms: !!num.capabilities.mms
          }
        }));
        console.log(`Found ${allNumbers.length} toll-free numbers`);
      } catch (tollFreeErr) {
        console.log(`No toll-free numbers available: ${tollFreeErr.message}`);
      }
    }
    if (allNumbers.length === 0) {
      try {
        console.log(`Searching for mobile numbers in ${countryCode}...`);
        const mobileNumbers = await client.availablePhoneNumbers(countryCode).mobile.list({ voiceEnabled: true, smsEnabled: true, limit: 10 });
        allNumbers = mobileNumbers.map((num) => ({
          phoneNumber: num.phoneNumber,
          friendlyName: num.friendlyName,
          locality: "Mobile",
          region: num.region || countryCode,
          capabilities: {
            voice: !!num.capabilities.voice,
            sms: !!num.capabilities.sms,
            mms: !!num.capabilities.mms
          }
        }));
        console.log(`Found ${allNumbers.length} mobile numbers`);
      } catch (mobileErr) {
        console.log(`No mobile numbers available: ${mobileErr.message}`);
      }
    }
    return { success: true, numbers: allNumbers };
  } catch (error) {
    console.error("Failed to search available numbers:", error);
    let userError = "Failed to search available numbers";
    if (error?.code === 21452 || error?.message?.includes("not available")) {
      userError = `Phone numbers are not available in ${countryCode}. Try a different country.`;
    } else if (error?.code === 20003) {
      userError = "Phone number service is temporarily unavailable. Please try again later.";
    }
    return {
      success: false,
      error: userError
    };
  }
}
async function provisionPhoneNumber(phoneNumber, friendlyName, webhookBaseUrl) {
  try {
    const client = getTwilioClient();
    console.log(`Provisioning number ${phoneNumber} with webhook URL: ${webhookBaseUrl}`);
    if (!webhookBaseUrl || webhookBaseUrl.includes("undefined")) {
      console.error("Invalid webhook base URL provided:", webhookBaseUrl);
      return { success: false, error: "Server configuration error. Please contact support." };
    }
    const purchasedNumber = await client.incomingPhoneNumbers.create({
      phoneNumber,
      friendlyName,
      voiceUrl: `${webhookBaseUrl}/api/webhooks/twilio/voice`,
      voiceMethod: "POST",
      smsUrl: `${webhookBaseUrl}/api/webhooks/twilio/sms`,
      smsMethod: "POST"
    });
    return {
      success: true,
      number: {
        sid: purchasedNumber.sid,
        phoneNumber: purchasedNumber.phoneNumber,
        friendlyName: purchasedNumber.friendlyName,
        capabilities: {
          voice: purchasedNumber.capabilities.voice,
          sms: purchasedNumber.capabilities.sms,
          mms: purchasedNumber.capabilities.mms
        }
      }
    };
  } catch (error) {
    console.error("Failed to provision phone number:", error?.message || error);
    console.error("Twilio error code:", error?.code);
    console.error("Twilio error details:", error?.moreInfo || "none");
    let userError = "Failed to get your SecureConnect number. Please try again.";
    if (error?.code === 21422) {
      userError = "This number is no longer available. Please select a different number.";
    } else if (error?.code === 21451) {
      userError = "Account balance insufficient for this purchase. Please contact support.";
    } else if (error?.code === 21452) {
      userError = "Phone number provisioning is not available in your region.";
    } else if (error?.code === 20003) {
      userError = "Authentication failed. Please check Twilio credentials.";
    } else if (error?.code === 21212) {
      userError = "Invalid phone number format. Please select a different number.";
    } else if (error?.code === 21214) {
      userError = "This number cannot be purchased. Please select a different number.";
    } else if (error?.code === 21606 || error?.code === 21215) {
      userError = "Phone number purchasing is not enabled for this account. Please contact support.";
    } else if (error?.message) {
      userError = `Unable to provision number: ${error.message}`;
    }
    return { success: false, error: userError };
  }
}
async function releasePhoneNumber(twilioSid) {
  try {
    const client = getTwilioClient();
    await client.incomingPhoneNumbers(twilioSid).remove();
    return { success: true };
  } catch (error) {
    console.error("Failed to release phone number:", error);
    return {
      success: false,
      error: error?.message || "Failed to release phone number"
    };
  }
}
function validateTwilioWebhookSignature(signature, url, params) {
  if (!signature) {
    console.warn("Missing Twilio signature header");
    return false;
  }
  const authToken = process.env.TWILIO_AUTH_TOKEN || process.env.Twilio_Auth_Token;
  if (!authToken) {
    console.error("Twilio auth token not configured for webhook validation");
    return false;
  }
  try {
    return import_twilio.default.validateRequest(authToken, signature, url, params);
  } catch (error) {
    console.error("Error validating Twilio signature:", error);
    return false;
  }
}
var import_twilio, twilioClient, COUNTRY_DIAL_CODES, COUNTRY_NAMES, geoPermissionsCache, GEO_CACHE_TTL;
var init_twilioClient = __esm({
  "server/twilioClient.ts"() {
    "use strict";
    import_twilio = __toESM(require("twilio"));
    twilioClient = null;
    COUNTRY_DIAL_CODES = {
      US: "+1",
      CA: "+1",
      AU: "+61",
      GB: "+44",
      DE: "+49",
      FR: "+33",
      ES: "+34",
      IT: "+39",
      NL: "+31",
      BE: "+32",
      CH: "+41",
      AT: "+43",
      SE: "+46",
      NO: "+47",
      DK: "+45",
      FI: "+358",
      IE: "+353",
      PT: "+351",
      PL: "+48",
      GR: "+30",
      CZ: "+420",
      HU: "+36",
      RO: "+40",
      RU: "+7",
      UA: "+380",
      TR: "+90",
      IL: "+972",
      SA: "+966",
      AE: "+971",
      QA: "+974",
      KW: "+965",
      EG: "+20",
      ZA: "+27",
      NG: "+234",
      KE: "+254",
      MA: "+212",
      IN: "+91",
      PK: "+92",
      BD: "+880",
      CN: "+86",
      JP: "+81",
      KR: "+82",
      TW: "+886",
      HK: "+852",
      SG: "+65",
      MY: "+60",
      ID: "+62",
      PH: "+63",
      TH: "+66",
      VN: "+84",
      MX: "+52",
      BR: "+55",
      AR: "+54",
      CO: "+57",
      CL: "+56",
      PE: "+51",
      VE: "+58",
      EC: "+593",
      NZ: "+64"
    };
    COUNTRY_NAMES = {
      US: "United States",
      CA: "Canada",
      AU: "Australia",
      GB: "United Kingdom",
      DE: "Germany",
      FR: "France",
      ES: "Spain",
      IT: "Italy",
      NL: "Netherlands",
      BE: "Belgium",
      CH: "Switzerland",
      AT: "Austria",
      SE: "Sweden",
      NO: "Norway",
      DK: "Denmark",
      FI: "Finland",
      IE: "Ireland",
      PT: "Portugal",
      PL: "Poland",
      GR: "Greece",
      CZ: "Czech Republic",
      HU: "Hungary",
      RO: "Romania",
      RU: "Russia",
      UA: "Ukraine",
      TR: "Turkey",
      IL: "Israel",
      SA: "Saudi Arabia",
      AE: "United Arab Emirates",
      QA: "Qatar",
      KW: "Kuwait",
      EG: "Egypt",
      ZA: "South Africa",
      NG: "Nigeria",
      KE: "Kenya",
      MA: "Morocco",
      IN: "India",
      PK: "Pakistan",
      BD: "Bangladesh",
      CN: "China",
      JP: "Japan",
      KR: "South Korea",
      TW: "Taiwan",
      HK: "Hong Kong",
      SG: "Singapore",
      MY: "Malaysia",
      ID: "Indonesia",
      PH: "Philippines",
      TH: "Thailand",
      VN: "Vietnam",
      MX: "Mexico",
      BR: "Brazil",
      AR: "Argentina",
      CO: "Colombia",
      CL: "Chile",
      PE: "Peru",
      VE: "Venezuela",
      EC: "Ecuador",
      NZ: "New Zealand"
    };
    geoPermissionsCache = null;
    GEO_CACHE_TTL = 6 * 60 * 60 * 1e3;
  }
});

// server/aiModerator.ts
var aiModerator_exports = {};
__export(aiModerator_exports, {
  checkAndConsumeChatLimit: () => checkAndConsumeChatLimit,
  evaluateReport: () => evaluateReport,
  refundChatLimitSlot: () => refundChatLimitSlot
});
function describeAction(action) {
  switch (action) {
    case "warn":
      return "warning issued";
    case "chat_limit":
      return "chat limit (5 messages/day for 7 days)";
    case "suspend_24h":
      return "24-hour suspension";
    case "suspend_7d":
      return "7-day suspension";
    case "suspend_30d":
      return "30-day suspension";
    case "suspend_permanent":
      return "permanent suspension";
    default:
      return "no action";
  }
}
async function gatherEvidence(report) {
  const reporter = await storage.getUser(report.reporterId);
  const reported = await storage.getUser(report.reportedUserId);
  let reportedMessage = null;
  let conversationId = null;
  if (report.reportedMessageId) {
    const [m] = await db.select().from(messages).where((0, import_drizzle_orm4.eq)(messages.id, report.reportedMessageId)).limit(1);
    if (m) {
      reportedMessage = {
        content: m.content,
        mediaType: m.mediaType,
        createdAt: m.createdAt ? new Date(m.createdAt).toISOString() : null,
        senderId: m.senderId
      };
      conversationId = m.conversationId;
    }
  }
  const conversationContext = [];
  if (!conversationId) {
    try {
      const recent = await db.select({ conversationId: messages.conversationId }).from(messages).where(
        // Either direction between the two users — covers reported_user → reporter
        // AND reporter → reported_user so we never miss the shared thread.
        import_drizzle_orm4.sql`(
            (${messages.senderId} = ${report.reportedUserId} AND ${messages.receiverId} = ${report.reporterId})
            OR
            (${messages.senderId} = ${report.reporterId} AND ${messages.receiverId} = ${report.reportedUserId})
          )`
      ).orderBy((0, import_drizzle_orm4.desc)(messages.createdAt)).limit(1);
      if (recent[0]?.conversationId) conversationId = recent[0].conversationId;
    } catch {
    }
  }
  if (conversationId) {
    const rows = await db.select().from(messages).where((0, import_drizzle_orm4.eq)(messages.conversationId, conversationId)).orderBy((0, import_drizzle_orm4.desc)(messages.createdAt)).limit(50);
    for (const m of rows.reverse()) {
      const role = m.senderId === report.reportedUserId ? "reported_user" : m.senderId === report.reporterId ? "reporter" : "other";
      conversationContext.push({
        role,
        content: m.content ?? "",
        mediaType: m.mediaType,
        ts: m.createdAt ? new Date(m.createdAt).toISOString() : ""
      });
    }
  }
  return {
    reportedMessage,
    conversationContext,
    reportedUserDisplay: reported?.displayName || reported?.phoneNumber || "Reported user",
    reporterDisplay: reporter?.displayName || reporter?.phoneNumber || "Reporter"
  };
}
function looksLikeCiphertext(s) {
  if (!s) return true;
  const trimmed = s.trim();
  if (trimmed.length === 0) return true;
  if (trimmed.startsWith("{") && trimmed.includes('"ciphertext"')) return true;
  if (/^[A-Za-z0-9+/=]{120,}$/.test(trimmed)) return true;
  return false;
}
async function callOpenAI(report, evidence) {
  const reasonLabel = REASON_LABELS[report.reason] || report.reason;
  const reportedText = evidence.reportedMessage?.content ?? null;
  const allCiphertext = looksLikeCiphertext(reportedText) && evidence.conversationContext.every((m) => looksLikeCiphertext(m.content));
  if (allCiphertext && evidence.conversationContext.length > 0) {
    return {
      verdict: "insufficient_evidence",
      severity: 1,
      confidence: 95,
      recommendedAction: "none",
      reason: "All available messages are end-to-end encrypted ciphertext that the server cannot read. Manual review required for human-readable evidence."
    };
  }
  const userPayload = {
    report: {
      reason: report.reason,
      reasonLabel,
      reporterDetails: report.details || null,
      reporter: evidence.reporterDisplay,
      reportedUser: evidence.reportedUserDisplay
    },
    reportedMessage: evidence.reportedMessage ? {
      text: looksLikeCiphertext(evidence.reportedMessage.content) ? "[encrypted - cannot read]" : evidence.reportedMessage.content,
      mediaType: evidence.reportedMessage.mediaType,
      ts: evidence.reportedMessage.createdAt,
      sentBy: evidence.reportedMessage.senderId === report.reportedUserId ? "reported_user" : "reporter"
    } : null,
    conversationHistory: evidence.conversationContext.slice(-50).map((m) => ({
      from: m.role,
      text: looksLikeCiphertext(m.content) ? "[encrypted]" : m.content,
      mediaType: m.mediaType,
      ts: m.ts
    }))
  };
  const completion = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Evaluate this report and respond with JSON of shape: {"verdict":"approve|decline|insufficient_evidence","severity":1-5,"confidence":0-100,"recommendedAction":"none|warn|chat_limit|suspend_24h|suspend_7d|suspend_30d|suspend_permanent","reason":"brief one-paragraph explanation citing evidence"}.

Report payload:
${JSON.stringify(userPayload, null, 2)}`
      }
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 600
  });
  const raw = completion.choices[0]?.message?.content || "{}";
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      verdict: "error",
      severity: 1,
      confidence: 0,
      recommendedAction: "none",
      reason: `AI returned non-JSON: ${raw.slice(0, 300)}`
    };
  }
  const verdict = ["approve", "decline", "insufficient_evidence"].includes(
    parsed.verdict
  ) ? parsed.verdict : "insufficient_evidence";
  const severity = Math.max(1, Math.min(5, Number(parsed.severity) || 1));
  const confidence = Math.max(0, Math.min(100, Number(parsed.confidence) || 0));
  const allowedActions = [
    "none",
    "warn",
    "chat_limit",
    "suspend_24h",
    "suspend_7d",
    "suspend_30d",
    "suspend_permanent"
  ];
  let recommendedAction = allowedActions.includes(parsed.recommendedAction) ? parsed.recommendedAction : "none";
  if (verdict !== "approve") recommendedAction = "none";
  return {
    verdict,
    severity,
    confidence,
    recommendedAction,
    reason: typeof parsed.reason === "string" ? parsed.reason.slice(0, 1e3) : ""
  };
}
async function applyAction(reportedUserId, action, reasonLabel) {
  const now = /* @__PURE__ */ new Date();
  switch (action) {
    case "warn":
      return `warned for ${reasonLabel}`;
    case "chat_limit": {
      const until = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1e3);
      await db.update(users).set({
        chatLimitUntil: until,
        chatLimitMessagesPerDay: 5,
        chatMessagesUsedToday: 0,
        chatLimitDayStart: now
      }).where((0, import_drizzle_orm4.eq)(users.id, reportedUserId));
      return `chat-limited to 5 messages/day until ${until.toISOString()}`;
    }
    case "suspend_24h":
    case "suspend_7d":
    case "suspend_30d":
    case "suspend_permanent": {
      const days = action === "suspend_24h" ? 1 : action === "suspend_7d" ? 7 : action === "suspend_30d" ? 30 : 365 * 100;
      const until = new Date(now.getTime() + days * 24 * 60 * 60 * 1e3);
      await storage.suspendUser(reportedUserId, `AI moderation: ${reasonLabel}`);
      await db.update(users).set({ chatLimitUntil: until }).where((0, import_drizzle_orm4.eq)(users.id, reportedUserId));
      return `${action} for ${reasonLabel}`;
    }
    default:
      return "no action";
  }
}
async function evaluateReport(reportId) {
  let report;
  try {
    const claim = await db.update(userReports).set({ aiEvaluatedAt: /* @__PURE__ */ new Date() }).where((0, import_drizzle_orm4.and)((0, import_drizzle_orm4.eq)(userReports.id, reportId), import_drizzle_orm4.sql`${userReports.aiEvaluatedAt} IS NULL`)).returning();
    if (claim.length === 0) {
      console.log(`[AI-MOD] report=${reportId} already claimed by another worker, skipping.`);
      return;
    }
    report = claim[0];
    if (!process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
      await db.update(userReports).set({
        aiVerdict: "error",
        aiVerdictReason: "AI moderator not configured (missing OPENAI key) \u2014 needs human review.",
        aiAction: "none"
      }).where((0, import_drizzle_orm4.eq)(userReports.id, reportId));
      return;
    }
    const evidence = await gatherEvidence(report);
    const result = await callOpenAI(report, evidence);
    let actionTakenStr = null;
    let nextStatus = report.status;
    if (result.verdict === "approve" && result.recommendedAction !== "none") {
      const reasonLabel = REASON_LABELS[report.reason] || report.reason;
      actionTakenStr = await applyAction(
        report.reportedUserId,
        result.recommendedAction,
        reasonLabel
      );
      nextStatus = "actioned";
      if (result.recommendedAction.startsWith("suspend_")) {
        try {
          const io = global.__socketIO;
          if (io) {
            const sockets = await io.in(report.reportedUserId).fetchSockets();
            for (const s of sockets) {
              try {
                s.emit("account-suspended", { reason: report.reason });
              } catch {
              }
              try {
                s.disconnect(true);
              } catch {
              }
            }
          }
        } catch (e) {
          console.error("[AI-MOD] socket disconnect failed:", e);
        }
      } else if (result.recommendedAction === "chat_limit") {
        try {
          const io = global.__socketIO;
          if (io) io.to(report.reportedUserId).emit("chat-limit-applied", { perDay: 5 });
        } catch {
        }
      }
    } else if (result.verdict === "decline") {
      nextStatus = "dismissed";
      actionTakenStr = `auto-dismissed by AI (${describeAction(result.recommendedAction)})`;
    } else if (result.verdict === "insufficient_evidence") {
      nextStatus = "pending";
      actionTakenStr = "needs human review";
    }
    await db.update(userReports).set({
      aiVerdict: result.verdict,
      aiVerdictReason: result.reason,
      aiAction: result.recommendedAction,
      aiSeverity: result.severity,
      aiConfidence: result.confidence,
      aiEvaluatedAt: /* @__PURE__ */ new Date(),
      status: nextStatus,
      actionTaken: actionTakenStr ?? report.actionTaken,
      reviewedAt: nextStatus !== "pending" ? /* @__PURE__ */ new Date() : report.reviewedAt,
      reviewedBy: nextStatus !== "pending" ? "ai-moderator" : report.reviewedBy
    }).where((0, import_drizzle_orm4.eq)(userReports.id, reportId));
    console.log(
      `[AI-MOD] report=${reportId} verdict=${result.verdict} action=${result.recommendedAction} severity=${result.severity} confidence=${result.confidence}`
    );
  } catch (err) {
    console.error("[AI-MOD] evaluation failed:", err?.message || err);
    try {
      await db.update(userReports).set({
        aiVerdict: "error",
        aiVerdictReason: String(err?.message || err).slice(0, 500),
        aiEvaluatedAt: /* @__PURE__ */ new Date()
      }).where((0, import_drizzle_orm4.eq)(userReports.id, reportId));
    } catch {
    }
  }
}
async function checkAndConsumeChatLimit(userId) {
  const [user] = await db.select().from(users).where((0, import_drizzle_orm4.eq)(users.id, userId)).limit(1);
  if (!user) return { allowed: true };
  const now = /* @__PURE__ */ new Date();
  if (user.chatLimitUntil && new Date(user.chatLimitUntil).getTime() <= now.getTime()) {
    await db.update(users).set({
      chatLimitUntil: null,
      chatLimitMessagesPerDay: null,
      chatMessagesUsedToday: 0,
      chatLimitDayStart: null
    }).where((0, import_drizzle_orm4.eq)(users.id, userId));
    return { allowed: true };
  }
  const perDay = user.chatLimitMessagesPerDay;
  if (!perDay || perDay <= 0) return { allowed: true };
  const todayUtcMidnight = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  const tomorrowIso = new Date(todayUtcMidnight.getTime() + 24 * 60 * 60 * 1e3).toISOString();
  const result = await db.update(users).set({
    chatMessagesUsedToday: import_drizzle_orm4.sql`CASE
        WHEN ${users.chatLimitDayStart} IS NULL OR ${users.chatLimitDayStart} < ${todayUtcMidnight}
          THEN 1
        ELSE COALESCE(${users.chatMessagesUsedToday}, 0) + 1
      END`,
    chatLimitDayStart: import_drizzle_orm4.sql`CASE
        WHEN ${users.chatLimitDayStart} IS NULL OR ${users.chatLimitDayStart} < ${todayUtcMidnight}
          THEN ${todayUtcMidnight}
        ELSE ${users.chatLimitDayStart}
      END`
  }).where(
    (0, import_drizzle_orm4.and)(
      (0, import_drizzle_orm4.eq)(users.id, userId),
      import_drizzle_orm4.sql`(
          ${users.chatLimitDayStart} IS NULL
          OR ${users.chatLimitDayStart} < ${todayUtcMidnight}
          OR COALESCE(${users.chatMessagesUsedToday}, 0) < ${perDay}
        )`
    )
  ).returning({ usedNow: users.chatMessagesUsedToday });
  if (result.length === 0) {
    return {
      allowed: false,
      reason: `Daily message limit reached (${perDay}/day). Resets at ${tomorrowIso}.`,
      remaining: 0,
      perDay,
      resetAt: tomorrowIso
    };
  }
  const usedNow = result[0]?.usedNow ?? 1;
  return {
    allowed: true,
    remaining: Math.max(0, perDay - usedNow),
    perDay,
    resetAt: tomorrowIso
  };
}
async function refundChatLimitSlot(userId) {
  try {
    await db.update(users).set({
      chatMessagesUsedToday: import_drizzle_orm4.sql`GREATEST(COALESCE(${users.chatMessagesUsedToday}, 0) - 1, 0)`
    }).where((0, import_drizzle_orm4.eq)(users.id, userId));
  } catch (e) {
    console.error("[AI-MOD] refund slot failed:", e);
  }
}
var import_openai, import_drizzle_orm4, openai, MODEL, REASON_LABELS, SYSTEM_PROMPT;
var init_aiModerator = __esm({
  "server/aiModerator.ts"() {
    "use strict";
    import_openai = __toESM(require("openai"));
    init_storage();
    init_db();
    init_schema();
    import_drizzle_orm4 = require("drizzle-orm");
    openai = new import_openai.default({
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL
    });
    MODEL = "gpt-5.1";
    REASON_LABELS = {
      spam: "Spam or unwanted content",
      harassment: "Harassment or bullying",
      hate_speech: "Hate speech",
      sexual_content: "Sexual or nude content",
      threats_or_violence: "Threats or violence",
      csam: "Child exploitation",
      impersonation: "Impersonation",
      scam_or_fraud: "Scam or fraud",
      other: "Other"
    };
    SYSTEM_PROMPT = `You are SecureConnect's AI Trust & Safety officer. Your job is to evaluate user reports against actual chat history and decide whether the reported behavior matches the reported reason. You only approve reports when the evidence clearly supports the claim. You never act on suspicion alone.

Verdict definitions:
- "approve": The reported behavior clearly matches the reported reason and there is concrete evidence in the messages. Choose a recommendedAction proportional to severity.
- "decline": The evidence does NOT support the claim, or the message is benign / a misunderstanding / out of context.
- "insufficient_evidence": The reported message is encrypted ciphertext, missing, or the context is too thin to make a confident decision. Always pair with action "none".

Severity scale (1-5):
1 = Minor / borderline (mild rudeness, single low-effort spam)
2 = Mild but clearly unwelcome (repeated spam, name-calling)
3 = Moderate (sustained harassment, slurs, scams)
4 = Severe (threats of violence, sexual content sent to non-consenting party, doxxing)
5 = Critical (explicit threats of imminent harm, child exploitation, coordinated abuse)

Recommended action mapping (use ONLY these strings):
- severity 1 + first-time \u2192 "warn"
- severity 2 \u2192 "chat_limit"  (5 messages/day for 7 days)
- severity 3 \u2192 "suspend_24h"
- severity 4 \u2192 "suspend_7d"
- severity 5 (CSAM, credible threats of violence) \u2192 "suspend_permanent"
- severity 5 (other) \u2192 "suspend_30d"
- decline / insufficient_evidence \u2192 "none"

Hard rules:
- CSAM (child_exploitation): if there is ANY credible signal, set verdict="approve", severity=5, action="suspend_permanent". Do NOT downgrade.
- Credible threats of violence with a target \u2192 minimum suspend_7d.
- Encrypted/empty/non-text content \u2192 verdict="insufficient_evidence", action="none".
- Always favor decline when context shows the messages are consensual, in-jokes, or the reported user is the victim.
- Confidence must reflect honesty (10-100). If you wouldn't bet money on the verdict, drop confidence below 60 and prefer insufficient_evidence.

Return STRICT JSON only \u2014 no prose, no markdown, no commentary outside JSON.`;
  }
});

// server/replit_integrations/audio/client.ts
var client_exports = {};
__export(client_exports, {
  convertToWav: () => convertToWav,
  detectAudioFormat: () => detectAudioFormat,
  ensureCompatibleFormat: () => ensureCompatibleFormat,
  openai: () => openai2,
  speechToText: () => speechToText,
  speechToTextStream: () => speechToTextStream,
  textToSpeech: () => textToSpeech,
  textToSpeechStream: () => textToSpeechStream,
  voiceChat: () => voiceChat,
  voiceChatStream: () => voiceChatStream
});
function detectAudioFormat(buffer) {
  if (buffer.length < 12) return "unknown";
  if (buffer[0] === 82 && buffer[1] === 73 && buffer[2] === 70 && buffer[3] === 70) {
    return "wav";
  }
  if (buffer[0] === 26 && buffer[1] === 69 && buffer[2] === 223 && buffer[3] === 163) {
    return "webm";
  }
  if (buffer[0] === 255 && (buffer[1] === 251 || buffer[1] === 250 || buffer[1] === 243) || buffer[0] === 73 && buffer[1] === 68 && buffer[2] === 51) {
    return "mp3";
  }
  if (buffer[4] === 102 && buffer[5] === 116 && buffer[6] === 121 && buffer[7] === 112) {
    return "mp4";
  }
  if (buffer[0] === 79 && buffer[1] === 103 && buffer[2] === 103 && buffer[3] === 83) {
    return "ogg";
  }
  return "unknown";
}
async function convertToWav(audioBuffer) {
  const inputPath = (0, import_path.join)((0, import_os.tmpdir)(), `input-${(0, import_crypto2.randomUUID)()}`);
  const outputPath = (0, import_path.join)((0, import_os.tmpdir)(), `output-${(0, import_crypto2.randomUUID)()}.wav`);
  try {
    await (0, import_promises.writeFile)(inputPath, audioBuffer);
    await new Promise((resolve2, reject) => {
      const ffmpeg = (0, import_child_process.spawn)("ffmpeg", [
        "-i",
        inputPath,
        "-vn",
        // Extract audio only (ignore video track)
        "-f",
        "wav",
        "-ar",
        "16000",
        // 16kHz sample rate (good for speech)
        "-ac",
        "1",
        // Mono
        "-acodec",
        "pcm_s16le",
        "-y",
        // Overwrite output
        outputPath
      ]);
      ffmpeg.stderr.on("data", () => {
      });
      ffmpeg.on("close", (code) => {
        if (code === 0) resolve2();
        else reject(new Error(`ffmpeg exited with code ${code}`));
      });
      ffmpeg.on("error", reject);
    });
    return await (0, import_promises.readFile)(outputPath);
  } finally {
    await (0, import_promises.unlink)(inputPath).catch(() => {
    });
    await (0, import_promises.unlink)(outputPath).catch(() => {
    });
  }
}
async function ensureCompatibleFormat(audioBuffer) {
  const detected = detectAudioFormat(audioBuffer);
  if (detected === "wav") return { buffer: audioBuffer, format: "wav" };
  if (detected === "mp3") return { buffer: audioBuffer, format: "mp3" };
  const wavBuffer = await convertToWav(audioBuffer);
  return { buffer: wavBuffer, format: "wav" };
}
async function voiceChat(audioBuffer, voice = "alloy", inputFormat = "wav", outputFormat = "mp3") {
  const audioBase64 = audioBuffer.toString("base64");
  const response = await openai2.chat.completions.create({
    model: "gpt-audio",
    modalities: ["text", "audio"],
    audio: { voice, format: outputFormat },
    messages: [{
      role: "user",
      content: [
        { type: "input_audio", input_audio: { data: audioBase64, format: inputFormat } }
      ]
    }]
  });
  const message = response.choices[0]?.message;
  const transcript = message?.audio?.transcript || message?.content || "";
  const audioData = message?.audio?.data ?? "";
  return {
    transcript,
    audioResponse: import_node_buffer.Buffer.from(audioData, "base64")
  };
}
async function voiceChatStream(audioBuffer, voice = "alloy", inputFormat = "wav") {
  const audioBase64 = audioBuffer.toString("base64");
  const stream = await openai2.chat.completions.create({
    model: "gpt-audio",
    modalities: ["text", "audio"],
    audio: { voice, format: "pcm16" },
    messages: [{
      role: "user",
      content: [
        { type: "input_audio", input_audio: { data: audioBase64, format: inputFormat } }
      ]
    }],
    stream: true
  });
  return (async function* () {
    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta;
      if (!delta) continue;
      if (delta?.audio?.transcript) {
        yield { type: "transcript", data: delta.audio.transcript };
      }
      if (delta?.audio?.data) {
        yield { type: "audio", data: delta.audio.data };
      }
    }
  })();
}
async function textToSpeech(text2, voice = "alloy", format = "wav") {
  const response = await openai2.chat.completions.create({
    model: "gpt-audio",
    modalities: ["text", "audio"],
    audio: { voice, format },
    messages: [
      { role: "system", content: "You are an assistant that performs text-to-speech." },
      { role: "user", content: `Repeat the following text verbatim: ${text2}` }
    ]
  });
  const audioData = response.choices[0]?.message?.audio?.data ?? "";
  return import_node_buffer.Buffer.from(audioData, "base64");
}
async function textToSpeechStream(text2, voice = "alloy") {
  const stream = await openai2.chat.completions.create({
    model: "gpt-audio",
    modalities: ["text", "audio"],
    audio: { voice, format: "pcm16" },
    messages: [
      { role: "system", content: "You are an assistant that performs text-to-speech." },
      { role: "user", content: `Repeat the following text verbatim: ${text2}` }
    ],
    stream: true
  });
  return (async function* () {
    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta;
      if (!delta) continue;
      if (delta?.audio?.data) {
        yield delta.audio.data;
      }
    }
  })();
}
async function speechToText(audioBuffer, format = "wav") {
  const file = await (0, import_openai2.toFile)(audioBuffer, `audio.${format}`);
  const response = await openai2.audio.transcriptions.create({
    file,
    model: "gpt-4o-mini-transcribe"
  });
  return response.text;
}
async function speechToTextStream(audioBuffer, format = "wav") {
  const file = await (0, import_openai2.toFile)(audioBuffer, `audio.${format}`);
  const stream = await openai2.audio.transcriptions.create({
    file,
    model: "gpt-4o-mini-transcribe",
    stream: true
  });
  return (async function* () {
    for await (const event of stream) {
      if (event.type === "transcript.text.delta") {
        yield event.delta;
      }
    }
  })();
}
var import_openai2, import_node_buffer, import_child_process, import_promises, import_crypto2, import_os, import_path, openai2;
var init_client = __esm({
  "server/replit_integrations/audio/client.ts"() {
    "use strict";
    import_openai2 = __toESM(require("openai"));
    import_node_buffer = require("node:buffer");
    import_child_process = require("child_process");
    import_promises = require("fs/promises");
    import_crypto2 = require("crypto");
    import_os = require("os");
    import_path = require("path");
    openai2 = new import_openai2.default({
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL
    });
  }
});

// server/index.ts
var import_express = __toESM(require("express"));
var import_http_proxy_middleware = require("http-proxy-middleware");
var import_stripe_replit_sync = require("stripe-replit-sync");

// server/routes.ts
var import_node_http = require("node:http");
var import_socket = require("socket.io");
var import_jsonwebtoken = __toESM(require("jsonwebtoken"));
var import_bcryptjs = __toESM(require("bcryptjs"));
var import_twilio2 = __toESM(require("twilio"));
var import_qrcode = __toESM(require("qrcode"));
var import_fs = __toESM(require("fs"));
var import_path2 = __toESM(require("path"));
init_storage();
init_twilioClient();

// server/stripeClient.ts
var import_stripe = __toESM(require("stripe"));
var connectionSettings;
async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY ? "repl " + process.env.REPL_IDENTITY : process.env.WEB_REPL_RENEWAL ? "depl " + process.env.WEB_REPL_RENEWAL : null;
  if (!xReplitToken) {
    throw new Error("X_REPLIT_TOKEN not found for repl/depl");
  }
  const connectorName = "stripe";
  const isProduction = process.env.REPLIT_DEPLOYMENT === "1";
  const targetEnvironment = isProduction ? "production" : "development";
  const url = new URL(`https://${hostname}/api/v2/connection`);
  url.searchParams.set("include_secrets", "true");
  url.searchParams.set("connector_names", connectorName);
  url.searchParams.set("environment", targetEnvironment);
  const response = await fetch(url.toString(), {
    headers: {
      "Accept": "application/json",
      "X_REPLIT_TOKEN": xReplitToken
    }
  });
  const data = await response.json();
  connectionSettings = data.items?.[0];
  if (!connectionSettings || (!connectionSettings.settings.publishable || !connectionSettings.settings.secret)) {
    throw new Error(`Stripe ${targetEnvironment} connection not found`);
  }
  return {
    publishableKey: connectionSettings.settings.publishable,
    secretKey: connectionSettings.settings.secret
  };
}
async function getUncachableStripeClient() {
  const { secretKey } = await getCredentials();
  return new import_stripe.default(secretKey, {
    apiVersion: "2025-05-28.basil"
  });
}
async function getStripePublishableKey() {
  const { publishableKey } = await getCredentials();
  return publishableKey;
}
async function getStripeSecretKey() {
  const { secretKey } = await getCredentials();
  return secretKey;
}
var stripeSync = null;
async function getStripeSync() {
  if (!stripeSync) {
    const { StripeSync } = await import("stripe-replit-sync");
    const secretKey = await getStripeSecretKey();
    stripeSync = new StripeSync({
      poolConfig: {
        connectionString: process.env.DATABASE_URL,
        max: 2
      },
      stripeSecretKey: secretKey
    });
  }
  return stripeSync;
}

// server/objectStorage.ts
var import_storage = require("@google-cloud/storage");
var import_crypto = require("crypto");

// server/objectAcl.ts
var ACL_POLICY_METADATA_KEY = "custom:aclPolicy";
function isPermissionAllowed(requested, granted) {
  if (requested === "read" /* READ */) {
    return ["read" /* READ */, "write" /* WRITE */].includes(granted);
  }
  return granted === "write" /* WRITE */;
}
function createObjectAccessGroup(group) {
  switch (group.type) {
    default:
      throw new Error(`Unknown access group type: ${group.type}`);
  }
}
async function setObjectAclPolicy(objectFile, aclPolicy) {
  const [exists] = await objectFile.exists();
  if (!exists) {
    throw new Error(`Object not found: ${objectFile.name}`);
  }
  await objectFile.setMetadata({
    metadata: {
      [ACL_POLICY_METADATA_KEY]: JSON.stringify(aclPolicy)
    }
  });
}
async function getObjectAclPolicy(objectFile) {
  const [metadata] = await objectFile.getMetadata();
  const aclPolicy = metadata?.metadata?.[ACL_POLICY_METADATA_KEY];
  if (!aclPolicy) {
    return null;
  }
  return JSON.parse(aclPolicy);
}
async function canAccessObject({
  userId,
  objectFile,
  requestedPermission
}) {
  const aclPolicy = await getObjectAclPolicy(objectFile);
  if (!aclPolicy) {
    return false;
  }
  if (aclPolicy.visibility === "public" && requestedPermission === "read" /* READ */) {
    return true;
  }
  if (!userId) {
    return false;
  }
  if (aclPolicy.owner === userId) {
    return true;
  }
  for (const rule of aclPolicy.aclRules || []) {
    const accessGroup = createObjectAccessGroup(rule.group);
    if (await accessGroup.hasMember(userId) && isPermissionAllowed(requestedPermission, rule.permission)) {
      return true;
    }
  }
  return false;
}

// server/objectStorage.ts
var REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";
var objectStorageClient = new import_storage.Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: {
        type: "json",
        subject_token_field_name: "access_token"
      }
    },
    universe_domain: "googleapis.com"
  },
  projectId: ""
});
var ObjectNotFoundError = class _ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, _ObjectNotFoundError.prototype);
  }
};
var ObjectStorageService = class {
  constructor() {
  }
  getPublicObjectSearchPaths() {
    const pathsStr = process.env.PUBLIC_OBJECT_SEARCH_PATHS || "";
    const paths = Array.from(
      new Set(
        pathsStr.split(",").map((path3) => path3.trim()).filter((path3) => path3.length > 0)
      )
    );
    if (paths.length === 0) {
      throw new Error(
        "PUBLIC_OBJECT_SEARCH_PATHS not set. Create a bucket in 'Object Storage' tool and set PUBLIC_OBJECT_SEARCH_PATHS env var (comma-separated paths)."
      );
    }
    return paths;
  }
  getPrivateObjectDir() {
    const dir = process.env.PRIVATE_OBJECT_DIR || "";
    if (!dir) {
      throw new Error(
        "PRIVATE_OBJECT_DIR not set. Create a bucket in 'Object Storage' tool and set PRIVATE_OBJECT_DIR env var."
      );
    }
    return dir;
  }
  async searchPublicObject(filePath) {
    for (const searchPath of this.getPublicObjectSearchPaths()) {
      const fullPath = `${searchPath}/${filePath}`;
      const { bucketName, objectName } = parseObjectPath(fullPath);
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);
      const [exists] = await file.exists();
      if (exists) {
        return file;
      }
    }
    return null;
  }
  async downloadObject(file, res, cacheTtlSec = 3600) {
    try {
      const [metadata] = await file.getMetadata();
      const aclPolicy = await getObjectAclPolicy(file);
      const isPublic = aclPolicy?.visibility === "public";
      res.set({
        "Content-Type": metadata.contentType || "application/octet-stream",
        "Content-Length": metadata.size,
        "Cache-Control": `${isPublic ? "public" : "private"}, max-age=${cacheTtlSec}`
      });
      const stream = file.createReadStream();
      stream.on("error", (err) => {
        console.error("Stream error:", err);
        if (!res.headersSent) {
          res.status(500).json({ error: "Error streaming file" });
        }
      });
      stream.pipe(res);
    } catch (error) {
      console.error("Error downloading file:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Error downloading file" });
      }
    }
  }
  async getObjectEntityUploadURL() {
    const privateObjectDir = this.getPrivateObjectDir();
    if (!privateObjectDir) {
      throw new Error(
        "PRIVATE_OBJECT_DIR not set. Create a bucket in 'Object Storage' tool and set PRIVATE_OBJECT_DIR env var."
      );
    }
    const objectId = (0, import_crypto.randomUUID)();
    const fullPath = `${privateObjectDir}/uploads/${objectId}`;
    const { bucketName, objectName } = parseObjectPath(fullPath);
    return signObjectURL({
      bucketName,
      objectName,
      method: "PUT",
      ttlSec: 900
    });
  }
  async getObjectEntityFile(objectPath) {
    if (!objectPath.startsWith("/objects/")) {
      throw new ObjectNotFoundError();
    }
    const parts = objectPath.slice(1).split("/");
    if (parts.length < 2) {
      throw new ObjectNotFoundError();
    }
    const entityId = parts.slice(1).join("/");
    let entityDir = this.getPrivateObjectDir();
    if (!entityDir.endsWith("/")) {
      entityDir = `${entityDir}/`;
    }
    const objectEntityPath = `${entityDir}${entityId}`;
    const { bucketName, objectName } = parseObjectPath(objectEntityPath);
    const bucket = objectStorageClient.bucket(bucketName);
    const objectFile = bucket.file(objectName);
    const [exists] = await objectFile.exists();
    if (!exists) {
      throw new ObjectNotFoundError();
    }
    return objectFile;
  }
  normalizeObjectEntityPath(rawPath) {
    if (!rawPath.startsWith("https://storage.googleapis.com/")) {
      return rawPath;
    }
    const url = new URL(rawPath);
    const rawObjectPath = url.pathname;
    let objectEntityDir = this.getPrivateObjectDir();
    if (!objectEntityDir.endsWith("/")) {
      objectEntityDir = `${objectEntityDir}/`;
    }
    if (!rawObjectPath.startsWith(objectEntityDir)) {
      return rawObjectPath;
    }
    const entityId = rawObjectPath.slice(objectEntityDir.length);
    return `/objects/${entityId}`;
  }
  async trySetObjectEntityAclPolicy(rawPath, aclPolicy) {
    const normalizedPath = this.normalizeObjectEntityPath(rawPath);
    if (!normalizedPath.startsWith("/")) {
      return normalizedPath;
    }
    const objectFile = await this.getObjectEntityFile(normalizedPath);
    await setObjectAclPolicy(objectFile, aclPolicy);
    return normalizedPath;
  }
  async canAccessObjectEntity({
    userId,
    objectFile,
    requestedPermission
  }) {
    return canAccessObject({
      userId,
      objectFile,
      requestedPermission: requestedPermission ?? "read" /* READ */
    });
  }
};
function parseObjectPath(path3) {
  if (!path3.startsWith("/")) {
    path3 = `/${path3}`;
  }
  const pathParts = path3.split("/");
  if (pathParts.length < 3) {
    throw new Error("Invalid path: must contain at least a bucket name");
  }
  const bucketName = pathParts[1];
  const objectName = pathParts.slice(2).join("/");
  return { bucketName, objectName };
}
async function signObjectURL({
  bucketName,
  objectName,
  method,
  ttlSec
}) {
  const request = {
    bucket_name: bucketName,
    object_name: objectName,
    method,
    expires_at: new Date(Date.now() + ttlSec * 1e3).toISOString()
  };
  const response = await fetch(
    `${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request)
    }
  );
  if (!response.ok) {
    throw new Error(
      `Failed to sign object URL, errorcode: ${response.status}, make sure you're running on Replit`
    );
  }
  const { signed_url: signedURL } = await response.json();
  return signedURL;
}

// server/mock-data.ts
var MOCK_USERS = [
  {
    id: "mock-user-alice",
    phoneNumber: "+1234567001",
    displayName: "Alice",
    avatarIndex: 0,
    isVip: false
  },
  {
    id: "mock-user-bob",
    phoneNumber: "+1234567002",
    displayName: "Bob",
    avatarIndex: 1,
    isVip: true
  },
  {
    id: "mock-user-charlie",
    phoneNumber: "+1234567003",
    displayName: "Charlie",
    avatarIndex: 2,
    isVip: false
  }
];
function getMockConversations(reviewerUserId) {
  const now = /* @__PURE__ */ new Date();
  return MOCK_USERS.map((user, index2) => ({
    id: `mock-conv-${user.id}`,
    otherUserId: user.id,
    otherUserName: user.displayName,
    otherUserAvatar: user.avatarIndex,
    otherUserPhone: user.phoneNumber,
    lastMessage: getInitialMessage(user.displayName),
    lastMessageAt: new Date(now.getTime() - (index2 + 1) * 36e5).toISOString(),
    unreadCount: index2 === 0 ? 1 : 0
  }));
}
function getInitialMessage(name) {
  const messages2 = {
    "Alice": "Hey! Welcome to SecureConnect. Feel free to message me!",
    "Bob": "Hi there! I love the encryption features here.",
    "Charlie": "Nice to meet you! This app is great for privacy."
  };
  return messages2[name] || "Hello!";
}
function getMockMessages(conversationId, reviewerUserId) {
  const mockUser = MOCK_USERS.find((u) => conversationId === `mock-conv-${u.id}`);
  if (!mockUser) return [];
  const now = /* @__PURE__ */ new Date();
  const baseTime = now.getTime() - 36e5;
  const messageTemplates = {
    "Alice": [
      "Hey! Welcome to SecureConnect!",
      "All our messages are end-to-end encrypted.",
      "Feel free to send me a message to test the chat!"
    ],
    "Bob": [
      "Hi! Great to see you on SecureConnect.",
      "I really like the VIP features, especially the virtual phone number!",
      "Have you tried making a call yet?"
    ],
    "Charlie": [
      "Hello! Nice to meet you.",
      "This app keeps all our conversations private.",
      "Let me know if you have any questions!"
    ]
  };
  const templates = messageTemplates[mockUser.displayName] || ["Hello!"];
  return templates.map((content, index2) => ({
    id: `mock-msg-${conversationId}-${index2}`,
    conversationId,
    senderId: mockUser.id,
    receiverId: reviewerUserId,
    content,
    mediaUrl: null,
    mediaType: null,
    createdAt: new Date(baseTime + index2 * 6e4).toISOString(),
    isEncrypted: true,
    status: "read"
  }));
}
var AUTO_REPLIES = [
  "That's great to hear! SecureConnect keeps all our messages private.",
  "I love how easy it is to use this app!",
  "The encryption here is top-notch. Very secure!",
  "Have you tried the voice call feature? It works really well!",
  "Thanks for your message! I appreciate the quick response.",
  "This is such a convenient way to stay in touch securely.",
  "I feel much safer knowing our chats are encrypted.",
  "The app design is really clean and modern!"
];
var replyIndex = 0;
function getAutoReply() {
  const reply = AUTO_REPLIES[replyIndex % AUTO_REPLIES.length];
  replyIndex++;
  return reply;
}
function isMockUser(userId) {
  return userId.startsWith("mock-user-");
}
function isMockConversation(conversationId) {
  return conversationId.startsWith("mock-conv-");
}
function createMockBotReply(conversationId, botUserId, reviewerUserId) {
  return {
    id: `mock-msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    conversationId,
    senderId: botUserId,
    receiverId: reviewerUserId,
    content: getAutoReply(),
    mediaUrl: null,
    mediaType: null,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    isEncrypted: true,
    status: "sent"
  };
}

// server/pushNotifications.ts
var EXPO_PUSH_API = "https://exp.host/--/api/v2/push/send";
function getChannelAndPriority(type) {
  switch (type) {
    case "incoming_call":
    case "missed_call":
      return { channelId: "calls", priority: "high", sound: "default" };
    case "message":
      return { channelId: "messages", priority: "high", sound: "default" };
    case "activity":
      return { channelId: "activity", priority: "normal", sound: null };
    default:
      return { channelId: "messages", priority: "default", sound: "default" };
  }
}
async function sendPushNotification(pushToken, title, body, data, type = "message") {
  if (!pushToken || !pushToken.startsWith("ExponentPushToken")) {
    console.log("Invalid push token format:", pushToken?.substring(0, 20));
    return null;
  }
  const { channelId, priority, sound } = getChannelAndPriority(type);
  const message = {
    to: pushToken,
    sound,
    title,
    body,
    data: { ...data, type },
    channelId,
    priority
  };
  try {
    const response = await fetch(EXPO_PUSH_API, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(message)
    });
    const result = await response.json();
    if (result.data && result.data.length > 0) {
      const ticket = result.data[0];
      if (ticket.status === "error") {
        console.error("Push notification error:", ticket.message, ticket.details);
      } else {
        console.log(`Push notification sent successfully (${type}):`, ticket.id);
      }
      return ticket;
    }
    return null;
  } catch (error) {
    console.error("Error sending push notification:", error);
    return null;
  }
}
async function sendCallNotification(pushToken, callerName, callType, callId, callerId, conversationId) {
  const title = `Incoming ${callType === "video" ? "Video" : "Audio"} Call`;
  const body = `${callerName} is calling you`;
  return sendPushNotification(
    pushToken,
    title,
    body,
    {
      callId,
      callerId,
      callerName,
      callType,
      conversationId
    },
    "incoming_call"
  );
}
async function sendMissedCallNotification(pushToken, callerName, callType, callerId, conversationId) {
  const title = "Missed Call";
  const body = `You missed a ${callType === "video" ? "video" : ""} call from ${callerName}`;
  return sendPushNotification(
    pushToken,
    title,
    body,
    {
      callerId,
      callerName,
      callType,
      conversationId
    },
    "missed_call"
  );
}
async function sendMessageNotification(pushToken, senderName, messagePreview, conversationId, senderId) {
  return sendPushNotification(
    pushToken,
    senderName,
    messagePreview,
    {
      conversationId,
      otherUserId: senderId,
      senderName
    },
    "message"
  );
}

// server/routes.ts
var import_crypto3 = __toESM(require("crypto"));
var AccessToken = import_twilio2.default.jwt.AccessToken;
var VideoGrant = AccessToken.VideoGrant;
var socketIO = null;
function getIO() {
  return socketIO;
}
var JWT_SECRET = (() => {
  const fromEnv = process.env.SESSION_SECRET;
  if (fromEnv && fromEnv.length >= 32) return fromEnv;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "SESSION_SECRET is required in production and must be at least 32 characters. Set it in the deployment environment variables before booting."
    );
  }
  return fromEnv || "securechat-secret-key-dev-only-do-not-use-in-prod";
})();
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }
  try {
    const decoded = import_jsonwebtoken.default.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    req.deviceId = decoded.did;
    storage.getUser(decoded.userId).then((user) => {
      if (!user) {
        return res.status(403).json({ error: "User not found" });
      }
      if (user.isSuspended) {
        const until = user.chatLimitUntil ? new Date(user.chatLimitUntil).getTime() : null;
        if (until !== null && until <= Date.now()) {
          storage.unsuspendUser(decoded.userId).then(() => next()).catch(() => res.status(500).json({ error: "Auth check failed" }));
          return;
        }
        return res.status(403).json({
          error: "Account suspended",
          reason: user.suspensionReason || "Violation of community guidelines",
          suspended: true
        });
      }
      const currentTv = user.tokenVersion ?? 0;
      const tokenTv = decoded.tv ?? 0;
      if (tokenTv < currentTv) {
        return res.status(401).json({ error: "Session expired. Please sign in again." });
      }
      next();
    }).catch(() => res.status(500).json({ error: "Auth check failed" }));
  } catch (error) {
    return res.status(403).json({ error: "Invalid token" });
  }
}
function getClientIp(req) {
  const fwd = req.headers["x-forwarded-for"] || "";
  const ip = fwd.split(",")[0].trim() || req.socket.remoteAddress || "";
  return ip || null;
}
function generateSafeCode() {
  const bytes = import_crypto3.default.randomBytes(12).toString("hex").toUpperCase();
  return bytes.match(/.{1,4}/g).join("-");
}
function hashSafeCode(code) {
  const normalized = code.replace(/[-\s]/g, "").toUpperCase();
  return import_bcryptjs.default.hashSync(normalized, 10);
}
function verifySafeCode(code, hash) {
  const normalized = code.replace(/[-\s]/g, "").toUpperCase();
  return import_bcryptjs.default.compareSync(normalized, hash);
}
async function registerRoutes(app2) {
  const connectedUsers = /* @__PURE__ */ new Map();
  app2.get("/privacy", (req, res) => {
    const privacyPath = import_path2.default.resolve(process.cwd(), "server", "templates", "privacy-policy.html");
    const html = import_fs.default.readFileSync(privacyPath, "utf-8");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(html);
  });
  app2.get("/support", (req, res) => {
    const supportPath = import_path2.default.resolve(process.cwd(), "server", "templates", "support.html");
    const html = import_fs.default.readFileSync(supportPath, "utf-8");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(html);
  });
  app2.get("/terms", (req, res) => {
    const termsPath = import_path2.default.resolve(process.cwd(), "server", "templates", "terms-of-service.html");
    const html = import_fs.default.readFileSync(termsPath, "utf-8");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(html);
  });
  app2.get("/api/auth/geo-permissions", (req, res) => {
    try {
      const result = getEnabledSmsCountries();
      res.json({
        twilioConfigured: isTwilioConfigured(),
        countriesConfigured: result.configured,
        countries: result.countries,
        message: result.message
      });
    } catch (error) {
      console.error("Error getting geo permissions:", error);
      res.status(500).json({
        twilioConfigured: false,
        countriesConfigured: false,
        countries: [
          { isoCode: "US", name: "United States", dialCode: "+1" },
          { isoCode: "CA", name: "Canada", dialCode: "+1" }
        ],
        message: "Error loading country configuration"
      });
    }
  });
  app2.get("/api/stats/announcement", async (req, res) => {
    try {
      const stats = await storage.getAnnouncementStats();
      res.json(stats);
    } catch (error) {
      console.error("Error getting announcement stats:", error);
      res.json({
        activeUsers: 0,
        totalUsers: 0,
        recentMessage: "Welcome to SecureConnect"
      });
    }
  });
  const APPLE_REVIEW_TEST_DIGITS = process.env.APPLE_REVIEW_TEST_DIGITS || "5551234567";
  const APPLE_DEMO_CODE = "123456";
  let reviewModeEnabled = (process.env.REVIEW_MODE || "false").toLowerCase() === "true";
  const TEST_PHONE_PATTERNS = [
    "5551234567",
    // +1 555-123-4567 or any country code
    "5550000000"
    // +1 555-000-0000 or any country code
  ];
  const VIP_PHONE_NUMBERS = [
    "61474011265"
    // +61 474 011 265 (developer account)
  ];
  const isAppleReviewTestNumber = (phoneNumber) => {
    const digitsOnly = phoneNumber.replace(/\D/g, "");
    const matchesTestPattern = TEST_PHONE_PATTERNS.some(
      (pattern) => digitsOnly.endsWith(pattern) || digitsOnly.includes(pattern)
    );
    const endsWithTestDigits = digitsOnly.endsWith(APPLE_REVIEW_TEST_DIGITS);
    const containsTestPattern = digitsOnly.includes(APPLE_REVIEW_TEST_DIGITS);
    return matchesTestPattern || endsWithTestDigits || containsTestPattern;
  };
  const isVipPhoneNumber = (phoneNumber) => {
    const digitsOnly = phoneNumber.replace(/\D/g, "");
    return VIP_PHONE_NUMBERS.some((vipNumber) => digitsOnly.endsWith(vipNumber) || digitsOnly === vipNumber);
  };
  const shouldGetFreeVip = (phoneNumber) => {
    return isAppleReviewTestNumber(phoneNumber) || isVipPhoneNumber(phoneNumber);
  };
  const isAppleReviewerUser = async (userId) => {
    try {
      const user = await storage.getUser(userId);
      if (!user) return false;
      return isAppleReviewTestNumber(user.phoneNumber);
    } catch {
      return false;
    }
  };
  const isDevMode = () => {
    return process.env.REPLIT_DEPLOYMENT !== "1" && process.env.NODE_ENV !== "production";
  };
  app2.post("/api/auth/send-code", async (req, res) => {
    try {
      const { phoneNumber: rawPhone } = req.body;
      if (!rawPhone || typeof rawPhone !== "string") {
        return res.status(400).json({ error: "Please enter your phone number." });
      }
      const digitsOnly = rawPhone.replace(/\D/g, "");
      if (digitsOnly.length < 7 || digitsOnly.length > 15) {
        return res.status(400).json({ error: "Please enter a valid phone number with country code." });
      }
      const phoneNumber = rawPhone.trim().startsWith("+") ? `+${digitsOnly}` : `+${digitsOnly}`;
      if (reviewModeEnabled && isAppleReviewTestNumber(phoneNumber)) {
        const expiresAt2 = new Date(Date.now() + 60 * 60 * 1e3);
        await storage.createVerificationCode(phoneNumber, APPLE_DEMO_CODE, expiresAt2);
        console.log(`[APPLE REVIEW] Demo verification ready for: ${phoneNumber} (code: ${APPLE_DEMO_CODE})`);
        return res.json({ success: true, message: "Verification code sent" });
      }
      const code = generateVerificationCode();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1e3);
      await storage.createVerificationCode(phoneNumber, code, expiresAt);
      const twilioConfigured = (process.env.TWILIO_ACCOUNT_SID || process.env.Twilio_Account_SID) && (process.env.TWILIO_AUTH_TOKEN || process.env.Twilio_Auth_Token) && (process.env.TWILIO_PHONE_NUMBER || process.env.Twilio_Phone_Number);
      if (twilioConfigured) {
        const result = await sendVerificationSMS(phoneNumber, code);
        if (!result.success) {
          return res.status(400).json({
            error: result.userMessage || "Failed to send verification code"
          });
        }
      } else {
        console.log(`[DEV MODE] Verification code for ${phoneNumber}: ${code}`);
      }
      res.json({ success: true, message: "Verification code sent" });
    } catch (error) {
      console.error("Error sending code:", error);
      res.status(500).json({ error: "Something went wrong. Please try again." });
    }
  });
  app2.post("/api/auth/verify-code", async (req, res) => {
    try {
      const { phoneNumber: rawPhone, code, deviceId, deviceName, platform } = req.body;
      if (!rawPhone || !code || typeof rawPhone !== "string" || typeof code !== "string") {
        return res.status(400).json({ error: "Phone number and code are required" });
      }
      const verifyDigits = rawPhone.replace(/\D/g, "");
      if (verifyDigits.length < 7 || verifyDigits.length > 15) {
        return res.status(400).json({ error: "Please enter a valid phone number with country code." });
      }
      const phoneNumber = `+${verifyDigits}`;
      const isDemoBypass = reviewModeEnabled && isAppleReviewTestNumber(phoneNumber) && code === APPLE_DEMO_CODE;
      if (!isDemoBypass) {
        const verificationCode = await storage.getVerificationCode(phoneNumber, code);
        if (!verificationCode) {
          return res.status(400).json({ error: "Invalid verification code" });
        }
        if (/* @__PURE__ */ new Date() > verificationCode.expiresAt) {
          return res.status(400).json({ error: "Verification code expired" });
        }
        await storage.markCodeVerified(verificationCode.id);
      } else {
        console.log(`[APPLE REVIEW] Demo bypass accepted for: ${phoneNumber}`);
      }
      let user = await storage.getUserByPhone(phoneNumber);
      let isNewUser = false;
      if (!user) {
        user = await storage.createUser({ phoneNumber });
        isNewUser = true;
        storage.processNewUserJoined(phoneNumber).catch((err) => {
          console.error("Error processing new user join notifications:", err);
        });
      }
      const grantVip = isDemoBypass || isAppleReviewTestNumber(phoneNumber) || isVipPhoneNumber(phoneNumber);
      if (grantVip && !user.isVip) {
        user = await storage.updateUser(user.id, { isVip: true, vipStartedAt: /* @__PURE__ */ new Date() }) || user;
        console.log(`[AUTO VIP] Granted VIP access to: ${phoneNumber}`);
      }
      const tokenVersion = user.tokenVersion ?? 0;
      const token = import_jsonwebtoken.default.sign({ userId: user.id, tv: tokenVersion, did: deviceId ?? void 0 }, JWT_SECRET, { expiresIn: "30d" });
      let pendingSafeCode;
      if (isNewUser && !user.safeCodeHash) {
        try {
          const generated = generateSafeCode();
          const hash = hashSafeCode(generated);
          await storage.updateUser(user.id, { safeCodeHash: hash, safeCodeAcknowledged: false });
          user = { ...user, safeCodeHash: hash, safeCodeAcknowledged: false };
          pendingSafeCode = generated;
        } catch (e) {
          console.error("Failed to auto-generate Safe Code at signup:", e);
        }
      }
      let isNewDevice = false;
      if (deviceId) {
        try {
          const existingDevices = await storage.listDevices(user.id);
          isNewDevice = !existingDevices.some((d) => d.deviceId === deviceId);
        } catch {
          isNewDevice = !isNewUser;
        }
      }
      const ipAddress = getClientIp(req);
      const userAgent = req.headers["user-agent"] || null;
      storage.recordLoginEvent({
        userId: user.id,
        deviceId: deviceId ?? null,
        deviceName: deviceName ?? null,
        platform: platform ?? null,
        ipAddress,
        userAgent: typeof userAgent === "string" ? userAgent : null,
        isNewDevice: isNewDevice && !isNewUser
      }).catch((err) => console.error("Failed to record login event:", err));
      if (isNewDevice && !isNewUser && user.pushToken && user.notificationsEnabled !== false) {
        const where = deviceName ? ` from ${deviceName}` : "";
        sendPushNotification(
          user.pushToken,
          "New login detected",
          `New login to your SecureConnect account${where}. If this wasn't you, secure your account.`,
          { type: "security-alert", subtype: "new-login" },
          "activity"
        ).catch((err) => console.error("Failed to send new-login notification:", err));
      }
      res.json({
        success: true,
        token,
        user: {
          id: user.id,
          phoneNumber: user.phoneNumber,
          displayName: user.displayName,
          avatarIndex: user.avatarIndex,
          avatarUrl: user.avatarUrl,
          isVip: user.isVip,
          isAdFree: user.isAdFree,
          vipStartedAt: user.vipStartedAt,
          lastNameChangeAt: user.lastNameChangeAt,
          notificationsEnabled: user.notificationsEnabled ?? false,
          safeCodeAcknowledged: user.safeCodeAcknowledged ?? false,
          hasSafeCode: !!user.safeCodeHash
        },
        isNewUser,
        isNewDevice,
        // Returned exactly once at signup; the client persists this in
        // SecureStore until the user acknowledges saving it.
        pendingSafeCode
      });
    } catch (error) {
      console.error("Error verifying code:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.post("/api/auth/safe-code/generate", authenticateToken, async (req, res) => {
    try {
      const user = await storage.getUser(req.userId);
      if (!user) return res.status(404).json({ error: "User not found" });
      if (user.safeCodeHash) {
        return res.status(400).json({ error: "Safe code already exists. It cannot be regenerated for security reasons." });
      }
      const code = generateSafeCode();
      const hash = hashSafeCode(code);
      await storage.updateUser(user.id, { safeCodeHash: hash, safeCodeAcknowledged: false });
      res.json({ success: true, code });
    } catch (error) {
      console.error("Error generating safe code:", error);
      res.status(500).json({ error: "Could not generate safe code" });
    }
  });
  app2.post("/api/auth/safe-code/acknowledge", authenticateToken, async (req, res) => {
    try {
      const user = await storage.getUser(req.userId);
      if (!user) return res.status(404).json({ error: "User not found" });
      if (!user.safeCodeHash) {
        return res.status(400).json({ error: "No safe code generated yet. Generate one before acknowledging." });
      }
      await storage.updateUser(req.userId, { safeCodeAcknowledged: true });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Could not save acknowledgement" });
    }
  });
  app2.post("/api/auth/safe-code/verify", authenticateToken, async (req, res) => {
    try {
      const { code } = req.body;
      if (!code) return res.status(400).json({ error: "Code required" });
      const user = await storage.getUser(req.userId);
      if (!user || !user.safeCodeHash) {
        return res.status(400).json({ error: "No safe code on file" });
      }
      const valid = verifySafeCode(code, user.safeCodeHash);
      res.json({ valid });
    } catch (error) {
      res.status(500).json({ error: "Verification failed" });
    }
  });
  app2.get("/api/auth/login-events", authenticateToken, async (req, res) => {
    try {
      const events = await storage.getLoginEvents(req.userId, 50);
      res.json(events);
    } catch (error) {
      res.status(500).json({ error: "Could not fetch login history" });
    }
  });
  app2.post("/api/auth/logout-all-others", authenticateToken, async (req, res) => {
    try {
      const newVersion = await storage.bumpTokenVersion(req.userId, req.deviceId ?? null);
      const newToken = import_jsonwebtoken.default.sign(
        { userId: req.userId, tv: newVersion, did: req.deviceId ?? void 0 },
        JWT_SECRET,
        { expiresIn: "30d" }
      );
      try {
        if (socketIO) {
          const room = await socketIO.in(req.userId).fetchSockets();
          for (const s of room) {
            try {
              s.disconnect(true);
            } catch {
            }
          }
        }
      } catch (e) {
        console.error("Failed to disconnect sockets on logout-all-others:", e);
      }
      res.json({ success: true, token: newToken });
    } catch (error) {
      res.status(500).json({ error: "Logout failed" });
    }
  });
  app2.get("/api/auth/me", authenticateToken, async (req, res) => {
    try {
      const user = await storage.getUser(req.userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      res.setHeader("ETag", `W/"me-${Date.now()}-${Math.random().toString(36).slice(2)}"`);
      res.json({
        id: user.id,
        phoneNumber: user.phoneNumber,
        displayName: user.displayName,
        avatarIndex: user.avatarIndex,
        avatarUrl: user.avatarUrl,
        isVip: user.isVip,
        isAdFree: user.isAdFree,
        vipStartedAt: user.vipStartedAt,
        lastNameChangeAt: user.lastNameChangeAt,
        notificationsEnabled: user.notificationsEnabled ?? false,
        safeCodeAcknowledged: user.safeCodeAcknowledged ?? false,
        hasSafeCode: !!user.safeCodeHash,
        // Privacy & messaging preferences (build 59)
        readReceiptsEnabled: user.readReceiptsEnabled ?? true,
        typingIndicatorsEnabled: user.typingIndicatorsEnabled ?? true,
        showNotificationPreview: user.showNotificationPreview ?? true,
        defaultDisappearingTimer: user.defaultDisappearingTimer ?? 0,
        // Stories preferences
        storiesEnabled: user.storiesEnabled ?? true,
        storyPrivacyMode: user.storyPrivacyMode ?? "everyone",
        storyPrivacyExceptIds: user.storyPrivacyExceptIds ?? [],
        storyPrivacyOnlyIds: user.storyPrivacyOnlyIds ?? [],
        storyViewReceiptsEnabled: user.storyViewReceiptsEnabled ?? true
      });
    } catch (error) {
      console.error("Error getting user:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.put("/api/auth/profile", authenticateToken, async (req, res) => {
    try {
      const { displayName, avatarIndex } = req.body;
      const oldUser = await storage.getUser(req.userId);
      if (!oldUser) {
        return res.status(404).json({ error: "User not found" });
      }
      const isNameChanging = displayName && oldUser.displayName && displayName !== oldUser.displayName;
      if (isNameChanging && oldUser.lastNameChangeAt) {
        const lastChange = new Date(oldUser.lastNameChangeAt);
        const daysSinceChange = (Date.now() - lastChange.getTime()) / (1e3 * 60 * 60 * 24);
        if (daysSinceChange < 30) {
          const daysRemaining = Math.ceil(30 - daysSinceChange);
          return res.status(400).json({
            error: `You can change your name again in ${daysRemaining} day${daysRemaining === 1 ? "" : "s"}`,
            daysRemaining,
            nextChangeDate: new Date(lastChange.getTime() + 30 * 24 * 60 * 60 * 1e3).toISOString()
          });
        }
      }
      const updateData = { avatarIndex };
      if (displayName !== void 0) {
        updateData.displayName = displayName;
        if (isNameChanging || !oldUser.displayName && displayName) {
          updateData.lastNameChangeAt = /* @__PURE__ */ new Date();
        }
      }
      const user = await storage.updateUser(req.userId, updateData);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      if (displayName && !oldUser.displayName && user.phoneNumber) {
        storage.processNewUserJoined(user.phoneNumber, displayName).catch((err) => {
          console.error("Error processing join notifications after profile setup:", err);
        });
      }
      res.json({
        id: user.id,
        phoneNumber: user.phoneNumber,
        displayName: user.displayName,
        avatarIndex: user.avatarIndex,
        avatarUrl: user.avatarUrl,
        isVip: user.isVip,
        isAdFree: user.isAdFree,
        lastNameChangeAt: user.lastNameChangeAt
      });
    } catch (error) {
      console.error("Error updating profile:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.post("/api/keys", authenticateToken, async (req, res) => {
    try {
      const { publicKey } = req.body;
      if (!publicKey) {
        return res.status(400).json({ error: "publicKey required" });
      }
      await storage.updateUser(req.userId, { publicKey });
      res.json({ ok: true });
    } catch (error) {
      console.error("Error saving public key:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.get("/api/keys/:userId", authenticateToken, async (req, res) => {
    try {
      const user = await storage.getUser(req.params.userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json({ publicKey: user.publicKey || null });
    } catch (error) {
      console.error("Error fetching public key:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.post("/api/e2ee/devices/register", authenticateToken, async (req, res) => {
    try {
      const { deviceId, identityPublicKey, signingPublicKey } = req.body;
      if (!deviceId || !identityPublicKey || !signingPublicKey) {
        return res.status(400).json({ error: "deviceId, identityPublicKey, signingPublicKey required" });
      }
      const device = await storage.registerDevice(req.userId, deviceId, identityPublicKey, signingPublicKey);
      res.json({ ok: true, deviceId: device.deviceId });
    } catch (error) {
      res.status(500).json({ error: "Failed to register device" });
    }
  });
  app2.post("/api/e2ee/prekeys/signed", authenticateToken, async (req, res) => {
    try {
      const { keyId, publicKey, signature } = req.body;
      if (!keyId || !publicKey || !signature) {
        return res.status(400).json({ error: "keyId, publicKey, signature required" });
      }
      await storage.upsertSignedPrekey(req.userId, keyId, publicKey, signature);
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to upload signed prekey" });
    }
  });
  app2.post("/api/e2ee/prekeys/onetime", authenticateToken, async (req, res) => {
    try {
      const { keys } = req.body;
      if (!Array.isArray(keys) || keys.length === 0) {
        return res.status(400).json({ error: "keys array required" });
      }
      const sanitised = keys.filter((k) => typeof k.id === "string" && typeof k.publicKey === "string").map((k) => ({ keyId: k.id, publicKey: k.publicKey }));
      if (sanitised.length === 0) {
        return res.status(400).json({ error: "No valid keys provided" });
      }
      await storage.addOneTimePrekeys(req.userId, sanitised);
      res.json({ ok: true, count: sanitised.length });
    } catch (error) {
      res.status(500).json({ error: "Failed to upload one-time prekeys" });
    }
  });
  app2.get("/api/e2ee/prekeys/bundle/:userId", authenticateToken, async (req, res) => {
    try {
      const targetUserId = req.params.userId;
      if (targetUserId === req.userId) {
        return res.status(400).json({ error: "Cannot fetch your own bundle" });
      }
      const bundle = await storage.getPreKeyBundle(targetUserId);
      if (!bundle) {
        return res.status(404).json({ error: "no_keys" });
      }
      res.json(bundle);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch prekey bundle" });
    }
  });
  app2.get("/api/e2ee/prekeys/count", authenticateToken, async (req, res) => {
    try {
      const count = await storage.countUnusedOneTimePrekeys(req.userId);
      res.json({ count });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch prekey count" });
    }
  });
  app2.get("/api/e2ee/devices", authenticateToken, async (req, res) => {
    try {
      const devices = await storage.listDevices(req.userId);
      res.json(devices);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch devices" });
    }
  });
  app2.delete("/api/e2ee/devices/:deviceId", authenticateToken, async (req, res) => {
    try {
      const { deviceId } = req.params;
      const revoked = await storage.revokeDevice(req.userId, deviceId);
      if (!revoked) return res.status(404).json({ error: "Device not found" });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to revoke device" });
    }
  });
  app2.post("/api/e2ee/backup", authenticateToken, async (req, res) => {
    try {
      const { deviceId, encryptedBlob, salt, nonce } = req.body;
      if (!deviceId || !encryptedBlob || !salt || !nonce) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      await storage.upsertBackup(req.userId, deviceId, encryptedBlob, salt, nonce);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to save backup" });
    }
  });
  app2.get("/api/e2ee/backup", authenticateToken, async (req, res) => {
    try {
      const backup = await storage.getBackup(req.userId);
      if (!backup) return res.status(404).json({ error: "No backup found" });
      res.json(backup);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch backup" });
    }
  });
  app2.delete("/api/auth/account", authenticateToken, async (req, res) => {
    try {
      const user = await storage.getUser(req.userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      await storage.deleteUserAccount(req.userId);
      console.log(`[ACCOUNT DELETED] User ${req.userId} (${user.phoneNumber}) permanently deleted`);
      res.json({ success: true, message: "Account permanently deleted" });
    } catch (error) {
      console.error("Error deleting account:", error);
      res.status(500).json({ error: "Failed to delete account. Please try again." });
    }
  });
  app2.post("/api/push-token", authenticateToken, async (req, res) => {
    try {
      const { pushToken } = req.body;
      const tokenValue = pushToken || null;
      await storage.updateUser(req.userId, { pushToken: tokenValue });
      console.log(`Push token ${tokenValue ? "registered" : "cleared"} for user ${req.userId}`);
      res.json({ ok: true });
    } catch (error) {
      console.error("Error saving push token:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.put("/api/notifications/settings", authenticateToken, async (req, res) => {
    try {
      const { enabled } = req.body;
      await storage.updateUser(req.userId, { notificationsEnabled: enabled });
      res.json({ ok: true, notificationsEnabled: enabled });
    } catch (error) {
      console.error("Error updating notification settings:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  const OWNER_PHONE_FULL = process.env.OWNER_PHONE_NUMBER;
  if (!OWNER_PHONE_FULL) {
    console.warn("[SECURITY] OWNER_PHONE_NUMBER environment variable not set - admin endpoints disabled");
  }
  const isOwnerPhone = (phoneNumber) => {
    if (!OWNER_PHONE_FULL) {
      return false;
    }
    const digitsOnly = phoneNumber.replace(/\D/g, "");
    const ownerDigits = OWNER_PHONE_FULL.replace(/\D/g, "");
    return digitsOnly === ownerDigits;
  };
  app2.get("/api/review-mode", (req, res) => {
    res.json({ reviewMode: reviewModeEnabled });
  });
  app2.post("/api/admin/review-mode", authenticateToken, async (req, res) => {
    try {
      const requestingUser = await storage.getUser(req.userId);
      if (!requestingUser || !isOwnerPhone(requestingUser.phoneNumber)) {
        return res.status(403).json({ error: "Unauthorized - Owner access only" });
      }
      const { enabled } = req.body;
      if (typeof enabled !== "boolean") {
        return res.status(400).json({ error: "enabled must be a boolean" });
      }
      reviewModeEnabled = enabled;
      console.log(`[ADMIN] Review mode ${enabled ? "ENABLED" : "DISABLED"} by owner`);
      res.json({ success: true, reviewMode: reviewModeEnabled });
    } catch (error) {
      console.error("Error toggling review mode:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.get("/api/admin/check-owner", authenticateToken, async (req, res) => {
    try {
      const user = await storage.getUser(req.userId);
      if (!user) {
        return res.json({ isOwner: false });
      }
      res.json({ isOwner: isOwnerPhone(user.phoneNumber) });
    } catch (error) {
      res.json({ isOwner: false });
    }
  });
  app2.get("/api/admin/users", authenticateToken, async (req, res) => {
    try {
      const requestingUser = await storage.getUser(req.userId);
      if (!requestingUser) {
        return res.status(403).json({ error: "Unauthorized" });
      }
      if (!isOwnerPhone(requestingUser.phoneNumber)) {
        console.log(`[ADMIN] Unauthorized access attempt from user ${req.userId}`);
        return res.status(403).json({ error: "Unauthorized - Owner access only" });
      }
      console.log(`[ADMIN] Owner accessed user list`);
      const allUsers = await storage.listAllUsers();
      res.json(allUsers.map((user) => ({
        id: user.id,
        phoneNumber: user.phoneNumber,
        displayName: user.displayName || "Not set",
        createdAt: user.createdAt
      })));
    } catch (error) {
      console.error("Error fetching admin users:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.get("/api/admin/reports", authenticateToken, async (req, res) => {
    try {
      const requestingUser = await storage.getUser(req.userId);
      if (!requestingUser || !isOwnerPhone(requestingUser.phoneNumber)) {
        return res.status(403).json({ error: "Unauthorized - Owner access only" });
      }
      const status = typeof req.query.status === "string" ? req.query.status : void 0;
      const limit = req.query.limit ? Math.max(1, Math.min(500, Number(req.query.limit))) : 100;
      const reports = await storage.listReports({ status, limit });
      res.json(reports);
    } catch (error) {
      console.error("[ADMIN] list reports failed:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.post("/api/admin/reports/:id/action", authenticateToken, async (req, res) => {
    try {
      const requestingUser = await storage.getUser(req.userId);
      if (!requestingUser || !isOwnerPhone(requestingUser.phoneNumber)) {
        return res.status(403).json({ error: "Unauthorized - Owner access only" });
      }
      const { id } = req.params;
      const { action, notes } = req.body || {};
      const ALLOWED_ACTIONS = ["dismiss", "warn", "suspend", "unsuspend", "reviewed"];
      if (!ALLOWED_ACTIONS.includes(action)) {
        return res.status(400).json({ error: `action must be one of ${ALLOWED_ACTIONS.join(", ")}` });
      }
      if (notes !== void 0 && notes !== null && typeof notes !== "string") {
        return res.status(400).json({ error: "notes must be a string" });
      }
      if (typeof notes === "string" && notes.length > 2e3) {
        return res.status(400).json({ error: "notes must be 2000 characters or fewer" });
      }
      const report = await storage.getReport(id);
      if (!report) return res.status(404).json({ error: "Report not found" });
      const now = /* @__PURE__ */ new Date();
      const noteSuffix = notes ? ` \u2014 ${String(notes).slice(0, 500)}` : "";
      let nextStatus = report.status;
      let actionTaken = report.actionTaken ?? null;
      if (action === "dismiss") {
        nextStatus = "dismissed";
        actionTaken = `dismissed${noteSuffix}`;
      } else if (action === "reviewed") {
        nextStatus = "reviewed";
        actionTaken = `reviewed_no_action${noteSuffix}`;
      } else if (action === "warn") {
        nextStatus = "actioned";
        actionTaken = `warned${noteSuffix}`;
      } else if (action === "suspend") {
        nextStatus = "actioned";
        actionTaken = `suspended${noteSuffix}`;
        await storage.suspendUser(report.reportedUserId, `Reported for ${report.reason}${noteSuffix}`);
        try {
          if (socketIO) {
            const sockets = await socketIO.in(report.reportedUserId).fetchSockets();
            for (const s of sockets) {
              try {
                s.emit("account-suspended", { reason: report.reason });
              } catch {
              }
              try {
                s.disconnect(true);
              } catch {
              }
            }
          }
        } catch (e) {
          console.error("[ADMIN] Failed to disconnect suspended user sockets:", e);
        }
        console.log(`[ADMIN][SUSPEND] user=${report.reportedUserId} by=${req.userId} report=${id}`);
      } else if (action === "unsuspend") {
        nextStatus = "reviewed";
        actionTaken = `unsuspended${noteSuffix}`;
        await storage.unsuspendUser(report.reportedUserId);
        console.log(`[ADMIN][UNSUSPEND] user=${report.reportedUserId} by=${req.userId} report=${id}`);
      }
      const updated = await storage.updateReport(id, {
        status: nextStatus,
        reviewedAt: now,
        reviewedBy: req.userId,
        actionTaken
      });
      res.json({ success: true, report: updated });
    } catch (error) {
      console.error("[ADMIN] action on report failed:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.get("/api/users/search", authenticateToken, async (req, res) => {
    try {
      const { phone } = req.query;
      if (!phone || typeof phone !== "string") {
        return res.json([]);
      }
      const user = await storage.getUserByPhone(phone);
      if (!user || user.id === req.userId) {
        return res.json([]);
      }
      res.json([{
        id: user.id,
        displayName: user.displayName,
        phoneNumber: user.phoneNumber,
        avatarIndex: user.avatarIndex,
        isVip: user.isVip
      }]);
    } catch (error) {
      console.error("Error searching users:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.get("/api/users/:userId/contact-info", authenticateToken, async (req, res) => {
    try {
      const { userId } = req.params;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      const virtualNumber = user.virtualNumberId ? await storage.getVirtualNumber(user.virtualNumberId) : null;
      res.json({
        phoneNumber: user.phoneNumber,
        virtualNumber: virtualNumber?.phoneNumber,
        preferredNumberType: user.preferredNumberType || "personal"
      });
    } catch (error) {
      console.error("Error fetching user contact info:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.post("/api/invite/send", authenticateToken, async (req, res) => {
    try {
      const { phoneNumber } = req.body;
      if (!phoneNumber) {
        return res.status(400).json({ error: "Phone number is required" });
      }
      const existingUser = await storage.getUserByPhone(phoneNumber);
      if (existingUser) {
        return res.status(400).json({ error: "This user is already on SecureConnect" });
      }
      const sender = await storage.getUser(req.userId);
      if (!sender) {
        return res.status(400).json({ error: "Sender not found" });
      }
      await storage.addPendingContact(req.userId, phoneNumber);
      const senderName = sender.displayName || "Someone";
      const twilioConfigured = (process.env.TWILIO_ACCOUNT_SID || process.env.Twilio_Account_SID) && (process.env.TWILIO_AUTH_TOKEN || process.env.Twilio_Auth_Token) && (process.env.TWILIO_PHONE_NUMBER || process.env.Twilio_Phone_Number);
      if (!twilioConfigured) {
        console.log(`[DEV MODE] Invite to ${phoneNumber} from ${senderName}: Join SecureConnect to start messaging!`);
        return res.json({ success: true, message: "Invite sent (dev mode)" });
      }
      const { sendInviteSMS: sendInviteSMS2 } = await Promise.resolve().then(() => (init_twilioClient(), twilioClient_exports));
      const sent = await sendInviteSMS2(phoneNumber, senderName);
      if (!sent) {
        return res.status(500).json({ error: "Failed to send SMS invite" });
      }
      res.json({ success: true, message: "Invite sent" });
    } catch (error) {
      console.error("Error sending invite:", error);
      res.status(500).json({ error: "Failed to send invite" });
    }
  });
  app2.post("/api/contacts/add-pending", authenticateToken, async (req, res) => {
    try {
      const { phoneNumber } = req.body;
      if (!phoneNumber) {
        return res.status(400).json({ error: "Phone number is required" });
      }
      const existingUser = await storage.getUserByPhone(phoneNumber);
      if (existingUser) {
        const conversation = await storage.getOrCreateConversation(req.userId, existingUser.id);
        return res.json({
          success: true,
          userExists: true,
          conversationId: conversation.id,
          user: {
            id: existingUser.id,
            displayName: existingUser.displayName,
            phoneNumber: existingUser.phoneNumber
          }
        });
      }
      await storage.addPendingContact(req.userId, phoneNumber);
      res.json({
        success: true,
        userExists: false,
        message: "Contact added. You will be notified when they join."
      });
    } catch (error) {
      console.error("Error adding pending contact:", error);
      res.status(500).json({ error: "Failed to add contact" });
    }
  });
  app2.get("/api/notifications/joins", authenticateToken, async (req, res) => {
    try {
      const notifications = await storage.getJoinNotifications(req.userId);
      res.json(notifications);
    } catch (error) {
      console.error("Error getting join notifications:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.put("/api/notifications/joins/:id/read", authenticateToken, async (req, res) => {
    try {
      await storage.markJoinNotificationRead(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking notification read:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.get("/api/users/:id/profile", authenticateToken, async (req, res) => {
    try {
      const userId = req.params.id;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      if (userId === req.userId) {
        return res.status(400).json({ error: "Cannot add yourself" });
      }
      res.json({
        id: user.id,
        displayName: user.displayName || "User",
        avatarIndex: user.avatarIndex || 0
      });
    } catch (error) {
      console.error("Error getting user profile:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.get("/api/qrcode/:userId", authenticateToken, async (req, res) => {
    try {
      const { userId } = req.params;
      const color = req.query.color || "#2563EB";
      const qrValue = `secureconnect://user/${userId}`;
      const qrDataUrl = await import_qrcode.default.toDataURL(qrValue, {
        width: 400,
        margin: 2,
        color: {
          dark: color,
          light: "#FFFFFF"
        },
        errorCorrectionLevel: "M"
      });
      res.json({ dataUrl: qrDataUrl });
    } catch (error) {
      console.error("Error generating QR code:", error);
      res.status(500).json({ error: "Failed to generate QR code" });
    }
  });
  app2.get("/api/conversations", authenticateToken, async (req, res) => {
    try {
      const numberType = req.query.numberType || "personal";
      const conversations2 = await storage.getConversations(req.userId, numberType);
      const isReviewer = await isAppleReviewerUser(req.userId);
      if (isReviewer && isDevMode() && numberType === "personal") {
        const mockConvs = getMockConversations(req.userId);
        const combinedConversations = [...mockConvs, ...conversations2];
        return res.json(combinedConversations);
      }
      res.json(conversations2);
    } catch (error) {
      console.error("Error getting conversations:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.post("/api/conversations", authenticateToken, async (req, res) => {
    try {
      const { otherUserId, numberType } = req.body;
      if (!otherUserId) {
        return res.status(400).json({ error: "Other user ID is required" });
      }
      const conversationNumberType = numberType || "personal";
      const conversation = await storage.getOrCreateConversation(req.userId, otherUserId, conversationNumberType);
      res.json(conversation);
    } catch (error) {
      console.error("Error creating conversation:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.get("/api/conversations/:id/messages", authenticateToken, async (req, res) => {
    try {
      const conversationId = req.params.id;
      if (isMockConversation(conversationId) && isDevMode()) {
        const isReviewer = await isAppleReviewerUser(req.userId);
        if (isReviewer) {
          const mockMessages = getMockMessages(conversationId, req.userId);
          return res.json(mockMessages);
        }
      }
      const isParticipant = await storage.isConversationParticipant(conversationId, req.userId);
      if (!isParticipant) {
        return res.status(403).json({ error: "Not a participant in this conversation" });
      }
      const messages2 = await storage.getConversationMessages(conversationId, 50, req.userId);
      const reader = await storage.getUser(req.userId);
      const readReceiptsOn = reader?.readReceiptsEnabled !== false;
      const updated = readReceiptsOn ? await storage.markMessagesRead(conversationId, req.userId) : [];
      if (updated.length > 0) {
        const readAt = updated[0].readAt;
        const messageIds = updated.map((u) => u.id);
        io.to(`conversation:${conversationId}`).emit("messages-read", {
          conversationId,
          messageIds,
          readerId: req.userId,
          readAt
        });
        const uniqueSenders = Array.from(new Set(updated.map((u) => u.senderId)));
        for (const senderId of uniqueSenders) {
          if (senderId !== req.userId) {
            io.to(senderId).emit("messages-read", {
              conversationId,
              messageIds: updated.filter((u) => u.senderId === senderId).map((u) => u.id),
              readerId: req.userId,
              readAt
            });
          }
        }
      }
      res.json(messages2);
    } catch (error) {
      console.error("Error getting messages:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.post("/api/messages", authenticateToken, async (req, res) => {
    try {
      const {
        conversationId,
        receiverId,
        content,
        mediaUrl,
        mediaType,
        isHidden,
        encryptionVersion,
        e2eeInitEnvelope,
        replyToMessageId,
        replyToSenderId,
        forwarded,
        forwardedFromUserId,
        expiresAt: clientExpiresAt
      } = req.body;
      if (receiverId) {
        const isBlocked = await storage.isBlockedByEither(req.userId, receiverId);
        if (isBlocked) {
          return res.status(403).json({ error: "Cannot send message. User is blocked." });
        }
      }
      if (!isMockConversation(conversationId)) {
        const { checkAndConsumeChatLimit: checkAndConsumeChatLimit2 } = await Promise.resolve().then(() => (init_aiModerator(), aiModerator_exports));
        const limit = await checkAndConsumeChatLimit2(req.userId);
        if (!limit.allowed) {
          return res.status(429).json({
            error: limit.reason || "Daily message limit reached.",
            chatLimited: true,
            perDay: limit.perDay,
            resetAt: limit.resetAt
          });
        }
        if (typeof limit.remaining === "number") {
          res.setHeader("X-Chat-Limit-Remaining", String(limit.remaining));
          res.setHeader("X-Chat-Limit-Per-Day", String(limit.perDay ?? ""));
        }
      }
      if (isMockConversation(conversationId) && isDevMode()) {
        const isReviewer = await isAppleReviewerUser(req.userId);
        if (isReviewer && isMockUser(receiverId)) {
          const mockMessage = {
            id: `mock-msg-${Date.now()}-rest`,
            conversationId,
            senderId: req.userId,
            receiverId,
            content,
            mediaUrl: mediaUrl || null,
            mediaType: mediaType || null,
            createdAt: (/* @__PURE__ */ new Date()).toISOString(),
            isEncrypted: true,
            status: "sent"
          };
          io.to(`conversation:${conversationId}`).emit("new-message", mockMessage);
          const replyDelay = 1e3 + Math.random() * 2e3;
          setTimeout(() => {
            const botReply = createMockBotReply(conversationId, receiverId, req.userId);
            io.to(`conversation:${conversationId}`).emit("new-message", botReply);
            io.to(req.userId).emit("message-notification", {
              conversationId,
              message: botReply
            });
          }, replyDelay);
          return res.json(mockMessage);
        }
      }
      let message;
      try {
        message = await storage.createMessage({
          conversationId,
          senderId: req.userId,
          receiverId,
          content,
          mediaUrl,
          mediaType,
          isHidden
        }, {
          encryptionVersion: encryptionVersion ?? "v2-signal",
          e2eeInitEnvelope: e2eeInitEnvelope ?? null,
          replyToMessageId: replyToMessageId ?? null,
          // Never persist a plaintext reply preview server-side. Recipients
          // render quoted replies by looking up replyToMessageId in their own
          // decrypted local cache.
          replyToPreview: null,
          replyToSenderId: replyToSenderId ?? null,
          forwarded: forwarded === true,
          forwardedFromUserId: forwarded === true ? forwardedFromUserId ?? null : null,
          expiresAt: typeof clientExpiresAt === "number" && clientExpiresAt > Date.now() ? new Date(clientExpiresAt) : typeof clientExpiresAt === "string" && !Number.isNaN(Date.parse(clientExpiresAt)) ? new Date(clientExpiresAt) : null
        });
      } catch (e) {
        if (!isMockConversation(conversationId)) {
          try {
            const { refundChatLimitSlot: refundChatLimitSlot2 } = await Promise.resolve().then(() => (init_aiModerator(), aiModerator_exports));
            await refundChatLimitSlot2(req.userId);
          } catch {
          }
        }
        throw e;
      }
      if (receiverId && connectedUsers.has(receiverId)) {
        const delivered = await storage.markMessageDelivered(message.id, receiverId);
        if (delivered) message = delivered;
      }
      io.to(`conversation:${conversationId}`).emit("new-message", {
        ...message,
        conversationId
      });
      if (message.status === "delivered" && message.deliveredAt) {
        io.to(req.userId).emit("message-status", {
          conversationId,
          messageId: message.id,
          status: "delivered",
          deliveredAt: message.deliveredAt
        });
      }
      if (receiverId) {
        io.to(receiverId).emit("message-notification", {
          conversationId,
          message
        });
        const receiver = await storage.getUser(receiverId);
        const sender = await storage.getUser(req.userId);
        const receiverOnline = connectedUsers.has(receiverId);
        if (!receiverOnline && receiver?.pushToken && receiver?.notificationsEnabled !== false) {
          const senderName = sender?.displayName || sender?.phoneNumber || "Someone";
          let messagePreview = "New message";
          if (mediaType === "audio") messagePreview = "Sent a voice message";
          else if (mediaType === "image") messagePreview = "Sent a photo";
          else if (mediaType === "video") messagePreview = "Sent a video";
          else if (mediaType === "gif") messagePreview = "Sent a GIF";
          const previewOff = receiver.showNotificationPreview === false;
          const pushTitle = previewOff ? "SecureConnect" : senderName;
          const pushBody = previewOff ? "New encrypted message" : messagePreview;
          sendMessageNotification(
            receiver.pushToken,
            pushTitle,
            pushBody,
            conversationId,
            req.userId
          ).catch((err) => console.error("Push notification failed:", err));
        }
      }
      res.json(message);
    } catch (error) {
      console.error("Error creating message:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.delete("/api/messages/:id", authenticateToken, async (req, res) => {
    try {
      const messageId = req.params.id;
      const ok = await storage.deleteMessageForMe(messageId, req.userId);
      if (!ok) return res.status(404).json({ error: "Message not found or not allowed" });
      res.json({ success: true, scope: "me" });
    } catch (error) {
      console.error("Error deleting message for me:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.post("/api/messages/:id/delete-for-everyone", authenticateToken, async (req, res) => {
    try {
      const messageId = req.params.id;
      const updated = await storage.deleteMessageForEveryone(messageId, req.userId);
      if (!updated) {
        return res.status(403).json({ error: "Cannot delete this message for everyone" });
      }
      const ioRef = getIO();
      if (ioRef) {
        ioRef.to(`conversation:${updated.conversationId}`).emit("message-deleted-for-everyone", {
          messageId: updated.id,
          conversationId: updated.conversationId,
          deletedBy: req.userId
        });
      }
      res.json({ success: true, scope: "everyone", message: updated });
    } catch (error) {
      console.error("Error deleting message for everyone:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.post("/api/messages/:id/forward", authenticateToken, async (req, res) => {
    try {
      const messageId = req.params.id;
      const { conversationIds } = req.body;
      if (!Array.isArray(conversationIds) || conversationIds.length === 0) {
        return res.status(400).json({ error: "conversationIds[] is required" });
      }
      if (conversationIds.length > 20) {
        return res.status(400).json({ error: "Cannot forward to more than 20 chats at once" });
      }
      const ioRef = getIO();
      const { checkAndConsumeChatLimit: checkAndConsumeChatLimit2, refundChatLimitSlot: refundChatLimitSlot2 } = await Promise.resolve().then(() => (init_aiModerator(), aiModerator_exports));
      const results = [];
      let chatLimited = null;
      for (const targetConvId of conversationIds) {
        const isPart = await storage.isConversationParticipant(targetConvId, req.userId);
        if (!isPart) {
          results.push({ conversationId: targetConvId, ok: false, reason: "not_participant" });
          continue;
        }
        const recent = await storage.getConversationMessages(targetConvId, 1).catch(() => []);
        let receiverId = null;
        const last = recent[recent.length - 1];
        if (last) {
          receiverId = last.senderId === req.userId ? last.receiverId ?? null : last.senderId;
        }
        if (receiverId) {
          try {
            const blocked = await storage.isBlockedByEither(req.userId, receiverId);
            if (blocked) {
              results.push({ conversationId: targetConvId, ok: false, reason: "blocked" });
              continue;
            }
          } catch (e) {
            results.push({ conversationId: targetConvId, ok: false, reason: "block_check_failed" });
            continue;
          }
        }
        let consumed = false;
        try {
          const limit = await checkAndConsumeChatLimit2(req.userId);
          if (!limit.allowed) {
            chatLimited = { perDay: limit.perDay, resetAt: limit.resetAt };
            results.push({ conversationId: targetConvId, ok: false, reason: "chat_limited" });
            continue;
          }
          consumed = true;
        } catch (e) {
          console.error("[AI-MOD] forward limit check failed (fail-closed):", e);
          results.push({ conversationId: targetConvId, ok: false, reason: "limit_check_failed" });
          continue;
        }
        const fwd = await storage.forwardMessage(messageId, targetConvId, req.userId, receiverId).catch((e) => {
          console.error("forwardMessage failed:", e);
          return null;
        });
        if (!fwd) {
          if (consumed) await refundChatLimitSlot2(req.userId);
          results.push({ conversationId: targetConvId, ok: false, reason: "persist_failed" });
          continue;
        }
        if (ioRef) {
          ioRef.to(`conversation:${targetConvId}`).emit("new-message", fwd);
          if (receiverId) ioRef.to(receiverId).emit("message-notification", { conversationId: targetConvId, message: fwd });
        }
        results.push({ conversationId: targetConvId, ok: true, messageId: fwd.id });
      }
      res.json({ success: true, results, chatLimited });
    } catch (error) {
      console.error("Error forwarding message:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.get("/api/conversations/:id", authenticateToken, async (req, res) => {
    try {
      const conversationId = req.params.id;
      const isParticipant = await storage.isConversationParticipant(conversationId, req.userId);
      if (!isParticipant) return res.status(403).json({ error: "Not a participant" });
      const conv = await storage.getConversationById(conversationId);
      if (!conv) return res.status(404).json({ error: "Conversation not found" });
      res.json({
        id: conv.id,
        pinnedMessageId: conv.pinnedMessageId ?? null,
        disappearingTimer: conv.disappearingTimer ?? 0,
        createdAt: conv.createdAt
      });
    } catch (e) {
      console.error("GET /api/conversations/:id error", e);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.post("/api/conversations/:id/pin", authenticateToken, async (req, res) => {
    try {
      const conversationId = req.params.id;
      const { messageId } = req.body;
      if (!messageId) return res.status(400).json({ error: "messageId is required" });
      const ok = await storage.pinMessage(conversationId, messageId, req.userId);
      if (!ok) return res.status(403).json({ error: "Cannot pin this message" });
      const ioRef = getIO();
      if (ioRef) ioRef.to(`conversation:${conversationId}`).emit("message-pinned", { conversationId, messageId, pinnedBy: req.userId });
      res.json({ success: true, pinnedMessageId: messageId });
    } catch (error) {
      console.error("Error pinning message:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.delete("/api/conversations/:id/pin", authenticateToken, async (req, res) => {
    try {
      const conversationId = req.params.id;
      const ok = await storage.unpinMessage(conversationId, req.userId);
      if (!ok) return res.status(403).json({ error: "Cannot unpin in this conversation" });
      const ioRef = getIO();
      if (ioRef) ioRef.to(`conversation:${conversationId}`).emit("message-unpinned", { conversationId, unpinnedBy: req.userId });
      res.json({ success: true });
    } catch (error) {
      console.error("Error unpinning message:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.patch("/api/conversations/:id/timer", authenticateToken, async (req, res) => {
    try {
      const conversationId = req.params.id;
      const { seconds } = req.body;
      if (typeof seconds !== "number" || seconds < 0 || seconds > 60 * 60 * 24 * 7) {
        return res.status(400).json({ error: "seconds must be a number 0..604800" });
      }
      const ok = await storage.setConversationTimer(conversationId, req.userId, Math.floor(seconds));
      if (!ok) return res.status(403).json({ error: "Not a participant in this conversation" });
      const ioRef = getIO();
      if (ioRef) ioRef.to(`conversation:${conversationId}`).emit("disappearing-timer-changed", {
        conversationId,
        seconds: Math.floor(seconds),
        changedBy: req.userId
      });
      res.json({ success: true, seconds: Math.floor(seconds) });
    } catch (error) {
      console.error("Error setting disappearing timer:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.patch("/api/users/me/privacy", authenticateToken, async (req, res) => {
    try {
      const { readReceiptsEnabled, typingIndicatorsEnabled, showNotificationPreview, defaultDisappearingTimer } = req.body ?? {};
      const updated = await storage.updateUserPrivacy(req.userId, {
        readReceiptsEnabled: typeof readReceiptsEnabled === "boolean" ? readReceiptsEnabled : void 0,
        typingIndicatorsEnabled: typeof typingIndicatorsEnabled === "boolean" ? typingIndicatorsEnabled : void 0,
        showNotificationPreview: typeof showNotificationPreview === "boolean" ? showNotificationPreview : void 0,
        defaultDisappearingTimer: typeof defaultDisappearingTimer === "number" ? defaultDisappearingTimer : void 0
      });
      if (!updated) return res.status(404).json({ error: "User not found" });
      res.json({
        readReceiptsEnabled: updated.readReceiptsEnabled,
        typingIndicatorsEnabled: updated.typingIndicatorsEnabled,
        showNotificationPreview: updated.showNotificationPreview,
        defaultDisappearingTimer: updated.defaultDisappearingTimer
      });
    } catch (error) {
      console.error("Error updating privacy:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.patch("/api/users/me/story-privacy", authenticateToken, async (req, res) => {
    try {
      const { storiesEnabled, storyPrivacyMode, storyPrivacyExceptIds, storyPrivacyOnlyIds, storyViewReceiptsEnabled } = req.body ?? {};
      const validModes = ["everyone", "contacts", "except", "only"];
      if (typeof storyPrivacyMode === "string" && !validModes.includes(storyPrivacyMode)) {
        return res.status(400).json({ error: "Invalid storyPrivacyMode" });
      }
      const sanitizeIds = (arr) => Array.isArray(arr) ? Array.from(new Set(arr.filter((x) => typeof x === "string" && x.trim().length > 0))) : void 0;
      const updated = await storage.updateStoryPrivacy(req.userId, {
        storiesEnabled: typeof storiesEnabled === "boolean" ? storiesEnabled : void 0,
        storyPrivacyMode: typeof storyPrivacyMode === "string" ? storyPrivacyMode : void 0,
        storyPrivacyExceptIds: sanitizeIds(storyPrivacyExceptIds),
        storyPrivacyOnlyIds: sanitizeIds(storyPrivacyOnlyIds),
        storyViewReceiptsEnabled: typeof storyViewReceiptsEnabled === "boolean" ? storyViewReceiptsEnabled : void 0
      });
      if (!updated) return res.status(404).json({ error: "User not found" });
      res.json({
        storiesEnabled: updated.storiesEnabled,
        storyPrivacyMode: updated.storyPrivacyMode,
        storyPrivacyExceptIds: updated.storyPrivacyExceptIds || [],
        storyPrivacyOnlyIds: updated.storyPrivacyOnlyIds || [],
        storyViewReceiptsEnabled: updated.storyViewReceiptsEnabled
      });
    } catch (error) {
      console.error("Error updating story privacy:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.post("/api/messages/:id/unsend", authenticateToken, async (req, res) => {
    try {
      const messageId = req.params.id;
      const message = await storage.getMessage(messageId);
      if (!message) {
        return res.status(404).json({ error: "Message not found" });
      }
      if (message.senderId !== req.userId) {
        return res.status(403).json({ error: "You can only unsend your own messages" });
      }
      const messageTime = message.createdAt ? new Date(message.createdAt).getTime() : 0;
      const now = Date.now();
      const fiveMinutes = 5 * 60 * 1e3;
      if (now - messageTime > fiveMinutes) {
        return res.status(400).json({ error: "Messages can only be unsent within 5 minutes" });
      }
      await storage.deleteMessage(messageId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error unsending message:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.post("/api/messages/:id/transcribe", authenticateToken, async (req, res) => {
    try {
      const messageId = req.params.id;
      const message = await storage.getMessage(messageId);
      if (!message) {
        return res.status(404).json({ error: "Message not found" });
      }
      if (message.mediaType !== "audio" || !message.mediaUrl) {
        return res.status(400).json({ error: "Not a voice message" });
      }
      if (message.transcription) {
        return res.json({ transcription: message.transcription });
      }
      const objectStorageService = new ObjectStorageService();
      const objectFile = await objectStorageService.getObjectEntityFile(message.mediaUrl);
      const chunks = [];
      const stream = objectFile.createReadStream();
      for await (const chunk of stream) {
        chunks.push(Buffer.from(chunk));
      }
      const audioBuffer = Buffer.concat(chunks);
      const { ensureCompatibleFormat: ensureCompatibleFormat2 } = await Promise.resolve().then(() => (init_client(), client_exports));
      const { speechToText: speechToText2 } = await Promise.resolve().then(() => (init_client(), client_exports));
      const { buffer: compatBuffer, format } = await ensureCompatibleFormat2(audioBuffer);
      const transcription = await speechToText2(compatBuffer, format);
      await storage.updateMessageTranscription(messageId, transcription);
      res.json({ transcription });
    } catch (error) {
      console.error("Error transcribing message:", error);
      res.status(500).json({ error: "Failed to transcribe voice message" });
    }
  });
  app2.post("/api/messages/:id/react", authenticateToken, async (req, res) => {
    try {
      const messageId = req.params.id;
      const { emoji } = req.body;
      const userId = req.userId;
      if (!emoji || typeof emoji !== "string") {
        return res.status(400).json({ error: "emoji is required" });
      }
      const updated = await storage.addMessageReaction(messageId, userId, emoji);
      if (!updated) {
        return res.status(404).json({ error: "Message not found" });
      }
      const io2 = getIO();
      if (io2 && updated.conversationId) {
        io2.to(`conversation:${updated.conversationId}`).emit("message-reaction", {
          messageId,
          reactions: updated.reactions,
          userId,
          emoji
        });
      }
      res.json({ reactions: updated.reactions });
    } catch (error) {
      console.error("Error reacting to message:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.get("/api/calls", authenticateToken, async (req, res) => {
    try {
      const calls2 = await storage.getCalls(req.userId);
      const enrichedCalls = await Promise.all(calls2.map(async (call) => {
        const caller = await storage.getUser(call.callerId);
        const receiver = await storage.getUser(call.receiverId);
        return {
          ...call,
          callerName: caller?.displayName || caller?.phoneNumber || "Unknown",
          receiverName: receiver?.displayName || receiver?.phoneNumber || "Unknown",
          callerAvatarIndex: caller ? Math.abs(caller.id.charCodeAt(0)) % 6 : 0,
          receiverAvatarIndex: receiver ? Math.abs(receiver.id.charCodeAt(0)) % 6 : 0
        };
      }));
      res.json(enrichedCalls);
    } catch (error) {
      console.error("Error getting calls:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.post("/api/calls", authenticateToken, async (req, res) => {
    try {
      const { receiverId, type } = req.body;
      const isBlocked = await storage.isBlockedByEither(req.userId, receiverId);
      if (isBlocked) {
        return res.status(403).json({ error: "Cannot make call. User is blocked." });
      }
      const call = await storage.createCall(req.userId, receiverId, type);
      const receiver = await storage.getUser(receiverId);
      let receiverPhoneNumber = receiver?.phoneNumber;
      if (receiver?.preferredNumberType === "app" && receiver?.virtualNumberId) {
        const virtualNum = await storage.getVirtualNumber(receiver.virtualNumberId);
        if (virtualNum) {
          receiverPhoneNumber = virtualNum.phoneNumber;
        }
      }
      res.json({ ...call, receiverPhoneNumber });
    } catch (error) {
      console.error("Error creating call:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.put("/api/calls/:id", authenticateToken, async (req, res) => {
    try {
      const call = await storage.updateCall(req.params.id, req.body);
      res.json(call);
    } catch (error) {
      console.error("Error updating call:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.delete("/api/calls/:id", authenticateToken, async (req, res) => {
    try {
      const deleted = await storage.deleteCall(req.params.id, req.userId);
      if (!deleted) {
        return res.status(404).json({ error: "Call not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting call:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.delete("/api/calls", authenticateToken, async (req, res) => {
    try {
      await storage.clearCallHistory(req.userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error clearing call history:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.post("/api/video/token", authenticateToken, async (req, res) => {
    try {
      const { callId } = req.body;
      if (!callId) {
        return res.status(400).json({ error: "Call ID is required" });
      }
      const call = await storage.getCall(callId);
      if (!call) {
        return res.status(404).json({ error: "Call not found" });
      }
      if (call.callerId !== req.userId && call.receiverId !== req.userId) {
        return res.status(403).json({ error: "Not authorized for this call" });
      }
      const livekitApiKey = process.env.LIVEKIT_API_KEY;
      const livekitApiSecret = process.env.LIVEKIT_API_SECRET;
      const livekitUrl = process.env.LIVEKIT_URL;
      if (!livekitApiKey || !livekitApiSecret || !livekitUrl) {
        console.error("Missing LiveKit credentials");
        return res.status(503).json({
          error: "Calling service not configured",
          code: "LIVEKIT_NOT_CONFIGURED"
        });
      }
      const user = await storage.getUser(req.userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      const { AccessToken: LKAccessToken } = await import("livekit-server-sdk");
      const roomName = `call_${callId}`;
      const identity = user.displayName || user.phoneNumber || req.userId;
      const at = new LKAccessToken(livekitApiKey, livekitApiSecret, {
        identity,
        ttl: "1h"
      });
      at.addGrant({
        roomJoin: true,
        room: roomName,
        canPublish: true,
        canSubscribe: true
      });
      const token = await at.toJwt();
      res.json({
        token,
        identity,
        roomName,
        callId,
        livekitUrl
      });
    } catch (error) {
      console.error("Error generating call token:", error);
      res.status(500).json({ error: "Failed to generate call token" });
    }
  });
  app2.post("/api/contacts/check", authenticateToken, async (req, res) => {
    try {
      const { phoneNumbers } = req.body;
      if (!phoneNumbers || !Array.isArray(phoneNumbers)) {
        return res.status(400).json({ error: "Phone numbers array required" });
      }
      const normalizedNumbers = phoneNumbers.map((p) => p.replace(/\D/g, ""));
      const users2 = await storage.findUsersByPhoneNumbers(normalizedNumbers, req.userId);
      res.json({ users: users2 });
    } catch (error) {
      console.error("Error checking contacts:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.post("/api/invite/track", authenticateToken, async (req, res) => {
    try {
      const { phoneNumber } = req.body;
      if (!phoneNumber) {
        return res.status(400).json({ error: "Phone number required" });
      }
      await storage.addPendingContact(req.userId, phoneNumber);
      res.json({ success: true });
    } catch (error) {
      console.error("Error tracking invite:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.put("/api/user/avatar", authenticateToken, async (req, res) => {
    try {
      const { avatarUrl } = req.body;
      const user = await storage.updateUser(req.userId, { avatarUrl });
      res.json(user);
    } catch (error) {
      console.error("Error updating avatar:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.get("/api/user/chat-background", authenticateToken, async (req, res) => {
    try {
      const user = await storage.getUser(req.userId);
      res.json({ chatBackgroundUrl: user?.chatBackgroundUrl || null });
    } catch (error) {
      console.error("Error getting chat background:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.put("/api/user/chat-background", authenticateToken, async (req, res) => {
    try {
      const user = await storage.getUser(req.userId);
      if (!user?.isVip) {
        return res.status(403).json({ error: "VIP subscription required for custom chat backgrounds" });
      }
      const { chatBackgroundUrl } = req.body;
      const updatedUser = await storage.updateUser(req.userId, { chatBackgroundUrl });
      res.json({ chatBackgroundUrl: updatedUser?.chatBackgroundUrl || null });
    } catch (error) {
      console.error("Error updating chat background:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.delete("/api/user/chat-background", authenticateToken, async (req, res) => {
    try {
      await storage.updateUser(req.userId, { chatBackgroundUrl: null });
      res.json({ success: true });
    } catch (error) {
      console.error("Error removing chat background:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.get("/api/locker", authenticateToken, async (req, res) => {
    try {
      const user = await storage.getUser(req.userId);
      if (!user?.isVip) {
        return res.status(403).json({ error: "VIP subscription required" });
      }
      const items = await storage.getHiddenLockerItems(req.userId);
      res.json(items);
    } catch (error) {
      console.error("Error getting locker items:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.post("/api/locker", authenticateToken, async (req, res) => {
    try {
      const user = await storage.getUser(req.userId);
      if (!user?.isVip) {
        return res.status(403).json({ error: "VIP subscription required" });
      }
      const item = await storage.addToLocker(req.userId, req.body);
      res.json(item);
    } catch (error) {
      console.error("Error adding to locker:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.delete("/api/locker/reset", authenticateToken, async (req, res) => {
    try {
      await storage.resetLocker(req.userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error resetting locker:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.delete("/api/locker/:id", authenticateToken, async (req, res) => {
    try {
      await storage.removeFromLocker(req.params.id, req.userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error removing from locker:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.post("/api/locker/pin", authenticateToken, async (req, res) => {
    try {
      const user = await storage.getUser(req.userId);
      if (!user?.isVip) {
        return res.status(403).json({ error: "VIP subscription required" });
      }
      const { pin } = req.body;
      const hashedPin = await import_bcryptjs.default.hash(pin, 10);
      await storage.setLockerPin(req.userId, hashedPin);
      res.json({ success: true });
    } catch (error) {
      console.error("Error setting locker pin:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.get("/api/locker/has-pin", authenticateToken, async (req, res) => {
    try {
      const user = await storage.getUser(req.userId);
      res.json({ hasPin: !!user?.lockerPin });
    } catch (error) {
      console.error("Error checking pin:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.post("/api/locker/verify-pin", authenticateToken, async (req, res) => {
    try {
      const user = await storage.getUser(req.userId);
      if (!user?.lockerPin) {
        return res.json({ valid: false, hasPin: false });
      }
      const { pin } = req.body;
      if (!pin) {
        return res.json({ valid: false, hasPin: true });
      }
      const valid = await import_bcryptjs.default.compare(pin, user.lockerPin);
      res.json({ valid, hasPin: true });
    } catch (error) {
      console.error("Error verifying pin:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.post("/api/locker/change-pin", authenticateToken, async (req, res) => {
    try {
      const { currentPin, newPin } = req.body;
      if (!currentPin || !newPin || !/^\d{4}$/.test(newPin)) {
        return res.status(400).json({ error: "Both current PIN and a 4-digit new PIN are required" });
      }
      const user = await storage.getUser(req.userId);
      if (!user?.lockerPin) {
        return res.status(400).json({ error: "No PIN is currently configured" });
      }
      const valid = await import_bcryptjs.default.compare(currentPin, user.lockerPin);
      if (!valid) {
        return res.status(401).json({ error: "Current PIN is incorrect" });
      }
      const hashedPin = await import_bcryptjs.default.hash(newPin, 10);
      await storage.setLockerPin(req.userId, hashedPin);
      res.json({ success: true });
    } catch (error) {
      console.error("Error changing locker PIN:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.get("/api/virtual-number", authenticateToken, async (req, res) => {
    try {
      const user = await storage.getUser(req.userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      const virtualNumber = user.virtualNumberId ? await storage.getVirtualNumber(user.virtualNumberId) : null;
      res.json({
        hasVirtualNumber: !!virtualNumber,
        virtualNumber: virtualNumber ? {
          phoneNumber: virtualNumber.phoneNumber,
          countryCode: virtualNumber.countryCode,
          capabilities: virtualNumber.capabilities,
          status: virtualNumber.status
        } : null,
        preferredNumberType: user.preferredNumberType || "personal",
        isVip: user.isVip
      });
    } catch (error) {
      console.error("Error getting virtual number:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.get("/api/virtual-number/available", authenticateToken, async (req, res) => {
    try {
      const user = await storage.getUser(req.userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      const countryCode = req.query.country || "US";
      const areaCode = req.query.areaCode;
      const result = await searchAvailableNumbers(countryCode, areaCode);
      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }
      res.json({ numbers: result.numbers });
    } catch (error) {
      console.error("Error searching available numbers:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.post("/api/virtual-number/provision", authenticateToken, async (req, res) => {
    try {
      console.log("Virtual number provision request:", req.body);
      const user = await storage.getUser(req.userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      console.log("User requesting virtual number:", user.id);
      if (user.virtualNumberId) {
        return res.status(400).json({ error: "You already have a SecureConnect number. Release it first to get a new one." });
      }
      const { phoneNumber, countryCode } = req.body;
      if (!phoneNumber || !countryCode) {
        return res.status(400).json({ error: "Phone number and country code are required" });
      }
      let webhookBaseUrl;
      if (process.env.PUBLIC_API_URL) {
        webhookBaseUrl = process.env.PUBLIC_API_URL;
      } else {
        const forwardedHost = req.headers["x-forwarded-host"];
        const host = req.headers.host;
        const hostToUse = forwardedHost || host;
        const allowedDomains = [
          "secureconnectchat.com",
          "www.secureconnectchat.com",
          /\.replit\.dev$/,
          // Replit development domains
          /\.replit\.app$/,
          // Replit deployment domains
          /\.riker\.replit\.dev$/
          // Replit internal domains
        ];
        const isAllowed = allowedDomains.some((pattern) => {
          if (typeof pattern === "string") {
            return hostToUse === pattern;
          }
          return pattern.test(hostToUse);
        });
        if (!isAllowed) {
          console.error("Invalid host for webhook URL:", hostToUse);
          return res.status(400).json({ error: "Invalid request origin. Please try again." });
        }
        const protocol = req.headers["x-forwarded-proto"] || "https";
        webhookBaseUrl = `${protocol}://${hostToUse}`;
      }
      if (!webhookBaseUrl) {
        console.error("No valid webhook base URL found");
        return res.status(500).json({ error: "Server configuration error. Please try again." });
      }
      console.log("Attempting to provision number:", phoneNumber, "country:", countryCode, "webhook:", webhookBaseUrl);
      const result = await provisionPhoneNumber(phoneNumber, `SecureConnect-${user.id.slice(0, 8)}`, webhookBaseUrl);
      console.log("Provision result:", result.success ? "success" : "failed", result.error || "");
      if (!result.success || !result.number) {
        return res.status(400).json({ error: result.error || "Failed to get your SecureConnect number. Please try again." });
      }
      const virtualNumber = await storage.createVirtualNumber({
        phoneNumber: result.number.phoneNumber,
        countryCode,
        twilioSid: result.number.sid,
        capabilities: result.number.capabilities,
        assignedUserId: user.id
      });
      await storage.updateUser(user.id, {
        virtualNumberId: virtualNumber.id,
        preferredNumberType: "app"
        // Auto-switch to app number
      });
      res.json({
        success: true,
        virtualNumber: {
          phoneNumber: virtualNumber.phoneNumber,
          countryCode: virtualNumber.countryCode,
          capabilities: virtualNumber.capabilities
        }
      });
    } catch (error) {
      console.error("Error provisioning virtual number:", error);
      res.status(500).json({ error: "Failed to get your SecureConnect number. Please try again." });
    }
  });
  app2.delete("/api/virtual-number", authenticateToken, async (req, res) => {
    try {
      const user = await storage.getUser(req.userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      if (!user.virtualNumberId) {
        return res.status(400).json({ error: "You do not have a SecureConnect number to release" });
      }
      const virtualNumber = await storage.getVirtualNumber(user.virtualNumberId);
      if (!virtualNumber) {
        return res.status(404).json({ error: "Virtual number not found" });
      }
      const result = await releasePhoneNumber(virtualNumber.twilioSid);
      if (!result.success) {
        console.error("Failed to release from Twilio:", result.error);
      }
      await storage.releaseVirtualNumber(virtualNumber.id);
      await storage.updateUser(user.id, {
        virtualNumberId: null,
        preferredNumberType: "personal"
      });
      res.json({ success: true });
    } catch (error) {
      console.error("Error releasing virtual number:", error);
      res.status(500).json({ error: "Failed to release your SecureConnect number" });
    }
  });
  app2.put("/api/virtual-number/preference", authenticateToken, async (req, res) => {
    try {
      const user = await storage.getUser(req.userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      const { preferredNumberType } = req.body;
      console.log("[VIRTUAL] User", user.id, "updating preference to:", preferredNumberType);
      if (!preferredNumberType || !["personal", "app"].includes(preferredNumberType)) {
        return res.status(400).json({ error: 'Invalid preference. Use "personal" or "app".' });
      }
      if (preferredNumberType === "app" && !user.virtualNumberId) {
        return res.status(400).json({ error: "You need a SecureConnect number to use this option" });
      }
      await storage.updateUser(user.id, { preferredNumberType });
      console.log("[VIRTUAL] User", user.id, "preference updated successfully to:", preferredNumberType);
      res.json({ success: true, preferredNumberType });
    } catch (error) {
      console.error("Error updating number preference:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.get("/api/stripe/publishable-key", async (req, res) => {
    try {
      const publishableKey = await getStripePublishableKey();
      res.json({ publishableKey });
    } catch (error) {
      console.error("Error getting Stripe key:", error);
      res.status(500).json({ error: "Stripe not configured" });
    }
  });
  app2.post("/api/stripe/checkout", authenticateToken, async (req, res) => {
    try {
      const user = await storage.getUser(req.userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      const stripe = await getUncachableStripeClient();
      let customerId = user.stripeCustomerId;
      if (!customerId) {
        const customer = await stripe.customers.create({
          phone: user.phoneNumber,
          metadata: { userId: user.id }
        });
        customerId = customer.id;
        await storage.updateUser(user.id, { stripeCustomerId: customerId });
      }
      const baseUrl = `https://${process.env.REPLIT_DOMAINS?.split(",")[0] || "localhost:5000"}`;
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ["card"],
        line_items: [{
          price_data: {
            currency: "usd",
            product_data: {
              name: "SecureChat VIP",
              description: "Unlock Hidden Locker, Priority Support, and Exclusive Features"
            },
            unit_amount: 1999,
            recurring: { interval: "month" }
          },
          quantity: 1
        }],
        mode: "subscription",
        success_url: `${baseUrl}/vip-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/vip-cancel`
      });
      res.json({ url: session.url });
    } catch (error) {
      console.error("Error creating checkout:", error);
      res.status(500).json({ error: "Failed to create checkout session" });
    }
  });
  app2.post("/api/stripe/checkout/remove-ads", authenticateToken, async (req, res) => {
    try {
      const user = await storage.getUser(req.userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      if (user.isAdFree) {
        return res.status(400).json({ error: "You already have ad-free access" });
      }
      const stripe = await getUncachableStripeClient();
      let customerId = user.stripeCustomerId;
      if (!customerId) {
        const customer = await stripe.customers.create({
          phone: user.phoneNumber,
          metadata: { userId: user.id }
        });
        customerId = customer.id;
        await storage.updateUser(user.id, { stripeCustomerId: customerId });
      }
      const baseUrl = `https://${process.env.REPLIT_DOMAINS?.split(",")[0] || "localhost:5000"}`;
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ["card"],
        line_items: [{
          price_data: {
            currency: "aud",
            product_data: {
              name: "Remove Ads Forever",
              description: "Lifetime ad-free experience in SecureConnect"
            },
            unit_amount: 2999
          },
          quantity: 1
        }],
        mode: "payment",
        metadata: {
          userId: user.id,
          purchaseType: "ad_removal",
          productId: "prod_TcFdeE3YbLninV"
        },
        success_url: `${baseUrl}/ad-removal-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/ad-removal-cancel`
      });
      res.json({ url: session.url });
    } catch (error) {
      console.error("Error creating ad removal checkout:", error);
      res.status(500).json({ error: "Failed to create checkout session" });
    }
  });
  app2.post("/api/stripe/webhook/ad-removal", async (req, res) => {
    try {
      const stripe = await getUncachableStripeClient();
      const sig = req.headers["stripe-signature"];
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
      if (!webhookSecret) {
        console.log("No webhook secret configured");
        return res.status(400).json({ error: "Webhook not configured" });
      }
      let event;
      try {
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
      } catch (err) {
        console.error("Webhook signature verification failed:", err.message);
        return res.status(400).json({ error: "Invalid signature" });
      }
      if (event.type === "checkout.session.completed") {
        const session = event.data.object;
        if (session.metadata?.purchaseType === "ad_removal") {
          const userId = session.metadata.userId;
          await storage.updateUser(userId, {
            isAdFree: true,
            adRemovalPurchasedAt: /* @__PURE__ */ new Date()
          });
          console.log(`User ${userId} purchased ad removal`);
        }
      }
      res.json({ received: true });
    } catch (error) {
      console.error("Webhook error:", error);
      res.status(500).json({ error: "Webhook processing failed" });
    }
  });
  const VALID_PRODUCT_IDS = /* @__PURE__ */ new Set([
    "secureconnect.removeads.2025",
    "secureconnect.vip.monthly.2025"
  ]);
  async function verifyAppleReceipt(receiptData, useSandbox = false) {
    const url = useSandbox ? "https://sandbox.itunes.apple.com/verifyReceipt" : "https://buy.itunes.apple.com/verifyReceipt";
    const sharedSecret = process.env.APPLE_SHARED_SECRET;
    const payload = {
      "receipt-data": receiptData,
      "exclude-old-transactions": true
    };
    if (sharedSecret) {
      payload["password"] = sharedSecret;
    }
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    return response.json();
  }
  function extractPurchasedProducts(receiptResponse) {
    const products = /* @__PURE__ */ new Set();
    if (receiptResponse.receipt?.in_app) {
      for (const purchase of receiptResponse.receipt.in_app) {
        if (purchase.product_id) {
          products.add(purchase.product_id);
        }
      }
    }
    if (receiptResponse.latest_receipt_info) {
      for (const purchase of receiptResponse.latest_receipt_info) {
        if (purchase.product_id) {
          const expiresDate = purchase.expires_date_ms ? parseInt(purchase.expires_date_ms) : null;
          if (!expiresDate || expiresDate > Date.now()) {
            products.add(purchase.product_id);
          }
        }
      }
    }
    return products;
  }
  app2.post("/api/iap/verify", authenticateToken, async (req, res) => {
    try {
      const { receipt, platform, productId } = req.body;
      if (!receipt) {
        return res.status(400).json({ error: "Receipt is required" });
      }
      if (!productId || !VALID_PRODUCT_IDS.has(productId)) {
        console.log(`[IAP] Invalid product ID: ${productId}`);
        return res.status(400).json({ error: "Invalid product ID" });
      }
      const user = await storage.getUser(req.userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      console.log(`[IAP] Verifying ${platform} receipt for user ${user.id}, product: ${productId}`);
      let receiptResponse = await verifyAppleReceipt(receipt, false);
      if (receiptResponse.status === 21007) {
        console.log("[IAP] Production receipt failed, trying sandbox...");
        receiptResponse = await verifyAppleReceipt(receipt, true);
      }
      if (receiptResponse.status !== 0) {
        console.log(`[IAP] Apple receipt verification failed with status: ${receiptResponse.status}`);
        return res.status(400).json({
          error: "Receipt verification failed",
          status: receiptResponse.status
        });
      }
      const purchasedProducts = extractPurchasedProducts(receiptResponse);
      console.log(`[IAP] Verified products in receipt:`, Array.from(purchasedProducts));
      if (!purchasedProducts.has(productId)) {
        console.log(`[IAP] Product ${productId} not found in receipt`);
        return res.status(400).json({ error: "Product not found in receipt" });
      }
      if (productId === "secureconnect.removeads.2025") {
        await storage.updateUser(user.id, {
          isAdFree: true,
          adRemovalPurchasedAt: /* @__PURE__ */ new Date()
        });
        console.log(`[IAP] User ${user.id} purchased ad removal via Apple IAP (verified)`);
      } else if (productId === "secureconnect.vip.monthly.2025") {
        await storage.updateUser(user.id, {
          isVip: true,
          vipStartedAt: /* @__PURE__ */ new Date()
        });
        console.log(`[IAP] User ${user.id} subscribed to VIP via Apple IAP (verified)`);
      }
      res.json({ success: true, verified: true });
    } catch (error) {
      console.error("[IAP] Verification error:", error);
      res.status(500).json({ error: "Receipt verification failed" });
    }
  });
  app2.get("/api/iap/restore-status", authenticateToken, async (req, res) => {
    try {
      const user = await storage.getUser(req.userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json({
        isAdFree: user.isAdFree || false,
        isVip: user.isVip || false,
        adRemovalPurchasedAt: user.adRemovalPurchasedAt,
        vipStartedAt: user.vipStartedAt
      });
    } catch (error) {
      console.error("[IAP] Restore status error:", error);
      res.status(500).json({ error: "Failed to get restore status" });
    }
  });
  app2.get("/api/stripe/subscription-status", authenticateToken, async (req, res) => {
    try {
      const user = await storage.getUser(req.userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      if (!user.stripeSubscriptionId) {
        return res.json({ isVip: false, subscription: null });
      }
      const stripe = await getUncachableStripeClient();
      const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
      const isActive = subscription.status === "active" || subscription.status === "trialing";
      if (isActive !== user.isVip) {
        const updateData = { isVip: isActive };
        if (isActive) {
          updateData.vipStartedAt = /* @__PURE__ */ new Date();
        }
        await storage.updateUser(user.id, updateData);
      }
      res.json({
        isVip: isActive,
        subscription: {
          status: subscription.status,
          currentPeriodEnd: subscription.current_period_end
        }
      });
    } catch (error) {
      console.error("Error getting subscription:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.post("/api/objects/upload", authenticateToken, async (req, res) => {
    try {
      console.log("Getting upload URL for user:", req.userId);
      const objectStorageService = new ObjectStorageService();
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      console.log("Upload URL generated successfully");
      res.json({ uploadURL });
    } catch (error) {
      console.error("Error getting upload URL:", error?.message || error);
      res.status(500).json({ error: error?.message || "Failed to get upload URL" });
    }
  });
  app2.put("/api/objects/media", authenticateToken, async (req, res) => {
    try {
      const { mediaURL } = req.body;
      if (!mediaURL) {
        return res.status(400).json({ error: "mediaURL is required" });
      }
      const objectStorageService = new ObjectStorageService();
      const objectPath = await objectStorageService.trySetObjectEntityAclPolicy(
        mediaURL,
        {
          owner: req.userId,
          visibility: "public"
        }
      );
      res.json({ objectPath });
    } catch (error) {
      console.error("Error setting media ACL:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.get("/objects/*objectPath", async (req, res) => {
    const objectStorageService = new ObjectStorageService();
    try {
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error("Error serving object:", error);
      if (error instanceof ObjectNotFoundError) {
        return res.sendStatus(404);
      }
      return res.sendStatus(500);
    }
  });
  app2.get("/public-objects/*filePath", async (req, res) => {
    const filePath = req.path.replace("/public-objects/", "");
    const objectStorageService = new ObjectStorageService();
    try {
      const file = await objectStorageService.searchPublicObject(filePath);
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }
      objectStorageService.downloadObject(file, res);
    } catch (error) {
      console.error("Error searching for public object:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.get("/api/message-requests", authenticateToken, async (req, res) => {
    try {
      const user = await storage.getUser(req.userId);
      const requests = await storage.getMessageRequests(req.userId);
      res.json({
        requests,
        setting: user?.messageRequestSetting || "everyone"
      });
    } catch (error) {
      console.error("Error getting message requests:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.get("/api/message-requests/pending/count", authenticateToken, async (req, res) => {
    try {
      const count = await storage.getPendingMessageRequestCount(req.userId);
      res.json({ count });
    } catch (error) {
      console.error("Error getting pending request count:", error);
      res.json({ count: 0 });
    }
  });
  app2.put("/api/message-requests/settings", authenticateToken, async (req, res) => {
    try {
      const { setting } = req.body;
      if (!["everyone", "contacts_only"].includes(setting)) {
        return res.status(400).json({ error: "Invalid setting" });
      }
      await storage.updateUser(req.userId, { messageRequestSetting: setting });
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating message request setting:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.put("/api/privacy/last-seen", authenticateToken, async (req, res) => {
    try {
      const { setting } = req.body;
      if (!["everyone", "contacts", "vip", "nobody"].includes(setting)) {
        return res.status(400).json({ error: "Invalid setting" });
      }
      await storage.updateUser(req.userId, { lastSeenPrivacy: setting });
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating last seen privacy:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.get("/api/users/:userId/last-seen", authenticateToken, async (req, res) => {
    try {
      const { userId } = req.params;
      const canSee = await storage.canSeeLastSeen(req.userId, userId);
      if (!canSee) {
        return res.json({ lastSeen: null, hidden: true });
      }
      const user = await storage.getUser(userId);
      res.json({ lastSeen: user?.lastSeen, hidden: false });
    } catch (error) {
      console.error("Error getting last seen:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.post("/api/conversations/:conversationId/archive", authenticateToken, async (req, res) => {
    try {
      const { conversationId } = req.params;
      await storage.archiveConversation(conversationId, req.userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error archiving conversation:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.post("/api/conversations/:conversationId/unarchive", authenticateToken, async (req, res) => {
    try {
      const { conversationId } = req.params;
      await storage.unarchiveConversation(conversationId, req.userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error unarchiving conversation:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.put("/api/conversations/:conversationId/folder", authenticateToken, async (req, res) => {
    try {
      const { conversationId } = req.params;
      const { folder } = req.body;
      if (!["none", "randoms", "friends", "family"].includes(folder)) {
        return res.status(400).json({ error: "Invalid folder" });
      }
      await storage.updateChatFolder(conversationId, req.userId, folder);
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating chat folder:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.get("/api/conversations/:conversationId/search", authenticateToken, async (req, res) => {
    try {
      const { conversationId } = req.params;
      const { q } = req.query;
      if (!q || typeof q !== "string") {
        return res.status(400).json({ error: "Search query required" });
      }
      const results = await storage.searchMessages(conversationId, q);
      res.json(results);
    } catch (error) {
      console.error("Error searching messages:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.get("/api/scheduled-messages", authenticateToken, async (req, res) => {
    try {
      const scheduled = await storage.getScheduledMessages(req.userId);
      res.json(scheduled);
    } catch (error) {
      console.error("Error getting scheduled messages:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.post("/api/scheduled-messages", authenticateToken, async (req, res) => {
    try {
      const { conversationId, receiverId, content, mediaUrl, mediaType, scheduledFor } = req.body;
      if (!conversationId || !scheduledFor) {
        return res.status(400).json({ error: "conversationId and scheduledFor are required" });
      }
      const scheduled = await storage.createScheduledMessage({
        conversationId,
        senderId: req.userId,
        receiverId,
        content,
        mediaUrl,
        mediaType,
        scheduledFor: new Date(scheduledFor)
      });
      res.json(scheduled);
    } catch (error) {
      console.error("Error creating scheduled message:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.delete("/api/scheduled-messages/:id", authenticateToken, async (req, res) => {
    try {
      const { id } = req.params;
      await storage.cancelScheduledMessage(id, req.userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error cancelling scheduled message:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  const normalizeGiphy = (data) => {
    const items = Array.isArray(data?.data) ? data.data : [];
    return {
      results: items.map((g) => ({
        id: String(g.id),
        media_formats: {
          gif: { url: g?.images?.original?.url || g?.images?.downsized_large?.url || "" },
          tinygif: { url: g?.images?.fixed_width?.url || g?.images?.preview_gif?.url || g?.images?.original?.url || "" }
        }
      })).filter((g) => g.media_formats.gif.url)
    };
  };
  const normalizeTenor = (data) => {
    const items = Array.isArray(data?.results) ? data.results : [];
    return {
      results: items.map((g) => ({
        id: String(g.id),
        media_formats: {
          gif: { url: g?.media_formats?.gif?.url || "" },
          tinygif: { url: g?.media_formats?.tinygif?.url || g?.media_formats?.gif?.url || "" }
        }
      })).filter((g) => g.media_formats.gif.url)
    };
  };
  app2.get("/api/gifs/search", authenticateToken, async (req, res) => {
    try {
      const { q, limit = 20 } = req.query;
      const tenorKey = process.env.TENOR_API_KEY;
      const giphyKey = process.env.GIPHY_API_KEY;
      if (!tenorKey && !giphyKey) {
        return res.status(503).json({ error: "GIF service not configured", results: [] });
      }
      if (giphyKey) {
        const url2 = `https://api.giphy.com/v1/gifs/search?api_key=${giphyKey}&q=${encodeURIComponent(q)}&limit=${limit}&rating=pg-13`;
        const r = await fetch(url2);
        const d = await r.json();
        return res.json(normalizeGiphy(d));
      }
      const url = `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(q)}&key=${tenorKey}&limit=${limit}&media_filter=gif`;
      const response = await fetch(url);
      const data = await response.json();
      res.json(normalizeTenor(data));
    } catch (error) {
      console.error("Error searching GIFs:", error);
      res.status(500).json({ error: "Internal server error", results: [] });
    }
  });
  app2.get("/api/gifs/trending", authenticateToken, async (req, res) => {
    try {
      const { limit = 20 } = req.query;
      const tenorKey = process.env.TENOR_API_KEY;
      const giphyKey = process.env.GIPHY_API_KEY;
      if (!tenorKey && !giphyKey) {
        return res.status(503).json({ error: "GIF service not configured", results: [] });
      }
      if (giphyKey) {
        const url2 = `https://api.giphy.com/v1/gifs/trending?api_key=${giphyKey}&limit=${limit}&rating=pg-13`;
        const r = await fetch(url2);
        const d = await r.json();
        return res.json(normalizeGiphy(d));
      }
      const url = `https://tenor.googleapis.com/v2/featured?key=${tenorKey}&limit=${limit}&media_filter=gif`;
      const response = await fetch(url);
      const data = await response.json();
      res.json(normalizeTenor(data));
    } catch (error) {
      console.error("Error getting trending GIFs:", error);
      res.status(500).json({ error: "Internal server error", results: [] });
    }
  });
  app2.post("/api/message-requests/:requestId/accept", authenticateToken, async (req, res) => {
    try {
      const { requestId } = req.params;
      const result = await storage.acceptMessageRequest(requestId, req.userId);
      if (!result) {
        return res.status(404).json({ error: "Request not found" });
      }
      res.json({ success: true, conversationId: result.conversationId });
    } catch (error) {
      console.error("Error accepting request:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.post("/api/message-requests/:requestId/decline", authenticateToken, async (req, res) => {
    try {
      const { requestId } = req.params;
      await storage.declineMessageRequest(requestId, req.userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error declining request:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.get("/api/statuses", authenticateToken, async (req, res) => {
    try {
      const statuses2 = await storage.getStatuses(req.userId);
      res.json(statuses2);
    } catch (error) {
      console.error("Error getting statuses:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.get("/api/statuses/mine", authenticateToken, async (req, res) => {
    try {
      const statuses2 = await storage.getMyStatuses(req.userId);
      res.json(statuses2);
    } catch (error) {
      console.error("Error getting my statuses:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.post("/api/statuses", authenticateToken, async (req, res) => {
    try {
      const { mediaUrl, mediaType, caption, privacy, customViewers } = req.body;
      const status = await storage.createStatus(req.userId, { mediaUrl, mediaType, caption, privacy, customViewers });
      res.json(status);
    } catch (error) {
      if (error?.message === "STORIES_DISABLED") {
        return res.status(403).json({ error: "Stories are turned off in your settings." });
      }
      console.error("Error creating status:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.post("/api/statuses/:statusId/view", authenticateToken, async (req, res) => {
    try {
      const { statusId } = req.params;
      await storage.viewStatus(statusId, req.userId);
      res.json({ success: true });
    } catch (error) {
      if (error?.message === "STATUS_NOT_FOUND") {
        return res.status(404).json({ error: "Status not found" });
      }
      console.error("Error viewing status:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.get("/api/statuses/:statusId/viewers", authenticateToken, async (req, res) => {
    try {
      const { statusId } = req.params;
      const viewers = await storage.getStatusViewers(statusId, req.userId);
      res.json(viewers);
    } catch (error) {
      console.error("Error getting status viewers:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.delete("/api/statuses/:statusId", authenticateToken, async (req, res) => {
    try {
      const { statusId } = req.params;
      await storage.deleteStatus(statusId, req.userId);
      res.json({ success: true });
    } catch (error) {
      if (error?.message === "STATUS_NOT_FOUND") {
        return res.status(404).json({ error: "Status not found" });
      }
      if (error?.message === "NOT_AUTHORIZED") {
        return res.status(403).json({ error: "Not authorized to delete this status" });
      }
      console.error("Error deleting status:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.get("/api/friends", authenticateToken, async (req, res) => {
    try {
      const friends2 = await storage.getFriends(req.userId);
      res.json(friends2);
    } catch (error) {
      console.error("Error getting friends:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.post("/api/friends", authenticateToken, async (req, res) => {
    try {
      const { friendId } = req.body;
      const friend = await storage.addFriend(req.userId, friendId);
      res.json(friend);
    } catch (error) {
      console.error("Error adding friend:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.delete("/api/friends/:friendId", authenticateToken, async (req, res) => {
    try {
      const { friendId } = req.params;
      await storage.removeFriend(req.userId, friendId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error removing friend:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.get("/api/blocks", authenticateToken, async (req, res) => {
    try {
      const blocks = await storage.getBlockedUsers(req.userId);
      res.json(blocks);
    } catch (error) {
      console.error("Error getting blocked users:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.post("/api/blocks", authenticateToken, async (req, res) => {
    try {
      const { blockedId } = req.body;
      if (!blockedId) {
        return res.status(400).json({ error: "blockedId is required" });
      }
      const block = await storage.blockUser(req.userId, blockedId);
      res.json(block);
    } catch (error) {
      console.error("Error blocking user:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.delete("/api/blocks/:blockedId", authenticateToken, async (req, res) => {
    try {
      const { blockedId } = req.params;
      await storage.unblockUser(req.userId, blockedId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error unblocking user:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.get("/api/blocks/check/:userId", authenticateToken, async (req, res) => {
    try {
      const { userId } = req.params;
      const isBlocked = await storage.isBlocked(req.userId, userId);
      const blockedByThem = await storage.isBlocked(userId, req.userId);
      res.json({ isBlocked, blockedByThem });
    } catch (error) {
      console.error("Error checking block status:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.post("/api/reports", authenticateToken, async (req, res) => {
    try {
      const { reportedUserId, reportedMessageId, reason, details } = req.body || {};
      if (!reportedUserId || typeof reportedUserId !== "string") {
        return res.status(400).json({ error: "reportedUserId is required" });
      }
      if (!reason || typeof reason !== "string" || reason.trim().length === 0) {
        return res.status(400).json({ error: "reason is required" });
      }
      if (reportedUserId === req.userId) {
        return res.status(400).json({ error: "You cannot report yourself" });
      }
      const reportedUser = await storage.getUser(reportedUserId);
      if (!reportedUser) {
        return res.status(404).json({ error: "Reported user not found" });
      }
      const ALLOWED_REASONS = [
        "spam",
        "harassment",
        "hate_speech",
        "sexual_content",
        "threats_or_violence",
        "csam",
        "impersonation",
        "scam_or_fraud",
        "other"
      ];
      const safeReason = ALLOWED_REASONS.includes(reason) ? reason : "other";
      const safeDetails = typeof details === "string" ? details.slice(0, 2e3) : null;
      const safeMessageId = typeof reportedMessageId === "string" && reportedMessageId.length > 0 ? reportedMessageId : null;
      const isDuplicate = await storage.hasRecentReport(
        req.userId,
        reportedUserId,
        safeMessageId
      );
      if (isDuplicate) {
        return res.status(200).json({
          success: true,
          duplicate: true,
          message: "You have already reported this. Our team will review it."
        });
      }
      const report = await storage.createUserReport({
        reporterId: req.userId,
        reportedUserId,
        reportedMessageId: safeMessageId,
        reason: safeReason,
        details: safeDetails,
        status: "pending"
      });
      console.log(
        `[REPORT] reporter=${req.userId} reported=${reportedUserId} messageId=${safeMessageId ?? "none"} reason=${safeReason} id=${report.id}`
      );
      const { evaluateReport: evaluateReport2 } = await Promise.resolve().then(() => (init_aiModerator(), aiModerator_exports));
      evaluateReport2(report.id).catch(
        (e) => console.error("[AI-MOD] evaluateReport threw:", e)
      );
      res.json({
        success: true,
        reportId: report.id,
        message: "Thanks for the report. Our AI Trust & Safety system is reviewing this now and will take action within seconds if it violates our rules."
      });
    } catch (error) {
      console.error("Error creating report:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.get("/api/location/me", authenticateToken, async (req, res) => {
    try {
      const user = await storage.getUser(req.userId);
      if (!user?.isVip) {
        return res.status(403).json({ error: "VIP subscription required" });
      }
      const share = await storage.getLocationShare(req.userId);
      res.json(share || { isSharing: false });
    } catch (error) {
      console.error("Error getting location share:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.post("/api/location/update", authenticateToken, async (req, res) => {
    try {
      const user = await storage.getUser(req.userId);
      if (!user?.isVip) {
        return res.status(403).json({ error: "VIP subscription required" });
      }
      const { latitude, longitude } = req.body;
      const share = await storage.updateLocationShare(req.userId, { latitude, longitude });
      const approvedFriends = await storage.getApprovedFriendIds(req.userId);
      for (const friendId of approvedFriends) {
        io.to(friendId).emit("friend-location-update", {
          userId: req.userId,
          latitude,
          longitude,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
          lastUpdated: (/* @__PURE__ */ new Date()).toISOString(),
          isSharing: true
        });
      }
      res.json(share);
    } catch (error) {
      console.error("Error updating location:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.post("/api/location/toggle", authenticateToken, async (req, res) => {
    try {
      const user = await storage.getUser(req.userId);
      if (!user?.isVip) {
        return res.status(403).json({ error: "VIP subscription required" });
      }
      const { isSharing } = req.body;
      const share = await storage.updateLocationShare(req.userId, { isSharing });
      res.json(share);
    } catch (error) {
      console.error("Error toggling location sharing:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.get("/api/location/requests", authenticateToken, async (req, res) => {
    try {
      const user = await storage.getUser(req.userId);
      if (!user?.isVip) {
        return res.status(403).json({ error: "VIP subscription required" });
      }
      const requests = await storage.getLocationRequests(req.userId);
      res.json(requests);
    } catch (error) {
      console.error("Error getting location requests:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.post("/api/location/request", authenticateToken, async (req, res) => {
    try {
      const user = await storage.getUser(req.userId);
      if (!user?.isVip) {
        return res.status(403).json({ error: "VIP subscription required" });
      }
      const { targetId } = req.body;
      const request = await storage.createLocationRequest(req.userId, targetId);
      res.json(request);
    } catch (error) {
      console.error("Error creating location request:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.post("/api/location/requests/:requestId/respond", authenticateToken, async (req, res) => {
    try {
      const user = await storage.getUser(req.userId);
      if (!user?.isVip) {
        return res.status(403).json({ error: "VIP subscription required" });
      }
      const { requestId } = req.params;
      const { accept } = req.body;
      await storage.respondToLocationRequest(requestId, req.userId, accept);
      if (accept) {
        await storage.updateLocationShare(req.userId, { isSharing: true });
        const request = await storage.getLocationRequestById(requestId);
        if (request) {
          const otherUserId = request.requesterId === req.userId ? request.targetId : request.requesterId;
          await storage.updateLocationShare(otherUserId, { isSharing: true });
          io.to(otherUserId).emit("location-request-accepted", {
            acceptedBy: req.userId,
            acceptedByName: user.displayName
          });
          io.to(req.userId).emit("location-sharing-enabled", {
            friendId: otherUserId
          });
          io.to(otherUserId).emit("location-sharing-enabled", {
            friendId: req.userId
          });
        }
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error responding to location request:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.get("/api/location/friends", authenticateToken, async (req, res) => {
    try {
      const user = await storage.getUser(req.userId);
      if (!user?.isVip) {
        return res.status(403).json({ error: "VIP subscription required" });
      }
      const locations = await storage.getFriendLocations(req.userId);
      res.json(locations);
    } catch (error) {
      console.error("Error getting friend locations:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.post("/api/webhooks/twilio/sms", async (req, res) => {
    try {
      const twilioSignature = req.headers["x-twilio-signature"];
      const webhookUrl = `https://${req.headers.host}${req.originalUrl}`;
      if (!validateTwilioWebhookSignature(twilioSignature, webhookUrl, req.body)) {
        console.warn("Invalid Twilio webhook signature for SMS");
        res.status(403).send("Forbidden");
        return;
      }
      const { From, To, Body } = req.body;
      console.log(`Incoming SMS: From ${From} to ${To}: ${Body}`);
      const virtualNumber = await storage.getVirtualNumberByPhone(To);
      if (!virtualNumber || !virtualNumber.assignedUserId) {
        console.log("Virtual number not found or not assigned:", To);
        res.type("text/xml").send("<Response></Response>");
        return;
      }
      const sender = await storage.getUserByPhone(From);
      const receiver = await storage.getUser(virtualNumber.assignedUserId);
      if (sender && receiver) {
        const conversation = await storage.getOrCreateConversation(sender.id, receiver.id);
        const message = await storage.createMessage({
          conversationId: conversation.id,
          senderId: sender.id,
          receiverId: receiver.id,
          content: Body,
          isHidden: false
        });
        socketIO?.to(receiver.id).emit("new-message", message);
        socketIO?.to(receiver.id).emit("message-notification", {
          conversationId: conversation.id,
          senderId: sender.id,
          senderName: sender.displayName || sender.phoneNumber || "Someone",
          content: Body,
          messageId: message.id
        });
        if (receiver?.pushToken && receiver?.notificationsEnabled !== false) {
          const senderName = sender?.displayName || sender?.phoneNumber || "Someone";
          const messagePreview = Body.length > 50 ? Body.substring(0, 50) + "..." : Body;
          sendPushNotification(
            receiver.pushToken,
            senderName,
            messagePreview,
            {
              conversationId: conversation.id,
              otherUserId: sender.id,
              senderName,
              messageId: message.id
            }
          ).catch((err) => console.error("Push notification failed for SMS:", err));
        }
        console.log(`Routed SMS from ${From} to user ${receiver.id} via virtual number`);
      } else {
        console.log(`External SMS from ${From} to virtual number ${To} - not from SecureConnect user`);
      }
      res.type("text/xml").send("<Response></Response>");
    } catch (error) {
      console.error("Error handling incoming SMS:", error);
      res.type("text/xml").send("<Response></Response>");
    }
  });
  app2.post("/api/webhooks/twilio/voice", async (req, res) => {
    try {
      const twilioSignature = req.headers["x-twilio-signature"];
      const webhookUrl = `https://${req.headers.host}${req.originalUrl}`;
      if (!validateTwilioWebhookSignature(twilioSignature, webhookUrl, req.body)) {
        console.warn("Invalid Twilio webhook signature for voice");
        res.status(403).send("Forbidden");
        return;
      }
      const { From, To, CallSid } = req.body;
      console.log(`Incoming call: From ${From} to ${To}, CallSid: ${CallSid}`);
      const virtualNumber = await storage.getVirtualNumberByPhone(To);
      if (!virtualNumber || !virtualNumber.assignedUserId) {
        console.log("Virtual number not found or not assigned:", To);
        res.type("text/xml").send(`
          <Response>
            <Say>This number is not currently accepting calls.</Say>
            <Hangup/>
          </Response>
        `);
        return;
      }
      const caller = await storage.getUserByPhone(From);
      const receiver = await storage.getUser(virtualNumber.assignedUserId);
      if (caller && receiver) {
        console.log(`Call from ${From} to user ${receiver.id} via virtual number - routing to app`);
        const call = await storage.createCall(caller.id, receiver.id, "audio");
        socketIO?.to(receiver.id).emit("incoming-call", {
          callerId: caller.id,
          callId: call.id,
          type: "audio",
          callerName: caller.displayName || caller.phoneNumber,
          callerPhoneNumber: From,
          viaVirtualNumber: true
        });
        if (receiver.pushToken && receiver.notificationsEnabled !== false) {
          const callerName = caller.displayName || caller.phoneNumber || "Someone";
          sendCallNotification(
            receiver.pushToken,
            callerName,
            "audio",
            call.id,
            caller.id,
            void 0
          ).catch((err) => console.error("Virtual number call push notification failed:", err));
        }
        res.type("text/xml").send(`
          <Response>
            <Say>Connecting your call through SecureConnect. Please wait.</Say>
            <Pause length="30"/>
            <Say>The person you are calling is not available right now. Please try again through the app.</Say>
            <Hangup/>
          </Response>
        `);
      } else {
        res.type("text/xml").send(`
          <Response>
            <Say>This number only accepts calls from SecureConnect users. Please download SecureConnect to call this number.</Say>
            <Hangup/>
          </Response>
        `);
      }
    } catch (error) {
      console.error("Error handling incoming call:", error);
      res.type("text/xml").send(`
        <Response>
          <Say>An error occurred. Please try again later.</Say>
          <Hangup/>
        </Response>
      `);
    }
  });
  const httpServer = (0, import_node_http.createServer)(app2);
  const io = new import_socket.Server(httpServer, {
    cors: {
      origin: process.env.REPLIT_DOMAINS?.split(",").map((d) => `https://${d.trim()}`) || [],
      credentials: true
    }
  });
  socketIO = io;
  global.__socketIO = io;
  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error("Authentication required"));
    }
    try {
      const decoded = import_jsonwebtoken.default.verify(token, JWT_SECRET);
      try {
        const u = await storage.getUser(decoded.userId);
        const currentTv = u?.tokenVersion ?? 0;
        const tokenTv = decoded.tv ?? 0;
        if (!u || tokenTv !== currentTv) {
          return next(new Error("Session revoked"));
        }
      } catch {
        return next(new Error("Authentication failed"));
      }
      socket.userId = decoded.userId;
      socket.tokenVersion = decoded.tv ?? 0;
      next();
    } catch (error) {
      next(new Error("Invalid token"));
    }
  });
  io.on("connection", (socket) => {
    const userId = socket.userId;
    console.log(`User ${userId} connected`);
    if (!connectedUsers.has(userId)) connectedUsers.set(userId, /* @__PURE__ */ new Set());
    connectedUsers.get(userId).add(socket.id);
    socket.join(userId);
    socket.on("join-conversation", (conversationId) => {
      socket.join(`conversation:${conversationId}`);
    });
    socket.on("leave-conversation", (conversationId) => {
      socket.leave(`conversation:${conversationId}`);
    });
    socket.on("send-message", async (data) => {
      if (isMockConversation(data.conversationId) && isDevMode()) {
        const isReviewer = await isAppleReviewerUser(userId);
        if (isReviewer && isMockUser(data.receiverId)) {
          const userMessage = {
            id: `mock-msg-${Date.now()}-user`,
            conversationId: data.conversationId,
            senderId: userId,
            receiverId: data.receiverId,
            content: data.content,
            mediaUrl: data.mediaUrl || null,
            mediaType: data.mediaType || null,
            createdAt: (/* @__PURE__ */ new Date()).toISOString(),
            isEncrypted: true,
            status: "sent"
          };
          io.to(`conversation:${data.conversationId}`).emit("new-message", userMessage);
          const replyDelay = 1e3 + Math.random() * 2e3;
          setTimeout(() => {
            const botReply = createMockBotReply(data.conversationId, data.receiverId, userId);
            io.to(`conversation:${data.conversationId}`).emit("new-message", botReply);
            io.to(userId).emit("message-notification", {
              conversationId: data.conversationId,
              message: botReply
            });
          }, replyDelay);
          return;
        }
      }
      if (data.receiverId) {
        try {
          const blocked = await storage.isBlockedByEither(userId, data.receiverId);
          if (blocked) {
            socket.emit("send-message-error", { error: "Cannot send message. User is blocked." });
            return;
          }
        } catch (e) {
          console.error("[SEND] socket block check failed (fail-closed):", e);
          socket.emit("send-message-error", { error: "Could not verify send permissions. Try again." });
          return;
        }
      }
      try {
        const { checkAndConsumeChatLimit: checkAndConsumeChatLimit2 } = await Promise.resolve().then(() => (init_aiModerator(), aiModerator_exports));
        const limit = await checkAndConsumeChatLimit2(userId);
        if (!limit.allowed) {
          socket.emit("chat-limit-blocked", {
            error: limit.reason || "Daily message limit reached.",
            perDay: limit.perDay,
            resetAt: limit.resetAt
          });
          return;
        }
      } catch (e) {
        console.error("[AI-MOD] socket limit check failed (fail-closed):", e);
        socket.emit("send-message-error", { error: "Could not verify message limits. Try again." });
        return;
      }
      const message = await storage.createMessage({
        conversationId: data.conversationId,
        senderId: userId,
        receiverId: data.receiverId,
        content: data.content,
        mediaUrl: data.mediaUrl,
        mediaType: data.mediaType,
        isHidden: data.isHidden
      });
      io.to(`conversation:${data.conversationId}`).emit("new-message", message);
      if (data.receiverId) {
        io.to(data.receiverId).emit("message-notification", {
          conversationId: data.conversationId,
          message
        });
        const receiver = await storage.getUser(data.receiverId);
        const sender = await storage.getUser(userId);
        const receiverOnline = connectedUsers.has(data.receiverId);
        if (!receiverOnline && receiver?.pushToken && receiver?.notificationsEnabled !== false) {
          const senderName = sender?.displayName || sender?.phoneNumber || "Someone";
          let messagePreview = "New message";
          if (data.mediaType === "audio") messagePreview = "Sent a voice message";
          else if (data.mediaType === "image") messagePreview = "Sent a photo";
          else if (data.mediaType === "video") messagePreview = "Sent a video";
          else if (data.mediaType === "gif") messagePreview = "Sent a GIF";
          const previewOff = receiver.showNotificationPreview === false;
          const pushTitle = previewOff ? "SecureConnect" : senderName;
          const pushBody = previewOff ? "New encrypted message" : messagePreview;
          sendMessageNotification(
            receiver.pushToken,
            pushTitle,
            pushBody,
            data.conversationId,
            userId
          ).catch((err) => console.error("Push notification failed:", err));
        }
      }
    });
    socket.on("message-delivered", async (data) => {
      try {
        if (!data?.messageId) return;
        const updated = await storage.markMessageDelivered(data.messageId, userId);
        if (!updated) return;
        if (updated.status !== "delivered") return;
        const payload = {
          conversationId: updated.conversationId,
          messageId: updated.id,
          status: "delivered",
          deliveredAt: updated.deliveredAt
        };
        io.to(`conversation:${updated.conversationId}`).emit("message-status", payload);
        io.to(updated.senderId).emit("message-status", payload);
      } catch (err) {
        console.error("message-delivered handler failed:", err);
      }
    });
    socket.on("mark-read", async (data) => {
      try {
        const reader = userId ? await storage.getUser(userId) : null;
        if (reader && reader.readReceiptsEnabled === false) {
          return;
        }
      } catch {
      }
      try {
        if (data?.messageId) {
          const updated = await storage.markMessageRead(data.messageId, userId);
          if (!updated || updated.readBy !== userId) return;
          const payload = {
            conversationId: updated.conversationId,
            messageIds: [updated.id],
            readerId: userId,
            readAt: updated.readAt
          };
          io.to(`conversation:${updated.conversationId}`).emit("messages-read", payload);
          io.to(updated.senderId).emit("messages-read", payload);
          return;
        }
        if (data?.conversationId) {
          const isParticipant = await storage.isConversationParticipant(data.conversationId, userId);
          if (!isParticipant) return;
          const updated = await storage.markMessagesRead(data.conversationId, userId);
          if (updated.length === 0) return;
          const readAt = updated[0].readAt;
          io.to(`conversation:${data.conversationId}`).emit("messages-read", {
            conversationId: data.conversationId,
            messageIds: updated.map((u) => u.id),
            readerId: userId,
            readAt
          });
          const uniqueSenders = Array.from(new Set(updated.map((u) => u.senderId)));
          for (const senderId of uniqueSenders) {
            if (senderId === userId) continue;
            io.to(senderId).emit("messages-read", {
              conversationId: data.conversationId,
              messageIds: updated.filter((u) => u.senderId === senderId).map((u) => u.id),
              readerId: userId,
              readAt
            });
          }
        }
      } catch (err) {
        console.error("mark-read handler failed:", err);
      }
    });
    socket.on("typing", async (data) => {
      try {
        const u = await storage.getUser(userId);
        if (u && u.typingIndicatorsEnabled === false) return;
      } catch {
      }
      socket.to(`conversation:${data.conversationId}`).emit("user-typing", {
        userId,
        conversationId: data.conversationId
      });
    });
    socket.on("stop-typing", (data) => {
      socket.to(`conversation:${data.conversationId}`).emit("user-stop-typing", {
        userId,
        conversationId: data.conversationId
      });
    });
    socket.on("call-user", async (data) => {
      const caller = await storage.getUser(userId);
      const receiver = await storage.getUser(data.receiverId);
      let callerPhoneNumber = caller?.phoneNumber || "";
      console.log("[CALL] Initiating call from", userId, "to", data.receiverId);
      console.log("[CALL] Caller preferredNumberType:", caller?.preferredNumberType);
      console.log("[CALL] Caller virtualNumberId:", caller?.virtualNumberId);
      if (caller?.preferredNumberType === "app" && caller?.virtualNumberId) {
        const virtualNumber = await storage.getVirtualNumber(caller.virtualNumberId);
        console.log("[CALL] Found virtual number:", virtualNumber?.phoneNumber);
        if (virtualNumber) {
          callerPhoneNumber = virtualNumber.phoneNumber;
        }
      }
      console.log("[CALL] Final callerPhoneNumber:", callerPhoneNumber);
      io.to(data.receiverId).emit("incoming-call", {
        callerId: userId,
        callId: data.callId,
        type: data.type,
        callerName: data.callerName,
        callerPhoneNumber
      });
      if (receiver?.pushToken && receiver?.notificationsEnabled !== false) {
        const callerName = caller?.displayName || callerPhoneNumber || "Someone";
        sendCallNotification(
          receiver.pushToken,
          callerName,
          data.type || "audio",
          data.callId,
          userId,
          data.conversationId
        ).catch((err) => console.error("Call push notification failed:", err));
      }
      const missedCallTimeout = setTimeout(async () => {
        if (receiver?.pushToken && receiver?.notificationsEnabled !== false) {
          const callerName = caller?.displayName || callerPhoneNumber || "Someone";
          sendMissedCallNotification(
            receiver.pushToken,
            callerName,
            data.type || "audio",
            userId,
            data.conversationId
          ).catch((err) => console.error("Missed call push notification failed:", err));
        }
      }, 3e4);
      const callAcceptedHandler = (acceptData) => {
        if (acceptData.callId === data.callId) {
          clearTimeout(missedCallTimeout);
          socket.off("call-accepted", callAcceptedHandler);
        }
      };
      const callRejectedHandler = (rejectData) => {
        if (rejectData.callId === data.callId) {
          clearTimeout(missedCallTimeout);
          socket.off("call-rejected", callRejectedHandler);
        }
      };
      const callEndedHandler = (endData) => {
        if (endData.callId === data.callId) {
          clearTimeout(missedCallTimeout);
          socket.off("call-ended", callEndedHandler);
        }
      };
      socket.on("call-accepted", callAcceptedHandler);
      socket.on("call-rejected", callRejectedHandler);
      socket.on("call-ended", callEndedHandler);
      setTimeout(() => {
        socket.off("call-accepted", callAcceptedHandler);
        socket.off("call-rejected", callRejectedHandler);
        socket.off("call-ended", callEndedHandler);
      }, 35e3);
    });
    socket.on("call-accepted", (data) => {
      io.to(data.callerId).emit("call-accepted", {
        callId: data.callId
      });
    });
    socket.on("call-rejected", (data) => {
      io.to(data.callerId).emit("call-rejected", {
        callId: data.callId
      });
    });
    socket.on("call-ended", (data) => {
      io.to(data.otherUserId).emit("call-ended", {
        callId: data.callId
      });
    });
    socket.on("disconnect", async () => {
      console.log(`User ${userId} disconnected`);
      const sockets = connectedUsers.get(userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) connectedUsers.delete(userId);
      }
      await storage.updateUser(userId, { lastSeen: /* @__PURE__ */ new Date() });
    });
  });
  const sweepInterval = setInterval(async () => {
    try {
      const expired = await storage.sweepExpiredMessages();
      if (expired.length === 0) return;
      const ioRef = getIO();
      if (!ioRef) return;
      const byConv = /* @__PURE__ */ new Map();
      for (const e of expired) {
        const arr = byConv.get(e.conversationId) ?? [];
        arr.push(e.id);
        byConv.set(e.conversationId, arr);
      }
      for (const [conversationId, messageIds] of byConv) {
        ioRef.to(`conversation:${conversationId}`).emit("messages-expired", {
          conversationId,
          messageIds
        });
      }
      console.log(`[Sweep] Expired ${expired.length} messages`);
    } catch (err) {
      console.error("[Sweep] Failed:", err);
    }
  }, 6e4);
  if (typeof sweepInterval.unref === "function") sweepInterval.unref();
  return httpServer;
}

// server/webhookHandlers.ts
var WebhookHandlers = class {
  static async processWebhook(payload, signature, uuid) {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        "STRIPE WEBHOOK ERROR: Payload must be a Buffer. Received type: " + typeof payload + ". This usually means express.json() parsed the body before reaching this handler. FIX: Ensure webhook route is registered BEFORE app.use(express.json())."
      );
    }
    const sync = await getStripeSync();
    await sync.processWebhook(payload, signature, uuid);
  }
};

// server/index.ts
var fs2 = __toESM(require("fs"));
var path2 = __toESM(require("path"));
var app = (0, import_express.default)();
var log = console.log;
async function initStripe() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log("DATABASE_URL not set, skipping Stripe initialization");
    return;
  }
  try {
    console.log("Initializing Stripe schema...");
    await (0, import_stripe_replit_sync.runMigrations)({
      databaseUrl,
      schema: "stripe"
    });
    console.log("Stripe schema ready");
    const stripeSync2 = await getStripeSync();
    console.log("Setting up managed webhook...");
    const webhookBaseUrl = `https://${process.env.REPLIT_DOMAINS?.split(",")[0]}`;
    const { webhook, uuid } = await stripeSync2.findOrCreateManagedWebhook(
      `${webhookBaseUrl}/api/stripe/webhook`,
      {
        enabled_events: ["*"],
        description: "SecureChat Stripe sync webhook"
      }
    );
    console.log(`Webhook configured: ${webhook.url}`);
    stripeSync2.syncBackfill().then(() => {
      console.log("Stripe data synced");
    }).catch((err) => {
      console.error("Error syncing Stripe data:", err);
    });
  } catch (error) {
    console.warn("Stripe not configured, skipping \u2014 server will start without Stripe:", error.message ?? error);
  }
}
function setupCors(app2) {
  app2.use((req, res, next) => {
    const origins = /* @__PURE__ */ new Set();
    if (process.env.REPLIT_DEV_DOMAIN) {
      origins.add(`https://${process.env.REPLIT_DEV_DOMAIN}`);
    }
    if (process.env.REPLIT_DOMAINS) {
      process.env.REPLIT_DOMAINS.split(",").forEach((d) => {
        origins.add(`https://${d.trim()}`);
      });
    }
    const origin = req.header("origin");
    if (origin && origins.has(origin)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS"
      );
      res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.header("Access-Control-Allow-Credentials", "true");
    }
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  });
}
function setupRequestLogging(app2) {
  app2.use((req, res, next) => {
    const start = Date.now();
    const path3 = req.path;
    let capturedJsonResponse = void 0;
    const originalResJson = res.json;
    res.json = function(bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };
    res.on("finish", () => {
      if (!path3.startsWith("/api")) return;
      const duration = Date.now() - start;
      let logLine = `${req.method} ${path3} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "\u2026";
      }
      log(logLine);
    });
    next();
  });
}
function getAppName() {
  try {
    const appJsonPath = path2.resolve(process.cwd(), "app.json");
    const appJsonContent = fs2.readFileSync(appJsonPath, "utf-8");
    const appJson = JSON.parse(appJsonContent);
    return appJson.expo?.name || "App Landing Page";
  } catch {
    return "App Landing Page";
  }
}
function serveExpoManifest(platform, res) {
  const manifestPath = path2.resolve(
    process.cwd(),
    "static-build",
    platform,
    "manifest.json"
  );
  if (!fs2.existsSync(manifestPath)) {
    return res.status(404).json({ error: `Manifest not found for platform: ${platform}` });
  }
  res.setHeader("expo-protocol-version", "1");
  res.setHeader("expo-sfv-version", "0");
  res.setHeader("content-type", "application/json");
  const manifest = fs2.readFileSync(manifestPath, "utf-8");
  res.send(manifest);
}
function configureExpoAndLanding(app2) {
  const templatePath = path2.resolve(
    process.cwd(),
    "server",
    "templates",
    "landing-page.html"
  );
  const marketingPath = path2.resolve(
    process.cwd(),
    "server",
    "templates",
    "marketing-page.html"
  );
  const landingPageTemplate = fs2.readFileSync(templatePath, "utf-8");
  const marketingPageTemplate = fs2.readFileSync(marketingPath, "utf-8");
  const appName = getAppName();
  const isDev = process.env.NODE_ENV === "development";
  log("Serving static Expo files with dynamic manifest routing");
  if (isDev) {
    log("Development mode: proxying to Expo dev server on port 8081");
    const expoProxy = (0, import_http_proxy_middleware.createProxyMiddleware)({
      target: "http://localhost:8081",
      changeOrigin: true,
      ws: true,
      logLevel: "warn"
    });
    const appAliasProxy = (0, import_http_proxy_middleware.createProxyMiddleware)({
      target: "http://localhost:8081",
      changeOrigin: true,
      ws: true,
      logLevel: "warn",
      pathRewrite: { "^/app": "" }
    });
    app2.use((req, res, next) => {
      if (req.path === "/open") {
        const host = req.get("host") || "";
        const expsUrl = `exps://${host}`;
        return res.redirect(expsUrl);
      }
      if (req.path.startsWith("/api") || req.path.startsWith("/objects") || req.path.startsWith("/public-objects") || req.path === "/privacy" || req.path === "/support" || req.path === "/terms") {
        return next();
      }
      if (req.path === "/app" || req.path.startsWith("/app/")) {
        return appAliasProxy(req, res, next);
      }
      return expoProxy(req, res, next);
    });
  } else {
    app2.use((req, res, next) => {
      if (req.path.startsWith("/api") || req.path === "/privacy" || req.path === "/support" || req.path === "/terms") {
        return next();
      }
      if (req.path !== "/" && req.path !== "/manifest" && req.path !== "/open") {
        return next();
      }
      const platform = req.header("expo-platform");
      if (platform && (platform === "ios" || platform === "android")) {
        return serveExpoManifest(platform, res);
      }
      if (req.path === "/open") {
        const forwardedHost = req.header("x-forwarded-host");
        const host = forwardedHost || req.get("host") || "";
        const expsUrl = `exps://${host}`;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        return res.status(200).send(`<!doctype html><html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Open ${appName}</title>
<meta http-equiv="refresh" content="0;url=${expsUrl}">
<style>body{font-family:-apple-system,system-ui,sans-serif;background:#0b0b16;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:1.5rem;text-align:center}a{color:#7c5cff;font-weight:600}</style>
</head><body>
<h1 style="margin:0 0 1rem">Opening ${appName}\u2026</h1>
<p>If nothing happens, make sure <a href="https://expo.dev/go" target="_blank">Expo Go</a> is installed, then <a href="${expsUrl}">tap here</a>.</p>
<p style="margin-top:2rem;opacity:0.7"><a href="/" style="color:#aaa">Back to landing page</a></p>
<script>setTimeout(function(){window.location.href=${JSON.stringify(expsUrl)};},100);</script>
</body></html>`);
      }
      if (req.path === "/") {
        const forwardedHost = req.header("x-forwarded-host");
        const host = forwardedHost || req.get("host") || "";
        const expsUrl = `${host}`;
        const html = marketingPageTemplate.replace(/EXPS_URL_PLACEHOLDER/g, expsUrl).replace(/APP_NAME_PLACEHOLDER/g, appName);
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        return res.status(200).send(html);
      }
      next();
    });
    app2.use("/assets", import_express.default.static(path2.resolve(process.cwd(), "assets")));
    app2.use(import_express.default.static(path2.resolve(process.cwd(), "static-build")));
    const webBuildDir = path2.resolve(process.cwd(), "web-build");
    if (fs2.existsSync(webBuildDir)) {
      app2.use("/app", import_express.default.static(webBuildDir, { index: false }));
      app2.get(/^\/app(\/.*)?$/, (_req, res) => {
        res.setHeader("Cache-Control", "no-cache");
        res.sendFile(path2.join(webBuildDir, "index.html"));
      });
    } else {
      app2.get(/^\/app(\/.*)?$/, (_req, res) => {
        res.status(503).type("text/html").send(
          `<!doctype html><meta charset="utf-8"><title>Web app unavailable</title><div style="font-family:-apple-system,system-ui,sans-serif;padding:2rem;max-width:560px;margin:auto;color:#222"><h1>Web app is being prepared</h1><p>The browser version of ${getAppName()} hasn't been built yet. Please redeploy or try again in a few minutes.</p><p><a href="/" style="color:#7c5cff">Back to home</a></p></div>`
        );
      });
    }
  }
  log("Expo routing: Checking expo-platform header on / and /manifest");
}
function setupErrorHandler(app2) {
  app2.use((err, _req, res, _next) => {
    const error = err;
    const status = error.status || error.statusCode || 500;
    const message = error.message || "Internal Server Error";
    res.status(status).json({ message });
    throw err;
  });
}
(async () => {
  await initStripe().catch((err) => {
    console.warn("Stripe initialization skipped:", err.message ?? err);
  });
  setupCors(app);
  app.post(
    "/api/stripe/webhook/:uuid",
    import_express.default.raw({ type: "application/json" }),
    async (req, res) => {
      const signature = req.headers["stripe-signature"];
      if (!signature) {
        return res.status(400).json({ error: "Missing stripe-signature" });
      }
      try {
        const sig = Array.isArray(signature) ? signature[0] : signature;
        if (!Buffer.isBuffer(req.body)) {
          console.error("Webhook body is not a Buffer");
          return res.status(500).json({ error: "Webhook processing error" });
        }
        const { uuid } = req.params;
        await WebhookHandlers.processWebhook(req.body, sig, uuid);
        res.status(200).json({ received: true });
      } catch (error) {
        console.error("Webhook error:", error.message);
        res.status(400).json({ error: "Webhook processing error" });
      }
    }
  );
  app.use(import_express.default.json());
  app.use(import_express.default.urlencoded({ extended: false }));
  setupRequestLogging(app);
  const server = await registerRoutes(app);
  configureExpoAndLanding(app);
  setupErrorHandler(app);
  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true
    },
    () => {
      log(`express server serving on port ${port}`);
    }
  );
})();
