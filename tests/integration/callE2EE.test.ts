// Phase C.3 — call media-frame E2EE pubkey exchange tests.
//
// The server is a dumb relay: it stores each side's X25519 pubkey and
// hands the peer's pubkey back. It must NEVER let one user write the
// other side's slot, must reject malformed keys, and must scope reads
// to call participants.

import request from "supertest";
import {
  buildApp,
  signToken,
  createTestUser,
  cleanupTestData,
  closePool,
} from "./helpers";

let app: import("express").Express;

const VALID_KEY_B64 = Buffer.alloc(32, 7).toString("base64");
const VALID_KEY_B64_ALT = Buffer.alloc(32, 9).toString("base64");

beforeAll(async () => {
  app = await buildApp();
});

afterAll(async () => {
  await cleanupTestData();
  await closePool();
});

async function makeCall(callerToken: string, receiverId: string): Promise<string> {
  const res = await request(app)
    .post("/api/calls")
    .set("Authorization", `Bearer ${callerToken}`)
    .send({ receiverId, type: "audio" });
  expect(res.status).toBe(200);
  return res.body.id;
}

describe("Phase C.3 — call E2EE key exchange", () => {
  it("stores caller pubkey when the caller POSTs, returns it on GET, peer null until other side posts", async () => {
    const caller = await createTestUser();
    const recipient = await createTestUser();
    const callerTok = signToken(caller.id);
    const recipientTok = signToken(recipient.id);
    const callId = await makeCall(callerTok, recipient.id);

    const post = await request(app)
      .post(`/api/calls/${callId}/e2ee-key`)
      .set("Authorization", `Bearer ${callerTok}`)
      .send({ publicKey: VALID_KEY_B64 });
    expect(post.status).toBe(200);

    // Caller reads — sees their own key, peer still null.
    const get1 = await request(app)
      .get(`/api/calls/${callId}/e2ee-key`)
      .set("Authorization", `Bearer ${callerTok}`);
    expect(get1.status).toBe(200);
    expect(get1.body.myPublicKey).toBe(VALID_KEY_B64);
    expect(get1.body.peerPublicKey).toBeNull();

    // Recipient reads — sees peer (caller's) key, my still null.
    const get2 = await request(app)
      .get(`/api/calls/${callId}/e2ee-key`)
      .set("Authorization", `Bearer ${recipientTok}`);
    expect(get2.status).toBe(200);
    expect(get2.body.myPublicKey).toBeNull();
    expect(get2.body.peerPublicKey).toBe(VALID_KEY_B64);
  });

  it("both sides can post, both GETs see both keys with correct my/peer mapping", async () => {
    const caller = await createTestUser();
    const recipient = await createTestUser();
    const callerTok = signToken(caller.id);
    const recipientTok = signToken(recipient.id);
    const callId = await makeCall(callerTok, recipient.id);

    await request(app)
      .post(`/api/calls/${callId}/e2ee-key`)
      .set("Authorization", `Bearer ${callerTok}`)
      .send({ publicKey: VALID_KEY_B64 });
    await request(app)
      .post(`/api/calls/${callId}/e2ee-key`)
      .set("Authorization", `Bearer ${recipientTok}`)
      .send({ publicKey: VALID_KEY_B64_ALT });

    const getCaller = await request(app)
      .get(`/api/calls/${callId}/e2ee-key`)
      .set("Authorization", `Bearer ${callerTok}`);
    expect(getCaller.body.myPublicKey).toBe(VALID_KEY_B64);
    expect(getCaller.body.peerPublicKey).toBe(VALID_KEY_B64_ALT);

    const getRecipient = await request(app)
      .get(`/api/calls/${callId}/e2ee-key`)
      .set("Authorization", `Bearer ${recipientTok}`);
    expect(getRecipient.body.myPublicKey).toBe(VALID_KEY_B64_ALT);
    expect(getRecipient.body.peerPublicKey).toBe(VALID_KEY_B64);
  });

  it("rejects non-participants with 403 on both POST and GET", async () => {
    const caller = await createTestUser();
    const recipient = await createTestUser();
    const stranger = await createTestUser();
    const callId = await makeCall(signToken(caller.id), recipient.id);
    const strangerTok = signToken(stranger.id);

    const postRes = await request(app)
      .post(`/api/calls/${callId}/e2ee-key`)
      .set("Authorization", `Bearer ${strangerTok}`)
      .send({ publicKey: VALID_KEY_B64 });
    expect(postRes.status).toBe(403);

    const getRes = await request(app)
      .get(`/api/calls/${callId}/e2ee-key`)
      .set("Authorization", `Bearer ${strangerTok}`);
    expect(getRes.status).toBe(403);
  });

  it("rejects pubkeys that aren't 32 bytes after base64-decoding", async () => {
    const caller = await createTestUser();
    const recipient = await createTestUser();
    const callerTok = signToken(caller.id);
    const callId = await makeCall(callerTok, recipient.id);

    const tooShort = Buffer.alloc(16, 1).toString("base64");
    const tooLong = Buffer.alloc(64, 1).toString("base64");

    for (const bad of [tooShort, tooLong, "not-base64-!!!", ""]) {
      const res = await request(app)
        .post(`/api/calls/${callId}/e2ee-key`)
        .set("Authorization", `Bearer ${callerTok}`)
        .send({ publicKey: bad });
      expect(res.status).toBe(400);
    }
  });

  it("404 when the call does not exist", async () => {
    const u = await createTestUser();
    const tok = signToken(u.id);
    const res = await request(app)
      .post(`/api/calls/00000000-0000-0000-0000-000000000000/e2ee-key`)
      .set("Authorization", `Bearer ${tok}`)
      .send({ publicKey: VALID_KEY_B64 });
    expect(res.status).toBe(404);
  });

  it("posting the same side twice overwrites (key rotation safe)", async () => {
    const caller = await createTestUser();
    const recipient = await createTestUser();
    const callerTok = signToken(caller.id);
    const callId = await makeCall(callerTok, recipient.id);

    await request(app)
      .post(`/api/calls/${callId}/e2ee-key`)
      .set("Authorization", `Bearer ${callerTok}`)
      .send({ publicKey: VALID_KEY_B64 });
    await request(app)
      .post(`/api/calls/${callId}/e2ee-key`)
      .set("Authorization", `Bearer ${callerTok}`)
      .send({ publicKey: VALID_KEY_B64_ALT });

    const get = await request(app)
      .get(`/api/calls/${callId}/e2ee-key`)
      .set("Authorization", `Bearer ${callerTok}`);
    expect(get.body.myPublicKey).toBe(VALID_KEY_B64_ALT);
  });
});
