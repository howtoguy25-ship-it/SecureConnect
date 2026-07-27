// Phase C.1 sealed-call signaling integration tests.
//
// These cover the server's decision-making on POST /api/calls and the
// recipient-side redaction on GET /api/calls. The socket-emit path
// (call-user) is unit-tested elsewhere; here we focus on the REST
// surface that is observable to supertest.

import request from "supertest";
import { db } from "../../server/db";
import { calls } from "@shared/schema";
import { eq } from "drizzle-orm";
import {
  buildApp,
  signToken,
  createTestUser,
  createTestVirtualNumber,
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

describe("Phase C.1 — POST /api/calls sealing eligibility", () => {
  it("seals the call when caller is in app-number mode with a VN and recipient supports sealed-sender", async () => {
    const caller = await createTestUser({ supportsSealedSender: true });
    const recipient = await createTestUser({ supportsSealedSender: true });
    await createTestVirtualNumber({ assignedUserId: caller.id });

    const res = await request(app)
      .post("/api/calls")
      .set("Authorization", `Bearer ${signToken(caller.id)}`)
      .send({ receiverId: recipient.id, type: "audio" });

    expect(res.status).toBe(200);
    expect(res.body.sealedCall).toBe(true);
    expect(res.body.outerCallerVirtualNumberId).toBeTruthy();
  });

  it("does NOT seal when the caller is in personal-number mode (no VN)", async () => {
    const caller = await createTestUser({ supportsSealedSender: true });
    const recipient = await createTestUser({ supportsSealedSender: true });
    // No virtual number assigned — caller stays on phone-number identity.

    const res = await request(app)
      .post("/api/calls")
      .set("Authorization", `Bearer ${signToken(caller.id)}`)
      .send({ receiverId: recipient.id, type: "audio" });

    expect(res.status).toBe(200);
    expect(res.body.sealedCall).toBe(false);
    expect(res.body.outerCallerVirtualNumberId).toBeNull();
  });

  it("does NOT seal when recipient does not support sealed-sender (capability cohort gate)", async () => {
    const caller = await createTestUser({ supportsSealedSender: true });
    const recipient = await createTestUser({ supportsSealedSender: false });
    await createTestVirtualNumber({ assignedUserId: caller.id });

    const res = await request(app)
      .post("/api/calls")
      .set("Authorization", `Bearer ${signToken(caller.id)}`)
      .send({ receiverId: recipient.id, type: "audio" });

    expect(res.status).toBe(200);
    expect(res.body.sealedCall).toBe(false);
  });
});

describe("Phase C.1 — GET /api/calls recipient-side redaction", () => {
  it("redacts callerId + substitutes the virtual-number string when the receiver views a sealed call", async () => {
    const caller = await createTestUser({
      displayName: "Real Caller Name That Must Not Leak",
      supportsSealedSender: true,
    });
    const recipient = await createTestUser({ supportsSealedSender: true });
    const vn = await createTestVirtualNumber({ assignedUserId: caller.id });

    // Create the call as the caller (this writes sealedCall=true).
    const createRes = await request(app)
      .post("/api/calls")
      .set("Authorization", `Bearer ${signToken(caller.id)}`)
      .send({ receiverId: recipient.id, type: "audio" });
    expect(createRes.body.sealedCall).toBe(true);
    const callId: string = createRes.body.id;

    // Receiver fetches their call history.
    const listRes = await request(app)
      .get("/api/calls")
      .set("Authorization", `Bearer ${signToken(recipient.id)}`);
    expect(listRes.status).toBe(200);
    const row = (listRes.body as any[]).find((c) => c.id === callId);
    expect(row).toBeDefined();
    expect(row.callerId).toBeNull();
    expect(row.callerName).toBe(vn.phoneNumber);
    expect(row.callerName).not.toContain("Real Caller Name");
  });

  it("the CALLER side still sees full receiver identity (sealing is one-way)", async () => {
    const caller = await createTestUser({ supportsSealedSender: true });
    const recipient = await createTestUser({
      displayName: "Receiver Display Name",
      supportsSealedSender: true,
    });
    await createTestVirtualNumber({ assignedUserId: caller.id });

    const createRes = await request(app)
      .post("/api/calls")
      .set("Authorization", `Bearer ${signToken(caller.id)}`)
      .send({ receiverId: recipient.id, type: "audio" });
    const callId: string = createRes.body.id;

    const listRes = await request(app)
      .get("/api/calls")
      .set("Authorization", `Bearer ${signToken(caller.id)}`);
    const row = (listRes.body as any[]).find((c) => c.id === callId);
    expect(row).toBeDefined();
    // Caller view is untouched by sealing — they made the call.
    expect(row.callerId).toBe(caller.id);
    expect(row.receiverName).toBe("Receiver Display Name");
  });

  it("non-sealed rows are returned with callerId intact even to the receiver", async () => {
    const caller = await createTestUser({ supportsSealedSender: true });
    const recipient = await createTestUser({ supportsSealedSender: true });
    // No VN → call won't be sealed.

    const createRes = await request(app)
      .post("/api/calls")
      .set("Authorization", `Bearer ${signToken(caller.id)}`)
      .send({ receiverId: recipient.id, type: "video" });
    expect(createRes.body.sealedCall).toBe(false);
    const callId: string = createRes.body.id;

    const listRes = await request(app)
      .get("/api/calls")
      .set("Authorization", `Bearer ${signToken(recipient.id)}`);
    const row = (listRes.body as any[]).find((c) => c.id === callId);
    expect(row).toBeDefined();
    expect(row.callerId).toBe(caller.id);
  });
});

describe("Phase C.1 — PUT /api/calls/:id recipient-side redaction", () => {
  it("PUT response also strips callerId when the sealed recipient updates duration", async () => {
    const caller = await createTestUser({ supportsSealedSender: true });
    const recipient = await createTestUser({ supportsSealedSender: true });
    await createTestVirtualNumber({ assignedUserId: caller.id });

    const createRes = await request(app)
      .post("/api/calls")
      .set("Authorization", `Bearer ${signToken(caller.id)}`)
      .send({ receiverId: recipient.id, type: "audio" });
    const callId: string = createRes.body.id;

    // Recipient hangs up after picking up — same path CallContext.endCall takes.
    const putRes = await request(app)
      .put(`/api/calls/${callId}`)
      .set("Authorization", `Bearer ${signToken(recipient.id)}`)
      .send({ status: "ended", duration: 12 });
    expect(putRes.status).toBe(200);
    expect(putRes.body.callerId).toBeNull();
    expect(putRes.body.sealedCall).toBe(true);
  });

  it("PUT rejects updates from non-participants with 403", async () => {
    const caller = await createTestUser();
    const recipient = await createTestUser();
    const stranger = await createTestUser();

    const createRes = await request(app)
      .post("/api/calls")
      .set("Authorization", `Bearer ${signToken(caller.id)}`)
      .send({ receiverId: recipient.id, type: "audio" });
    const callId: string = createRes.body.id;

    const putRes = await request(app)
      .put(`/api/calls/${callId}`)
      .set("Authorization", `Bearer ${signToken(stranger.id)}`)
      .send({ status: "ended", duration: 999 });
    expect(putRes.status).toBe(403);
  });

  it("PUT ignores attempts to flip sealedCall via the request body", async () => {
    const caller = await createTestUser({ supportsSealedSender: true });
    const recipient = await createTestUser({ supportsSealedSender: true });
    await createTestVirtualNumber({ assignedUserId: caller.id });

    const createRes = await request(app)
      .post("/api/calls")
      .set("Authorization", `Bearer ${signToken(caller.id)}`)
      .send({ receiverId: recipient.id, type: "audio" });
    const callId: string = createRes.body.id;

    await request(app)
      .put(`/api/calls/${callId}`)
      .set("Authorization", `Bearer ${signToken(recipient.id)}`)
      .send({ sealedCall: false, callerId: recipient.id, duration: 5 });

    const [row] = await db.select().from(calls).where(eq(calls.id, callId));
    expect(row.sealedCall).toBe(true);
    expect(row.callerId).toBe(caller.id);
    expect(row.duration).toBe(5);
  });
});

describe("Phase C.1 — sealed_call persistence", () => {
  it("persists sealedCall + outerCallerVirtualNumberId on the calls row", async () => {
    const caller = await createTestUser({ supportsSealedSender: true });
    const recipient = await createTestUser({ supportsSealedSender: true });
    const vn = await createTestVirtualNumber({ assignedUserId: caller.id });

    const createRes = await request(app)
      .post("/api/calls")
      .set("Authorization", `Bearer ${signToken(caller.id)}`)
      .send({ receiverId: recipient.id, type: "audio" });
    const callId: string = createRes.body.id;

    const [row] = await db.select().from(calls).where(eq(calls.id, callId));
    expect(row.sealedCall).toBe(true);
    expect(row.outerCallerVirtualNumberId).toBe(vn.id);
  });
});
