/**
 * Phase 1 — Signed PreKey Rotation Integration Test (PLACEHOLDER).
 *
 * This file is intentionally skipped until SecureStore mocking lands.
 * The full 8-case spec lives in the long comment below; do not delete it
 * when you implement, just lift each block into a `test(...)` call.
 *
 * Tracked in TODO.md under "Phase 2 → Test infrastructure".
 */

describe.skip("prekey rotation (PLACEHOLDER — needs SecureStore mock)", () => {
  test("cold start, no current SPK", () => {
    // see comment below
  });
});

test("prekey rotation spec — placeholder marker", () => {
  expect(true).toBe(true);
});

/**
 * Spec (to lift into individual tests once mocking is in place):
 *
 * 1.  COLD START — no current SPK on device
 *     Setup:  SecureStore empty for "e2ee_spk_current_id".
 *     Action: rotateSignedPreKeyIfStale(token, apiBase)
 *     Expect:
 *       - returns true (rotation happened)
 *       - "e2ee_spk_current_id" is now populated
 *       - "e2ee_spk_ids" contains exactly one id
 *       - fetch was called once with POST /api/e2ee/prekeys/signed
 *       - request body has {keyId, publicKey, signature}, signature
 *         verifies against the stored signing public key
 *
 * 2.  FRESH SPK — current SPK created 1 day ago
 *     Setup:  write an SPK with createdAt = Date.now() - 1*DAY_MS,
 *             set "e2ee_spk_current_id" to its id.
 *     Action: rotateSignedPreKeyIfStale(token, apiBase)
 *     Expect:
 *       - returns false (not stale)
 *       - "e2ee_spk_current_id" unchanged
 *       - fetch was NOT called
 *
 * 3.  STALE SPK — current SPK created 8 days ago
 *     Setup:  write an SPK with createdAt = Date.now() - 8*DAY_MS,
 *             set "e2ee_spk_current_id" to its id.
 *     Action: rotateSignedPreKeyIfStale(token, apiBase)
 *     Expect:
 *       - returns true
 *       - "e2ee_spk_current_id" points at a NEW id (not the old one)
 *       - the OLD SPK private key is STILL on disk (30-day grace)
 *       - "e2ee_spk_ids" contains both ids
 *       - POST /api/e2ee/prekeys/signed was called once with the new id
 *
 * 4.  LEGACY RECORD — pre-Phase-1 SPK missing createdAt
 *     Setup:  write an SPK JSON {pub, priv} (no createdAt) under
 *             "e2ee_spk_<id>", set "e2ee_spk_current_id" to its id.
 *     Action: rotateSignedPreKeyIfStale(token, apiBase)
 *     Expect:
 *       - returns true (treated as stale because createdAt is null)
 *       - a fresh SPK is generated and uploaded
 *
 * 5.  SERVER REJECT — POST returns 500
 *     Setup:  stale SPK, fetch mock returns {ok:false, status:500}.
 *     Action: rotateSignedPreKeyIfStale(token, apiBase)
 *     Expect:
 *       - throws an Error containing "SPK upload failed"
 *       - the LOCAL new SPK is still on disk (so next retry can re-upload)
 *       - "e2ee_spk_current_id" points at the new id (so generate isn't
 *         re-run, only the upload is retried)
 *       - MainApp's caller swallows the throw (verified separately)
 *
 * 6.  CLEANUP — SPK older than retention window
 *     Setup:  write an SPK with createdAt = Date.now() - 31*DAY_MS, add
 *             its id to "e2ee_spk_ids". Also write a current SPK 1 day old.
 *     Action: cleanupExpiredSignedPreKeys()
 *     Expect:
 *       - the 31-day-old SPK private key file is GONE
 *       - the 1-day-old SPK (which is current) is UNTOUCHED
 *       - "e2ee_spk_ids" contains only the current id
 *
 * 7.  CLEANUP NEVER DELETES CURRENT
 *     Setup:  write the current SPK with createdAt = Date.now() - 31*DAY_MS
 *             (paranoid case: rotation never ran for over a month).
 *     Action: cleanupExpiredSignedPreKeys()
 *     Expect:
 *       - the SPK file is STILL on disk
 *       - "e2ee_spk_ids" still contains its id
 *       - (this is the safety net: we never destroy the only key we have)
 *
 * 8.  PEER FETCHES NEW SPK
 *     Setup:  run #3 (rotation), then a peer requests our prekey bundle
 *             via GET /api/e2ee/prekeys/:userId/bundle.
 *     Expect:
 *       - bundle.signedPreKey.id === the NEW id
 *       - bundle.signedPreKey.signature verifies against our signing key
 *       - if the peer references the OLD id in an init envelope (because
 *         they fetched the bundle before our rotation), our X3DH receive
 *         path still finds the old SPK on disk and decrypts successfully
 */
