import { users, conversations, conversationParticipants, messages, calls, hiddenLockerItems, verificationCodes, pendingContacts, joinNotifications, messageRequests, statuses, statusViews, statusAllowedViewers, statusMutes, friends, locationShares, locationRequests, virtualNumbers, externalSms, userBlocks, userReports, scheduledMessages, userDevices, signedPrekeys, oneTimePrekeys, encryptedBackups, loginEvents, appSettings, messageSaves } from "@shared/schema";
import type { User, InsertUser, Message, InsertMessage, Conversation, Call, HiddenLockerItem, VerificationCode, PendingContact, JoinNotification, MessageRequest, Status, StatusView, Friend, LocationShare, LocationRequest, VirtualNumber, ExternalSms, UserBlock, UserReport, InsertUserReport, ScheduledMessage, UserDevice, SignedPrekey, OneTimePrekey, LoginEvent } from "@shared/schema";
import { gt, lt, lte, ilike } from "drizzle-orm";
import { db } from "./db";
import { eq, and, desc, sql, or, inArray, ne, isNull } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByPhone(phoneNumber: string): Promise<User | undefined>;
  getUserByAppleId(appleUserId: string): Promise<User | undefined>;
  getUserByGoogleId(googleUserId: string): Promise<User | undefined>;
  getUserBySafeCodeLookupHash(hash: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, data: Partial<User>): Promise<User | undefined>;
  
  createVerificationCode(phoneNumber: string, code: string, expiresAt: Date): Promise<VerificationCode>;
  getVerificationCode(phoneNumber: string, code: string): Promise<VerificationCode | undefined>;
  markCodeVerified(id: string): Promise<void>;
  
  getConversations(userId: string, numberType?: string): Promise<any[]>;
  findConversationBetween(userId1: string, userId2: string, numberType?: string): Promise<Conversation | undefined>;
  getOrCreateConversation(userId1: string, userId2: string, numberType?: string): Promise<Conversation>;
  getOrCreateConversationAsRequest(initiatorId: string, otherUserId: string, numberType?: string): Promise<Conversation>;
  getConversationMessages(conversationId: string, limit?: number, viewerUserId?: string): Promise<Message[]>;
  getConversationById(conversationId: string): Promise<Conversation | undefined>;
  getConversationParticipants(conversationId: string): Promise<{ userId: string }[]>;
  
  createMessage(message: InsertMessage): Promise<Message>;
  getMessage(id: string): Promise<Message | undefined>;
  deleteMessage(id: string): Promise<void>;
  updateMessageStatus(id: string, status: string): Promise<void>;
  addMessageReaction(messageId: string, userId: string, emoji: string): Promise<Message | undefined>;
  markMessagesRead(conversationId: string, userId: string): Promise<void>;
  
  getCalls(userId: string): Promise<Call[]>;
  getCall(id: string): Promise<Call | undefined>;
  createCall(
    callerId: string,
    receiverId: string,
    type: string,
    opts?: { sealedCall?: boolean; outerCallerVirtualNumberId?: string | null },
  ): Promise<Call>;
  updateCall(id: string, data: Partial<Call>): Promise<Call | undefined>;
  deleteCall(id: string, userId: string): Promise<boolean>;
  clearCallHistory(userId: string): Promise<void>;
  
  getHiddenLockerItems(userId: string): Promise<HiddenLockerItem[]>;
  addToLocker(userId: string, data: Partial<HiddenLockerItem>): Promise<HiddenLockerItem>;
  removeFromLocker(id: string, userId: string): Promise<void>;
  
  setLockerPin(userId: string, pin: string): Promise<void>;
  verifyLockerPin(userId: string, pin: string): Promise<boolean>;
  resetLocker(userId: string): Promise<void>;
  
  getAnnouncementStats(): Promise<{ activeUsers: number; totalUsers: number; recentMessage: string }>;
  addPendingContact(addedByUserId: string, phoneNumber: string): Promise<PendingContact>;
  getPendingContactsForPhone(phoneNumber: string): Promise<PendingContact[]>;
  markPendingContactsNotified(phoneNumber: string): Promise<void>;
  createJoinNotification(userId: string, newUserPhone: string, newUserName?: string): Promise<JoinNotification>;
  getJoinNotifications(userId: string): Promise<JoinNotification[]>;
  markJoinNotificationRead(id: string): Promise<void>;
  processNewUserJoined(newUserPhone: string, newUserName?: string): Promise<void>;
  
  getMessageRequests(userId: string): Promise<any[]>;
  getPendingMessageRequestCount(userId: string): Promise<number>;
  createMessageRequest(senderId: string, receiverId: string, messagePreview?: string, conversationId?: string): Promise<MessageRequest>;
  acceptMessageRequest(requestId: string, userId: string): Promise<{ conversationId: string } | null>;
  declineMessageRequest(requestId: string, userId: string): Promise<void>;
  getPendingRequestForRecipient(conversationId: string, receiverUserId: string): Promise<string | null>;
  findUsersByPhoneNumbers(phoneNumbers: string[], excludeUserId: string): Promise<User[]>;
  listAllUsers(): Promise<Pick<User, 'id' | 'phoneNumber' | 'displayName' | 'createdAt' | 'isSuspended' | 'suspensionReason' | 'pushToken' | 'notificationsEnabled'>[]>;
  deleteUserAccount(userId: string): Promise<void>;

  // Account deletion (build 62) — two-phase: request → 30-day grace → tombstone.
  requestAccountDeletion(userId: string): Promise<{ scheduledFor: Date }>;
  emergencyDeleteAccount(userId: string): Promise<void>;
  cancelAccountDeletion(userId: string): Promise<void>;
  getDueAccountDeletions(limit?: number): Promise<Array<{ id: string }>>;
  executeHardDelete(userId: string): Promise<void>;

  recordLoginEvent(data: { userId: string; deviceId?: string | null; deviceName?: string | null; platform?: string | null; ipAddress?: string | null; userAgent?: string | null; isNewDevice?: boolean }): Promise<LoginEvent>;
  getLoginEvents(userId: string, limit?: number): Promise<LoginEvent[]>;
  bumpTokenVersion(userId: string, currentDeviceId?: string | null): Promise<number>;

  // Privacy + per-chat settings + message actions (Build 59)
  getUserPrivacy(userId: string): Promise<{ readReceiptsEnabled: boolean; typingIndicatorsEnabled: boolean; showNotificationPreview: boolean; defaultDisappearingTimer: number } | undefined>;
  updateUserPrivacy(userId: string, patch: { readReceiptsEnabled?: boolean; typingIndicatorsEnabled?: boolean; showNotificationPreview?: boolean; defaultDisappearingTimer?: number }): Promise<User | undefined>;
  updateStoryPrivacy(userId: string, patch: { storiesEnabled?: boolean; storyPrivacyMode?: string; storyPrivacyExceptIds?: string[]; storyPrivacyOnlyIds?: string[]; storyViewReceiptsEnabled?: boolean }): Promise<User | undefined>;
  setConversationTimer(conversationId: string, userId: string, seconds: number): Promise<boolean>;
  pinMessage(conversationId: string, messageId: string, userId: string): Promise<boolean>;
  unpinMessage(conversationId: string, userId: string): Promise<boolean>;
  saveMessage(userId: string, messageId: string): Promise<boolean>;
  unsaveMessage(userId: string, messageId: string): Promise<boolean>;
  getSavedMessageIds(userId: string, conversationId: string): Promise<string[]>;
  deleteMessageForMe(messageId: string, userId: string): Promise<boolean>;
  deleteMessageForEveryone(
    messageId: string,
    userId: string,
  ): Promise<{ message: Message } | { error: 'not_found' | 'not_sender' | 'expired' }>;
  forwardMessage(originalMessageId: string, targetConversationId: string, senderId: string, receiverId: string | null): Promise<Message | null>;
  sweepExpiredMessages(): Promise<Array<{ id: string; conversationId: string }>>;

  createUserReport(data: InsertUserReport): Promise<UserReport>;
  hasRecentReport(reporterId: string, reportedUserId: string, reportedMessageId?: string | null): Promise<boolean>;
  listReports(filter: { status?: string; limit?: number }): Promise<Array<UserReport & {
    reporter: { id: string; phoneNumber: string; displayName: string | null } | null;
    reported: { id: string; phoneNumber: string; displayName: string | null; isSuspended: boolean | null } | null;
  }>>;
  getReport(id: string): Promise<UserReport | undefined>;
  updateReport(id: string, patch: Partial<UserReport>): Promise<UserReport | undefined>;
  suspendUser(userId: string, reason: string): Promise<void>;
  unsuspendUser(userId: string): Promise<void>;
  getAppSetting(key: string): Promise<string | undefined>;
  setAppSetting(key: string, value: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getAppSetting(key: string): Promise<string | undefined> {
    const [row] = await db.select().from(appSettings).where(eq(appSettings.key, key));
    return row?.value;
  }

  async setAppSetting(key: string, value: string): Promise<void> {
    await db.insert(appSettings).values({ key, value, updatedAt: new Date() })
      .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } });
  }

  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByPhone(phoneNumber: string): Promise<User | undefined> {
    // Exclude tombstoned (account-deleted) rows so a recycled phone number
    // can re-register cleanly and so search / contact-discovery never
    // surfaces a "Deleted user" placeholder. Defense in depth: the
    // tombstone rewrites phoneNumber to `deleted:<uuid>` so a real E.164
    // lookup wouldn't match anyway, but we filter explicitly in case
    // somebody passes the tombstoned value.
    const [user] = await db.select().from(users).where(and(
      eq(users.phoneNumber, phoneNumber),
      or(isNull(users.isDeletedPlaceholder), eq(users.isDeletedPlaceholder, false)),
    ));
    return user || undefined;
  }

  async getUserByAppleId(appleUserId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(and(
      eq(users.appleUserId, appleUserId),
      or(isNull(users.isDeletedPlaceholder), eq(users.isDeletedPlaceholder, false)),
    ));
    return user || undefined;
  }

  async getUserByGoogleId(googleUserId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(and(
      eq(users.googleUserId, googleUserId),
      or(isNull(users.isDeletedPlaceholder), eq(users.isDeletedPlaceholder, false)),
    ));
    return user || undefined;
  }

  // usernameLower must already be lowercased by the caller — the column
  // stores the canonical lowercase form, so an exact eq() match works
  // without an extra LOWER() on every lookup.
  async getUserByUsername(usernameLower: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(and(
      eq(users.username, usernameLower),
      or(isNull(users.isDeletedPlaceholder), eq(users.isDeletedPlaceholder, false)),
    ));
    return user || undefined;
  }

  async getUserBySafeCodeLookupHash(hash: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(and(
      eq(users.safeCodeLookupHash, hash),
      or(isNull(users.isDeletedPlaceholder), eq(users.isDeletedPlaceholder, false)),
    ));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async updateUser(id: string, data: Partial<User>): Promise<User | undefined> {
    const [user] = await db.update(users).set(data).where(eq(users.id, id)).returning();
    return user || undefined;
  }

  async createVerificationCode(phoneNumber: string, code: string, expiresAt: Date): Promise<VerificationCode> {
    const [verificationCode] = await db.insert(verificationCodes).values({
      phoneNumber,
      code,
      expiresAt,
    }).returning();
    return verificationCode;
  }

  async getVerificationCode(phoneNumber: string, code: string): Promise<VerificationCode | undefined> {
    const [verificationCode] = await db.select()
      .from(verificationCodes)
      .where(and(
        eq(verificationCodes.phoneNumber, phoneNumber),
        eq(verificationCodes.code, code),
        eq(verificationCodes.verified, false)
      ));
    return verificationCode || undefined;
  }

  async markCodeVerified(id: string): Promise<void> {
    await db.update(verificationCodes).set({ verified: true }).where(eq(verificationCodes.id, id));
  }

  async getConversations(userId: string, numberType: string = 'personal'): Promise<any[]> {
    // Optimized: Single query with joins instead of N+1 queries
    // Step 1: Get all conversations for this user with the correct numberType
    const myParticipations = await db.select({
      conversationId: conversationParticipants.conversationId,
      unreadCount: conversationParticipants.unreadCount,
      isArchived: conversationParticipants.isArchived,
      isMuted: conversationParticipants.isMuted,
      isLocked: conversationParticipants.isLocked,
      folder: conversationParticipants.folder,
      convId: conversations.id,
      convNumberType: conversations.numberType,
      convLastMessageAt: conversations.lastMessageAt,
      convLastMessagePreview: conversations.lastMessagePreview,
      convCreatedAt: conversations.createdAt,
    })
      .from(conversationParticipants)
      .innerJoin(conversations, eq(conversationParticipants.conversationId, conversations.id))
      .where(eq(conversationParticipants.userId, userId));

    if (myParticipations.length === 0) return [];

    // Filter by numberType
    const filteredParticipations = myParticipations.filter(p => 
      (p.convNumberType || 'personal') === numberType
    );

    if (filteredParticipations.length === 0) return [];

    const conversationIds = filteredParticipations.map(p => p.conversationId);

    // Step 2: Get all other participants for these conversations in a single query
    const allOtherParticipants = await db.select({
      conversationId: conversationParticipants.conversationId,
      participantUserId: conversationParticipants.userId,
      userId: users.id,
      phoneNumber: users.phoneNumber,
      displayName: users.displayName,
      username: users.username,
      avatarIndex: users.avatarIndex,
      avatarUrl: users.avatarUrl,
      isVip: users.isVip,
      lastSeen: users.lastSeen,
    })
      .from(conversationParticipants)
      .innerJoin(users, eq(conversationParticipants.userId, users.id))
      .where(and(
        inArray(conversationParticipants.conversationId, conversationIds),
        ne(conversationParticipants.userId, userId)
      ));

    // Build a map of conversationId -> otherUser
    const otherUserMap = new Map<string, any>();
    for (const p of allOtherParticipants) {
      otherUserMap.set(p.conversationId, {
        id: p.userId,
        phoneNumber: p.phoneNumber,
        displayName: p.displayName,
        username: p.username,
        avatarIndex: p.avatarIndex,
        avatarUrl: p.avatarUrl,
        isVip: p.isVip,
        lastSeen: p.lastSeen,
      });
    }

    // Step 3: which of these conversations are still a pending message
    // request *for this user to accept* — flags the "Message request" label
    // in the chat list instead of a real message preview.
    const pendingForMe = await db.select({ conversationId: messageRequests.conversationId })
      .from(messageRequests)
      .where(and(
        eq(messageRequests.receiverId, userId),
        eq(messageRequests.status, "pending"),
        inArray(messageRequests.conversationId, conversationIds),
      ));
    const pendingForMeSet = new Set(pendingForMe.map(r => r.conversationId));

    // Combine results
    const results = filteredParticipations.map(p => ({
      id: p.convId,
      numberType: p.convNumberType,
      lastMessageAt: p.convLastMessageAt,
      lastMessagePreview: p.convLastMessagePreview,
      createdAt: p.convCreatedAt,
      otherUser: otherUserMap.get(p.conversationId) || null,
      unreadCount: p.unreadCount || 0,
      isPendingRequest: pendingForMeSet.has(p.conversationId),
      // Was previously never selected here, so the client's own
      // isArchived/folder filtering (ChatsScreen) silently never worked —
      // needed now so declining a message request (which archives it for
      // the decliner) actually removes it from their main list.
      isArchived: p.isArchived ?? false,
      isMuted: p.isMuted ?? false,
      isLocked: p.isLocked ?? false,
      folder: p.folder || 'none',
    }));

    // Sort by lastMessageAt descending
    return results.sort((a, b) => 
      new Date(b.lastMessageAt || 0).getTime() - new Date(a.lastMessageAt || 0).getTime()
    );
  }

  // Read-only lookup half of getOrCreateConversation, split out so callers
  // that need to know "did this conversation already exist?" (the message-
  // request gate in POST /api/conversations) can check before creating.
  async findConversationBetween(userId1: string, userId2: string, numberType: string = 'personal'): Promise<Conversation | undefined> {
    const user1Convs = await db.select()
      .from(conversationParticipants)
      .where(eq(conversationParticipants.userId, userId1));

    for (const conv of user1Convs) {
      const [user2Part] = await db.select()
        .from(conversationParticipants)
        .where(and(
          eq(conversationParticipants.conversationId, conv.conversationId),
          eq(conversationParticipants.userId, userId2)
        ));

      if (user2Part) {
        const [conversation] = await db.select().from(conversations).where(eq(conversations.id, conv.conversationId));
        const convNumberType = conversation?.numberType || 'personal';
        if (convNumberType === numberType) {
          return conversation;
        }
      }
    }
    return undefined;
  }

  async getOrCreateConversation(userId1: string, userId2: string, numberType: string = 'personal'): Promise<Conversation> {
    const existing = await this.findConversationBetween(userId1, userId2, numberType);
    if (existing) return existing;

    // Create new conversation with the specified numberType
    const [newConversation] = await db.insert(conversations).values({ numberType }).returning();

    await db.insert(conversationParticipants).values([
      { conversationId: newConversation.id, userId: userId1 },
      { conversationId: newConversation.id, userId: userId2 },
    ]);

    return newConversation;
  }

  // Same as getOrCreateConversation, but also files a pending message
  // request the moment a brand-new conversation is created — the single
  // shared entry point every "start talking to someone new" path should go
  // through (direct new-message, status reply, etc.) so the accept/decline
  // gate applies consistently everywhere, not just one route.
  async getOrCreateConversationAsRequest(initiatorId: string, otherUserId: string, numberType: string = 'personal'): Promise<Conversation> {
    const existing = await this.findConversationBetween(initiatorId, otherUserId, numberType);
    const conversation = await this.getOrCreateConversation(initiatorId, otherUserId, numberType);
    if (!existing) {
      await this.createMessageRequest(initiatorId, otherUserId, undefined, conversation.id);
    }
    return conversation;
  }

  async getConversationById(conversationId: string): Promise<Conversation | undefined> {
    const [row] = await db.select().from(conversations).where(eq(conversations.id, conversationId)).limit(1);
    return row;
  }

  async getConversationParticipants(conversationId: string): Promise<{ userId: string }[]> {
    return await db.select({ userId: conversationParticipants.userId })
      .from(conversationParticipants)
      .where(eq(conversationParticipants.conversationId, conversationId));
  }

  async getConversationMessages(conversationId: string, limit = 50, viewerUserId?: string): Promise<Message[]> {
    const messagesList = await db.select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(desc(messages.createdAt))
      .limit(limit);

    // Filter per-user "delete for me" tombstones so removed messages do not
    // reappear after a refresh.
    const filtered = viewerUserId
      ? messagesList.filter((m) => {
          const list = (m.deletedForUserIds as string[] | null) ?? [];
          return !list.includes(viewerUserId);
        })
      : messagesList;

    return filtered.reverse();
  }

  async createMessage(
    insertMessage: InsertMessage,
    extra?: {
      encryptionVersion?: string;
      e2eeInitEnvelope?: any;
      replyToMessageId?: string | null;
      replyToPreview?: string | null;
      replyToSenderId?: string | null;
      forwarded?: boolean;
      forwardedFromUserId?: string | null;
      expiresAt?: Date | null;
      // System messages (e.g. missed-call events) are server-authored and
      // not encrypted — they carry no user plaintext, only a structured
      // event payload in `content`. Set isEncrypted=false to opt out of
      // the encrypted-message preview path and let the client render the
      // event directly.
      isEncrypted?: boolean;
    }
  ): Promise<Message> {
    const isEncrypted = extra?.isEncrypted ?? true;
    const encVer = extra?.encryptionVersion ?? (isEncrypted ? "v2-signal" : "none");

    // Resolve disappearing-message expiry: explicit extra.expiresAt wins,
    // otherwise fall back to the conversation's disappearingTimer.
    let expiresAt: Date | null = extra?.expiresAt ?? null;
    if (!expiresAt) {
      const [conv] = await db.select({ t: conversations.disappearingTimer })
        .from(conversations)
        .where(eq(conversations.id, insertMessage.conversationId))
        .limit(1);
      if (conv?.t && conv.t > 0) {
        expiresAt = new Date(Date.now() + conv.t * 1000);
      }
    }

    const [message] = await db.insert(messages).values({
      ...insertMessage,
      isEncrypted,
      encryptionVersion: encVer,
      e2eeInitEnvelope: extra?.e2eeInitEnvelope ?? null,
      replyToMessageId: extra?.replyToMessageId ?? null,
      replyToPreview: extra?.replyToPreview ?? null,
      replyToSenderId: extra?.replyToSenderId ?? null,
      forwarded: extra?.forwarded ?? false,
      forwardedFromUserId: extra?.forwardedFromUserId ?? null,
      expiresAt,
    }).returning();

    // Never store plaintext previews for encrypted messages
    let preview: string;
    if (insertMessage.mediaType === "call_event") {
      // System event — derive a human preview from the structured payload
      // so the chat list shows e.g. "Missed audio call" instead of JSON.
      try {
        const ev = JSON.parse(insertMessage.content || "{}");
        const verb = ev.action === "missed" ? "Missed" :
                     ev.action === "declined" ? "Declined" :
                     ev.action === "ended" ? "Call" : "Call";
        const kind = ev.callType === "video" ? "video call" : "audio call";
        preview = `${verb} ${kind}`;
      } catch {
        preview = "Call";
      }
    } else if (encVer === "v2-signal" || encVer === "v1-nacl") {
      if (insertMessage.mediaType === "audio") preview = "Sent a voice message";
      else if (insertMessage.mediaType === "image") preview = "Sent a photo";
      else if (insertMessage.mediaType === "video") preview = "Sent a video";
      else preview = "Encrypted message";
    } else {
      if (!insertMessage.content) preview = insertMessage.mediaType ? `Sent a ${insertMessage.mediaType}` : "[Media]";
      else preview = insertMessage.content.substring(0, 50);
    }

    await db.update(conversations)
      .set({ lastMessageAt: new Date(), lastMessagePreview: preview })
      .where(eq(conversations.id, insertMessage.conversationId));

    if (insertMessage.receiverId) {
      await db.update(conversationParticipants)
        .set({ unreadCount: sql`${conversationParticipants.unreadCount} + 1` })
        .where(and(
          eq(conversationParticipants.conversationId, insertMessage.conversationId),
          eq(conversationParticipants.userId, insertMessage.receiverId)
        ));
    }

    return message;
  }

  async updateMessageStatus(id: string, status: string): Promise<void> {
    await db.update(messages).set({ status }).where(eq(messages.id, id));
  }

  // Mark a single message as delivered. Only the real receiver can do this.
  // Returns the updated message (with senderId so caller can notify the sender).
  async markMessageDelivered(messageId: string, receiverUserId: string): Promise<Message | undefined> {
    const [existing] = await db.select().from(messages).where(eq(messages.id, messageId)).limit(1);
    if (!existing) return undefined;
    if (existing.receiverId !== receiverUserId) return undefined;
    if (existing.status === "read" || existing.status === "delivered") return existing;

    const [updated] = await db.update(messages)
      .set({ status: "delivered", deliveredAt: new Date() })
      .where(and(eq(messages.id, messageId), eq(messages.receiverId, receiverUserId), eq(messages.status, "sent")))
      .returning();
    return updated ?? existing;
  }

  // Mark a single message as read. Only the real receiver can do this.
  async markMessageRead(messageId: string, receiverUserId: string): Promise<Message | undefined> {
    const [existing] = await db.select().from(messages).where(eq(messages.id, messageId)).limit(1);
    if (!existing) return undefined;
    if (existing.receiverId !== receiverUserId) return undefined;
    if (existing.status === "read") return existing;

    // Message-request flow: the recipient can preview a pending request
    // without the sender learning it was seen — "seen" only starts flowing
    // once they accept (see getPendingRequestForRecipient).
    if (await this.getPendingRequestForRecipient(existing.conversationId, receiverUserId)) return existing;

    const now = new Date();
    const [updated] = await db.update(messages)
      .set({ status: "read", readAt: now, readBy: receiverUserId, deliveredAt: existing.deliveredAt ?? now })
      .where(and(eq(messages.id, messageId), eq(messages.receiverId, receiverUserId)))
      .returning();
    return updated ?? existing;
  }

  // Returns true if user is a participant in this conversation.
  async isConversationParticipant(conversationId: string, userId: string): Promise<boolean> {
    const [row] = await db.select({ id: conversationParticipants.userId })
      .from(conversationParticipants)
      .where(and(
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.userId, userId),
      ))
      .limit(1);
    return !!row;
  }

  async addMessageReaction(messageId: string, userId: string, emoji: string): Promise<Message | undefined> {
    const msg = await db.select().from(messages).where(eq(messages.id, messageId)).limit(1);
    if (!msg[0]) return undefined;

    const current: Record<string, string[]> = (msg[0].reactions as Record<string, string[]>) || {};
    const updated: Record<string, string[]> = { ...current };

    if (updated[emoji]?.includes(userId)) {
      updated[emoji] = updated[emoji].filter((id) => id !== userId);
      if (updated[emoji].length === 0) delete updated[emoji];
    } else {
      for (const key of Object.keys(updated)) {
        updated[key] = updated[key].filter((id) => id !== userId);
        if (updated[key].length === 0) delete updated[key];
      }
      updated[emoji] = [...(updated[emoji] || []), userId];
    }

    const [result] = await db
      .update(messages)
      .set({ reactions: updated })
      .where(eq(messages.id, messageId))
      .returning();
    return result;
  }

  async getMessage(id: string): Promise<Message | undefined> {
    const [message] = await db.select().from(messages).where(eq(messages.id, id));
    return message || undefined;
  }

  async deleteMessage(id: string): Promise<void> {
    await db.delete(messages).where(eq(messages.id, id));
  }

  // ─── Build 59: privacy + chat actions ────────────────────────────────────
  async getUserPrivacy(userId: string): Promise<{ readReceiptsEnabled: boolean; typingIndicatorsEnabled: boolean; showNotificationPreview: boolean; defaultDisappearingTimer: number } | undefined> {
    const user = await this.getUser(userId);
    if (!user) return undefined;
    return {
      readReceiptsEnabled: user.readReceiptsEnabled ?? true,
      typingIndicatorsEnabled: user.typingIndicatorsEnabled ?? true,
      showNotificationPreview: user.showNotificationPreview ?? true,
      defaultDisappearingTimer: user.defaultDisappearingTimer ?? 0,
    };
  }

  async updateUserPrivacy(
    userId: string,
    patch: { readReceiptsEnabled?: boolean; typingIndicatorsEnabled?: boolean; showNotificationPreview?: boolean; defaultDisappearingTimer?: number; keepMutedChatsArchived?: boolean }
  ): Promise<User | undefined> {
    const set: Partial<User> = {};
    if (typeof patch.readReceiptsEnabled === 'boolean') set.readReceiptsEnabled = patch.readReceiptsEnabled;
    if (typeof patch.typingIndicatorsEnabled === 'boolean') set.typingIndicatorsEnabled = patch.typingIndicatorsEnabled;
    if (typeof patch.showNotificationPreview === 'boolean') set.showNotificationPreview = patch.showNotificationPreview;
    if (typeof patch.defaultDisappearingTimer === 'number' && patch.defaultDisappearingTimer >= 0) {
      set.defaultDisappearingTimer = patch.defaultDisappearingTimer;
    }
    if (typeof patch.keepMutedChatsArchived === 'boolean') set.keepMutedChatsArchived = patch.keepMutedChatsArchived;
    if (Object.keys(set).length === 0) return await this.getUser(userId);
    const [updated] = await db.update(users).set(set).where(eq(users.id, userId)).returning();
    // Turning the setting ON retroactively archives chats already muted —
    // otherwise the toggle would silently do nothing until the user
    // re-muted each chat by hand.
    if (updated && patch.keepMutedChatsArchived === true) {
      await db.update(conversationParticipants)
        .set({ isArchived: true })
        .where(and(
          eq(conversationParticipants.userId, userId),
          eq(conversationParticipants.isMuted, true)
        ));
    }
    return updated || undefined;
  }

  async setConversationTimer(conversationId: string, userId: string, seconds: number): Promise<boolean> {
    const isParticipant = await this.isConversationParticipant(conversationId, userId);
    if (!isParticipant) return false;
    if (seconds < 0) return false;
    await db.update(conversations).set({ disappearingTimer: seconds }).where(eq(conversations.id, conversationId));
    return true;
  }

  async pinMessage(conversationId: string, messageId: string, userId: string): Promise<boolean> {
    const isParticipant = await this.isConversationParticipant(conversationId, userId);
    if (!isParticipant) return false;
    const msg = await this.getMessage(messageId);
    if (!msg || msg.conversationId !== conversationId) return false;
    if (msg.deletedForEveryone) return false;
    if (msg.expiresAt && msg.expiresAt.getTime() <= Date.now()) return false;
    await db.update(conversations).set({ pinnedMessageId: messageId }).where(eq(conversations.id, conversationId));
    return true;
  }

  async unpinMessage(conversationId: string, userId: string): Promise<boolean> {
    const isParticipant = await this.isConversationParticipant(conversationId, userId);
    if (!isParticipant) return false;
    await db.update(conversations).set({ pinnedMessageId: null }).where(eq(conversations.id, conversationId));
    return true;
  }

  async saveMessage(userId: string, messageId: string): Promise<boolean> {
    const msg = await this.getMessage(messageId);
    if (!msg) return false;
    const isParticipant = await this.isConversationParticipant(msg.conversationId, userId);
    if (!isParticipant) return false;
    const [existing] = await db.select().from(messageSaves)
      .where(and(eq(messageSaves.userId, userId), eq(messageSaves.messageId, messageId)));
    if (existing) return true;
    await db.insert(messageSaves).values({ userId, messageId });
    return true;
  }

  async unsaveMessage(userId: string, messageId: string): Promise<boolean> {
    await db.delete(messageSaves)
      .where(and(eq(messageSaves.userId, userId), eq(messageSaves.messageId, messageId)));
    return true;
  }

  async getSavedMessageIds(userId: string, conversationId: string): Promise<string[]> {
    const isParticipant = await this.isConversationParticipant(conversationId, userId);
    if (!isParticipant) return [];
    const rows = await db.select({ messageId: messageSaves.messageId })
      .from(messageSaves)
      .innerJoin(messages, eq(messages.id, messageSaves.messageId))
      .where(and(eq(messageSaves.userId, userId), eq(messages.conversationId, conversationId)));
    return rows.map(r => r.messageId);
  }

  async deleteMessageForMe(messageId: string, userId: string): Promise<boolean> {
    const msg = await this.getMessage(messageId);
    if (!msg) return false;
    const isParticipant = await this.isConversationParticipant(msg.conversationId, userId);
    if (!isParticipant) return false;
    const current = (msg.deletedForUserIds as string[] | null) ?? [];
    if (current.includes(userId)) return true;
    const next = [...current, userId];
    await db.update(messages).set({ deletedForUserIds: next }).where(eq(messages.id, messageId));
    return true;
  }

  async deleteMessageForEveryone(
    messageId: string,
    userId: string,
  ): Promise<{ message: Message } | { error: 'not_found' | 'not_sender' | 'expired' }> {
    const msg = await this.getMessage(messageId);
    if (!msg) return { error: 'not_found' };
    if (msg.senderId !== userId) return { error: 'not_sender' }; // only sender can delete-for-everyone
    // Allow within sensible window: 1 hour
    const created = msg.createdAt ? new Date(msg.createdAt).getTime() : 0;
    if (Date.now() - created > 60 * 60 * 1000) return { error: 'expired' };
    const [updated] = await db.update(messages)
      .set({
        deletedForEveryone: true,
        content: null,
        mediaUrl: null,
        mediaType: null,
        e2eeInitEnvelope: null,
        replyToPreview: null,
      })
      .where(eq(messages.id, messageId))
      .returning();
    // If this message was pinned, unpin it.
    await db.update(conversations)
      .set({ pinnedMessageId: null })
      .where(and(eq(conversations.id, msg.conversationId), eq(conversations.pinnedMessageId, messageId)));
    return { message: updated };
  }

  async forwardMessage(
    originalMessageId: string,
    targetConversationId: string,
    senderId: string,
    receiverId: string | null,
  ): Promise<Message | null> {
    const original = await this.getMessage(originalMessageId);
    if (!original) return null;
    if (original.deletedForEveryone) return null;
    // The forwarder must be able to see the original.
    const canSeeOriginal = await this.isConversationParticipant(original.conversationId, senderId);
    if (!canSeeOriginal) return null;
    // The forwarder must be in the target conversation.
    const canSendInTarget = await this.isConversationParticipant(targetConversationId, senderId);
    if (!canSendInTarget) return null;

    return await this.createMessage(
      {
        conversationId: targetConversationId,
        senderId,
        receiverId: receiverId ?? null,
        content: original.content ?? null,
        mediaUrl: original.mediaUrl ?? null,
        mediaType: original.mediaType ?? null,
      } as InsertMessage,
      {
        encryptionVersion: original.encryptionVersion ?? "v2-signal",
        e2eeInitEnvelope: null, // forwarded messages re-establish E2EE on the target session
        forwarded: true,
        forwardedFromUserId: original.senderId,
      },
    );
  }

  async sweepExpiredMessages(): Promise<Array<{ id: string; conversationId: string }>> {
    const now = new Date();
    const expired = await db.select({ id: messages.id, conversationId: messages.conversationId })
      .from(messages)
      .where(and(
        sql`${messages.expiresAt} IS NOT NULL`,
        lt(messages.expiresAt, now),
        eq(messages.deletedForEveryone, false),
      ))
      .limit(500);
    if (expired.length === 0) return [];
    const ids = expired.map((e) => e.id);
    // Hard-delete expired ciphertext (no plaintext was ever stored).
    await db.delete(messages).where(inArray(messages.id, ids));
    // Unpin if needed
    for (const e of expired) {
      await db.update(conversations)
        .set({ pinnedMessageId: null })
        .where(and(eq(conversations.id, e.conversationId), eq(conversations.pinnedMessageId, e.id)));
    }
    return expired;
  }

  // Bulk-mark all unread messages in a conversation as read for the given user.
  // Returns the rows that were actually updated so callers can broadcast a socket event.
  async markMessagesRead(
    conversationId: string,
    userId: string,
  ): Promise<Array<{ id: string; senderId: string; readAt: Date }>> {
    // Message-request flow: same reasoning as markMessageRead.
    if (await this.getPendingRequestForRecipient(conversationId, userId)) return [];

    const now = new Date();
    const updated = await db.update(messages)
      .set({ status: "read", readAt: now, readBy: userId, deliveredAt: sql`COALESCE(${messages.deliveredAt}, ${now})` })
      .where(and(
        eq(messages.conversationId, conversationId),
        eq(messages.receiverId, userId),
        ne(messages.status, "read"),
      ))
      .returning({ id: messages.id, senderId: messages.senderId, readAt: messages.readAt });

    await db.update(conversationParticipants)
      .set({ unreadCount: 0 })
      .where(and(
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.userId, userId)
      ));

    return updated.map((r) => ({ id: r.id, senderId: r.senderId, readAt: r.readAt ?? now }));
  }

  async getCalls(userId: string): Promise<Call[]> {
    return db.select()
      .from(calls)
      .where(
        or(
          and(eq(calls.callerId, userId), eq(calls.hiddenForCaller, false)),
          and(eq(calls.receiverId, userId), eq(calls.hiddenForReceiver, false))
        )
      )
      .orderBy(desc(calls.createdAt))
      .limit(50);
  }

  async getCall(id: string): Promise<Call | undefined> {
    const [call] = await db.select().from(calls).where(eq(calls.id, id));
    return call || undefined;
  }

  async createCall(
    callerId: string,
    receiverId: string,
    type: string,
    opts?: { sealedCall?: boolean; outerCallerVirtualNumberId?: string | null },
  ): Promise<Call> {
    const [call] = await db.insert(calls).values({
      callerId,
      receiverId,
      type,
      status: "pending",
      sealedCall: opts?.sealedCall ?? false,
      outerCallerVirtualNumberId: opts?.outerCallerVirtualNumberId ?? null,
    }).returning();
    return call;
  }

  async deleteCall(id: string, userId: string): Promise<boolean> {
    const [call] = await db.select().from(calls).where(eq(calls.id, id));
    if (!call) return false;
    if (call.callerId !== userId && call.receiverId !== userId) return false;
    if (call.callerId === userId) {
      await db.update(calls).set({ hiddenForCaller: true }).where(eq(calls.id, id));
    } else {
      await db.update(calls).set({ hiddenForReceiver: true }).where(eq(calls.id, id));
    }
    return true;
  }

  async clearCallHistory(userId: string): Promise<void> {
    await db.update(calls)
      .set({ hiddenForCaller: true })
      .where(eq(calls.callerId, userId));
    await db.update(calls)
      .set({ hiddenForReceiver: true })
      .where(eq(calls.receiverId, userId));
  }

  async updateCall(id: string, data: Partial<Call>): Promise<Call | undefined> {
    const [call] = await db.update(calls).set(data).where(eq(calls.id, id)).returning();
    return call || undefined;
  }

  async getHiddenLockerItems(userId: string): Promise<HiddenLockerItem[]> {
    return db.select()
      .from(hiddenLockerItems)
      .where(eq(hiddenLockerItems.userId, userId))
      .orderBy(desc(hiddenLockerItems.createdAt));
  }

  async addToLocker(userId: string, data: Partial<HiddenLockerItem>): Promise<HiddenLockerItem> {
    // v2-only path.  Plaintext writes are forbidden as of Locker Phase 1 —
    // every new item must be encrypted client-side before it reaches the
    // server.  Defense in depth: even if a caller forgets to validate, we
    // refuse the write here.
    if (!data.ciphertext || !data.nonce) {
      throw new Error("Locker writes require ciphertext + nonce (v2)");
    }
    const [item] = await db.insert(hiddenLockerItems).values({
      userId,
      type: data.type || "message",
      content: null,
      mediaUrl: null,
      messageId: data.messageId ?? null,
      ciphertext: data.ciphertext,
      nonce: data.nonce,
      encryptedV2: true,
    }).returning();
    return item;
  }

  async migrateLockerItemToV2(
    itemId: string,
    userId: string,
    ciphertext: string,
    nonce: string,
  ): Promise<HiddenLockerItem | undefined> {
    // Atomic upgrade: write ciphertext, null the plaintext columns.  Server
    // never sees the key — client did the encryption.
    const [item] = await db.update(hiddenLockerItems)
      .set({
        ciphertext,
        nonce,
        encryptedV2: true,
        content: null,
        mediaUrl: null,
      })
      .where(and(
        eq(hiddenLockerItems.id, itemId),
        eq(hiddenLockerItems.userId, userId),
      ))
      .returning();
    return item;
  }

  async removeFromLocker(id: string, userId: string): Promise<void> {
    await db.delete(hiddenLockerItems)
      .where(and(eq(hiddenLockerItems.id, id), eq(hiddenLockerItems.userId, userId)));
  }

  async setLockerPin(userId: string, pin: string, salt: string): Promise<void> {
    await db.update(users)
      .set({ lockerPin: pin, lockerSalt: salt, lockerFailedAttempts: 0, lockerLockedUntil: null })
      .where(eq(users.id, userId));
  }

  async getLockerSalt(userId: string): Promise<string | null> {
    const [user] = await db.select({ s: users.lockerSalt }).from(users).where(eq(users.id, userId));
    return user?.s ?? null;
  }

  async bumpLockerFailedAttempts(userId: string): Promise<{ attempts: number; lockedUntil: Date | null }> {
    const [user] = await db.select({
      a: users.lockerFailedAttempts,
    }).from(users).where(eq(users.id, userId));
    const attempts = (user?.a ?? 0) + 1;
    // Ladder:  5 → 1min,  10 → 15min,  15 → 1hr,  20 → wipe (handled by caller)
    let lockedUntil: Date | null = null;
    if (attempts >= 15) lockedUntil = new Date(Date.now() + 60 * 60_000);
    else if (attempts >= 10) lockedUntil = new Date(Date.now() + 15 * 60_000);
    else if (attempts >= 5) lockedUntil = new Date(Date.now() + 60_000);
    await db.update(users)
      .set({ lockerFailedAttempts: attempts, lockerLockedUntil: lockedUntil })
      .where(eq(users.id, userId));
    return { attempts, lockedUntil };
  }

  async resetLockerFailedAttempts(userId: string): Promise<void> {
    await db.update(users)
      .set({ lockerFailedAttempts: 0, lockerLockedUntil: null })
      .where(eq(users.id, userId));
  }

  async getLockerLockoutState(userId: string): Promise<{ attempts: number; lockedUntil: Date | null }> {
    const [user] = await db.select({
      a: users.lockerFailedAttempts,
      u: users.lockerLockedUntil,
    }).from(users).where(eq(users.id, userId));
    return { attempts: user?.a ?? 0, lockedUntil: user?.u ?? null };
  }

  async resetLocker(userId: string): Promise<void> {
    await db.delete(hiddenLockerItems).where(eq(hiddenLockerItems.userId, userId));
    await db.update(users)
      .set({ lockerPin: null, lockerSalt: null, lockerFailedAttempts: 0, lockerLockedUntil: null })
      .where(eq(users.id, userId));
  }

  // ─── Locked Chats (build 133) ────────────────────────────────────────────
  // A separate PIN from Hidden Locker's — gates visibility of individually
  // locked conversations rather than a re-encrypted vault, so the lockout
  // ladder here is non-destructive (no wipe tier).
  async setChatLockPin(userId: string, pinHash: string): Promise<void> {
    await db.update(users)
      .set({ chatLockPinHash: pinHash, chatLockFailedAttempts: 0, chatLockLockedUntil: null })
      .where(eq(users.id, userId));
  }

  async bumpChatLockFailedAttempts(userId: string): Promise<{ attempts: number; lockedUntil: Date | null }> {
    const [user] = await db.select({
      a: users.chatLockFailedAttempts,
    }).from(users).where(eq(users.id, userId));
    const attempts = (user?.a ?? 0) + 1;
    // Ladder: 5 → 30s, 10 → 5min, 15 → 30min, 20+ → 24h (capped, non-destructive).
    let lockedUntil: Date | null = null;
    if (attempts >= 20) lockedUntil = new Date(Date.now() + 24 * 60 * 60_000);
    else if (attempts >= 15) lockedUntil = new Date(Date.now() + 30 * 60_000);
    else if (attempts >= 10) lockedUntil = new Date(Date.now() + 5 * 60_000);
    else if (attempts >= 5) lockedUntil = new Date(Date.now() + 30_000);
    await db.update(users)
      .set({ chatLockFailedAttempts: attempts, chatLockLockedUntil: lockedUntil })
      .where(eq(users.id, userId));
    return { attempts, lockedUntil };
  }

  async resetChatLockFailedAttempts(userId: string): Promise<void> {
    await db.update(users)
      .set({ chatLockFailedAttempts: 0, chatLockLockedUntil: null })
      .where(eq(users.id, userId));
  }

  async getChatLockLockoutState(userId: string): Promise<{ attempts: number; lockedUntil: Date | null }> {
    const [user] = await db.select({
      a: users.chatLockFailedAttempts,
      u: users.chatLockLockedUntil,
    }).from(users).where(eq(users.id, userId));
    return { attempts: user?.a ?? 0, lockedUntil: user?.u ?? null };
  }

  async lockConversation(conversationId: string, userId: string, locked: boolean): Promise<void> {
    await db.update(conversationParticipants)
      .set({ isLocked: locked })
      .where(and(
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.userId, userId)
      ));
  }

  async getAnnouncementStats(): Promise<{ activeUsers: number; totalUsers: number; recentMessage: string }> {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    
    const [totalResult] = await db.select({ count: sql<number>`count(*)` }).from(users);
    const [activeResult] = await db.select({ count: sql<number>`count(*)` })
      .from(users)
      .where(sql`${users.lastSeen} > ${fiveMinutesAgo}`);
    
    const messages = [
      "Secure messaging for everyone",
      "Join thousands of secure users",
      "Your privacy matters to us",
      "End-to-end encrypted by default",
    ];
    
    const randomMessage = messages[Math.floor(Math.random() * messages.length)];
    
    return {
      activeUsers: Number(activeResult?.count || 0),
      totalUsers: Number(totalResult?.count || 0),
      recentMessage: randomMessage,
    };
  }

  async addPendingContact(addedByUserId: string, phoneNumber: string): Promise<PendingContact> {
    const [existing] = await db.select()
      .from(pendingContacts)
      .where(and(
        eq(pendingContacts.addedByUserId, addedByUserId),
        eq(pendingContacts.pendingPhoneNumber, phoneNumber)
      ));
    
    if (existing) {
      return existing;
    }
    
    const [contact] = await db.insert(pendingContacts).values({
      addedByUserId,
      pendingPhoneNumber: phoneNumber,
    }).returning();
    return contact;
  }

  async getPendingContactsForPhone(phoneNumber: string): Promise<PendingContact[]> {
    return db.select()
      .from(pendingContacts)
      .where(and(
        eq(pendingContacts.pendingPhoneNumber, phoneNumber),
        eq(pendingContacts.notified, false)
      ));
  }

  async markPendingContactsNotified(phoneNumber: string): Promise<void> {
    await db.update(pendingContacts)
      .set({ notified: true })
      .where(eq(pendingContacts.pendingPhoneNumber, phoneNumber));
  }

  async createJoinNotification(userId: string, newUserPhone: string, newUserName?: string): Promise<JoinNotification> {
    const [notification] = await db.insert(joinNotifications).values({
      userId,
      newUserPhoneNumber: newUserPhone,
      newUserName: newUserName || null,
    }).returning();
    return notification;
  }

  async getJoinNotifications(userId: string): Promise<JoinNotification[]> {
    return db.select()
      .from(joinNotifications)
      .where(eq(joinNotifications.userId, userId))
      .orderBy(desc(joinNotifications.createdAt));
  }

  async markJoinNotificationRead(id: string): Promise<void> {
    await db.update(joinNotifications)
      .set({ isRead: true })
      .where(eq(joinNotifications.id, id));
  }

  async processNewUserJoined(newUserPhone: string, newUserName?: string): Promise<void> {
    const pendingContacts = await this.getPendingContactsForPhone(newUserPhone);
    
    for (const contact of pendingContacts) {
      await this.createJoinNotification(contact.addedByUserId, newUserPhone, newUserName);
      
      const newUser = await this.getUserByPhone(newUserPhone);
      if (newUser) {
        await this.getOrCreateConversation(contact.addedByUserId, newUser.id);
      }
    }
    
    await this.markPendingContactsNotified(newUserPhone);
  }

  async getMessageRequests(userId: string): Promise<any[]> {
    const requests = await db.select()
      .from(messageRequests)
      .where(and(
        eq(messageRequests.receiverId, userId),
        eq(messageRequests.status, "pending")
      ))
      .orderBy(desc(messageRequests.createdAt));
    
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
          conversationId: req.conversationId,
        };
      })
    );
    
    return requestsWithSenders;
  }

  async getPendingMessageRequestCount(userId: string): Promise<number> {
    const [result] = await db.select({ count: sql<number>`count(*)` })
      .from(messageRequests)
      .where(and(
        eq(messageRequests.receiverId, userId),
        eq(messageRequests.status, "pending")
      ));
    return Number(result?.count || 0);
  }

  // messagePreview is intentionally never populated with real message text —
  // this app's messages are Signal-Protocol E2EE end to end, and a plaintext
  // preview column would leak content to the server. The linked
  // conversationId is what lets the recipient actually preview the
  // (encrypted, client-decrypted) conversation before deciding.
  async createMessageRequest(senderId: string, receiverId: string, messagePreview?: string, conversationId?: string): Promise<MessageRequest> {
    const [existing] = await db.select()
      .from(messageRequests)
      .where(and(
        eq(messageRequests.senderId, senderId),
        eq(messageRequests.receiverId, receiverId),
        eq(messageRequests.status, "pending")
      ));

    if (existing) {
      return existing;
    }

    const [request] = await db.insert(messageRequests).values({
      senderId,
      receiverId,
      messagePreview,
      conversationId,
    }).returning();
    return request;
  }

  async acceptMessageRequest(requestId: string, userId: string): Promise<{ conversationId: string } | null> {
    const [request] = await db.select()
      .from(messageRequests)
      .where(and(
        eq(messageRequests.id, requestId),
        eq(messageRequests.receiverId, userId)
      ));

    if (!request) return null;

    await db.update(messageRequests)
      .set({ status: "accepted" })
      .where(eq(messageRequests.id, requestId));

    const conversation = request.conversationId
      ? (await this.getConversationById(request.conversationId)) ?? await this.getOrCreateConversation(userId, request.senderId)
      : await this.getOrCreateConversation(userId, request.senderId);

    return { conversationId: conversation.id };
  }

  async declineMessageRequest(requestId: string, userId: string): Promise<void> {
    const [request] = await db.select()
      .from(messageRequests)
      .where(and(
        eq(messageRequests.id, requestId),
        eq(messageRequests.receiverId, userId)
      ));
    if (!request) return;

    await db.update(messageRequests)
      .set({ status: "declined" })
      .where(eq(messageRequests.id, requestId));

    // Archive (rather than delete) the conversation for the decliner only —
    // it disappears from their main chat list but the sender's copy and
    // messages are untouched, and it's still reachable via Archived if the
    // decliner changes their mind.
    if (request.conversationId) {
      await db.update(conversationParticipants)
        .set({ isArchived: true })
        .where(and(
          eq(conversationParticipants.conversationId, request.conversationId),
          eq(conversationParticipants.userId, userId),
        ));
    }
  }

  // Is there a still-pending request where `receiverUserId` must accept
  // before replying / before the sender sees read receipts, for this
  // conversation? Returns the request id if so, so callers can act on it
  // (accept/decline UI) without a second lookup.
  async getPendingRequestForRecipient(conversationId: string, receiverUserId: string): Promise<string | null> {
    const [request] = await db.select({ id: messageRequests.id })
      .from(messageRequests)
      .where(and(
        eq(messageRequests.conversationId, conversationId),
        eq(messageRequests.receiverId, receiverUserId),
        eq(messageRequests.status, "pending"),
      ));
    return request?.id ?? null;
  }

  async findUsersByPhoneNumbers(phoneNumbers: string[], excludeUserId: string): Promise<User[]> {
    if (phoneNumbers.length === 0) return [];
    
    const normalizedNumbers = phoneNumbers.map(p => {
      const digits = p.replace(/\D/g, '');
      return digits.length > 10 ? digits.slice(-10) : digits;
    }).filter(p => p.length >= 10);
    
    if (normalizedNumbers.length === 0) return [];
    
    // Exclude tombstoned (account-deleted) rows so contact discovery
    // never surfaces a "Deleted user" placeholder in another user's
    // address book sync (build 62).
    const foundUsers = await db.select()
      .from(users)
      .where(and(
        ne(users.id, excludeUserId),
        or(isNull(users.isDeletedPlaceholder), eq(users.isDeletedPlaceholder, false)),
      ));

    return foundUsers.filter(user => {
      const userDigits = user.phoneNumber.replace(/\D/g, '');
      const userLast10 = userDigits.length > 10 ? userDigits.slice(-10) : userDigits;
      return normalizedNumbers.some(n => n === userLast10 || userDigits.endsWith(n) || n.endsWith(userDigits));
    });
  }

  async listAllUsers(): Promise<Pick<User, 'id' | 'phoneNumber' | 'displayName' | 'createdAt' | 'isSuspended' | 'suspensionReason' | 'pushToken' | 'notificationsEnabled'>[]> {
    const allUsers = await db.select({
      id: users.id,
      phoneNumber: users.phoneNumber,
      displayName: users.displayName,
      createdAt: users.createdAt,
      isSuspended: users.isSuspended,
      suspensionReason: users.suspensionReason,
      pushToken: users.pushToken,
      notificationsEnabled: users.notificationsEnabled,
    })
      .from(users)
      .orderBy(desc(users.createdAt));
    return allUsers;
  }

  // Status methods
  async updateStoryPrivacy(userId: string, patch: { storiesEnabled?: boolean; storyPrivacyMode?: string; storyPrivacyExceptIds?: string[]; storyPrivacyOnlyIds?: string[]; storyViewReceiptsEnabled?: boolean }): Promise<User | undefined> {
    const set: any = {};
    if (typeof patch.storiesEnabled === 'boolean') set.storiesEnabled = patch.storiesEnabled;
    if (typeof patch.storyPrivacyMode === 'string') set.storyPrivacyMode = patch.storyPrivacyMode;
    if (Array.isArray(patch.storyPrivacyExceptIds)) set.storyPrivacyExceptIds = patch.storyPrivacyExceptIds;
    if (Array.isArray(patch.storyPrivacyOnlyIds)) set.storyPrivacyOnlyIds = patch.storyPrivacyOnlyIds;
    if (typeof patch.storyViewReceiptsEnabled === 'boolean') set.storyViewReceiptsEnabled = patch.storyViewReceiptsEnabled;
    if (Object.keys(set).length === 0) {
      const [u] = await db.select().from(users).where(eq(users.id, userId));
      return u;
    }
    const [updated] = await db.update(users).set(set).where(eq(users.id, userId)).returning();
    return updated;
  }

  async createStatus(userId: string, data: {
    mediaUrl?: string; mediaType?: string; caption?: string; privacy: string; customViewers?: string[];
    isEncrypted?: boolean;
    encryptedCaption?: string | null;
    captionNonce?: string | null;
    mediaKeyWraps?: Record<string, { wrappedKey: string; nonce: string }>;
    trimStartMs?: number | null;
    trimEndMs?: number | null;
  }): Promise<Status> {
    const [me] = await db.select().from(users).where(eq(users.id, userId));
    if (me && me.storiesEnabled === false) {
      throw new Error('STORIES_DISABLED');
    }
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    // Trim window only makes sense for videos, and only when both bounds
    // are sane non-negative millisecond offsets with end after start —
    // anything else is silently ignored rather than stored as a nonsense
    // window that could hide a whole video behind a bad player state.
    const hasValidTrim =
      data.mediaType === 'video' &&
      typeof data.trimStartMs === 'number' && Number.isFinite(data.trimStartMs) && data.trimStartMs >= 0 &&
      typeof data.trimEndMs === 'number' && Number.isFinite(data.trimEndMs) && data.trimEndMs > data.trimStartMs;
    const [status] = await db.insert(statuses).values({
      userId,
      mediaUrl: data.mediaUrl,
      mediaType: data.mediaType,
      // Encrypted rows never get a plaintext caption column.
      caption: data.isEncrypted ? null : data.caption,
      isEncrypted: data.isEncrypted ?? false,
      encryptedCaption: data.isEncrypted ? (data.encryptedCaption ?? null) : null,
      captionNonce: data.isEncrypted ? (data.captionNonce ?? null) : null,
      mediaKeyWraps: data.isEncrypted ? (data.mediaKeyWraps ?? {}) : null,
      privacy: data.privacy,
      expiresAt,
      trimStartMs: hasValidTrim ? Math.round(data.trimStartMs!) : null,
      trimEndMs: hasValidTrim ? Math.round(data.trimEndMs!) : null,
    }).returning();
    
    if (data.privacy === "custom" && data.customViewers?.length) {
      await Promise.all(data.customViewers.map(viewerId =>
        db.insert(statusAllowedViewers).values({ statusId: status.id, userId: viewerId })
      ));
    }
    
    return status;
  }

  // ---------- Story visibility helpers (shared by feed, view-record, and viewers list) ----------
  private async _getStoryViewerContext(viewerId: string): Promise<{
    viewer: User | undefined;
    mutualFriendIds: Set<string>;
    blockedSet: Set<string>;
  }> {
    const [viewer] = await db.select().from(users).where(eq(users.id, viewerId));

    // Mutual friends only: row in BOTH directions.
    const out = await db.select().from(friends).where(eq(friends.userId, viewerId));
    const inn = await db.select().from(friends).where(eq(friends.friendId, viewerId));
    const outSet = new Set(out.map(f => f.friendId));
    const inSet = new Set(inn.map(f => f.userId));
    const mutualFriendIds = new Set<string>(Array.from(outSet).filter(id => inSet.has(id)));

    const blocksOut = await db.select().from(userBlocks).where(eq(userBlocks.blockerId, viewerId));
    const blocksIn = await db.select().from(userBlocks).where(eq(userBlocks.blockedId, viewerId));
    const blockedSet = new Set<string>([
      ...blocksOut.map(b => b.blockedId),
      ...blocksIn.map(b => b.blockerId),
    ]);

    return { viewer, mutualFriendIds, blockedSet };
  }

  private _canViewerSeeStatusSync(
    viewerId: string,
    status: Status,
    poster: User | undefined,
    ctx: { viewer: User | undefined; mutualFriendIds: Set<string>; blockedSet: Set<string> },
  ): boolean {
    if (!ctx.viewer || ctx.viewer.storiesEnabled === false) return false;
    if (!poster) return false;
    if (poster.storiesEnabled === false) return false;
    if (status.userId === viewerId) return false;
    if (status.expiresAt && status.expiresAt <= new Date()) return false;
    if (ctx.blockedSet.has(status.userId)) return false;

    const mode = poster.storyPrivacyMode || 'everyone';
    const exceptIds: string[] = Array.isArray(poster.storyPrivacyExceptIds) ? poster.storyPrivacyExceptIds : [];
    const onlyIds: string[] = Array.isArray(poster.storyPrivacyOnlyIds) ? poster.storyPrivacyOnlyIds : [];

    let allowed = false;
    if (mode === 'everyone') {
      allowed = true;
    } else if (mode === 'contacts') {
      allowed = ctx.mutualFriendIds.has(status.userId);
    } else if (mode === 'except') {
      allowed = ctx.mutualFriendIds.has(status.userId) && !exceptIds.includes(viewerId);
    } else if (mode === 'only') {
      allowed = onlyIds.includes(viewerId);
    }
    if (!allowed) return false;

    // Legacy per-status overrides — keep older statuses behaving as their author intended.
    if (status.privacy === 'friends' && !ctx.mutualFriendIds.has(status.userId)) return false;
    // 'custom' (legacy) is checked separately by the caller via statusAllowedViewers.
    return true;
  }

  async getStatuses(viewerId: string): Promise<any[]> {
    const ctx = await this._getStoryViewerContext(viewerId);
    if (!ctx.viewer || ctx.viewer.storiesEnabled === false) return [];

    const now = new Date();
    const allStatuses = await db.select()
      .from(statuses)
      .where(sql`${statuses.expiresAt} > ${now}`)
      .orderBy(desc(statuses.createdAt));

    // Filter out posters this viewer has muted from their status feed. Mute
    // is one-way and feed-only — the muted user can still message + call,
    // and their own feed is unaffected.
    const muteRows = await db.select({ mutedUserId: statusMutes.mutedUserId })
      .from(statusMutes)
      .where(eq(statusMutes.muterId, viewerId));
    const mutedSet = new Set(muteRows.map(r => r.mutedUserId));

    const posterIds = Array.from(new Set(allStatuses.map(s => s.userId).filter(id => id !== viewerId && !mutedSet.has(id))));
    const posterRows = posterIds.length
      ? await db.select().from(users).where(inArray(users.id, posterIds))
      : [];
    const posterMap = new Map(posterRows.map(u => [u.id, u]));

    const result: any[] = [];
    for (const status of allStatuses) {
      if (mutedSet.has(status.userId)) continue;
      const poster = posterMap.get(status.userId);
      if (!this._canViewerSeeStatusSync(viewerId, status, poster, ctx)) continue;

      // Legacy 'custom' allow-list check (only for old statuses created via the legacy modal).
      if (status.privacy === 'custom') {
        const [row] = await db.select().from(statusAllowedViewers).where(and(
          eq(statusAllowedViewers.statusId, status.id),
          eq(statusAllowedViewers.userId, viewerId),
        ));
        if (!row) continue;
      }

      // E2EE: hand back only this viewer's own slice of mediaKeyWraps, never
      // the whole map (every other eligible viewer's wrapped key too —
      // unreadable to this caller, but no reason to ship it). A viewer who
      // passed the visibility gate above but has no wrap yet (e.g. added
      // to a privacy list after the story was posted, or wasn't part of
      // the poster's eligible set at post time) simply gets no key and
      // the client shows it as undecryptable rather than omitting the row.
      const { mediaKeyWraps, ...statusFields } = status as any;
      const myWrap = status.isEncrypted ? (mediaKeyWraps as Record<string, any> | null)?.[viewerId] ?? null : null;

      result.push({
        ...statusFields,
        mediaKeyWrap: myWrap,
        user: { id: poster!.id, displayName: poster!.displayName, avatarUrl: poster!.avatarUrl },
      });
    }
    return result;
  }

  async getMyStatuses(userId: string): Promise<any[]> {
    const now = new Date();
    const myStatuses = await db.select()
      .from(statuses)
      .where(and(eq(statuses.userId, userId), sql`${statuses.expiresAt} > ${now}`))
      .orderBy(desc(statuses.createdAt));
    
    return Promise.all(myStatuses.map(async (status) => {
      const views = await db.select().from(statusViews).where(eq(statusViews.statusId, status.id));
      // Same shape as getStatuses: expose only my own slice (I'm always
      // eligible for my own story) rather than every viewer's wrapped key.
      const { mediaKeyWraps, ...statusFields } = status as any;
      const myWrap = status.isEncrypted ? (mediaKeyWraps as Record<string, any> | null)?.[userId] ?? null : null;
      return { ...statusFields, mediaKeyWrap: myWrap, viewCount: views.length };
    }));
  }

  async viewStatus(
    statusId: string,
    viewerId: string,
    metrics?: { watchDurationMs?: number; completed?: boolean },
  ): Promise<void> {
    const [status] = await db.select().from(statuses).where(eq(statuses.id, statusId));
    if (!status) throw new Error('STATUS_NOT_FOUND');
    if (status.userId === viewerId) return;

    const [owner] = await db.select().from(users).where(eq(users.id, status.userId));
    const ctx = await this._getStoryViewerContext(viewerId);
    if (!this._canViewerSeeStatusSync(viewerId, status, owner, ctx)) return;

    // Legacy custom allow-list
    if (status.privacy === 'custom') {
      const [row] = await db.select().from(statusAllowedViewers).where(and(
        eq(statusAllowedViewers.statusId, status.id),
        eq(statusAllowedViewers.userId, viewerId),
      ));
      if (!row) return;
    }

    // Reciprocal view-receipts: only record when BOTH sides currently have receipts on.
    if (!ctx.viewer || ctx.viewer.storyViewReceiptsEnabled === false) return;
    if (!owner || owner.storyViewReceiptsEnabled === false) return;

    // Clamp incoming watch duration to a sane range (0 .. 10 minutes) so a
    // misbehaving / malicious client can't poison aggregates.
    const incomingMs = Math.max(0, Math.min(10 * 60_000, Math.round(metrics?.watchDurationMs ?? 0)));
    const incomingDone = metrics?.completed === true;

    const [existing] = await db.select()
      .from(statusViews)
      .where(and(eq(statusViews.statusId, statusId), eq(statusViews.viewerId, viewerId)));
    if (!existing) {
      await db.insert(statusViews).values({
        statusId,
        viewerId,
        watchDurationMs: incomingMs,
        completed: incomingDone,
      });
    } else if (incomingMs > 0 || incomingDone) {
      // Accumulate: a viewer who re-opens a story should add to total watch
      // time. `completed` is sticky-true.
      await db.update(statusViews)
        .set({
          watchDurationMs: (existing.watchDurationMs ?? 0) + incomingMs,
          completed: existing.completed || incomingDone,
          updatedAt: new Date(),
        })
        .where(eq(statusViews.id, existing.id));
    }
  }

  async getStatusAnalytics(statusId: string, ownerId: string): Promise<{
    totalViews: number;
    completedViews: number;
    completionRate: number;
    avgWatchMs: number;
    totalWatchMs: number;
  } | null> {
    const [status] = await db.select().from(statuses).where(eq(statuses.id, statusId));
    if (!status || status.userId !== ownerId) return null;
    if (status.expiresAt && status.expiresAt <= new Date()) {
      return { totalViews: 0, completedViews: 0, completionRate: 0, avgWatchMs: 0, totalWatchMs: 0 };
    }
    const views = await db.select().from(statusViews).where(eq(statusViews.statusId, statusId));
    const totalViews = views.length;
    if (totalViews === 0) {
      return { totalViews: 0, completedViews: 0, completionRate: 0, avgWatchMs: 0, totalWatchMs: 0 };
    }
    const completedViews = views.filter(v => v.completed).length;
    const totalWatchMs = views.reduce((sum, v) => sum + (v.watchDurationMs ?? 0), 0);
    return {
      totalViews,
      completedViews,
      completionRate: Math.round((completedViews / totalViews) * 100),
      avgWatchMs: Math.round(totalWatchMs / totalViews),
      totalWatchMs,
    };
  }

  async deleteStatus(statusId: string, userId: string): Promise<void> {
    const [status] = await db.select().from(statuses).where(eq(statuses.id, statusId));
    if (!status) throw new Error('STATUS_NOT_FOUND');
    if (status.userId !== userId) throw new Error('NOT_AUTHORIZED');
    await db.delete(statuses).where(eq(statuses.id, statusId));
  }

  // Friends methods — request-then-accept model. A row is created by the
  // requester with status='pending'; the recipient accepting flips it to
  // 'accepted'. Friendship is mutual once accepted, so getFriends/removeFriend
  // look in both directions regardless of who originally sent the request.
  async getFriends(userId: string): Promise<any[]> {
    const rows = await db.select().from(friends).where(and(
      or(eq(friends.userId, userId), eq(friends.friendId, userId)),
      eq(friends.status, 'accepted'),
    ));

    return Promise.all(rows.map(async (f) => {
      const otherId = f.userId === userId ? f.friendId : f.userId;
      const [friend] = await db.select().from(users).where(eq(users.id, otherId));
      return { id: friend?.id, displayName: friend?.displayName, avatarUrl: friend?.avatarUrl };
    }));
  }

  // Pending requests the given user has RECEIVED and can accept/decline.
  async getPendingFriendRequests(userId: string): Promise<any[]> {
    const rows = await db.select().from(friends).where(and(
      eq(friends.friendId, userId),
      eq(friends.status, 'pending'),
    ));

    return Promise.all(rows.map(async (f) => {
      const [sender] = await db.select().from(users).where(eq(users.id, f.userId));
      return {
        id: f.id,
        senderId: f.userId,
        displayName: sender?.displayName,
        avatarUrl: sender?.avatarUrl,
        createdAt: f.createdAt,
      };
    }));
  }

  // Relationship state between two specific users, for a chat's "Add Friend"
  // affordance to know what to show (Add / Request Sent / Accept / Friends).
  async getFriendshipStatus(
    userId: string,
    otherUserId: string,
  ): Promise<{ status: 'none' | 'friends' | 'request_sent' | 'request_received'; requestId?: string }> {
    const [outgoing] = await db.select().from(friends)
      .where(and(eq(friends.userId, userId), eq(friends.friendId, otherUserId)));
    if (outgoing) {
      return outgoing.status === 'accepted'
        ? { status: 'friends' }
        : { status: 'request_sent', requestId: outgoing.id };
    }
    const [incoming] = await db.select().from(friends)
      .where(and(eq(friends.userId, otherUserId), eq(friends.friendId, userId)));
    if (incoming) {
      return incoming.status === 'accepted'
        ? { status: 'friends' }
        : { status: 'request_received', requestId: incoming.id };
    }
    return { status: 'none' };
  }

  // Sending a request when the OTHER user already sent one to you auto
  // -accepts it (mutual match) rather than creating a redundant reverse row.
  async sendFriendRequest(userId: string, friendId: string): Promise<{ request: Friend; autoAccepted: boolean }> {
    if (userId === friendId) throw new Error('CANNOT_FRIEND_SELF');

    const [reverse] = await db.select().from(friends)
      .where(and(eq(friends.userId, friendId), eq(friends.friendId, userId)));
    if (reverse) {
      if (reverse.status === 'pending') {
        const [accepted] = await db.update(friends)
          .set({ status: 'accepted' })
          .where(eq(friends.id, reverse.id))
          .returning();
        return { request: accepted, autoAccepted: true };
      }
      return { request: reverse, autoAccepted: false };
    }

    const [existing] = await db.select().from(friends)
      .where(and(eq(friends.userId, userId), eq(friends.friendId, friendId)));
    if (existing) return { request: existing, autoAccepted: false };

    const [created] = await db.insert(friends)
      .values({ userId, friendId, status: 'pending' })
      .returning();
    return { request: created, autoAccepted: false };
  }

  async acceptFriendRequest(requestId: string, userId: string): Promise<Friend | undefined> {
    const [row] = await db.select().from(friends).where(eq(friends.id, requestId));
    if (!row || row.friendId !== userId || row.status !== 'pending') return undefined;
    const [updated] = await db.update(friends)
      .set({ status: 'accepted' })
      .where(eq(friends.id, requestId))
      .returning();
    return updated;
  }

  async declineFriendRequest(requestId: string, userId: string): Promise<void> {
    const [row] = await db.select().from(friends).where(eq(friends.id, requestId));
    if (!row || row.friendId !== userId) return;
    await db.delete(friends).where(eq(friends.id, requestId));
  }

  async removeFriend(userId: string, friendId: string): Promise<void> {
    await db.delete(friends).where(or(
      and(eq(friends.userId, userId), eq(friends.friendId, friendId)),
      and(eq(friends.userId, friendId), eq(friends.friendId, userId)),
    ));
  }

  // Location methods (VIP only)
  async getLocationShare(userId: string): Promise<LocationShare | undefined> {
    const [share] = await db.select().from(locationShares).where(eq(locationShares.userId, userId));
    return share;
  }

  async updateLocationShare(userId: string, data: { encryptedLocations?: Record<string, { ciphertext: string; nonce: string }>; isSharing?: boolean }): Promise<LocationShare> {
    const [existing] = await db.select().from(locationShares).where(eq(locationShares.userId, userId));
    
    if (existing) {
      const [updated] = await db.update(locationShares)
        .set({ ...data, lastUpdated: new Date() })
        .where(eq(locationShares.userId, userId))
        .returning();
      return updated;
    }
    
    const [created] = await db.insert(locationShares).values({
      userId,
      encryptedLocations: data.encryptedLocations ?? {},
      isSharing: data.isSharing ?? false,
    }).returning();
    return created;
  }

  async getLocationRequests(userId: string): Promise<any[]> {
    const requests = await db.select()
      .from(locationRequests)
      .where(eq(locationRequests.targetId, userId))
      .orderBy(desc(locationRequests.createdAt));
    
    return Promise.all(requests.map(async (r) => {
      const [requester] = await db.select().from(users).where(eq(users.id, r.requesterId));
      return { ...r, requester: { id: requester?.id, displayName: requester?.displayName, avatarUrl: requester?.avatarUrl } };
    }));
  }

  async createLocationRequest(requesterId: string, targetId: string): Promise<LocationRequest> {
    const [existing] = await db.select()
      .from(locationRequests)
      .where(and(
        eq(locationRequests.requesterId, requesterId),
        eq(locationRequests.targetId, targetId),
        eq(locationRequests.status, "pending")
      ));
    
    if (existing) return existing;
    
    const [request] = await db.insert(locationRequests).values({ requesterId, targetId }).returning();
    return request;
  }

  async respondToLocationRequest(requestId: string, userId: string, accept: boolean): Promise<void> {
    await db.update(locationRequests)
      .set({ status: accept ? "accepted" : "declined" })
      .where(and(eq(locationRequests.id, requestId), eq(locationRequests.targetId, userId)));
  }

  async getLocationRequestById(requestId: string): Promise<LocationRequest | undefined> {
    const [request] = await db.select().from(locationRequests).where(eq(locationRequests.id, requestId));
    return request;
  }

  async getApprovedFriendIds(userId: string): Promise<string[]> {
    const acceptedRequests = await db.select()
      .from(locationRequests)
      .where(and(eq(locationRequests.targetId, userId), eq(locationRequests.status, "accepted")));
    
    const acceptedByMe = await db.select()
      .from(locationRequests)
      .where(and(eq(locationRequests.requesterId, userId), eq(locationRequests.status, "accepted")));
    
    const friendIds = [...acceptedRequests.map(r => r.requesterId), ...acceptedByMe.map(r => r.targetId)];
    return [...new Set(friendIds)];
  }

  async getFriendLocations(userId: string): Promise<any[]> {
    const acceptedRequests = await db.select()
      .from(locationRequests)
      .where(and(eq(locationRequests.targetId, userId), eq(locationRequests.status, "accepted")));
    
    const acceptedByMe = await db.select()
      .from(locationRequests)
      .where(and(eq(locationRequests.requesterId, userId), eq(locationRequests.status, "accepted")));
    
    const friendIds = [...acceptedRequests.map(r => r.requesterId), ...acceptedByMe.map(r => r.targetId)];
    const uniqueFriendIds = [...new Set(friendIds)];
    
    if (uniqueFriendIds.length === 0) return [];

    const locations = await db.select()
      .from(locationShares)
      .where(and(
        inArray(locationShares.userId, uniqueFriendIds),
        eq(locationShares.isSharing, true)
      ));

    // E2EE: only ever hand back the requesting viewer's own slice of a
    // friend's per-viewer-sealed blobs — never the whole map (which holds
    // ciphertext for that friend's other viewers too, unreadable to this
    // caller but no reason to ship it). A friend who hasn't re-sent a
    // location tick since this viewer was approved simply has no slice
    // yet, so they're omitted rather than shown with stale/empty data.
    const withKey = locations
      .map((loc) => ({ loc, sealed: (loc.encryptedLocations as Record<string, { ciphertext: string; nonce: string }> | null)?.[userId] }))
      .filter((x): x is { loc: typeof x.loc; sealed: { ciphertext: string; nonce: string } } => !!x.sealed);

    return Promise.all(withKey.map(async ({ loc, sealed }) => {
      const [user] = await db.select().from(users).where(eq(users.id, loc.userId));
      return {
        id: loc.id,
        userId: loc.userId,
        ciphertext: sealed.ciphertext,
        nonce: sealed.nonce,
        isSharing: loc.isSharing,
        lastUpdated: loc.lastUpdated,
        user: { id: user?.id, displayName: user?.displayName, avatarUrl: user?.avatarUrl },
      };
    }));
  }

  // Virtual Number Management
  async getVirtualNumber(id: string): Promise<VirtualNumber | undefined> {
    const [number] = await db.select().from(virtualNumbers).where(eq(virtualNumbers.id, id));
    return number || undefined;
  }

  async getVirtualNumberByPhone(phoneNumber: string): Promise<VirtualNumber | undefined> {
    const [number] = await db.select().from(virtualNumbers).where(eq(virtualNumbers.phoneNumber, phoneNumber));
    return number || undefined;
  }

  async createVirtualNumber(data: {
    phoneNumber: string;
    countryCode: string;
    twilioSid: string;
    capabilities: { voice: boolean; sms: boolean; mms: boolean };
    assignedUserId: string;
  }): Promise<VirtualNumber> {
    const [number] = await db.insert(virtualNumbers).values({
      phoneNumber: data.phoneNumber,
      countryCode: data.countryCode,
      twilioSid: data.twilioSid,
      capabilities: data.capabilities,
      status: 'active',
      assignedUserId: data.assignedUserId,
      assignedAt: new Date(),
    }).returning();
    return number;
  }

  // VN Recycling (30-day quarantine). The row stays in our pool with
  // status='released' for 30 days. The Twilio number itself is NOT released
  // back to the global pool here (caller `/api/virtual-number` DELETE no
  // longer calls Twilio's releasePhoneNumber either) — otherwise stale
  // SMS / 2FA codes addressed to that E.164 could reach the next global
  // owner of the number. After `recyclableAt <= now()`, the row is eligible
  // for reassignment via `getRecyclableNumber` + `reassignVirtualNumber`.
  // `releasingUserId` is the user who is releasing — stored as
  // `previousAssignedUserId` so we can refuse to hand this number back
  // to them during a future recycle (prior-owner correlation defense).
  async releaseVirtualNumber(id: string, releasingUserId: string | null = null): Promise<void> {
    const now = new Date();
    const recyclableAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // +30 days
    // If caller didn't pass releasingUserId, read the current assignment
    // off the row so we still record prior-owner correctly. This keeps
    // older callers (e.g., user-deletion path in transactional cleanup)
    // safe by default.
    let priorOwner = releasingUserId;
    if (!priorOwner) {
      const [cur] = await db.select({ a: virtualNumbers.assignedUserId })
        .from(virtualNumbers).where(eq(virtualNumbers.id, id)).limit(1);
      priorOwner = cur?.a ?? null;
    }
    await db.update(virtualNumbers)
      .set({
        status: 'released',
        assignedUserId: null,
        releasedAt: now,
        recyclableAt,
        previousAssignedUserId: priorOwner,
      })
      .where(eq(virtualNumbers.id, id));
  }

  // Returns the oldest quarantine-expired released VN in the requested
  // country that was NOT previously owned by `forUserId`, or undefined
  // if the pool is empty. The previousAssignedUserId filter is the
  // prior-owner correlation defense — a user releasing and re-provisioning
  // must not get their own E.164 back. Picks oldest-recyclable-first so
  // freshly-quarantined numbers continue to age past their 30-day cooldown
  // before being reassigned. Rows with NULL `recyclableAt` (legacy
  // pre-feature releases that already returned the number to Twilio under
  // the old flow) are excluded by SQL three-valued logic on `<=`.
  async getRecyclableNumber(countryCode: string, forUserId: string): Promise<VirtualNumber | undefined> {
    const [row] = await db
      .select()
      .from(virtualNumbers)
      .where(and(
        eq(virtualNumbers.status, 'released'),
        eq(virtualNumbers.countryCode, countryCode),
        lte(virtualNumbers.recyclableAt, new Date()),
        or(
          isNull(virtualNumbers.previousAssignedUserId),
          ne(virtualNumbers.previousAssignedUserId, forUserId),
        ),
      ))
      .orderBy(virtualNumbers.recyclableAt)
      .limit(1);
    return row || undefined;
  }

  // Atomically reassign a quarantine-expired VN to a new user. Returns
  // null if the row was claimed by a concurrent provision (race-safe via
  // the status='released' + recyclableAt<=now WHERE clause — the update
  // matches zero rows once another caller has already flipped the status
  // to 'active'). Caller MUST re-check the return value before pointing
  // the user's `users.virtualNumberId` at it.
  async reassignVirtualNumber(id: string, userId: string): Promise<VirtualNumber | null> {
    const [row] = await db.update(virtualNumbers)
      .set({
        status: 'active',
        assignedUserId: userId,
        assignedAt: new Date(),
        releasedAt: null,
        recyclableAt: null,
        // Clear prior-owner now that the number has a new owner. (We
        // could keep history, but the defense only matters at recycle
        // time — once the row is active, prior-owner is stale state.)
        previousAssignedUserId: null,
      })
      .where(and(
        eq(virtualNumbers.id, id),
        eq(virtualNumbers.status, 'released'),
        lte(virtualNumbers.recyclableAt, new Date()),
        // Belt-and-suspenders: even though `getRecyclableNumber` already
        // excludes the prior owner, this WHERE-clause guard means a
        // hand-crafted reassign call still can't violate the invariant.
        or(
          isNull(virtualNumbers.previousAssignedUserId),
          ne(virtualNumbers.previousAssignedUserId, userId),
        ),
      ))
      .returning();
    return row || null;
  }

  // ── Sealed-sender helpers (build 63, Phase 3) ──────────────────────────
  // Returns true iff the (userId, virtualNumberId) pair owns an ACTIVE
  // virtual number. Released and suspended numbers do not count, even
  // though the row still exists. See docs/e2ee/sealed-sender.md §3.
  async ownsVirtualNumber(userId: string, virtualNumberId: string): Promise<boolean> {
    const [row] = await db
      .select({ id: virtualNumbers.id })
      .from(virtualNumbers)
      .where(and(
        eq(virtualNumbers.id, virtualNumberId),
        eq(virtualNumbers.assignedUserId, userId),
        eq(virtualNumbers.status, 'active'),
      ))
      .limit(1);
    return !!row;
  }

  // Carrier SMS landing. NOT E2EE — see schema header comment on externalSms.
  // Callers pass an already-encrypted `body` + `isEncrypted: true` (see
  // server/smsEncryption.ts and the Twilio SMS webhook in routes.ts) so
  // storage.ts stays a thin persistence layer with no crypto of its own.
  async insertExternalSms(data: {
    virtualNumberId: string;
    fromPhoneE164: string;
    body: string;
    isEncrypted?: boolean;
    deliveredToUserId: string;
  }): Promise<ExternalSms> {
    const [row] = await db.insert(externalSms).values(data).returning();
    return row;
  }

  // Sealed-sender message insertion. The route layer is responsible for
  // having already verified ownsVirtualNumber. We require an explicit
  // ciphertext payload (Signal envelope) — sealed sender does NOT introduce
  // a second crypto layer.
  async createSealedMessage(input: {
    conversationId: string;
    senderId: string;                     // real user id, stays server-side for abuse
    receiverId: string;
    outerSenderVirtualNumberId: string;
    content: string;                      // Signal ciphertext (base64)
    e2eeInitEnvelope?: unknown;
    replyToMessageId?: string | null;
    expiresAt?: Date | null;
  }): Promise<Message> {
    let expiresAt: Date | null = input.expiresAt ?? null;
    if (!expiresAt) {
      const [conv] = await db.select({ t: conversations.disappearingTimer })
        .from(conversations)
        .where(eq(conversations.id, input.conversationId))
        .limit(1);
      if (conv?.t && conv.t > 0) {
        expiresAt = new Date(Date.now() + conv.t * 1000);
      }
    }

    const [message] = await db.insert(messages).values({
      conversationId: input.conversationId,
      senderId: input.senderId,
      receiverId: input.receiverId,
      content: input.content,
      isEncrypted: true,
      encryptionVersion: 'v2-signal',
      e2eeInitEnvelope: input.e2eeInitEnvelope ?? null,
      replyToMessageId: input.replyToMessageId ?? null,
      replyToPreview: null,
      replyToSenderId: null, // never leaks even pre-sanitization for sealed messages
      forwarded: false,
      forwardedFromUserId: null,
      expiresAt,
      outerSenderVirtualNumberId: input.outerSenderVirtualNumberId,
      sealedSender: true,
    }).returning();

    await db.update(conversations)
      .set({ lastMessageAt: new Date(), lastMessagePreview: 'Encrypted message' })
      .where(eq(conversations.id, input.conversationId));

    await db.update(conversationParticipants)
      .set({ unreadCount: sql`${conversationParticipants.unreadCount} + 1` })
      .where(and(
        eq(conversationParticipants.conversationId, input.conversationId),
        eq(conversationParticipants.userId, input.receiverId),
      ));

    return message;
  }

  // Status viewers
  async getStatusViewers(statusId: string, ownerId: string): Promise<any[]> {
    const [status] = await db.select().from(statuses).where(eq(statuses.id, statusId));
    if (!status || status.userId !== ownerId) {
      return [];
    }
    // Expired stories no longer expose viewer metadata.
    if (status.expiresAt && status.expiresAt <= new Date()) {
      return [];
    }
    const [owner] = await db.select().from(users).where(eq(users.id, ownerId));
    if (!owner || owner.storyViewReceiptsEnabled === false) {
      // Legacy-compatible empty array; new clients read user.storyViewReceiptsEnabled from profile to decide UI copy.
      return [];
    }

    const views = await db.select().from(statusViews).where(eq(statusViews.statusId, statusId));
    const viewerIds = views.map(v => v.viewerId);
    if (viewerIds.length === 0) return [];
    const viewerRows = await db.select().from(users).where(inArray(users.id, viewerIds));
    const viewerMap = new Map(viewerRows.map(u => [u.id, u]));

    const out: any[] = [];
    for (const view of views) {
      const viewer = viewerMap.get(view.viewerId);
      // Filter out viewers who currently have view-receipts off (reciprocity must hold at exposure time).
      if (!viewer || viewer.storyViewReceiptsEnabled === false) continue;
      out.push({
        id: view.id,
        viewedAt: view.viewedAt,
        watchDurationMs: view.watchDurationMs ?? 0,
        completed: view.completed ?? false,
        viewer: { id: viewer.id, displayName: viewer.displayName, avatarUrl: viewer.avatarUrl },
      });
    }
    return out;
  }

  // ---- Status mutes (feed-only hide; one-way; does not block msg/call) ----
  async muteStatusUser(muterId: string, mutedUserId: string): Promise<void> {
    if (muterId === mutedUserId) return;
    // ON CONFLICT DO NOTHING via raw SQL — composite PK makes re-muting a no-op.
    await db.execute(sql`
      INSERT INTO status_mutes (muter_id, muted_user_id)
      VALUES (${muterId}, ${mutedUserId})
      ON CONFLICT (muter_id, muted_user_id) DO NOTHING
    `);
  }

  async unmuteStatusUser(muterId: string, mutedUserId: string): Promise<void> {
    await db.delete(statusMutes).where(and(
      eq(statusMutes.muterId, muterId),
      eq(statusMutes.mutedUserId, mutedUserId),
    ));
  }

  async getStatusMutes(muterId: string): Promise<Array<{ id: string; displayName: string | null; avatarUrl: string | null; createdAt: Date | null }>> {
    const rows = await db.select({
      id: users.id,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      createdAt: statusMutes.createdAt,
    })
      .from(statusMutes)
      .innerJoin(users, eq(users.id, statusMutes.mutedUserId))
      .where(eq(statusMutes.muterId, muterId))
      .orderBy(desc(statusMutes.createdAt));
    return rows;
  }

  // Resolve the conversation (creating if necessary) for replying to a story.
  // Returns null when the viewer cannot see the story under current privacy
  // rules, has muted the author, or the story has expired — so the client
  // can show a generic "unavailable" message without leaking which case it is.
  async getStatusReplyContext(statusId: string, viewerId: string): Promise<{
    conversationId: string;
    otherUserId: string;
    otherUserName: string;
    status: { id: string; caption: string | null; mediaUrl: string | null; mediaType: string | null };
  } | null> {
    const [status] = await db.select().from(statuses).where(eq(statuses.id, statusId));
    if (!status) return null;
    if (status.expiresAt && status.expiresAt <= new Date()) return null;
    if (status.userId === viewerId) return null; // can't reply to self

    // Mute also blocks reply — symmetric with feed visibility.
    const [muteRow] = await db.select().from(statusMutes).where(and(
      eq(statusMutes.muterId, viewerId),
      eq(statusMutes.mutedUserId, status.userId),
    ));
    if (muteRow) return null;

    const [author] = await db.select().from(users).where(eq(users.id, status.userId));
    if (!author) return null;

    const ctx = await this._getStoryViewerContext(viewerId);
    if (!ctx.viewer || ctx.viewer.storiesEnabled === false) return null;
    if (!this._canViewerSeeStatusSync(viewerId, status, author, ctx)) return null;
    if (status.privacy === 'custom') {
      const [allowed] = await db.select().from(statusAllowedViewers).where(and(
        eq(statusAllowedViewers.statusId, status.id),
        eq(statusAllowedViewers.userId, viewerId),
      ));
      if (!allowed) return null;
    }

    const conversation = await this.getOrCreateConversationAsRequest(viewerId, status.userId);
    return {
      conversationId: conversation.id,
      otherUserId: author.id,
      otherUserName: author.displayName || author.phoneNumber || 'User',
      status: {
        id: status.id,
        caption: status.caption,
        mediaUrl: status.mediaUrl,
        mediaType: status.mediaType,
      },
    };
  }

  // User blocking methods
  async blockUser(blockerId: string, blockedId: string): Promise<UserBlock> {
    const [existing] = await db.select()
      .from(userBlocks)
      .where(and(eq(userBlocks.blockerId, blockerId), eq(userBlocks.blockedId, blockedId)));
    
    if (existing) return existing;
    
    const [block] = await db.insert(userBlocks).values({ blockerId, blockedId }).returning();
    return block;
  }

  async unblockUser(blockerId: string, blockedId: string): Promise<void> {
    await db.delete(userBlocks)
      .where(and(eq(userBlocks.blockerId, blockerId), eq(userBlocks.blockedId, blockedId)));
  }

  async isBlocked(blockerId: string, blockedId: string): Promise<boolean> {
    const [block] = await db.select()
      .from(userBlocks)
      .where(and(eq(userBlocks.blockerId, blockerId), eq(userBlocks.blockedId, blockedId)));
    return !!block;
  }

  async getBlockedUsers(userId: string): Promise<any[]> {
    const blocks = await db.select().from(userBlocks).where(eq(userBlocks.blockerId, userId));
    
    return Promise.all(blocks.map(async (block) => {
      const [user] = await db.select().from(users).where(eq(users.id, block.blockedId));
      return {
        id: block.id,
        blockedAt: block.createdAt,
        user: {
          id: user?.id,
          displayName: user?.displayName,
          avatarUrl: user?.avatarUrl,
          phoneNumber: user?.phoneNumber,
        },
      };
    }));
  }

  async isBlockedByEither(userId1: string, userId2: string): Promise<boolean> {
    const [block] = await db.select()
      .from(userBlocks)
      .where(or(
        and(eq(userBlocks.blockerId, userId1), eq(userBlocks.blockedId, userId2)),
        and(eq(userBlocks.blockerId, userId2), eq(userBlocks.blockedId, userId1))
      ));
    return !!block;
  }

  // User reporting (App Store Guideline 1.2 — UGC abuse moderation)
  async createUserReport(data: InsertUserReport): Promise<UserReport> {
    const [report] = await db.insert(userReports).values(data).returning();
    return report;
  }

  async hasRecentReport(
    reporterId: string,
    reportedUserId: string,
    reportedMessageId?: string | null,
  ): Promise<boolean> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const conditions = [
      eq(userReports.reporterId, reporterId),
      eq(userReports.reportedUserId, reportedUserId),
      gt(userReports.createdAt, oneHourAgo),
    ];
    if (reportedMessageId) {
      conditions.push(eq(userReports.reportedMessageId, reportedMessageId));
    }
    const [recent] = await db.select().from(userReports).where(and(...conditions));
    return !!recent;
  }

  async listReports(filter: { status?: string; limit?: number }): Promise<Array<UserReport & {
    reporter: { id: string; phoneNumber: string; displayName: string | null } | null;
    reported: { id: string; phoneNumber: string; displayName: string | null; isSuspended: boolean | null } | null;
  }>> {
    const limit = Math.min(filter.limit ?? 100, 500);
    const conditions = filter.status ? [eq(userReports.status, filter.status)] : [];
    const rows = await db.select().from(userReports)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(userReports.createdAt))
      .limit(limit);
    if (!rows.length) return [];
    const userIds = Array.from(new Set([
      ...rows.map(r => r.reporterId),
      ...rows.map(r => r.reportedUserId),
    ]));
    const userRows = await db.select({
      id: users.id,
      phoneNumber: users.phoneNumber,
      displayName: users.displayName,
      isSuspended: users.isSuspended,
    }).from(users).where(inArray(users.id, userIds));
    const byId = new Map(userRows.map(u => [u.id, u]));
    return rows.map(r => ({
      ...r,
      reporter: byId.get(r.reporterId)
        ? { id: r.reporterId, phoneNumber: byId.get(r.reporterId)!.phoneNumber, displayName: byId.get(r.reporterId)!.displayName }
        : null,
      reported: byId.get(r.reportedUserId)
        ? {
            id: r.reportedUserId,
            phoneNumber: byId.get(r.reportedUserId)!.phoneNumber,
            displayName: byId.get(r.reportedUserId)!.displayName,
            isSuspended: byId.get(r.reportedUserId)!.isSuspended,
          }
        : null,
    }));
  }

  async getReport(id: string): Promise<UserReport | undefined> {
    const [row] = await db.select().from(userReports).where(eq(userReports.id, id));
    return row || undefined;
  }

  async updateReport(id: string, patch: Partial<UserReport>): Promise<UserReport | undefined> {
    const [row] = await db.update(userReports).set(patch).where(eq(userReports.id, id)).returning();
    return row || undefined;
  }

  async suspendUser(userId: string, reason: string): Promise<void> {
    // Bump tokenVersion so the user is force-logged-out from every device.
    const cur = await db.select({ tv: users.tokenVersion }).from(users).where(eq(users.id, userId));
    const nextTv = (cur[0]?.tv ?? 0) + 1;
    await db.update(users).set({
      isSuspended: true,
      suspendedAt: new Date(),
      suspensionReason: reason,
      tokenVersion: nextTv,
    }).where(eq(users.id, userId));
  }

  async unsuspendUser(userId: string): Promise<void> {
    await db.update(users).set({
      isSuspended: false,
      suspendedAt: null,
      suspensionReason: null,
    }).where(eq(users.id, userId));
  }

  // Archive/Unarchive conversation
  async archiveConversation(conversationId: string, userId: string): Promise<void> {
    await db.update(conversationParticipants)
      .set({ isArchived: true })
      .where(and(
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.userId, userId)
      ));
  }

  async unarchiveConversation(conversationId: string, userId: string): Promise<void> {
    await db.update(conversationParticipants)
      .set({ isArchived: false })
      .where(and(
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.userId, userId)
      ));
  }

  // Mute/Unmute a conversation. When the user has "Keep Muted Chats
  // Archived" on, muting also archives the chat (real toggle, not
  // decorative — see updateUserPrivacy's keepMutedChatsArchived field).
  // Unmuting never auto-unarchives: the user may have archived it on
  // purpose separately, so that stays a deliberate, explicit action.
  async muteConversation(conversationId: string, userId: string, muted: boolean): Promise<void> {
    const set: { isMuted: boolean; isArchived?: boolean } = { isMuted: muted };
    if (muted) {
      const user = await this.getUser(userId);
      if (user?.keepMutedChatsArchived) {
        set.isArchived = true;
      }
    }
    await db.update(conversationParticipants)
      .set(set)
      .where(and(
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.userId, userId)
      ));
  }

  // Update chat folder
  async updateChatFolder(conversationId: string, userId: string, folder: string): Promise<void> {
    await db.update(conversationParticipants)
      .set({ folder })
      .where(and(
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.userId, userId)
      ));
  }

  // Scheduled messages
  async getScheduledMessages(userId: string): Promise<ScheduledMessage[]> {
    const result = await db.select()
      .from(scheduledMessages)
      .where(and(
        eq(scheduledMessages.senderId, userId),
        eq(scheduledMessages.status, 'pending')
      ))
      .orderBy(scheduledMessages.scheduledFor);
    return result;
  }

  async createScheduledMessage(data: {
    conversationId: string;
    senderId: string;
    receiverId?: string;
    content?: string;
    mediaUrl?: string;
    mediaType?: string;
    scheduledFor: Date;
  }): Promise<ScheduledMessage> {
    const [scheduled] = await db.insert(scheduledMessages).values(data).returning();
    return scheduled;
  }

  async cancelScheduledMessage(id: string, userId: string): Promise<void> {
    await db.update(scheduledMessages)
      .set({ status: 'cancelled' })
      .where(and(
        eq(scheduledMessages.id, id),
        eq(scheduledMessages.senderId, userId)
      ));
  }

  async getPendingScheduledMessages(): Promise<ScheduledMessage[]> {
    const now = new Date();
    const result = await db.select()
      .from(scheduledMessages)
      .where(and(
        eq(scheduledMessages.status, 'pending'),
        lt(scheduledMessages.scheduledFor, now)
      ));
    return result;
  }

  async markScheduledMessageSent(id: string): Promise<void> {
    await db.update(scheduledMessages)
      .set({ status: 'sent' })
      .where(eq(scheduledMessages.id, id));
  }

  // Search messages in conversation
  async searchMessages(conversationId: string, query: string): Promise<Message[]> {
    const result = await db.select()
      .from(messages)
      .where(and(
        eq(messages.conversationId, conversationId),
        eq(messages.isHidden, false),
        ilike(messages.content, `%${query}%`)
      ))
      .orderBy(desc(messages.createdAt))
      .limit(50);
    return result;
  }

  // Check if user can see another user's last seen
  async canSeeLastSeen(viewerId: string, targetId: string): Promise<boolean> {
    const target = await this.getUser(targetId);
    if (!target) return false;
    
    const privacy = target.lastSeenPrivacy || 'everyone';
    
    if (privacy === 'everyone') return true;
    if (privacy === 'nobody') return false;
    
    if (privacy === 'contacts') {
      const [friend] = await db.select()
        .from(friends)
        .where(or(
          and(eq(friends.userId, targetId), eq(friends.friendId, viewerId)),
          and(eq(friends.userId, viewerId), eq(friends.friendId, targetId))
        ));
      return !!friend;
    }
    
    if (privacy === 'vip') {
      const viewer = await this.getUser(viewerId);
      return viewer?.isVip === true;
    }
    
    return true;
  }

  // ─── E2EE: Device registration ──────────────────────────────────────────

  async registerDevice(userId: string, deviceId: string, identityPublicKey: string, signingPublicKey: string): Promise<UserDevice> {
    const existing = await db.select().from(userDevices)
      .where(and(eq(userDevices.userId, userId), eq(userDevices.deviceId, deviceId)));
    if (existing.length > 0) {
      const [updated] = await db.update(userDevices)
        .set({ identityPublicKey, signingPublicKey, lastSeenAt: new Date() })
        .where(and(eq(userDevices.userId, userId), eq(userDevices.deviceId, deviceId)))
        .returning();
      return updated;
    }
    const [device] = await db.insert(userDevices).values({ userId, deviceId, identityPublicKey, signingPublicKey }).returning();
    return device;
  }

  async getDeviceForUser(userId: string): Promise<UserDevice | undefined> {
    const [device] = await db.select().from(userDevices)
      .where(eq(userDevices.userId, userId))
      .orderBy(desc(userDevices.lastSeenAt))
      .limit(1);
    return device;
  }

  // ─── E2EE: Signed prekeys ───────────────────────────────────────────────

  async upsertSignedPrekey(userId: string, keyId: string, publicKey: string, signature: string): Promise<SignedPrekey> {
    await db.delete(signedPrekeys).where(eq(signedPrekeys.userId, userId));
    const [row] = await db.insert(signedPrekeys).values({ userId, keyId, publicKey, signature }).returning();
    return row;
  }

  async getSignedPrekey(userId: string): Promise<SignedPrekey | undefined> {
    const [row] = await db.select().from(signedPrekeys)
      .where(eq(signedPrekeys.userId, userId))
      .orderBy(desc(signedPrekeys.createdAt))
      .limit(1);
    return row;
  }

  // ─── E2EE: One-time prekeys ─────────────────────────────────────────────

  async addOneTimePrekeys(userId: string, keys: Array<{ keyId: string; publicKey: string }>): Promise<void> {
    if (keys.length === 0) return;
    await db.insert(oneTimePrekeys).values(keys.map(k => ({ userId, keyId: k.keyId, publicKey: k.publicKey })));
  }

  async consumeOneTimePrekey(userId: string): Promise<OneTimePrekey | undefined> {
    const [row] = await db.select().from(oneTimePrekeys)
      .where(and(eq(oneTimePrekeys.userId, userId), eq(oneTimePrekeys.used, false)))
      .orderBy(oneTimePrekeys.createdAt)
      .limit(1);
    if (!row) return undefined;
    await db.update(oneTimePrekeys).set({ used: true }).where(eq(oneTimePrekeys.id, row.id));
    return row;
  }

  async countUnusedOneTimePrekeys(userId: string): Promise<number> {
    const rows = await db.select().from(oneTimePrekeys)
      .where(and(eq(oneTimePrekeys.userId, userId), eq(oneTimePrekeys.used, false)));
    return rows.length;
  }

  // ─── E2EE: Prekey bundle ────────────────────────────────────────────────

  async getPreKeyBundle(userId: string): Promise<{
    userId: string;
    identityPublicKey: string;
    signingPublicKey: string;
    signedPreKey: { id: string; publicKey: string; signature: string } | null;
    oneTimePreKey: { id: string; publicKey: string } | null;
  } | null> {
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
      oneTimePreKey: otpk ? { id: otpk.keyId, publicKey: otpk.publicKey } : null,
    };
  }

  // ─── E2EE: Device management ────────────────────────────────────────────

  async listDevices(userId: string): Promise<UserDevice[]> {
    return db.select().from(userDevices)
      .where(eq(userDevices.userId, userId))
      .orderBy(desc(userDevices.lastSeenAt));
  }

  async revokeDevice(userId: string, deviceId: string): Promise<boolean> {
    const result = await db.delete(userDevices)
      .where(and(eq(userDevices.userId, userId), eq(userDevices.deviceId, deviceId)))
      .returning();
    return result.length > 0;
  }

  // ─── E2EE: Encrypted backups ─────────────────────────────────────────────

  async upsertBackup(userId: string, deviceId: string, encryptedBlob: string, salt: string, nonce: string): Promise<void> {
    const existing = await db.select().from(encryptedBackups)
      .where(and(eq(encryptedBackups.userId, userId), eq(encryptedBackups.deviceId, deviceId)));
    if (existing.length > 0) {
      await db.update(encryptedBackups)
        .set({ encryptedBlob, salt, nonce, updatedAt: new Date() })
        .where(and(eq(encryptedBackups.userId, userId), eq(encryptedBackups.deviceId, deviceId)));
    } else {
      await db.insert(encryptedBackups).values({ userId, deviceId, encryptedBlob, salt, nonce });
    }
  }

  async getBackup(userId: string): Promise<{ encryptedBlob: string; salt: string; nonce: string } | null> {
    const [row] = await db.select().from(encryptedBackups)
      .where(eq(encryptedBackups.userId, userId))
      .orderBy(desc(encryptedBackups.updatedAt))
      .limit(1);
    if (!row) return null;
    return { encryptedBlob: row.encryptedBlob, salt: row.salt, nonce: row.nonce };
  }

  // Legacy immediate-delete kept as a thin wrapper that now routes through
  // the 30-day grace flow. Old clients calling DELETE /api/auth/account will
  // schedule deletion instead of irrevocably wiping their data.
  async deleteUserAccount(userId: string): Promise<void> {
    await this.requestAccountDeletion(userId);
  }

  // ─── Account deletion: request / cancel / sweep / hard delete (build 62) ──

  async requestAccountDeletion(userId: string): Promise<{ scheduledFor: Date }> {
    const scheduledFor = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await db.update(users).set({
      pendingDeletionAt: scheduledFor,
      deletionInitiatedAt: new Date(),
      // Force re-auth on all devices so the user explicitly re-enters the
      // pending-deletion state before being able to cancel.
      tokenVersion: sql`COALESCE(${users.tokenVersion}, 0) + 1`,
    }).where(eq(users.id, userId));
    return { scheduledFor };
  }

  // Owner-only emergency path: skips the normal 30-day grace period by
  // backdating pendingDeletionAt into the past, then immediately runs the
  // exact same transactional hard-delete the sweep uses. Used when the
  // account holder is locked out of both login (forgot a security-question
  // answer) and the Account-ID recovery flow (which itself requires both
  // answers), and needs the phone number freed up right away to sign up
  // fresh — see /api/auth/account/emergency-reset/confirm.
  async emergencyDeleteAccount(userId: string): Promise<void> {
    await db.update(users).set({
      pendingDeletionAt: new Date(Date.now() - 1000),
      deletionInitiatedAt: new Date(),
    }).where(eq(users.id, userId));
    await this.executeHardDelete(userId);
  }

  async cancelAccountDeletion(userId: string): Promise<void> {
    await db.update(users).set({
      pendingDeletionAt: null,
      deletionInitiatedAt: null,
      tokenVersion: sql`COALESCE(${users.tokenVersion}, 0) + 1`,
    }).where(eq(users.id, userId));
  }

  async getDueAccountDeletions(limit: number = 50): Promise<Array<{ id: string }>> {
    return await db.select({ id: users.id })
      .from(users)
      .where(and(
        lt(users.pendingDeletionAt, new Date()),
        or(isNull(users.isDeletedPlaceholder), eq(users.isDeletedPlaceholder, false)),
      ))
      .limit(limit);
  }

  // Hard-delete per-user records and tombstone the user row. Idempotent —
  // safe to call twice if the sweep tick crashes mid-execution.
  //
  // KEEP (per owner spec): messages (both directions — recipient data),
  // calls (shared call history — same rationale as messages; the tombstone
  // row renders as "Deleted user" in the call list for the surviving peer),
  // userReports (moderation audit), GCS media blobs (recipients hold the
  // keys and have the right to access media they already received).
  //
  // HARD DELETE: prekeys, devices, push tokens, login events, encrypted
  // backups, contacts (this user's address book), friends, blocks,
  // location data, hidden locker items, statuses + status_views they
  // emitted, scheduled outgoing messages, join notifications,
  // conversation_participants rows (so they vanish from group member
  // lists). Verification codes for their phone are cleared.
  //
  // TOMBSTONE the users row: phoneNumber → `deleted:<id>` (unique-safe,
  // never matches a real E.164), displayName → "Deleted user", all PII
  // and keys nulled, isSuspended = true (extra belt-and-braces on top of
  // tokenVersion bump), isDeletedPlaceholder = true, deletedAt stamped,
  // pendingDeletionAt cleared so the sweep doesn't pick it up again.
  async executeHardDelete(userId: string): Promise<void> {
    const user = await this.getUser(userId);
    if (!user) return;
    if (user.isDeletedPlaceholder) return; // already tombstoned, idempotent

    await db.transaction(async (tx) => {
      // Atomic claim: re-verify-under-lock that deletion is still pending
      // AND due AND not already tombstoned. Closes the TOCTOU race where
      // `cancelAccountDeletion` runs as a separate transaction between
      // `getDueAccountDeletions()` and this call — without this check,
      // a cancel-then-sweep interleaving would tombstone a cancelled user.
      const claimed = await tx.select({ id: users.id })
        .from(users)
        .where(and(
          eq(users.id, userId),
          lt(users.pendingDeletionAt, new Date()),
          or(isNull(users.isDeletedPlaceholder), eq(users.isDeletedPlaceholder, false)),
        ))
        .for('update');
      if (claimed.length === 0) {
        // Either cancelled, already tombstoned, or no longer due. Bail out
        // without writing anything — the surrounding transaction commits
        // an empty result set and the sweep moves on.
        return;
      }

      // E2EE material — gone. Peers attempting X3DH against this user will
      // get a 404 from /api/e2ee/prekeys/bundle/:userId, which is correct.
      await tx.delete(signedPrekeys).where(eq(signedPrekeys.userId, userId));
      await tx.delete(oneTimePrekeys).where(eq(oneTimePrekeys.userId, userId));
      await tx.delete(userDevices).where(eq(userDevices.userId, userId));
      await tx.delete(encryptedBackups).where(eq(encryptedBackups.userId, userId));

      // Auth / session trail.
      await tx.delete(loginEvents).where(eq(loginEvents.userId, userId));

      // Social graph — this user's address book is deleted. Other users'
      // contact entries pointing TO this user stay; UI resolves them to
      // "Deleted user" via the tombstone row.
      await tx.delete(pendingContacts).where(eq(pendingContacts.addedByUserId, userId));
      await tx.delete(friends).where(or(
        eq(friends.userId, userId),
        eq(friends.friendId, userId),
      ));
      await tx.delete(userBlocks).where(or(
        eq(userBlocks.blockerId, userId),
        eq(userBlocks.blockedId, userId),
      ));

      // Location data.
      await tx.delete(locationShares).where(eq(locationShares.userId, userId));
      await tx.delete(locationRequests).where(or(
        eq(locationRequests.requesterId, userId),
        eq(locationRequests.targetId, userId),
      ));

      // Personal storage.
      await tx.delete(hiddenLockerItems).where(eq(hiddenLockerItems.userId, userId));

      // Stories. status_views referencing the deleted statuses cascade via
      // FK; views EMITTED by this user we delete explicitly.
      await tx.delete(statusAllowedViewers).where(eq(statusAllowedViewers.userId, userId));
      await tx.delete(statusViews).where(eq(statusViews.viewerId, userId));
      await tx.delete(statuses).where(eq(statuses.userId, userId));

      // Outgoing queues. We also drop scheduledMessages whose receiver is
      // this user — once the recipient is tombstoned the send is
      // undeliverable (they have no devices/prekeys), so the sender's
      // queued message would just fail at fire time. Deleting it now is
      // cleaner than waiting for it to fail.
      await tx.delete(scheduledMessages).where(or(
        eq(scheduledMessages.senderId, userId),
        eq(scheduledMessages.receiverId, userId),
      ));
      await tx.delete(joinNotifications).where(eq(joinNotifications.userId, userId));

      // Message requests (inbound + outbound) — pending intros, never seen.
      await tx.delete(messageRequests).where(or(
        eq(messageRequests.senderId, userId),
        eq(messageRequests.receiverId, userId),
      ));

      // Conversation participations — remove so the deleted user vanishes
      // from group member lists. Messages stay; bubbles will render with
      // the tombstoned sender name.
      await tx.delete(conversationParticipants).where(eq(conversationParticipants.userId, userId));

      // Release virtual number assignment (FK already onDelete: set null,
      // but the user row stays so we have to clear explicitly).
      if (user.virtualNumberId) {
        await tx.update(virtualNumbers)
          .set({ assignedUserId: null })
          .where(eq(virtualNumbers.id, user.virtualNumberId));
      }

      // Verification codes — purge so a recycled phone can re-register
      // cleanly without colliding on stale OTPs.
      await tx.delete(verificationCodes).where(eq(verificationCodes.phoneNumber, user.phoneNumber));

      // Tombstone the user row. phoneNumber must remain UNIQUE NOT NULL,
      // so we rewrite to a sentinel that can never collide with a real
      // E.164 number (no leading "+", contains ":").
      await tx.update(users).set({
        phoneNumber: `deleted:${userId}`,
        displayName: 'Deleted user',
        avatarUrl: null,
        avatarIndex: 0,
        publicKey: null,
        pushToken: null,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        virtualNumberId: null,
        lockerPin: null,
        chatBackgroundUrl: null,
        safeCodeHash: null,
        safeCodeAcknowledged: false,
        isVip: false,
        isAdFree: false,
        notificationsEnabled: false,
        isSuspended: true,
        suspensionReason: 'Account deleted by user',
        isDeletedPlaceholder: true,
        deletedAt: new Date(),
        pendingDeletionAt: null,
        tokenVersion: sql`COALESCE(${users.tokenVersion}, 0) + 1`,
      }).where(eq(users.id, userId));
    });
  }

  async recordLoginEvent(data: { userId: string; deviceId?: string | null; deviceName?: string | null; platform?: string | null; ipAddress?: string | null; userAgent?: string | null; isNewDevice?: boolean }): Promise<LoginEvent> {
    // Demote any prior "current" event for the same device — a device only
    // has one active session at a time, the most recent one.
    if (data.deviceId) {
      await db.update(loginEvents)
        .set({ isCurrentSession: false })
        .where(and(
          eq(loginEvents.userId, data.userId),
          eq(loginEvents.deviceId, data.deviceId),
          eq(loginEvents.isCurrentSession, true),
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
      isCurrentSession: true,
    }).returning();
    return event;
  }

  async getLoginEvents(userId: string, limit: number = 50): Promise<LoginEvent[]> {
    return await db.select().from(loginEvents)
      .where(eq(loginEvents.userId, userId))
      .orderBy(desc(loginEvents.createdAt))
      .limit(limit);
  }

  async bumpTokenVersion(userId: string, currentDeviceId?: string | null): Promise<number> {
    const [updated] = await db.update(users)
      .set({ tokenVersion: sql`COALESCE(${users.tokenVersion}, 0) + 1` })
      .where(eq(users.id, userId))
      .returning({ tokenVersion: users.tokenVersion });
    // Mark all OTHER devices' sessions as no longer current. The current
    // device's most recent event stays flagged so the UI keeps the
    // "This device" badge after sign-out-others.
    if (currentDeviceId) {
      // SQL: NULL <> 'x' is UNKNOWN, so ne() alone misses NULL-device rows.
      // Explicitly include them via OR isNull(...) so legacy/unknown-device
      // sessions are also demoted on logout-all-others.
      await db.update(loginEvents)
        .set({ isCurrentSession: false })
        .where(and(
          eq(loginEvents.userId, userId),
          or(
            isNull(loginEvents.deviceId),
            ne(loginEvents.deviceId, currentDeviceId),
          ),
        ));
    } else {
      // No deviceId in the JWT — fall back to clearing all current flags.
      await db.update(loginEvents)
        .set({ isCurrentSession: false })
        .where(eq(loginEvents.userId, userId));
    }
    return updated?.tokenVersion ?? 0;
  }
}

export const storage = new DatabaseStorage();
