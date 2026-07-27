_Permanent project rules live in [replit.md](./replit.md) — this file is history only._

# Pryvo / SecureConnect Messenger — Build & Feature History

Reverse chronological order. Newest entries at top.

---

## Build 64 — export compliance correction + IAP product ID rebrand

**Avatar upload — permanent fix (black-square bug)**
Replaced the 3-step signed-URL-from-browser pattern (POST `/api/objects/upload` → PUT signed GCS URL → PUT `/api/objects/media` ACL) with a single server-proxied upload. The browser pattern depended on bucket CORS being correctly configured for every origin (replit dev domain, replit.app, pryvomessenger.com, custom domains) and on the client sending the exact same Content-Type the URL was signed with — both fragile, both silently produced 0-byte / wrong-content-type objects that rendered as black squares.

- New `ObjectStorageService.uploadBuffer(buffer, contentType, ownerUserId)` in `server/objectStorage.ts` — direct `file.save` to GCS (resumable: false), sets public ACL, returns `/objects/uploads/<id>`.
- New `POST /api/user/avatar/upload` in `server/routes.ts` — `express.raw({ type: 'image/*', limit: '10mb' })`, requires auth, uploads server-side, saves user, returns cache-busted `avatarUrl`.
- `client/screens/ProfileScreen.tsx` rewritten to POST the binary directly to the new endpoint. Web uses `fetch + blob`, native uses `FileSystem.uploadAsync` (`uploadType: 1`, BINARY). MIME resolved from `asset.mimeType` → extension lookup → jpeg fallback. `<Image onError>` falls back to colored letter avatar; `useEffect` on `user?.avatarUrl` resets the flag on each new upload.

No more CORS dependency, no more signed-URL drift, no more silent failures. Server validates MIME against a raster allowlist (jpeg/png/webp/heic/heif/gif — no SVG) and builds the persisted URL from `EXPO_PUBLIC_DOMAIN` rather than request headers to prevent host-header poisoning.

**IAP product ID rebrand** (Pryvo cleanup, alongside ASC rename `SecureConnect Messenger → Pryvo`):
- `secureconnect.vip.monthly.2025` → `pryvo.vip.monthly.2025` (auto-renewable, monthly)
- `secureconnect.removeads.2025` → `pryvo.removeads.2025` (non-consumable)
- Old product IDs deleted in ASC; per Apple's rules, deleted IDs are permanently burned and cannot be reused — recreated under fresh `pryvo.*` namespace.
- Code updated in `client/services/InAppPurchaseService.ts:6–7` and `server/routes.ts:3484–3485`. Server-side `verifyAppleReceipt` validates against the new `VALID_PRODUCT_IDS` set.
- Both new products must be re-created in ASC with screenshots + localizations and reach "Ready to Submit", then ticked on the Build 64 version page so they're reviewed alongside the binary.

**Export compliance** — Build 63 was rejected by TestFlight with error 90592 ("Invalid Export Compliance Code… key value [] in Info.plist doesn't match… export compliance documentation"). Root cause: Build 62 set `ITSAppUsesNonExemptEncryption: true` while also claiming the §740.17(b)(1) mass-market exemption — these are contradictory. Apple's flow treats `true` as "my encryption is NOT exempt → upload BIS classification docs"; `false` as "qualifies for one of the exemptions, including mass-market — no upload needed". Build 64 corrects to `false`. Same path Signal / WhatsApp / Telegram use for standard E2EE primitives.

Bundle ID briefly swapped to `com.adhamsalameh.pryvomessenger` during Build 63 prep then reverted to `com.adham.salameh.secureconnectchat` — the existing App Store listing is retained and bundle ID continuity preserved for push/IAP/AdMob.

## Build 63 — Pryvo domain swap + sealed-sender

- **Domain swap**: rebrand carried through to the API host (`secureconnectlive.com → pryvomessenger.com`). DNS must be pointed at the Replit deployment before installing on real devices.
- **Sealed-sender messaging**: app-number-mode → sealed recipient strips `senderId` from socket emit, push payload, and `GET /api/conversations/:id/messages`. Recipient sees the sender's VN string only. Single chokepoint at `POST /api/messages/send-sealed`; legacy `/api/messages` unchanged. Authz-gated to participants of the same virtual-number conversation.
- **Sealed calls**: `sealedCall=true` on `calls` row redacts `callerId` from recipient's signaling, push, and history. `PUT /api/calls/:id` participant-gated + field-whitelisted so client can't flip `sealedCall`/`callerId`/`receiverId`.
- **LiveKit identity pseudonymization**: `identity` claim = `p_${HMAC-SHA256(callId:userId, SERVER_SECRET).base64url[:22]}` — stable across reconnects, rotates per call. Override env: `LIVEKIT_IDENTITY_SECRET`.

## Build 62 — Pryvo rebrand + AdMob/UMP/export-compliance

- **Brand sweep**: SecureConnect → Pryvo across 31 user-visible files (permission strings, push titles, SMS templates, AI moderator system prompt, marketing page, error messages, in-app copy). **Explicitly preserved** as `SecureConnect-…` in three HKDF wire-protocol strings — renaming any of these would break key derivation between Build 61 and Build 62+:
  - `client/lib/callE2EE.ts` → `SecureConnect/LiveKit-Frame-v1` (call-frame E2EE)
  - `client/utils/crypto/x3dh.ts` → `SecureConnect-X3DH-v1` (X3DH initial key)
  - `client/utils/crypto/mediaEncryption.ts` → `SecureConnect-Media-v1-thumb` (thumbnail HKDF)
- **Google UMP (GDPR/UK/CH)**: `AdsConsent.gatherConsent()` runs in `MainApp.tsx` before `mobileAds().initialize()`. `AdBanner.tsx` now ANDs two gates before requesting personalized ads — Apple ATT (iOS) and Google UMP purpose-1 (storage) + purpose-3 (personalized ads). When `canRequestAds === false` the BannerAd component does not mount at all.
- **Apple export compliance (later reverted in Build 64)**: flipped `ITSAppUsesNonExemptEncryption` `false → true`, intended to claim §740.17(b)(1) mass-market exemption via App Store Connect's questionnaire. This combination triggered TestFlight error 90592 — see Build 64 for the correction.
- **AdMob Android-side gap (documented, not fixed)**: only an iOS app is registered in AdMob; `androidAppId` reuses the iOS value. Android builds will silently fail to load ads until an Android app is registered.

## Build 61 — E2EE handshake + SMS abuse fixes

- **Call E2EE**: POST/GET responses check `res.ok`; auth-class errors (401/403/404) abort handshake → transport-only fallback in <1s instead of silent 8s downgrade. Server-echo binding (`body.myPublicKey === myKp.publicKeyB64`) before deriving prevents stale-slot key mismatch. Peer pubkey length re-validated client-side === 32.
- `/api/auth/send-code`: new rate limiter (5 / 10min / (IP, E.164)), runs after normalization so punctuation variants share one bucket.
- `/api/invite/send`: rate limiter (5 / 10min / (userId, E.164)) + E.164 normalization before Twilio call (previously raw input was forwarded — SMS-bombing vector).

## Build 60 — API URL fix

Compiled binary reads API base from `EXPO_PUBLIC_DOMAIN` (build-time) → `Constants.expoConfig.extra.API_URL` → falls back to `https://pryvomessenger.com/`. `eas.json` production profile sets `EXPO_PUBLIC_DOMAIN=pryvomessenger.com` so EAS builds bake the custom domain (stable across re-deploys). Resolves Apple guideline 2.1(a) rejection on builds 58/59, where the previous fallback `https://secureconnect.replit.app/` 404'd.

## Build 59 (v1.0.5) — Premium chat + privacy

- Premium chat actions (Reply, Pin, Info, Delete-for-everyone), Privacy & Messaging screen, per-chat disappearing timer (Off/5m/8h/12h/18h/24h), forward picker, pinned banner.
- 60s sweep job hard-deletes expired ciphertext and broadcasts `messages-expired` (plural, batched per-conversation `{conversationId, messageIds: string[]}`).
- `sendMessageNotification` honors recipient's `showNotificationPreview`.

---

# Feature surface (cumulative, active across all current builds)

- **Onboarding**: Telegram-style phone verification with country picker.
- **Calling**: Dual-mode (in-app encrypted via LiveKit, or carrier handoff), Socket.IO signaling.
- **Virtual Phone Numbers**: Dedicated app-only E.164 number per user.
- **E2EE Messaging**: Signal Protocol (X3DH + Double Ratchet), encrypted key backup with recovery codes.
- **Trusted Devices + Security Screen**: View/revoke devices, Safe Code, Recovery Code, Login History.
- **Push Notifications**: Calls, messages, activity — priority-based Android channels.
- **Typing Indicators / Read Receipts**: Real-time via Socket.IO; both honor per-user privacy toggles.
- **Reactions**: Long-press emoji, real-time.
- **Premium Chat Actions**: Reply, Pin, Info, Delete-for-everyone, Copy/Share/Forward/Select/Unsend/Hide. Pinned-message banner, forwarded label, forward picker, quoted-reply with tap-to-scroll.
- **Disappearing Messages**: Per-chat timer (Off/5m/8h/12h/18h/24h), 60s sweep job, sender-only delete-for-everyone within 1 hour.
- **Privacy Controls**: Settings → Privacy & Messaging: Read Receipts, Typing Indicators, Notification Preview, Default Disappearing Timer.
- **Stories**: 4 privacy modes (Everyone / My Contacts / Except… / Only Share With…), bidirectional view receipts, mute, in-app reply via E2EE pipeline, completion-rate analytics.
- **Tappable Contact Cards**: `__SC_CONTACT_V1__`-prefixed encrypted message renders as glass card with Add / Call buttons; older clients see plaintext fallback line.
- **Hidden Locker (E2EE Phase 1)**: Client-side encrypted with scrypt-derived master key + tweetnacl secretbox. Server bcrypts PIN + stores salt; never sees key. Lockout ladder 5/10/15/20 → wipe. Screenshot-blocked via `expo-screen-capture`. Master key zeroed on background/unmount.
- **Sealed-Sender Messaging (Build 63)**: see Build 63 entry above.
- **Sealed Calls + LiveKit Identity Pseudonymization (Build 63)**: see Build 63 entry above.
- **Call Media-Frame E2EE (Build 61)**: Ephemeral X25519 per call → HKDF-SHA-256 → `RNKeyProvider.setSharedKey` → `setE2EEEnabled(true)`. Server stores only public halves; cannot derive shared secret. UI label `End-to-end encrypted` when `isE2EEActive()` else `Encrypted call` (transport-only fallback).
- **VN Recycling (30-day quarantine)**: Released VNs stay in our Twilio account with `status='released'`, `recyclableAt = releasedAt + 30d`. Inbound SMS to quarantined numbers drops. After 30d, race-safe atomic reassign before purchasing fresh from Twilio. Prior-owner defense via `previous_assigned_user_id`. Legacy released rows (pre-feature) have `recyclable_at=NULL` so they're never recycled.
- **SMS Abuse Rate Limiting (Build 61)**: see Build 61 entry above.
- **Logout Push-Token Clear**: Logout clears `users.pushToken`, bumps tokenVersion, disconnects sockets. Client-side fire-and-forget with 3s abort timeout.
- **Moderation & Account Suspension**: Owner-gated queue; suspension bumps tokenVersion + emits `account-suspended` socket event; suspended users blocked at `authenticateToken`.

# Key schema migrations

| File | Adds |
|---|---|
| `0002_call_e2ee_keys.sql` | `calls.callerE2eePubkey`, `calls.receiverE2eePubkey` |
| `0003_locker_encryption.sql` | `hidden_locker_items.ciphertext/nonce/encrypted_v2`, `users.locker_salt/locker_failed_attempts/locker_locked_until` |
| `0004_status_mutes.sql` | `status_mutes` (composite PK), `status_views.watch_duration_ms/completed` |
| `0005_vn_recycling.sql` | `virtual_numbers.recyclable_at` + partial index `idx_vn_recyclable` |
| `0006_vn_recycle_safety.sql` | `virtual_numbers.previous_assigned_user_id`; nulls all pre-feature `released` rows |

Applied via `psql "$DATABASE_URL" -f migrations/000X_*.sql` (drizzle-kit push is interactive in this repo).

# Key endpoints (non-CRUD)

- `PATCH /api/users/me/privacy` — Read Receipts / Typing / Notification Preview / Default Timer.
- `PATCH /api/users/me/story-privacy` — 4-mode story privacy + receipts.
- `PATCH /api/conversations/:id/timer` — per-chat disappearing timer.
- `POST|DELETE /api/conversations/:id/pin`, `POST /api/messages/:id/forward`, `POST /api/messages/:id/delete-for-everyone`.
- `POST /api/messages/send-sealed` — sealed-sender chokepoint (Build 63).
- `POST|GET /api/calls/:id/e2ee-key` — X25519 pubkey relay (participant-gated).
- `POST /api/locker/pin`, `verify-pin`, `change-pin`, `:id/migrate` — locker lifecycle.
- `POST /api/statuses/:id/reply-context`, `POST|DELETE /api/statuses/mute/:userId`, `GET /api/statuses/:id/analytics`.
- `POST /api/virtual-number/provision` (recycle-first then Twilio), `DELETE /api/virtual-number` (quarantine, no Twilio release).

# Standalone feature notes

## VN Recycling
- Storage: `releaseVirtualNumber(id, releasingUserId)` stamps `recyclableAt = now+30d` + prior owner; `getRecyclableNumber(country, forUserId)` excludes prior owner; `reassignVirtualNumber` race-safe atomic UPDATE with belt-and-suspenders WHERE.
- `/release` no longer calls Twilio's `releasePhoneNumber` — quarantine keeps E.164 in our account so stale 2FA codes don't reach the next claimant.

## Hidden Locker Phase 1
- Client-side encryption (scrypt + tweetnacl secretbox). Server-enforced lockout ladder. PIN change re-encrypts before flipping salt (crash-safe). Legacy plaintext items opportunistically re-encrypted via `POST /api/locker/:id/migrate`. PIN min length 6.
- **Deviations from spec**: scrypt instead of Argon2id (native module would block Expo Go); XSalsa20-Poly1305 instead of AES-GCM (tweetnacl audited/in-tree). Both meet the same threat model.
- **Known limitation**: PIN rotation is best-effort one-by-one — crash mid-loop can strand items under old key.
- **Out of scope for Phase 1**: biometric unlock (needs dev build), encryption of media bytes in GCS (only URL is encrypted), recovery phrase.

## Status Mute & Reply
- `status_mutes` table (composite PK, ON CONFLICT DO NOTHING, FK CASCADE). Mute is one-way feed-only — doesn't affect messaging/calls or the muted user's own feed. Reply resolves/creates conversation server-side and sends via existing E2EE `/api/messages` pipeline (server never sees content). Mute symmetrically blocks reply-context to prevent covert DM-reply.

## Story Analytics (v1.0.6)
- `status_views.watch_duration_ms` (clamped 0–10min, accumulates across re-opens) + `completed` (sticky-true; image stories complete after 5s on-screen). `GET /api/statuses/:id/analytics` → `{totalViews, completedViews, completionRate, avgWatchMs, totalWatchMs}` rendered as 3-cell summary card with per-viewer breakdown.

# Known follow-ups (deferred)

- Per-user VN provision/release rate limiting (belt-and-suspenders given deterministic legacy parking).
- Explicit Twilio ownership re-check on VN reassign (belt-and-suspenders).
- Inline PIN-prompt + encrypt-and-save for "Hide to Locker" from `ConversationScreen` (currently directs user to unlock Locker tab first — security-correct but UX regression).
- Two-phase commit for locker PIN rotation (currently best-effort one-by-one).
- Biometric unlock for locker (Phase 2 — needs `expo-local-authentication` on dev build).
- Encryption of locker media bytes in GCS (currently only URL string is encrypted).
- On-device validation of LiveKit frame-encryption layer (pending EAS build 61 install).
- CallKit/PushKit (true VoIP) — currently using `audio` + `remote-notification` background modes only.
