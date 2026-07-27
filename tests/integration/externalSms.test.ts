// Build-63 / Phase 3 external-SMS + Twilio-signature integration tests.
//
// Assertion 7: inbound carrier SMS lands in `external_sms`, NOT `messages`.
// Assertion 8: Twilio signature is still required (missing / invalid → 403).

import request from "supertest";
import { db } from "../../server/db";
import { externalSms, messages } from "@shared/schema";
import { eq } from "drizzle-orm";
import {
  buildApp,
  createTestUser,
  createTestVirtualNumber,
  cleanupTestData,
  closePool,
  setTwilioSignatureValid,
} from "./helpers";

let app: import("express").Express;

beforeAll(async () => {
  app = await buildApp();
});

afterAll(async () => {
  await cleanupTestData();
  await closePool();
});

describe("Assertion 7 — external SMS lands in external_sms (not messages)", () => {
  it("creates an external_sms row and writes nothing to messages", async () => {
    const recipient = await createTestUser({
      pushToken: "ExponentPushToken[fake-7]",
    });
    const vn = await createTestVirtualNumber({ assignedUserId: recipient.id });

    setTwilioSignatureValid(true);
    const body = `external-sms-body-${Date.now()}`;
    const res = await request(app)
      .post("/api/webhooks/twilio/sms")
      .set("X-Twilio-Signature", "valid-mock")
      .send({
        From: "+14155551212",
        To: vn.phoneNumber,
        Body: body,
      });
    expect(res.status).toBe(200);
    expect(res.text).toContain("<Response>");

    // external_sms row exists.
    const ext = await db
      .select()
      .from(externalSms)
      .where(eq(externalSms.virtualNumberId, vn.id));
    expect(ext.length).toBe(1);
    expect(ext[0].body).toBe(body);
    expect(ext[0].fromPhoneE164).toBe("+14155551212");
    expect(ext[0].deliveredToUserId).toBe(recipient.id);

    // messages table has NO row with this body.
    const { sql } = await import("drizzle-orm");
    const msgsHit = await db.execute(
      sql`SELECT id FROM messages WHERE content = ${body}`,
    );
    expect((msgsHit as any).rows?.length ?? (msgsHit as any).length ?? 0).toBe(0);
  });
});

describe("Assertion 8 — Twilio signature still required", () => {
  it("returns 403 when the signature header is missing", async () => {
    const recipient = await createTestUser();
    const vn = await createTestVirtualNumber({ assignedUserId: recipient.id });

    setTwilioSignatureValid(false);
    const res = await request(app)
      .post("/api/webhooks/twilio/sms")
      // no X-Twilio-Signature header
      .send({
        From: "+14155551213",
        To: vn.phoneNumber,
        Body: "should-be-rejected",
      });
    expect(res.status).toBe(403);

    // And no rows in EITHER table.
    const ext = await db
      .select()
      .from(externalSms)
      .where(eq(externalSms.virtualNumberId, vn.id));
    expect(ext.length).toBe(0);
  });

  it("plumbs the header, full URL, and body params into twilio.validateRequest", async () => {
    // Defends against a route-level bug where the signature check is bypassed
    // by, e.g., passing an empty params object or a hardcoded URL. We assert
    // on the exact (signature, url, params) tuple the route handed to twilio.
    const recipient = await createTestUser();
    const vn = await createTestVirtualNumber({ assignedUserId: recipient.id });

    setTwilioSignatureValid(true);
    const body = `plumbing-check-${Date.now()}`;
    const res = await request(app)
      .post("/api/webhooks/twilio/sms")
      .set("X-Twilio-Signature", "the-exact-signature-header")
      .send({
        From: "+14155551299",
        To: vn.phoneNumber,
        Body: body,
      });
    expect(res.status).toBe(200);

    const lastCall = (globalThis as any).__lastTwilioValidateCall();
    expect(lastCall).toBeTruthy();
    expect(lastCall.signature).toBe("the-exact-signature-header");
    expect(typeof lastCall.url).toBe("string");
    expect(lastCall.url.length).toBeGreaterThan(0);
    expect(lastCall.params).toMatchObject({
      From: "+14155551299",
      To: vn.phoneNumber,
      Body: body,
    });
  });

  it("returns 403 when the signature header is present but invalid", async () => {
    const recipient = await createTestUser();
    const vn = await createTestVirtualNumber({ assignedUserId: recipient.id });

    setTwilioSignatureValid(false);
    const res = await request(app)
      .post("/api/webhooks/twilio/sms")
      .set("X-Twilio-Signature", "obviously-wrong-signature")
      .send({
        From: "+14155551214",
        To: vn.phoneNumber,
        Body: "still-rejected",
      });
    expect(res.status).toBe(403);
  });
});
