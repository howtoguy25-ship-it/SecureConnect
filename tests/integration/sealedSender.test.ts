// Build-63 / Phase 3 sealed-sender integration tests.
//
// These assertions are the doc Appendix B contract. Each one corresponds
// to a row in `docs/e2ee/sealed-sender.md` §4 (the senderId surface audit
// table) or to a specific authz check on the send-sealed route.

import request from "supertest";
import { db } from "../../server/db";
import { messages, virtualNumbers } from "@shared/schema";
import { eq } from "drizzle-orm";
import {
  buildApp,
  signToken,
  createTestUser,
  createTestVirtualNumber,
  createTestConversation,
  getPushCalls,
  clearPushCalls,
  cleanupTestData,
  closePool,
} from "./helpers";

let app: import("express").Express;

beforeAll(async () => {
  app = await buildApp();
});

afterAll(async () => {
  await cleanupTestData();
  await closePool();
});

beforeEach(() => {
  clearPushCalls();
});

describe("Assertion 1 — ownership 403", () => {
  it("rejects send-sealed when the sender does not own the virtual number", async () => {
    const sender = await createTestUser();
    const recipient = await createTestUser();
    // VN belongs to a THIRD user, not the sender.
    const otherOwner = await createTestUser();
    const vn = await createTestVirtualNumber({ assignedUserId: otherOwner.id });
    // Point the sender's back-pointer at someone else's VN (stale/forged state).
    await db
      .update((await import("@shared/schema")).users)
      .set({ virtualNumberId: vn.id, preferredNumberType: "app" })
      .where(eq((await import("@shared/schema")).users.id, sender.id));

    const conv = await createTestConversation(sender.id, recipient.id, "virtual");
    const res = await request(app)
      .post("/api/messages/send-sealed")
      .set("Authorization", `Bearer ${signToken(sender.id)}`)
      .send({
        conversationId: conv.id,
        receiverId: recipient.id,
        content: "ciphertext-bytes-base64==",
      });
    expect(res.status).toBe(403);
  });
});

describe("Assertion 2 — released-number 403", () => {
  it("rejects send-sealed when the sender's VN status is released", async () => {
    const sender = await createTestUser();
    const recipient = await createTestUser();
    const vn = await createTestVirtualNumber({
      assignedUserId: sender.id,
      status: "released",
    });

    const conv = await createTestConversation(sender.id, recipient.id, "virtual");
    const res = await request(app)
      .post("/api/messages/send-sealed")
      .set("Authorization", `Bearer ${signToken(sender.id)}`)
      .send({
        conversationId: conv.id,
        receiverId: recipient.id,
        content: "ciphertext-bytes-base64==",
      });
    expect(res.status).toBe(403);
    expect(String(res.body?.error || "")).toMatch(/not active/i);
    // Sanity: the VN row still exists in DB but is `released`.
    const [row] = await db
      .select()
      .from(virtualNumbers)
      .where(eq(virtualNumbers.id, vn.id));
    expect(row.status).toBe("released");
  });
});

describe("Assertion 3 — sealed row shape", () => {
  it("persists sealedSender=true + outerSenderVirtualNumberId on the message row", async () => {
    const sender = await createTestUser();
    const recipient = await createTestUser();
    const vn = await createTestVirtualNumber({ assignedUserId: sender.id });
    const conv = await createTestConversation(sender.id, recipient.id, "virtual");

    const cipher = "ZXhhbXBsZS1jaXBoZXJ0ZXh0LWJhc2U2NA=="; // "example-ciphertext-base64"
    const res = await request(app)
      .post("/api/messages/send-sealed")
      .set("Authorization", `Bearer ${signToken(sender.id)}`)
      .send({
        conversationId: conv.id,
        receiverId: recipient.id,
        content: cipher,
      });
    expect(res.status).toBe(200);
    const messageId = res.body.id;
    expect(messageId).toBeTruthy();

    const [row] = await db.select().from(messages).where(eq(messages.id, messageId));
    expect(row.sealedSender).toBe(true);
    expect(row.outerSenderVirtualNumberId).toBe(vn.id);
    expect(row.senderId).toBe(sender.id); // retained server-side for abuse — by design
    expect(row.replyToSenderId).toBeNull();
    expect(row.content).toBe(cipher);
    expect(row.isEncrypted).toBe(true);
  });
});

describe("Assertion 4 — DB plaintext grep (no plaintext from Twilio webhook leaks into messages)", () => {
  it("after Twilio inbound SMS, the plaintext body is NOT in messages.content for any row", async () => {
    // This is the cross-check for the Twilio webhook fix: the historic
    // leak was `messages.content = Body` for inbound SMS. After the fix,
    // a unique plaintext marker delivered via the webhook must appear in
    // external_sms.body but NEVER in messages.content.
    const recipient = await createTestUser();
    const vn = await createTestVirtualNumber({ assignedUserId: recipient.id });

    const PLAINTEXT_MARKER = `PLAINTEXT_MARKER_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const { setTwilioSignatureValid } = await import("./helpers");
    setTwilioSignatureValid(true);
    const res = await request(app)
      .post("/api/webhooks/twilio/sms")
      .set("X-Twilio-Signature", "valid")
      .send({
        From: "+15558675309",
        To: vn.phoneNumber,
        Body: PLAINTEXT_MARKER,
      });
    expect(res.status).toBe(200);

    // Grep messages table — must be zero rows containing the marker.
    const { sql } = await import("drizzle-orm");
    const messagesHits = await db.execute(
      sql`SELECT id FROM messages WHERE content LIKE ${"%" + PLAINTEXT_MARKER + "%"}`,
    );
    expect((messagesHits as any).rows?.length ?? (messagesHits as any).length ?? 0).toBe(0);
  });
});

describe("Assertion 5 — REST senderId absence", () => {
  it("GET /api/conversations/:id/messages returns sealed rows with senderId=null to the recipient", async () => {
    const sender = await createTestUser();
    const recipient = await createTestUser();
    const vn = await createTestVirtualNumber({ assignedUserId: sender.id });
    const conv = await createTestConversation(sender.id, recipient.id, "virtual");

    // Sender sends sealed.
    const send = await request(app)
      .post("/api/messages/send-sealed")
      .set("Authorization", `Bearer ${signToken(sender.id)}`)
      .send({
        conversationId: conv.id,
        receiverId: recipient.id,
        content: "Y2lwaGVydGV4dC1iYXNlNjQ=",
      });
    expect(send.status).toBe(200);

    // Recipient reads.
    const list = await request(app)
      .get(`/api/conversations/${conv.id}/messages`)
      .set("Authorization", `Bearer ${signToken(recipient.id)}`);
    expect(list.status).toBe(200);
    const sealed = list.body.find((m: any) => m.sealedSender === true);
    expect(sealed).toBeTruthy();
    expect(sealed.senderId).toBeNull();
    expect(sealed.forwardedFromUserId).toBeNull();
    expect(sealed.replyToSenderId).toBeNull();
    expect(sealed.senderVirtualNumber).toBe(vn.phoneNumber);

    // And the SENDER reads — they keep full visibility on their own row.
    const senderList = await request(app)
      .get(`/api/conversations/${conv.id}/messages`)
      .set("Authorization", `Bearer ${signToken(sender.id)}`);
    expect(senderList.status).toBe(200);
    const sealedForSender = senderList.body.find((m: any) => m.sealedSender === true);
    expect(sealedForSender.senderId).toBe(sender.id);
  });
});

describe("Assertion 7 — 409 fallback for opted-out recipients", () => {
  it("send-sealed returns 409 sealed-sender-unsupported-recipient when recipient.supportsSealedSender=false", async () => {
    // Build 63 Phase A client contract: when the recipient is on an older
    // build (supportsSealedSender flipped off), /send-sealed must reject
    // with 409 + a stable sentinel error so the client can silently
    // retry on legacy /api/messages. This is the ONE path that lets
    // the rollout be a soft cutover instead of a flag day.
    const sender = await createTestUser();
    const recipient = await createTestUser({ supportsSealedSender: false });
    await createTestVirtualNumber({ assignedUserId: sender.id });
    const conv = await createTestConversation(sender.id, recipient.id, "virtual");

    const res = await request(app)
      .post("/api/messages/send-sealed")
      .set("Authorization", `Bearer ${signToken(sender.id)}`)
      .send({
        conversationId: conv.id,
        receiverId: recipient.id,
        content: "Y2lwaGVydGV4dC1mb3ItZmFsbGJhY2s=",
      });
    expect(res.status).toBe(409);
    expect(res.body?.error).toBe("sealed-sender-unsupported-recipient");

    // No message row was persisted — the client must use /api/messages.
    const persisted = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conv.id));
    expect(persisted.length).toBe(0);
  });
});

describe("Stop-gate — recipient REST payload dump", () => {
  it("dumps the rendered GET payload showing senderId is absent for the recipient", async () => {
    // Phase A stop-gate evidence. We snapshot the EXACT JSON the
    // recipient's client receives over the wire — same code path the
    // socket `new-message` event emits — so a reviewer can verify by
    // eye that no identifier of the sender leaks out. Asserted shape:
    //   senderId === null
    //   replyToSenderId === null
    //   forwardedFromUserId === null
    //   senderVirtualNumber === the VN's phoneNumber (NOT the sender's)
    const sender = await createTestUser({ displayName: "Sender Display" });
    const recipient = await createTestUser({ displayName: "Recipient Display" });
    const vn = await createTestVirtualNumber({ assignedUserId: sender.id });
    const conv = await createTestConversation(sender.id, recipient.id, "virtual");

    const send = await request(app)
      .post("/api/messages/send-sealed")
      .set("Authorization", `Bearer ${signToken(sender.id)}`)
      .send({
        conversationId: conv.id,
        receiverId: recipient.id,
        content: "U1RPUF9HQVRFX0NJUEhFUlRFWFRfQkFTRTY0",
      });
    expect(send.status).toBe(200);

    const list = await request(app)
      .get(`/api/conversations/${conv.id}/messages`)
      .set("Authorization", `Bearer ${signToken(recipient.id)}`);
    expect(list.status).toBe(200);
    const sealed = list.body.find((m: any) => m.sealedSender === true);
    expect(sealed).toBeTruthy();

    // Print to stdout — the build-script grep step pulls this block into
    // docs/e2ee/phase-a-client.md Appendix A.
    // eslint-disable-next-line no-console
    console.log(
      "[PHASE_A_STOP_GATE] recipient_payload=" + JSON.stringify(sealed, null, 2),
    );

    // Hard assertions — anything failing here is a leak.
    expect(sealed.senderId).toBeNull();
    expect(sealed.replyToSenderId).toBeNull();
    expect(sealed.forwardedFromUserId).toBeNull();
    expect(sealed.senderVirtualNumber).toBe(vn.phoneNumber);
    // And — critically — no field on the row matches the sender's user.id
    // (the leak would most plausibly come from a stale alias we missed).
    const allValues = JSON.stringify(sealed);
    expect(allValues.includes(sender.id)).toBe(false);
  });
});

describe("Phase B — broken-access-control fixes on /send-sealed", () => {
  it("rejects send-sealed when the sender is not a participant in conversationId", async () => {
    // A valid sender token used to be enough to write into ANY
    // conversation whose id the caller knew. The route now requires
    // the sender to be a participant in the conversation row.
    const sender = await createTestUser();
    await createTestVirtualNumber({ assignedUserId: sender.id });

    // Conversation between two OTHER users — sender is not a participant.
    const aliceOwner = await createTestUser();
    const bob = await createTestUser();
    const conv = await createTestConversation(aliceOwner.id, bob.id, "virtual");

    const res = await request(app)
      .post("/api/messages/send-sealed")
      .set("Authorization", `Bearer ${signToken(sender.id)}`)
      .send({
        conversationId: conv.id,
        receiverId: bob.id,
        content: "Y2lwaGVydGV4dA==",
      });
    expect(res.status).toBe(403);
  });

  it("rejects send-sealed when receiverId is not the other participant", async () => {
    // Sender is a participant, but receiverId points at a THIRD user.
    // Without this check the route would still create a row addressed
    // to a non-participant, and sanitizeForRecipient would strip
    // senderId for them — message injection into a stranger's inbox.
    const sender = await createTestUser();
    const realPartner = await createTestUser();
    const thirdParty = await createTestUser();
    await createTestVirtualNumber({ assignedUserId: sender.id });
    const conv = await createTestConversation(sender.id, realPartner.id, "virtual");

    const res = await request(app)
      .post("/api/messages/send-sealed")
      .set("Authorization", `Bearer ${signToken(sender.id)}`)
      .send({
        conversationId: conv.id,
        receiverId: thirdParty.id,
        content: "Y2lwaGVydGV4dA==",
      });
    expect(res.status).toBe(400);
  });

  it("rejects send-sealed on a personal-mode (non-virtual) conversation", async () => {
    // Sealed sender is virtual-number-only; personal-mode conversations
    // have no VN to substitute for the stripped senderId.
    const sender = await createTestUser();
    const recipient = await createTestUser();
    await createTestVirtualNumber({ assignedUserId: sender.id });
    const conv = await createTestConversation(sender.id, recipient.id, "personal");

    const res = await request(app)
      .post("/api/messages/send-sealed")
      .set("Authorization", `Bearer ${signToken(sender.id)}`)
      .send({
        conversationId: conv.id,
        receiverId: recipient.id,
        content: "Y2lwaGVydGV4dA==",
      });
    expect(res.status).toBe(400);
  });
});

describe("Phase B — client eligibility helper fail-closed semantics", () => {
  it("checkSealedSenderEligibility returns recipient-capability-unknown (not -unsupported) when capability is undefined", async () => {
    // Pure-logic test against the client helper. The contract is:
    //   - false  → "recipient-unsupported" (caller may fall back)
    //   - undef  → "recipient-capability-unknown" (caller must NOT fall
    //              back; must resolve capability first, and fail-closed
    //              if resolution itself fails)
    // The distinction is what closes the cold-start leak window.
    const { checkSealedSenderEligibility } = await import("../../client/lib/sealedSender");
    const baseUser = {
      id: "u1",
      preferredNumberType: "app" as const,
      virtualNumberId: "vn1",
      virtualNumber: { id: "vn1", phoneNumber: "+15555550100", status: "active" as const, countryCode: "US" },
    } as any;
    expect(
      checkSealedSenderEligibility({ currentUser: baseUser, recipientSupportsSealedSender: false })
        .reason,
    ).toBe("recipient-unsupported");
    expect(
      checkSealedSenderEligibility({ currentUser: baseUser, recipientSupportsSealedSender: undefined })
        .reason,
    ).toBe("recipient-capability-unknown");
    expect(
      checkSealedSenderEligibility({ currentUser: baseUser, recipientSupportsSealedSender: true })
        .eligible,
    ).toBe(true);
  });
});

describe("Phase B — sealed-media envelope leaves zero plaintext metadata", () => {
  it("a media-envelope-shaped sealed message stores no mediaUrl/mediaType server-side and strips senderId from the recipient view", async () => {
    // Phase B stop-gate. Encrypted media is text-shaped at the
    // message-row layer: the SCM1 envelope (`__SC_MEDIA_V1__{path,mk,...}`)
    // is encrypted by signalEncrypt() and ends up as opaque ciphertext in
    // `content`. The server never sees mediaUrl, mediaType, the GCS path,
    // or the per-file mediaKey. This test simulates that wire shape and
    // verifies both halves of the contract:
    //   1. Server stores `mediaUrl === null` and `mediaType === null`.
    //   2. Recipient view has senderId stripped exactly like a text bubble.
    const sender = await createTestUser({ displayName: "Sender Display" });
    const recipient = await createTestUser({ displayName: "Recipient Display" });
    const vn = await createTestVirtualNumber({ assignedUserId: sender.id });
    const conv = await createTestConversation(sender.id, recipient.id, "virtual");

    // Opaque base64 — represents (signalEncrypt of "__SC_MEDIA_V1__{...}").
    // The actual bytes don't matter to the route; what matters is that the
    // route never inspects them, never extracts a path, and never persists
    // a mediaUrl/mediaType row.
    const sealedMediaCiphertext = "U0NNRURJQVZFTk9QQVFVRUNJUEhFUlRFWFQ=";
    const send = await request(app)
      .post("/api/messages/send-sealed")
      .set("Authorization", `Bearer ${signToken(sender.id)}`)
      .send({
        conversationId: conv.id,
        receiverId: recipient.id,
        content: sealedMediaCiphertext,
      });
    expect(send.status).toBe(200);
    const messageId = send.body.id;
    expect(messageId).toBeTruthy();

    // Server-side row inspection — the route persists ONLY the ciphertext.
    const rows = await db.select().from(messages).where(eq(messages.id, messageId));
    expect(rows.length).toBe(1);
    const row = rows[0] as any;
    expect(row.content).toBe(sealedMediaCiphertext);
    expect(row.mediaUrl ?? null).toBeNull();
    expect(row.mediaType ?? null).toBeNull();
    expect(row.sealedSender).toBe(true);
    expect(row.outerSenderVirtualNumberId).toBe(vn.id);

    // Recipient-view inspection — same sanitizer path as text bubbles.
    const list = await request(app)
      .get(`/api/conversations/${conv.id}/messages`)
      .set("Authorization", `Bearer ${signToken(recipient.id)}`);
    expect(list.status).toBe(200);
    const sealed = list.body.find((m: any) => m.id === messageId);
    expect(sealed).toBeTruthy();

    // eslint-disable-next-line no-console
    console.log(
      "[PHASE_B_STOP_GATE] recipient_payload=" + JSON.stringify(sealed, null, 2),
    );

    expect(sealed.senderId).toBeNull();
    expect(sealed.replyToSenderId).toBeNull();
    expect(sealed.forwardedFromUserId).toBeNull();
    expect(sealed.mediaUrl ?? null).toBeNull();
    expect(sealed.mediaType ?? null).toBeNull();
    expect(sealed.senderVirtualNumber).toBe(vn.phoneNumber);
    // The sender's userId must not appear anywhere in the wire payload —
    // not in a stale alias, not in a join row, not in metadata.
    expect(JSON.stringify(sealed).includes(sender.id)).toBe(false);
  });
});

describe("Assertion 6 — push payload senderId absence", () => {
  it("the push payload for a sealed message contains no senderId / otherUserId field", async () => {
    const sender = await createTestUser();
    const recipient = await createTestUser({
      pushToken: "ExponentPushToken[fake-test-token]",
      notificationsEnabled: true,
    });
    await createTestVirtualNumber({ assignedUserId: sender.id });
    const conv = await createTestConversation(sender.id, recipient.id, "virtual");

    clearPushCalls();
    const res = await request(app)
      .post("/api/messages/send-sealed")
      .set("Authorization", `Bearer ${signToken(sender.id)}`)
      .send({
        conversationId: conv.id,
        receiverId: recipient.id,
        content: "Y2lwaGVydGV4dC1ieXRlcw==",
      });
    expect(res.status).toBe(200);

    // The route bypasses sendMessageNotification and goes to
    // sendPushNotification directly — that's the whole point of the
    // bypass (sendMessageNotification hard-codes otherUserId=senderId).
    const calls = getPushCalls();
    const pushCall = calls.find((c) => c.fn === "sendPushNotification");
    expect(pushCall).toBeTruthy();
    // sendPushNotification(pushToken, title, body, data, type)
    const data = pushCall!.args[3] as Record<string, unknown>;
    expect(data).toBeTruthy();
    expect(data.sealedSender).toBe(true);
    expect(data.otherUserId).toBeUndefined();
    expect(data.senderId).toBeUndefined();
    // sendMessageNotification (the leaky helper) must NOT have been called.
    const leaky = calls.find((c) => c.fn === "sendMessageNotification");
    expect(leaky).toBeUndefined();
  });
});
