# Phase 3 — Stories (Design Stub)

**Status:** Stub. Locked decisions captured below. Full design expands once Phase 2 ships.
**Last updated:** 2026-05-21.
**Depends on:** Phase 2 media encryption primitives (`docs/e2ee/phase-2-media.md`).

This document is intentionally a stub. Its purpose is to lock in the architectural decisions made during Phase 2 prep so that when Phase 3 implementation starts (immediately after build 62), there is no re-litigation of what the product is. **Do not write Stories code in Phase 2.** The existing v1.0.5 stories functionality (`replit.md`'s "Stories Privacy & Receipts" + "Story Analytics") remains in place and continues to operate against plaintext media on GCS during Phase 2.

---

## Locked decisions (owner sign-off, 2026-05-21)

### Visibility
- **Mutual contacts only.** WhatsApp / Signal model.
- No per-story audience picker in v1. The existing privacy modes ("Everyone / My Contacts / Contacts Except / Only Share With") from v1.0.5 will be **simplified to "Mutual Contacts" only** in Phase 3 to align with this decision. The existing UI is preserved as a fallback for users who already configured exceptions, but new audience picker entry points are removed.
- This is a deliberate scope reduction from the current build to make the trust model match the cryptography: encrypted-for-recipients only works cleanly when the recipient list is unambiguous.

### Expiry
- Per-story TTL chosen by the author at post time: **1 hour / 24 hours / 7 days**.
- **Default 24 hours** (matches current behavior, avoids surprising users).
- Server-side TTL is **verifiable**: the sweep job hard-deletes the GCS object and the encrypted envelope row when the TTL elapses. Not a soft-delete flag, not a `deletedAt` column we forget to query — a real `DELETE FROM` + GCS `delete()` call, with the deletion logged.

### Encryption
- **Re-uses Phase 2 primitives exactly.** No new cipher, no new format, no new header.
- Per-story symmetric key (32 bytes random), wire format `"SCM1"`, XSalsa20-Poly1305, chunked >5 MB, etc. See `docs/e2ee/phase-2-media.md` §3.
- **Fan-out via existing Signal envelope:** the sender Signal-encrypts the story's JSON envelope (`{mediaKey, nonceBase, mediaType, mimeType, durationMs, thumbnailUrl, expiresAt}`) once per recipient device, exactly the same way Phase 2 media messages do. No new crypto plumbing.
- Thumbnail key derived via HKDF subkey (same `info="SecureConnect-Media-v1-thumb"` string as Phase 2). Stories share the v1 wire format — no `"STR1"` magic.

### View receipts
- **Encrypted, sender-only.** A view receipt is a tiny Signal-encrypted message back to the author from the viewer containing `{storyId, viewedAt, watchDurationMs, completed}`.
- The server stores the ciphertext blob keyed by `(storyId, viewerId)` but cannot read its contents. The story author's client decrypts and aggregates locally to render the analytics card (Views / Completed % / Avg watch) that exists today in v1.0.6.
- Bidirectional toggle from v1.0.5 is preserved: if the viewer has "View Receipts" off, the client skips emitting the encrypted receipt. The server has no way to tell the difference between "off" and "viewer is offline."

### Replies-to-stories
- A reply opens the existing 1:1 DM thread with the author.
- The replying message includes a **quoted-story preview block** (same shape as the existing `replyToMessageId` / `replyToPreview` mechanism from v1.0.5, but the `replyTo` references a story instead of a message).
- The quoted preview is **encrypted** — the recipient (the story author) decrypts the preview from the reply envelope. The server stores it as an opaque ciphertext.
- No new public preview surface. No "X replied to your story" in any list other than the conversation itself.

---

## Implications for Phase 2

These are concrete things Phase 2 must **not** preclude:

1. **Wire format `"SCM1"` must accept story envelopes.** No story-specific header bits. Phase 2 chunk format = Phase 3 chunk format.
2. **`GET /api/media/encrypted/:objectPath` must be reusable** for stories. The auth check must be parameterized by "is the requester a participant of the message conversation OR a recipient of the story" rather than hardcoded to messages-only. Phase 2 will land a function `canAccessEncryptedObject(userId, objectPath)` that initially only handles the messages case; Phase 3 extends it to handle the stories case without changing the route shape.
3. **HKDF info strings are versioned `v1`.** Phase 3 will not use a different version. If we ever need a different KDF for stories, we bump to `v2` and document why.
4. **GCS object naming:** Phase 2 uses opaque UUID object keys under `.private/`. Phase 3 will use the same naming. Do not introduce a `stories/` subtree.

---

## Open questions for Phase 3 (resolve before Phase 3 implementation starts)

These do NOT need to be resolved before Phase 2 ships, but document them now so they don't get lost.

- **Multi-recipient fan-out cost:** A single story posted to N mutual contacts requires N Signal-envelope encryptions (one per recipient device). For users with 500+ mutual contacts × ~2 devices each, this is 1,000 ratchet steps on post. Acceptable on modern phones; needs a progress UI on lower-end Android. Decide: synchronous post-then-render, or background-queue + optimistic UI?
- **View receipt deduplication:** A viewer who watches a story 5 times sends 5 encrypted receipts. Server-side dedup is impossible (ciphertext is opaque). Client-side dedup is needed before the receipt aggregator card is correct. Decide: client emits at most one receipt per (story, viewer) per 24h, or server stores all and the author's client de-dups?
- **Migration of existing v1.0.5/v1.0.6 plaintext stories:** Same model as Phase 2 plaintext media. Tracked in `TODO.md` under the legacy-media cutover.
- **Sticker / GIF stories:** out of scope. Public CDN URLs, not private. Same model as in-message stickers.
- **Replies to expired stories:** if the recipient opens an expired story link in their DM, the preview shows "This story has expired." The reply itself remains visible.

---

## Test plan stub (expand for Phase 3)

- Roundtrip: A posts story → B (mutual contact, two devices) decrypts both copies → bytes equal original.
- Visibility: C (not a mutual contact) cannot fetch the encrypted object even if they discover the object path. Server returns 403.
- TTL: post a 1h story → wait → confirm GCS object is gone (not just row flag).
- View receipts honor both ends' toggles (already tested in v1.0.5 — re-run).
- Replies: A posts story → B replies → A's DM thread shows quoted-story preview with the right thumbnail.

---

## Out of scope for Phase 3

- Story reactions (emoji on a story bubble). Phase 4 maybe.
- Story re-share to another contact. Out of scope indefinitely — friction is the feature.
- Public profile stories. SecureConnect is a private messenger; we do not have public profiles.
- Cross-post to other networks. Never.
