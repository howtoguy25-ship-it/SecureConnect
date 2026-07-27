// Build 63 / Phase A — sealed-sender client helpers.
//
// This module is the SINGLE client-side gate that decides whether an
// outgoing 1:1 text message goes to `POST /api/messages/send-sealed`
// (no senderId reaches the recipient) or falls back to the legacy
// `POST /api/messages` route.
//
// Why a dedicated helper instead of inlining the branch in
// ConversationScreen.handleSend:
//   1. There is more than one composer entry point (forward, voice
//      transcript, contact-card share). Each must apply the SAME branch
//      logic. A shared helper keeps the rules in one place.
//   2. The 409 "sealed-sender-unsupported-recipient" fallback path
//      needs to be the same everywhere — the recipient is on an old
//      build and we have to retry on the legacy route without surfacing
//      the failure to the user.
//   3. The dev-mode senderId-leak assertion (Phase A spec item 5) lives
//      here too so we can audit every place that touches senderId on a
//      sealed message in one grep.

import type { User } from "./api-utils";
import { getApiUrl } from "./query-client";
import { getStoredToken } from "./auth";

export interface SealedSenderEligibility {
  eligible: boolean;
  reason?:
    | "no-user"
    | "not-app-mode"
    | "no-virtual-number"
    | "virtual-number-inactive"
    | "recipient-unsupported"
    | "recipient-capability-unknown"
    | "not-one-to-one";
}

/**
 * Returns whether the current outgoing text message qualifies for the
 * sealed-sender path. The three conditions match the server-side gate
 * in `POST /api/messages/send-sealed` exactly — see docs/e2ee/sealed-sender.md
 * §3 for the contract.
 *
 * The function does NOT check the conversation's numberType (the
 * "1:1 only" rule) because the conversation row isn't in scope here.
 * The caller is expected to be on a 1:1 conversation screen. Groups
 * are explicitly out of scope for build 63.
 */
export function checkSealedSenderEligibility(args: {
  currentUser: User | null;
  recipientSupportsSealedSender: boolean | undefined;
}): SealedSenderEligibility {
  const { currentUser, recipientSupportsSealedSender } = args;
  if (!currentUser) return { eligible: false, reason: "no-user" };
  if (currentUser.preferredNumberType !== "app") {
    return { eligible: false, reason: "not-app-mode" };
  }
  if (!currentUser.virtualNumberId || !currentUser.virtualNumber) {
    return { eligible: false, reason: "no-virtual-number" };
  }
  if (currentUser.virtualNumber.status !== "active") {
    return { eligible: false, reason: "virtual-number-inactive" };
  }
  // Distinguish "known unsupported" from "not yet fetched". The first
  // is a real fallback case (recipient is on an old build); the second
  // is a cold-start window — we MUST NOT silently fall back to legacy
  // there because that would leak senderId on the very first message
  // after opening a chat. Callers handle the two distinctly: hard
  // "unsupported" → legacy POST; "unknown" → fetch capability first,
  // then re-evaluate.
  if (recipientSupportsSealedSender === false) {
    return { eligible: false, reason: "recipient-unsupported" };
  }
  if (recipientSupportsSealedSender === undefined) {
    return { eligible: false, reason: "recipient-capability-unknown" };
  }
  return { eligible: true };
}

/**
 * Fetch the recipient's `supportsSealedSender` capability synchronously.
 * Used by callers that hit the cold-start window where the chat opened
 * but the contact-info query hasn't resolved yet. We must NOT fall back
 * to legacy in that window — that would leak senderId on the first
 * message of every fresh chat open.
 */
export async function fetchRecipientCapability(
  recipientUserId: string,
): Promise<boolean | undefined> {
  try {
    const token = await getStoredToken();
    const baseUrl = getApiUrl();
    const res = await fetch(
      new URL(`/api/users/${recipientUserId}/contact-info`, baseUrl).toString(),
      {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      },
    );
    if (!res.ok) return undefined;
    const body = await res.json().catch(() => null);
    if (!body || typeof body.supportsSealedSender !== "boolean") return undefined;
    return body.supportsSealedSender as boolean;
  } catch {
    return undefined;
  }
}

export interface SealedSendPayload {
  conversationId: string;
  receiverId: string;
  content: string; // Signal ciphertext (the inner encrypted payload)
  e2eeInitEnvelope?: unknown;
  replyToMessageId?: string;
}

export interface SealedSendResult {
  ok: boolean;
  status: number;
  /**
   * `true` when the server told us the recipient does not support sealed
   * sender (HTTP 409 with `error: "sealed-sender-unsupported-recipient"`).
   * The caller should retry on `POST /api/messages` without surfacing
   * the failure — sealed-sender is a transport detail.
   */
  fallbackToLegacy: boolean;
  /** Parsed response JSON when ok. Null on non-2xx. */
  message?: any;
  /** Raw error text when !ok and !fallbackToLegacy. */
  errorText?: string;
}

/**
 * POST a sealed text message. On HTTP 409 the result reports
 * `fallbackToLegacy: true` so the caller can retry on the legacy route
 * with the same ciphertext. The server's 409 sentinel is
 * `error: "sealed-sender-unsupported-recipient"`.
 */
export async function sendSealedMessage(
  payload: SealedSendPayload,
): Promise<SealedSendResult> {
  const token = await getStoredToken();
  const baseUrl = getApiUrl();
  const res = await fetch(new URL("/api/messages/send-sealed", baseUrl).toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  if (res.ok) {
    const message = await res.json().catch(() => null);
    return { ok: true, status: res.status, fallbackToLegacy: false, message };
  }
  // 409 + the exact sentinel `sealed-sender-unsupported-recipient` is
  // the only condition under which we downgrade to legacy /api/messages.
  // Other 409s (future conflict reasons) flow through the generic
  // failure branch so we never silently re-route on an unknown signal.
  if (res.status === 409) {
    const body = await res.json().catch(() => null);
    if (body && body.error === "sealed-sender-unsupported-recipient") {
      return { ok: false, status: 409, fallbackToLegacy: true };
    }
    return {
      ok: false,
      status: 409,
      fallbackToLegacy: false,
      errorText: body ? JSON.stringify(body) : "",
    };
  }
  // 400 "not a virtual-number conversation" — the server's route-level
  // gate for personal-mode conversations. Sealed sender is virtual-only
  // by design, and a personal conversation never hides sender identity,
  // so falling back to legacy /api/messages here is NOT a leak — it is
  // the correct route for this conversation type. Without this branch a
  // VN-mode sender simply cannot message any personal-number chat (the
  // send fails silently with a retry bubble).
  if (res.status === 400) {
    const body = await res.json().catch(() => null);
    const errMsg = typeof body?.error === "string" ? body.error : "";
    if (errMsg.includes("virtual-number conversation")) {
      return { ok: false, status: 400, fallbackToLegacy: true };
    }
    return {
      ok: false,
      status: 400,
      fallbackToLegacy: false,
      errorText: body ? JSON.stringify(body) : "",
    };
  }
  const errorText = await res.text().catch(() => "");
  return { ok: false, status: res.status, fallbackToLegacy: false, errorText };
}

/**
 * Dev-mode assertion. Call this from any code path that needs the
 * sender's identity for a NETWORK FETCH (e.g. profile lookup, avatar
 * fetch, blocked-user check). It is intentionally NOT called from the
 * `isOwn = senderId === user.id` ownership comparison because that read
 * is safe — when the sealed-sender server strips senderId it sets it to
 * null, so the comparison just resolves to `false` for non-senders.
 *
 * In production this is a no-op so we never crash a user-facing flow.
 */
// ─── Shared helper for all non-ConversationScreen composer entry points ──
//
// Items 4a/4b/4c on the production-readiness fix list: Forward,
// SendPhoto, Camera screens used to POST to `/api/messages`
// unconditionally, which means every forwarded/photo/video bubble
// carries the sender's `userId` on the row — even when the user is in
// sealed-mode and the chat composer would have stripped it. This
// helper is the single funnel those screens now call so the sealed
// branch + 409 fallback + cold-start fail-closed logic stays in lockstep
// with `ConversationScreen.sendTextLikeMessage`.
export interface SendEncryptedArgs {
  currentUser: User | null;
  conversationId: string;
  receiverId: string;
  /** Signal-encrypted ciphertext (already wrapped). */
  ciphertext: string;
  encryptionVersion: string;
  e2eeInitEnvelope: unknown;
  /** Plaintext mediaUrl/mediaType for the LEGACY route only. They're never
   * sent on the sealed path (sealed media uses an SCM1 envelope inside
   * the ciphertext). Pass `null` for pure-text sends. */
  legacyMediaUrl?: string | null;
  legacyMediaType?: string | null;
  /** Forwarded flag for the legacy route. Dropped on sealed sends because
   * `forwardedFromUserId` would itself leak an identity the sealed route
   * is designed to strip. Forwarded-attribution UX is a separate followup. */
  forwarded?: boolean;
  forwardedFromUserId?: string | null;
}

export interface SendEncryptedResult {
  ok: boolean;
  /** Persisted server row (sender's view) when ok. */
  message?: any;
  /** `"capability-unknown"` when the contact-info lookup failed and we
   * fail-closed instead of falling back to legacy. Caller should show a
   * "connection issue" UI and let the user retry. */
  failureReason?: "capability-unknown" | "sealed-rejected" | "legacy-rejected";
}

/**
 * Send a Signal-encrypted message to a 1:1 recipient through the
 * sealed-sender route when eligible, falling back to `/api/messages`
 * only when the recipient is known-unsupported (HTTP 409 sentinel) or
 * the sender isn't eligible for sealed-mode in the first place.
 *
 * Crucially, when `recipientSupportsSealedSender` resolves to
 * `undefined` (network failure on the capability fetch), we FAIL CLOSED
 * — we do NOT silently fall back to legacy, because that would leak
 * `senderId`. The caller gets `failureReason: "capability-unknown"`.
 */
export async function sendEncryptedToRecipient(
  args: SendEncryptedArgs,
): Promise<SendEncryptedResult> {
  const {
    currentUser,
    conversationId,
    receiverId,
    ciphertext,
    encryptionVersion,
    e2eeInitEnvelope,
    legacyMediaUrl = null,
    legacyMediaType = null,
    forwarded,
    forwardedFromUserId,
  } = args;

  // Resolve recipient capability. Cold-start (`undefined`) triggers a
  // synchronous fetch; if THAT also returns undefined we fail closed.
  let capability: boolean | undefined;
  let eligibility = checkSealedSenderEligibility({
    currentUser,
    recipientSupportsSealedSender: undefined,
  });
  if (eligibility.reason === "recipient-capability-unknown") {
    capability = await fetchRecipientCapability(receiverId);
    eligibility = checkSealedSenderEligibility({
      currentUser,
      recipientSupportsSealedSender: capability,
    });
  }

  // Only fail-closed if the user IS eligible for sealed-mode but we
  // couldn't confirm the recipient. Personal-mode / no-VN users were
  // never going sealed anyway — they flow straight to legacy.
  const userIsSealedCapable =
    currentUser?.preferredNumberType === "app" &&
    !!currentUser?.virtualNumber &&
    currentUser.virtualNumber.status === "active";
  if (
    userIsSealedCapable &&
    eligibility.reason === "recipient-capability-unknown"
  ) {
    return { ok: false, failureReason: "capability-unknown" };
  }

  if (eligibility.eligible) {
    const sealed = await sendSealedMessage({
      conversationId,
      receiverId,
      content: ciphertext,
      e2eeInitEnvelope,
    });
    if (sealed.ok) return { ok: true, message: sealed.message };
    if (!sealed.fallbackToLegacy) {
      return { ok: false, failureReason: "sealed-rejected" };
    }
    // 409 sentinel — fall through to legacy POST below.
  }

  // Legacy path. Used when (a) sender isn't sealed-eligible (no VN,
  // wrong mode, etc), (b) recipient is on an old build that returned
  // 409 sealed-sender-unsupported-recipient, or (c) the eligibility
  // check returned "recipient-unsupported" outright.
  const token = await getStoredToken();
  const baseUrl = getApiUrl();
  const res = await fetch(new URL("/api/messages", baseUrl).toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      conversationId,
      receiverId,
      content: ciphertext,
      mediaUrl: legacyMediaUrl,
      mediaType: legacyMediaType,
      encryptionVersion,
      e2eeInitEnvelope,
      ...(forwarded ? { forwarded: true, forwardedFromUserId } : {}),
    }),
  });
  if (!res.ok) return { ok: false, failureReason: "legacy-rejected" };
  const message = await res.json().catch(() => null);
  return { ok: true, message };
}

export function assertNoSenderIdLeak(
  message: { senderId?: string | null; sealedSender?: boolean | null },
  context: string,
): void {
  if (typeof __DEV__ === "undefined" || !(__DEV__ as unknown as boolean)) return;
  if (message.sealedSender !== true) return;
  if (message.senderId == null) return;
  // The sender's own outbox view legitimately carries senderId. This
  // assertion catches the OTHER case — code reaching for senderId on a
  // sealed message it received. The caller passes `context` so the
  // stack trace points at the offending site.
  throw new Error(
    `[sealedSender] code path "${context}" read senderId from a sealed message; ` +
      `this would leak the sender identity. Use the virtual number / display ` +
      `name fields instead.`,
  );
}
