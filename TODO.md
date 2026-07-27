# SecureConnect — Tracked TODOs

Items that don't fit in a single commit but must not be lost. Each item has an owner-decision status, a phase it lands in, and a one-line description. Append-only; once done, mark `[x]` with the commit/build it shipped in.

## Open

### Server hardening — to land in the Phase 2 server PR (build 62)

- [x] **Rate limit `POST /api/e2ee/prekeys/signed`** (server/routes.ts). Shipped build 62 — 10/hour/user via `signedPrekeyRateLimit`.
- [x] **Rate limit `POST /api/e2ee/prekeys/onetime`** (server/routes.ts). Shipped build 62 — 5/hour/user via `oneTimePrekeyRateLimit`.
- [x] **Rate limit `GET /api/e2ee/prekeys/bundle/:userId`** (server/routes.ts). Shipped build 62 — 120/min/user via `prekeyBundleRateLimit`.
- [x] **Rate limit `GET /api/media/encrypted/*objectPath`**. Shipped build 62 — 600/min/user via `encryptedMediaRateLimit`.

- [ ] **Rate limit `POST /api/objects/upload`** for media (Phase 2).
  Today's unauthenticated abuse risk is bounded by the 50 MB max attachment size, but a flood of small uploads still costs us GCS write ops. Add a per-user limit before Phase 2 ships.

- [ ] **Move all per-user rate limiters to Redis (or equivalent shared store) before horizontal scale.** All limiters in `server/routes.ts` (`makePerUserRateLimiter` factory: encrypted media, signed prekey, one-time prekey, prekey bundle) are in-memory `Map`s scoped to a single process. Effective limit silently multiplies by N across an N-instance fleet, and any sticky-session escape lets a misbehaving client evade enforcement entirely. Not blocking for current single-process deployment; **must** ship before we add a second app instance.

### Phase 2 build 62 — open verification gaps (filed 2026-05-21)

- [ ] **Decrypted-media cache wipe on cold-start + background→suspended.** Currently `wipeDecryptedMediaCache()` runs only inside `wipeE2EEKeys()` → `clearAuth()` (explicit logout path). It does NOT run on:
  - **(b)** App cold-start after a process kill / device reboot. A user who force-quits the app leaves plaintext media bytes in `FileSystem.cacheDirectory/decrypted-media/` until next login. Fix: call `wipeDecryptedMediaCache()` from app bootstrap when there's no valid auth token, AND optionally always wipe on cold-start (cheap — just a directory delete).
  - **(c)** App going background → suspended for >N minutes (suggest N=15). Use `AppState` listener + a stored `lastBackgroundedAt` timestamp; on next `active` transition, if `now - lastBackgroundedAt > 15min`, fire `wipeDecryptedMediaCache()`. Aligns with industry norm (Signal/Wire wipe attachment caches on a similar idle timeout).

- [ ] **Per-conversation authorization on `GET /api/media/encrypted/*objectPath`.** Today the route enforces only `authenticateToken` + rate limit + a literal `/objects/` path-prefix check. Any authenticated SecureConnect user can fetch any other user's ciphertext blob given a leaked objectPath. Confidentiality of contents is preserved by the 32-byte mediaKey (only delivered inside the E2EE envelope), but the design leaks: file sizes (Content-Length), upload-time correlation, and a confirmed-existence oracle. Phase 3 fix: introduce a `media_object_acl` table (`object_path`, `owner_user_id`, `allowed_recipient_user_ids[]`) populated at `PUT /api/objects/media` time and checked on read. Not blocking build 62 ship — but the "defense in depth" framing in the current route comment overstates what's actually delivered. Track here so the framing gets corrected when the ACL ships.

### Phase 2 — encrypted media (build 62)

#### Test infrastructure
- [x] **Wire a test runner.** `jest-expo` + `ts-jest`; `npm test` script; resolver for `@/*` paths. Initial scope: `tests/**/*.test.ts`. Landed in this Phase 2 prep batch.
- [ ] **Implement `tests/e2ee/prekeyRotation.test.ts`** per the spec already in that file (8 numbered cases). Currently a `.skip` placeholder so the runner stays green.

#### Crypto module
- [x] **`client/utils/crypto/mediaEncryption.ts`** — encrypt/decrypt with chunked `SCM1` wire format, per-attachment XSalsa20-Poly1305, HKDF-derived thumbnail subkey. Unit tests for roundtrip, tampered ciphertext, tampered header, wrong key, truncation.
- [ ] **Wire `mediaEncryption` into `ConversationScreen.uploadAndSendMedia`** at `client/screens/ConversationScreen.tsx:956`. Encrypt → upload → wrap key in Signal envelope. Strip EXIF for images via `expo-image-manipulator` re-encode.
- [ ] **Decrypt-on-receive in `ConversationScreen` message renderer.** Detect envelope prefix `__SC_MEDIA_V1__`, parse JSON, fetch encrypted blob, decrypt, render. Cache decrypted file at `FileSystem.cacheDirectory/decrypted-media/<messageId>` for the session.
- [ ] **Session-only decrypted-media cleanup** on `ConversationScreen` unmount and on app foreground after >10 min background.

#### Server endpoints (build 62)
- [ ] **`GET /api/media/encrypted/:objectPath`** — authenticated. Stream encrypted bytes. Participant-check before stream. Per-user rate limit (above).
- [ ] **Function `canAccessEncryptedObject(userId, objectPath)`** in `server/storage.ts` — initially handles the messages case (look up message by `mediaUrl`, verify userId is a conversation participant). Phase 3 extends to stories without changing the route shape.
- [ ] **`POST /api/messages/:id/delete-for-everyone`** — extend to issue a GCS `delete()` on `mediaUrl` and `thumbnailUrl` when the message is deleted (see Phase 2 doc §6).
- [ ] **Disappearing-message sweep** — same GCS cleanup as above when a message expires.
- [ ] **Remove `POST /api/messages/:id/transcribe`** or hard-refuse when the message envelope is encrypted media. Server-side transcription is dropped from v1.

#### Logout / account deletion (build 62 — required to ship)
- [x] **Wipe E2EE key material on logout.** Shipped build 62 — `wipeE2EEKeys()` in `client/utils/crypto/keyStorage.ts`, called from `clearAuth`.
- [x] **30-day account-deletion grace period.** Shipped build 62. `users.pendingDeletionAt` + `deletionInitiatedAt` + `isDeletedPlaceholder` + `deletedAt` columns. New `POST /api/auth/account/delete/{request-otp,confirm,cancel}` endpoints; legacy `DELETE /api/auth/account` returns 410 GONE. Sweep job in `server/routes.ts` runs every 6h, calls `storage.executeHardDelete`. Old `storage.deleteUserAccount` now routes through the grace flow so old clients that hit DELETE still get scheduled deletion semantics (though they'll see the 410 first).
- [x] **Re-authentication before delete.** Shipped build 62 — OTP required by both confirm and cancel endpoints. Client adds biometric prompt (expo-local-authentication) before OTP where available; OTP-only fallback. Rate-limited 3/hour/user via `deleteAccountOtpRateLimit`.
- [x] **Hard delete must cover what we own; keep what we should keep.** Shipped build 62 — `storage.executeHardDelete` is a transactional tombstone:
  - HARD DELETE: `signedPrekeys`, `oneTimePrekeys`, `userDevices`, `encryptedBackups`, `loginEvents`, `pendingContacts` (owned), `friends` (both dirs), `userBlocks` (both dirs), `locationShares`, `locationRequests` (both dirs), `hiddenLockerItems`, `statusAllowedViewers`, `statusViews` (emitted), `statuses` (owned), `scheduledMessages` (sent), `joinNotifications`, `messageRequests` (both dirs), `conversationParticipants` (so deleted user vanishes from group member lists), `verificationCodes` for their phone. `virtualNumbers.assignedUserId` set to null.
  - KEEP per owner spec: `messages` (both directions — recipient's data), `userReports` (audit), GCS media blobs (recipients hold the keys).
  - TOMBSTONE the user row: `phoneNumber → deleted:<id>` (unique-safe sentinel), `displayName → "Deleted user"`, all PII/keys nulled, `isDeletedPlaceholder = true`, `isSuspended = true`, `deletedAt` stamped, `tokenVersion` bumped.
  - `authenticateToken` rejects tombstoned users with 410 GONE; `getUserByPhone` filters them out so a recycled phone can re-register.
- [ ] **Client UI for delete-account flow.** Deferred to next turn: Settings → Delete Account screen (biometric → OTP → 30-day confirmation), pending-deletion banner with cancel button, AuthContext handling of `account-pending-deletion` / `account-deleted` socket events + 410 `accountDeleted` response, `pendingDeletionAt` surfaced via `refreshUser`.

#### Plaintext-media sunset
- [ ] **14-day pre-cutover in-app notice.** Banner on Chats screen 14 days before the 60-day legacy `/objects/*objectPath` cutover. Copy: "Media older than {DATE} will no longer be viewable. Save anything you want to keep."
- [ ] **Tighten `/objects/*objectPath`** (server/routes.ts:2823) to `410 GONE` 60 days after Phase 2 (build 62) ships. Calendar reminder — not automated; needs a human to flip the flag.

#### Voice-note transcription
- [ ] **Future: opt-in client-side ML transcription** for voice notes. Not in v1 / v2 / v3. Tracked here so the idea isn't lost.

### Phase 3 — Stories (build 63)
- [ ] Per `docs/stories/phase-3-design.md`. Re-uses Phase 2 primitives. Verifiable TTL deletion. Encrypted view receipts. Mutual-contacts visibility.

### Dead-button / stub-screen audit (build 62)

(Populated by the Phase 2 prep audit, 2026-05-21. See `tools/dead-button-audit.md` for the raw findings; fold the low-effort fixes into the Phase 2 PR, schedule the rest explicitly.)

- [ ] Audit findings — see audit doc for the per-item list and triage.

### Phase 1 — small follow-ups (non-blocking)

- [ ] **(Optional)** One-time `e2ee_session_index` backfill for users upgrading from build 60. Self-heal is sufficient per owner decision on 2026-05-21; revisit only if logout-then-relogin shows residual key material.

### Build / release

- [ ] **Build 61** — Apple compliance fixes (commit `fa821d0`) + Phase 1 E2EE hardening (commit `d01e9c1`). Bump `expo.ios.buildNumber` and `expo.android.versionCode`. Changelog must keep the two sections separate so App Review can see the SMS fix in isolation.
- [ ] **Build 62** — Phase 2 (encrypted media + logout key-wipe + delete-account hardening + dead-button audit fixes). Do not stack with build 61.
- [ ] **Build 63** — Phase 3 (Stories per `docs/stories/phase-3-design.md`). Do not stack with build 62.

## Done

- [x] (2026-05-21, this prep batch) Test runner wired: `jest-expo` + `ts-jest`. `npm test` runs. Placeholder `tests/e2ee/prekeyRotation.test.ts` and unit tests for `mediaEncryption` are green.
- [x] (2026-05-21, this prep batch) `docs/e2ee/phase-2-media.md` — design note + owner-resolved decisions.
- [x] (2026-05-21, this prep batch) `docs/stories/phase-3-design.md` — Phase 3 stub with locked decisions.
- [x] (2026-05-21, this prep batch) `client/utils/crypto/mediaEncryption.ts` — encrypt/decrypt module with unit tests.
