// Sealed-sender sanitizer (build 63, Phase 3).
//
// Single source of truth for what the recipient sees on a sealed-sender
// message. Every recipient-facing surface (REST GET, Socket.IO new-message,
// Socket.IO message-notification, APNs/FCM push payload) routes through
// `sanitizeForRecipient` so a future change cannot accidentally leak
// `messages.senderId` to the recipient.
//
// Contract:
//   - If msg.sealedSender !== true → return msg unchanged.
//   - If the viewer is the SENDER (their own outbox) → return msg unchanged
//     (they obviously know who they are).
//   - Otherwise → strip `senderId` AND `forwardedFromUserId` AND
//     `replyToSenderId` from the payload. Substitute the outer virtual
//     number + display name on `senderVirtualNumber` / `senderDisplayName`.
//
// See docs/e2ee/sealed-sender.md §4 (senderId flow audit) for the
// canonical surface-by-surface table.

import { db } from "./db";
import { virtualNumbers, users } from "@shared/schema";
import { eq, inArray } from "drizzle-orm";

export type RecipientView<T extends { sealedSender?: boolean | null; senderId?: string | null }> =
  Omit<T, "senderId" | "forwardedFromUserId" | "replyToSenderId"> & {
    senderId: string | null;
    forwardedFromUserId: string | null;
    replyToSenderId: string | null;
    senderVirtualNumber: string | null;
    senderDisplayName: string | null;
    sealedSender: boolean;
  };

type SealedInputBase = {
  sealedSender?: boolean | null;
  senderId?: string | null;
  outerSenderVirtualNumberId?: string | null;
  forwardedFromUserId?: string | null;
  replyToSenderId?: string | null;
  // Identity-bearing collections that previously leaked the sender's
  // real userId via per-message metadata. See sealed-sender.md §4.
  deletedForUserIds?: string[] | null;
  reactions?: Record<string, string[]> | null;
};

// For sealed messages, strip every userId from per-message collections
// except the viewer's own. The recipient continues to see their own
// reactions and their own delete-for-me marker; the sender's entries are
// redacted. The sender (viewing their own outbox) hits the carve-out in
// `sanitizeForRecipient` and never reaches these scrubbers.
function scrubUserIdArray(
  arr: string[] | null | undefined,
  viewerUserId: string | null,
): string[] {
  if (!arr || !viewerUserId) return [];
  return arr.filter((id) => id === viewerUserId);
}

function scrubReactions(
  reactions: Record<string, string[]> | null | undefined,
  viewerUserId: string | null,
): Record<string, string[]> {
  if (!reactions || !viewerUserId) return {};
  const out: Record<string, string[]> = {};
  for (const [emoji, ids] of Object.entries(reactions)) {
    const filtered = (ids || []).filter((id) => id === viewerUserId);
    if (filtered.length > 0) out[emoji] = filtered;
  }
  return out;
}

// Pre-resolve outer-virtual-number → {phoneNumber, displayName} for a batch.
export async function buildVirtualNumberLookup(
  outerIds: Array<string | null | undefined>
): Promise<Map<string, { phoneNumber: string; displayName: string | null }>> {
  const uniq = Array.from(new Set(outerIds.filter((v): v is string => !!v)));
  const map = new Map<string, { phoneNumber: string; displayName: string | null }>();
  if (uniq.length === 0) return map;

  // The virtual_numbers row carries phoneNumber + a reference to the
  // assignedUser. The recipient-facing displayName comes from the
  // assigned user's `displayName` (the sender chose how they appear
  // when they provisioned). We resolve both in one join-free pair of
  // queries to keep the query plan simple.
  const vnRows = await db
    .select({
      id: virtualNumbers.id,
      phoneNumber: virtualNumbers.phoneNumber,
      assignedUserId: virtualNumbers.assignedUserId,
    })
    .from(virtualNumbers)
    .where(inArray(virtualNumbers.id, uniq));

  const assignedIds = vnRows
    .map((r) => r.assignedUserId)
    .filter((v): v is string => !!v);
  const userMap = new Map<string, string | null>();
  if (assignedIds.length > 0) {
    const userRows = await db
      .select({ id: users.id, displayName: users.displayName })
      .from(users)
      .where(inArray(users.id, assignedIds));
    for (const u of userRows) userMap.set(u.id, u.displayName ?? null);
  }

  for (const r of vnRows) {
    map.set(r.id, {
      phoneNumber: r.phoneNumber,
      displayName: r.assignedUserId ? (userMap.get(r.assignedUserId) ?? null) : null,
    });
  }
  return map;
}

export function sanitizeForRecipient<T extends SealedInputBase>(
  msg: T,
  viewerUserId: string | null,
  vnLookup: Map<string, { phoneNumber: string; displayName: string | null }>
): T | RecipientView<T> {
  // Not sealed → legacy behavior, no change.
  if (!msg.sealedSender) return msg;
  // The sender viewing their own outbox keeps full visibility.
  if (viewerUserId && msg.senderId && viewerUserId === msg.senderId) return msg;

  const vn = msg.outerSenderVirtualNumberId
    ? vnLookup.get(msg.outerSenderVirtualNumberId) ?? null
    : null;

  // Strip every server-side identity field. The recipient client must
  // never see senderId on a sealed message; the client-side assertion in
  // RecipientView render gates on this absence. We also scrub the two
  // per-message collections that carry real userIds — deletedForUserIds
  // and reactions — leaving only the viewer's own entries. This closes
  // the leak path "sender delete-for-me on sealed message → recipient
  // sees sender's real userId in deletedForUserIds[]" that the audit
  // caught, and the parallel reactions leak.
  const {
    senderId: _s,
    forwardedFromUserId: _f,
    replyToSenderId: _r,
    deletedForUserIds: _d,
    reactions: _rx,
    ...rest
  } = msg as any;
  return {
    ...rest,
    senderId: null,
    forwardedFromUserId: null,
    replyToSenderId: null,
    deletedForUserIds: scrubUserIdArray(msg.deletedForUserIds, viewerUserId),
    reactions: scrubReactions(msg.reactions, viewerUserId),
    senderVirtualNumber: vn?.phoneNumber ?? null,
    senderDisplayName: vn?.displayName ?? null,
    sealedSender: true,
  } as RecipientView<T>;
}

export async function sanitizeManyForRecipient<T extends SealedInputBase>(
  msgs: T[],
  viewerUserId: string | null
): Promise<Array<T | RecipientView<T>>> {
  const lookup = await buildVirtualNumberLookup(
    msgs.map((m) => m.outerSenderVirtualNumberId)
  );
  return msgs.map((m) => sanitizeForRecipient(m, viewerUserId, lookup));
}

export async function sanitizeOneForRecipient<T extends SealedInputBase>(
  msg: T,
  viewerUserId: string | null
): Promise<T | RecipientView<T>> {
  const lookup = await buildVirtualNumberLookup([msg.outerSenderVirtualNumberId]);
  return sanitizeForRecipient(msg, viewerUserId, lookup);
}
