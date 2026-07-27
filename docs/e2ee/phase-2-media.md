# Phase 2 — Encrypted Media Design Note

**Status:** Draft, awaiting review. No code yet.
**Author:** Phase 2 prep, follow-on to Phase 1 (signed-prekey rotation, session-index fix, backup KDF bump).
**Reviewers:** Owner.
**Last updated:** 2026-05-21.

This document defines how attachments (images, video, voice notes, files, thumbnails) will be encrypted end-to-end in SecureConnect. Phase 1 hardened the Signal session layer. Phase 2 extends that protection to the bytes uploaded to object storage. **Today, media content is uploaded in plaintext to GCS** (see `client/screens/ConversationScreen.tsx:956` `uploadAndSendMedia`, and `server/routes.ts:2787` `/api/objects/upload`); only the text `content` field is Signal-encrypted. This phase closes that gap.

---

## 1. Threat Model

### In scope
- Still images (JPEG/HEIC/PNG) sent via the image picker, camera, and paste flows.
- Short videos (MP4/MOV) sent via the picker or camera (current cap: ~25 MB; see §7).
- Voice notes (M4A / AAC) recorded in-chat.
- Generic file attachments sent via the `+` menu (PDF, docs, etc.).
- Auto-generated thumbnails / previews for video and large images.

### Out of scope (this phase)
- Story media (`status_views` flow). Stories have their own privacy model already documented in `replit.md`. A future phase can apply the same envelope.
- Stickers / GIFs from Giphy / Tenor. These are public CDN URLs by design; we will not pretend they are private.
- LiveKit call media. Covered in the brief's Phase 3.

### What an attacker with full server / GCS read access can see today
| Surface | Before Phase 2 | After Phase 2 |
|---|---|---|
| Image / video pixel content | **Plaintext** | Ciphertext (AEAD) |
| Voice note audio | **Plaintext** | Ciphertext (AEAD) |
| Filename | Plaintext on GCS object key | Random UUID object key, original filename inside encrypted envelope |
| File size | Visible (object size) | Visible (object size + small constant header overhead). Not hidden. |
| MIME type | Plaintext (sent in message row + GCS `contentType`) | GCS stores `application/octet-stream`; real MIME inside envelope. The `mediaType` column on `messages` keeps a coarse class (`image` / `video` / `audio` / `file`) so the server can still route push notifications and clients can render a placeholder before decrypt. |
| Duration / dimensions | Visible (often in filename or stored separately) | Not stored server-side. Client derives after decrypt. |
| Sender → recipient mapping | Visible (message row) | Unchanged. Out of scope for this phase. |
| Approximate timestamp | Visible | Unchanged. |

### Metadata strategy
- **Stripped client-side before encryption:** EXIF (including GPS), iCC profile, XMP, maker notes. Implemented by passing every image through `expo-image-manipulator` with `compress: 0.9, format: SaveFormat.JPEG` (a re-encode with no operations is the documented way to drop EXIF in Expo). Videos are not transcoded — metadata containers are minimal and re-encoding is too costly on-device — but we will *not* keep the original filename in the message envelope; only what the user typed or the UI shows.
- **Stays plaintext on the message row for routing:** `mediaType` (one of `image|video|audio|file`), `mediaUrl` (opaque GCS path), approximate `size` (server already knows from the upload). The `mediaUrl` value is the key the server uses to enforce conversation-participant access on `/api/media/encrypted/:objectPath` — see §4.

---

## 2. Key Derivation & Lifecycle

### Choice: per-attachment key
Each attachment gets its own freshly-generated 32-byte media key. **No reuse**, including no reuse across the multiple media items of a single multi-image message (each picture is its own attachment, its own key).

**Justification:** AEAD nonces are finite. Per-attachment keys give us a fresh nonce space for free and eliminate any chance of nonce reuse across attachments. They also make "delete this one photo" cleanly destroy exactly one key without affecting siblings. The cost (32 bytes per attachment in the envelope) is negligible.

### How keys are bound to the Signal session
The media key is **transported, not derived from** the Signal session. The flow is:

1. Sender generates `mediaKey = csprng(32)` (`nacl.randomBytes(32)`).
2. Sender encrypts the file with `mediaKey` (see §3).
3. Sender builds a JSON envelope `{v:1, mediaKey, nonce, mediaType, mimeType, originalSize, ...}`.
4. Sender encrypts that JSON via the existing Signal `encryptMessage()` flow — the envelope becomes the `content` of the message exactly like a text message does today.
5. Recipient Signal-decrypts the envelope, then fetches and AEAD-decrypts the blob.

**Why not derive from the ratchet?** Because (a) we'd need to expose ratchet message-key material outside the ratchet module, breaking encapsulation, and (b) it offers no benefit — Signal already gives us forward secrecy on the envelope, and the ratchet has its own per-message keys we shouldn't reuse for symmetric file encryption.

### KDF use
The media key itself is random and used directly. **HKDF-SHA512 is only used to derive subkeys from it:**

- `chunkKey = HKDF(mediaKey, salt=nonce_prefix, info="SecureConnect-Media-v1-chunks", L=32)`
- `thumbnailKey = HKDF(mediaKey, salt=nonce_prefix, info="SecureConnect-Media-v1-thumb", L=32)`

Explicit info strings are versioned (`v1`) so we can roll the format forward without ambiguity. Salt is the 16-byte random nonce prefix from the wire header (see §3).

### Rotation
Media keys are ephemeral per attachment. They live in memory on the sender just long enough to encrypt + put inside the Signal envelope; the recipient holds them long enough to decrypt + render. They are **never written to disk** on either side. After render, the recipient discards the key when the cache entry is evicted (see §6).

---

## 3. Cipher & Framing

### AEAD: XChaCha20-Poly1305
**Picked over AES-256-GCM** because:
- We already ship `tweetnacl` (no GCM there) and `tweetnacl` ports run natively on JS without WebCrypto, which matters for React Native on Android where WebCrypto support is patchy.
- XChaCha20 takes a **24-byte nonce**, which is large enough that random-nonce collisions are statistically impossible (~2^96 messages before a 50% collision chance). AES-GCM's 12-byte nonce would force us into a counter scheme, which is fragile across re-tries.
- Poly1305 gives us a 16-byte tag, integrity-protected against any flipped byte.
- `nacl.secretbox` (which is XSalsa20-Poly1305, 24-byte nonce) is already used throughout the project. We will use the same primitive for files for consistency and to avoid pulling in another crypto lib. **Decision: `nacl.secretbox` (XSalsa20-Poly1305) for files**, same primitive the Double Ratchet already uses for message payloads.

### Nonce strategy
- **Random 24-byte nonce per chunk**, derived deterministically from a 16-byte random `nonceBase` (in the header) + 8-byte little-endian chunk counter. This gives us:
  - One CSPRNG call per file, not per chunk.
  - Guaranteed no collisions inside a file.
  - Cross-file collision probability bounded by the 128-bit `nonceBase`, ~2^64 attachments before 50% — comfortably more than the lifetime of any user.

### Whole-blob vs chunked
- **≤ 5 MB:** single-chunk encryption. Whole file in memory, one `nacl.secretbox` call. Simpler, no streaming.
- **> 5 MB:** chunked. **Chunk size: 1 MiB plaintext** (1,048,576 bytes). Each chunk is independently authenticated (Poly1305 tag per chunk), so a corrupted chunk fails fast without us having read the whole file. The last chunk carries a `final: true` byte (see header) so a truncated stream is detected.

### Wire format (version 1)

```
┌──────────────────────────────────────────────────────────────────┐
│ MAGIC      (4)  "SCM1"  — SecureConnect Media v1                 │
│ VERSION    (1)  0x01                                             │
│ ALGO_ID    (1)  0x01 = XSalsa20-Poly1305                         │
│ FLAGS      (1)  bit0: chunked, bit1: has_thumbnail               │
│ RESERVED   (1)  0x00                                             │
│ NONCE_BASE (16) random                                           │
│ CHUNK_SIZE (4)  uint32 little-endian, 0 for single-chunk         │
│ TOTAL_SIZE (8)  uint64 little-endian plaintext size              │
├──────────────────────────────────────────────────────────────────┤
│ For each chunk:                                                  │
│   CHUNK_LEN (4)  uint32 le ciphertext length (incl 16-byte tag)  │
│   FINAL     (1)  0x00 or 0x01 (last chunk)                       │
│   CIPHERTEXT (CHUNK_LEN bytes)  XSalsa20-Poly1305 output         │
└──────────────────────────────────────────────────────────────────┘
```

Header is 36 bytes, written verbatim at the start of the encrypted file on GCS. The header is **not** encrypted but **is** integrity-protected: every chunk's nonce is `nonceBase || counter_le8`, so any header tampering changes the nonce derivation and the first chunk fails to decrypt. We also include `algo_id` and `version` in associated data for chunk 0's secretbox call (via `nacl.secretbox` doesn't take AAD, so we prepend the header bytes to chunk 0's plaintext and verify them after decrypt — documented as a TODO in §8).

### Versioning
- Magic `"SCM1"` and explicit version byte. A future v2 (e.g. switching to libsodium's true XChaCha20-Poly1305-IETF, or adding chunked AAD) bumps both.
- Old clients reading a `"SCM2"` blob: hard-fail with `unsupported_media_version` and surface an "Update SecureConnect to view this file" message in the bubble (per §4).

---

## 4. Storage & Transport

### Where ciphertext lives
Same GCS bucket the project already uses (Replit `expo_object_storage` integration). The `.private` subtree under the configured `PRIVATE_OBJECT_DIR`. **No ACL change vs today**: objects are already created with no public ACL by default; the issue today is that `/objects/*objectPath` at `server/routes.ts:2823` is **unauthenticated**, so anyone with the URL can fetch.

### Server-visible vs hidden
| Server sees | Server doesn't see |
|---|---|
| Object size on GCS | Plaintext bytes |
| Time of upload | Original filename |
| Sender + recipient (from message row) | Real MIME type |
| Coarse `mediaType` enum on the row | Duration, dimensions, EXIF |

### New endpoint
- `GET /api/media/encrypted/:objectPath` — authenticated. Verifies the requester is a participant in the conversation containing a message whose `mediaUrl` matches the requested object. Streams the encrypted bytes. **Adds an in-process LRU rate limit** (per user, per minute) — see TODO.md for the tracked item.
- The existing public `/objects/*objectPath` route stays for legacy plaintext media already in the wild, but **new uploads never go through it**. A future migration can soft-delete those plaintext blobs after a grace period. **TODO** filed in TODO.md.

### Upload flow (sender)
```
[pick / capture media]
  → expo-image-manipulator re-encode (strips EXIF, images only)
  → generate mediaKey (32 bytes random)
  → encryptFile(uri, mediaKey) → writes ciphertext to FileSystem.cacheDirectory
  → POST /api/objects/upload (presigned PUT URL, unchanged)
  → PUT ciphertext to GCS at the new opaque path
  → build envelope { v:1, mediaKey, nonceBase, mediaType, mimeType, originalSize, mediaUrl, ... }
  → Signal-encrypt envelope as the message content
  → POST /api/messages (mediaUrl on the row is the GCS path, mediaType is the coarse class)
  → delete local ciphertext temp file
```

### Download flow (recipient)
```
[message arrives]
  → Signal-decrypt content → JSON envelope
  → GET /api/media/encrypted/:objectPath (Authorization header)
  → verify magic + version + algo_id + flags
  → for each chunk: verify Poly1305 tag, decrypt, append to in-memory buffer (for ≤5MB) or temp file (>5MB)
  → if final byte not seen at end → tampered_truncation error
  → write to FileSystem.cacheDirectory (session-only)
  → render
```

### Failure handling
- **Auth tag failure (any chunk):** abort decryption, discard partial output, surface to user as **"Could not verify this file — it may have been tampered with."** No partial render, no fallback. Log to Sentry with `media_tag_fail` tag.
- **Wrong key:** indistinguishable from auth-tag failure (Poly1305 fails before plaintext is exposed). Same UI.
- **Truncated download:** same UI as auth failure. Retry button.
- **Unsupported version:** specific message **"Update SecureConnect to view this file."**
- **404 on `/api/media/encrypted/:objectPath`:** message **"This file is no longer available."** (Could mean the sender ran delete-for-everyone.)

---

## 5. Thumbnails & Previews

**Choice:** derived from parent media key via HKDF.

- `thumbnailKey = HKDF(mediaKey, salt=nonceBase, info="SecureConnect-Media-v1-thumb", L=32)`
- A separate uploaded object, separate object path stored as `thumbnailUrl` inside the envelope (not on the message row).
- Same wire format (`"SCM1"`) but always single-chunk (thumbnails are ≤256×256, JPEG q=70, ~30 KB).

**No plaintext thumbnails on the server. Ever. Confirmed.** This also means: today's image-preview rendering that lets the chat list show a tiny preview without opening the conversation **needs work** — the chat list won't have the Signal session pre-decrypted to extract the key. Decision: chat list shows a placeholder ("Photo" / "Video" / "Voice message"); preview thumbnails appear only inside an opened conversation. This is a UX regression vs today but is the right call for the threat model.

**Justification for derived-from-parent (vs independent key):** one fewer key in the envelope; thumbnail and full media live and die together by design; the HKDF info-string separation guarantees the two keys are computationally independent so leaking the thumbnail key never leaks the full-media key.

---

## 6. Forward Secrecy & Deletion

### Local delete (delete-for-me)
- Remove the message row locally.
- Discard the in-memory mediaKey for that message.
- Evict any decrypted cache entry from `FileSystem.cacheDirectory/decrypted-media/`.
- **Do not** touch the GCS blob (other participants still have the message).

### Delete-for-everyone (existing endpoint `POST /api/messages/:id/delete-for-everyone`)
- Server: in addition to today's behavior (mark `deletedForEveryone=true`, clear `content` + `mediaUrl`), **also issue a GCS `delete` on the object** and on the thumbnail object.
- Clients: when the `message-deleted-for-everyone` socket event arrives, evict their decrypted cache for that messageId.
- The mediaKey is in the original envelope — once `content` is cleared on the row, the key is unreachable. **Forward secrecy is via key destruction, not blob destruction** — even if a recipient's device kept the encrypted blob in a backup, without the envelope they can't decrypt it.

### Disappearing messages (existing per-chat timer)
- Same sweep job that today deletes the message row should also issue GCS deletes for `mediaUrl` and `thumbnailUrl` if present. Documented as a Phase 2 server task.

### Decrypted cache lifetime
- Decrypted media is written to `FileSystem.cacheDirectory/decrypted-media/<messageId>` with a session-only in-memory `Map<messageId, uri>`.
- On `ConversationScreen` unmount: iterate the map, `FileSystem.deleteAsync` each file, clear the map.
- On app foreground after >10 min in background: same cleanup.
- **Never** written to `FileSystem.documentDirectory` or media library, unless the user explicitly taps "Save to Photos" (existing behavior, covered by `NSPhotoLibraryAddUsageDescription`).

---

## 7. Failure Modes & Limits

### Limits
- **Max attachment size:** 50 MB per attachment (hard cap, enforced client-side before upload and server-side at the presigned-URL request).
- **Max chunks per file:** 50 (= 50 MB / 1 MiB chunk + headroom). Hard fail beyond.
- **Max attachments per message:** unchanged from today (1 — multi-image is multiple messages).

### Edge cases
| Scenario | Behavior |
|---|---|
| Network drop mid-encrypt | Encryption is local; resumes on retry. Ciphertext temp file is overwritten, never appended. |
| Network drop mid-upload | Presigned PUT fails. Client retries up to 3× with exponential backoff. After that, the message row is marked `failed` (existing UI). The Signal envelope is never sent → recipient never sees a dangling reference. |
| Network drop mid-download | Partial bytes are discarded; auth tag would not validate. Retry button. |
| Storage full on recipient device | Hard fail with "Not enough space to open this file." No decrypted partial. |
| Sender sends, then deletes, before recipient downloads | Recipient gets 404 on the encrypted endpoint → renders "This file is no longer available." |
| Two clients of the same user (multi-device) | Each device decrypts independently from its own Signal session. Same mediaKey arrives via each session. |

### Server-side rate limits
Tracked in `TODO.md`. Carrying forward the unresolved Phase 1 item (rate limit on `/api/e2ee/prekeys/signed`) into the Phase 2 server batch — same review, same build.

---

## 8. Test Plan

### Unit tests (Phase 2 client)
- HKDF vector: known `(mediaKey, salt, info) → expected subkey` from an RFC-5869 test vector adapted to SHA-512.
- Encrypt → decrypt roundtrip: random 1 KB, 1 MiB, 5 MiB, 25 MiB plaintexts.
- Tampered ciphertext rejection: flip one bit in each chunk's ciphertext, in the tag, in the header (magic / version / nonceBase / chunk_size / total_size / final byte). Each must fail.
- Wrong-key rejection: encrypt with key A, attempt decrypt with key B → must fail at first chunk.
- Truncation rejection: chop last chunk's `final: 0x01` to `0x00` → must fail (no terminator).

### Unit tests (Phase 2 server)
- `/api/media/encrypted/:objectPath`: returns 401 unauthenticated, 403 to a non-participant, 200 to a participant, 404 to a deleted message.

### Integration tests
- Two test clients in the same conversation: A sends an image → B decrypts and the rendered bytes equal the original. Repeat for voice note (M4A) and small video.
- Old-build compatibility: a v1.0.6 client receiving a Phase 2 envelope (whose `content` JSON has a `"v":1` field it doesn't understand) → gracefully renders **"Update SecureConnect to view this file."** rather than crashing. To enable this we will keep the JSON envelope's *outer shape* identical to today's text payload (a string) so existing parsers don't trip.

### Negative tests (server fault injection)
- Server returns wrong blob bytes for an `objectPath` → recipient's first chunk fails → UI shows tampered error.
- Server returns truncated blob → recipient's final-byte check fails → UI shows tampered error.
- Server swaps blob for a different message's blob → wrong-key failure (because nonceBase doesn't match the envelope's expectations) → UI shows tampered error.

### Test infra status
**No test runner is currently wired in this repo** (no `jest.config.js`, no `__tests__/`, no `npm test` script in `package.json`). Phase 2 implementation must include **either** (a) wiring `jest-expo` and `ts-jest` for server tests, **or** (b) at minimum a `scripts/test-e2ee.ts` that the dev runs by hand against a local instance. Tracked in `TODO.md`.

A placeholder Phase 1 test file is being added in this same prep step (`tests/e2ee/prekeyRotation.test.ts`) — currently it documents the test plan and will become executable once the runner lands.

---

## Resolved decisions (owner sign-off, 2026-05-21)

1. **Cipher: `nacl.secretbox` (XSalsa20-Poly1305).** Owner: "stay on nacl.secretbox — it's already in the project and the security margin vs XChaCha20-IETF isn't meaningful here. Don't introduce a new primitive just for media." Decision: no new dependency, no libsodium binding. The 24-byte nonce of XSalsa20 is the same size as XChaCha20; the only difference is the internal mixing schedule, which is irrelevant at our message volume. §3 is canonical.

2. **Multi-device fan-out: per-device session, not per-device-shared key.** Confirmed: each recipient device decrypts independently from its own Signal session. The sender encrypts the per-attachment media key (the JSON envelope containing it, really) **once per recipient device session** using the existing Signal `encryptMessage()` path — no new fan-out plumbing. This means a single attachment uploaded to GCS once is referenced by N envelopes (one per recipient device), each containing the same media key under a different Signal session. Storage cost on the server is O(1) per attachment + O(devices) on the envelope rows, which is what we already pay for text messages.

3. **Voice-note transcription: dropped from v1.** No server-side transcription. The existing `POST /api/messages/:id/transcribe` endpoint will be removed (or refused for media that has an encrypted envelope) as part of Phase 2. Client-side ML transcription is a later conversation, opt-in only, tracked in `TODO.md`.

4. **Story media: deferred to Phase 3, not indefinitely.** Phase 2 ships media encryption only. Phase 3 (immediately after) ships Stories with the locked decisions captured in `docs/stories/phase-3-design.md` (created in this same prep step):
   - Visibility: mutual contacts (WhatsApp/Signal model), no per-story audience picker in v1.
   - Expiry: per-story 1h / 24h / 7d, default 24h.
   - Encryption: re-uses Phase 2 primitives. Per-story symmetric key, fanned out to each recipient device via existing Signal envelope. No new crypto.
   - Server-side TTL deletion is verifiable: hard GCS delete, not a flag.
   - View receipts: encrypted, sender-only.
   - Replies-to-stories: route into the existing 1:1 DM, quoting the story.

5. **Plaintext-media migration: 60-day sunset, no migration.** Legacy `/objects/*objectPath` route stays readable for 60 days post-Phase-2 ship, then returns `410 GONE`. **14-day pre-cutover in-app notice** ("Media older than X will no longer be viewable after Y") shown as a one-time banner on the Chats screen. Tracked in `TODO.md`.

---

## Approved fixed parameters (do not change without re-review)

- AEAD: `nacl.secretbox` (XSalsa20-Poly1305). 24-byte nonce.
- Per-attachment random 32-byte key. Never reused, never derived from session state.
- Whole-blob ≤ 5 MB, chunked > 5 MB.
- Chunk size: 1 MiB plaintext per chunk.
- Header magic: `"SCM1"`. Version byte 0x01. Algo id 0x01.
- Max attachment size: 50 MB. Hard fail both client and server.
- Thumbnail key: HKDF-SHA512(mediaKey, salt=nonceBase, info="SecureConnect-Media-v1-thumb", L=32).
- Chat-list previews downgrade to "Photo" / "Video" / "Voice message" placeholders.
- New authenticated endpoint: `GET /api/media/encrypted/:objectPath`.
- Legacy public `/objects/*objectPath`: kept readable for 60 days post-Phase-2, then `410 GONE`.

---

## Build plan (owner-confirmed)

| Build | Contents |
|---|---|
| **61** | Apple compliance fixes (commit `fa821d0`) + Phase 1 E2EE hardening (commit `d01e9c1`). |
| **62** | Phase 2: media encryption + functional logout (with E2EE key wipe) + delete-account hardening (30-day grace, re-auth, GCS blob deletion, prekey + device cleanup) + dead-button audit fixes. |
| **63** | Phase 3: Stories (per `docs/stories/phase-3-design.md`). |

**Do not bundle 62 and 63.** Each ships on its own so any regression can be bisected cleanly.

---

## Sign-off status

- [x] Cipher choice (`nacl.secretbox`).
- [x] Max attachment size 50 MB.
- [x] Voice-note transcription: drop from v1, opt-in client-side ML later.
- [x] Chat-list thumbnails downgrade to placeholders.
- [x] Stories deferred to Phase 3 (with locked decisions in stub doc).
- [x] Plaintext-media: 60-day legacy readable, then 410, with 14-day in-app notice.
- [x] `TODO.md` rate-limit item is in scope for the Phase 2 server PR.
- [x] Build plan: 61 → 62 (Phase 2) → 63 (Phase 3), no bundling.

**All gates green. Phase 2 implementation kicked off 2026-05-21.**
