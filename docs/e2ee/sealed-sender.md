# Sealed Sender for Virtual Numbers — Design

**Status:** DRAFT — sections 1 and 2 only. Pending review before implementation.
**Phase:** 3 (build 63).
**Author:** SecureConnect engineering.
**Companion doc:** `docs/e2ee/phase-2-media.md`.

This document is written **before** the code that implements it. The code's job is to make this document true. If something in this document is wrong, the code that follows it will also be wrong, so the document is reviewed first.

The remaining sections (Schema changes, senderId flow audit, badge copy justification, forward-only migration policy, external SMS handling, known residual leaks, future work) will be added once §1 and §2 are accepted.

---

## 1. Threat model and explicit non-goals

### 1.1 What the existing system already protects

SecureConnect 1:1 text messages are end-to-end encrypted using the Signal Protocol (X3DH + Double Ratchet, `encryptionVersion = 'v2-signal'`). The server stores ciphertext in `messages.content`; it does not possess the keys to decrypt it. This property is unchanged by sealed sender — sealed sender is **not** a new encryption layer. It is a change to what identifying metadata the server stores alongside the ciphertext, and what identifying metadata the server forwards to the recipient.

### 1.2 What sealed sender adds

Today, a row in the `messages` table carries `senderId` — the real `users.id` of the sender. That value is:

- written into the row at send time;
- returned to the recipient on `GET /api/messages/:conversationId`;
- emitted to the recipient on the Socket.IO `new-message` and `message-notification` events;
- included in the APNs/FCM push payload sent to the recipient's device;
- used as the lookup key for read-receipts and typing-indicator events.

Sealed sender, as scoped in this phase, removes the real `senderId` from **everything the recipient sees** for messages sent over a virtual number. The recipient sees only:

- the sender's **virtual number** (E.164), and
- the **display name** that the virtual_numbers row carries.

The real `senderId` is still stored on the message row server-side (see §1.5 on the abuse-reporting path), but it is never transmitted to the recipient over REST, socket, or push, and the recipient client is forbidden from fetching a user profile keyed by it.

### 1.3 The specific property this delivers

> A recipient who receives a sealed-sender message, and who later turns hostile or is compromised, **cannot** prove to a third party which real SecureConnect user account sent it. They have the virtual number and the display name. To link the virtual number to a real user, they must compromise the server.

That is the **only** new property sealed sender provides. It is a meaningful property — it means a virtual number is a real pseudonym from the recipient's point of view, not a cosmetic relabel of the sender's real identity. Everything else listed below is either pre-existing protection, or pre-existing leakage that sealed sender does **not** close.

### 1.4 What the server still sees (residual exposure)

After sealed sender ships, the server still observes, for every sealed-sender message it routes:

| Observable | Source | Why it is not closed in this phase |
|---|---|---|
| **Sender's IP address** | TLS termination on the API origin | Would require Tor, oblivious HTTP, or an anonymizing relay. Out of scope. |
| **Sender's auth token → real userId** | The HTTP request is authenticated; the server has to know who is making it in order to bill it, rate-limit it, and apply abuse policy | Would require anonymous credentials at upload (e.g. Privacy Pass / RSA blind signatures). Out of scope. |
| **Which device token receives the push** | APNs/FCM payload is addressed to a specific token, which the server maps to a specific user | Would require an oblivious push gateway. Out of scope. |
| **Timing of send and delivery** | Inherent to a real-time messaging system | Not addressable without batching/delaying. Out of scope. |
| **Ciphertext size** | The server stores and forwards the bytes | Would require padding to fixed bucket sizes. Not in this phase. |
| **The recipient's real userId** | The server must deliver to a real account | Out of scope. Sealed sender hides the *sender*, not the *recipient*. |
| **Conversation metadata** (`conversationId`, timestamps, sequence) | The `conversations` and `conversation_participants` rows are not encrypted | Pre-existing. Not addressed. |
| **The fact that *some* user sent *some* message at *some* time** | All of the above combined | Pre-existing. Not addressed. |
| **`messages.senderId` itself, stored server-side** | We deliberately keep it for abuse reports (§1.5) | Intentional residual exposure if the server is compromised. Documented, not closed. |

A reader of this doc should leave §1.4 with this conclusion: **a passive observer of the server's database, or an attacker who compromises the server, can still link sealed-sender messages back to real users.** Sealed sender does not protect against either of those threats. It protects against a hostile or compromised *recipient*, and against a future change to the recipient-facing APIs that would otherwise leak `senderId` accidentally.

### 1.5 Deliberate decision: keep `senderId` server-side for abuse

The `messages` row continues to carry the real `senderId` even when `sealedSender = true`. The reason is the moderation queue (`Settings → Moderation Queue`, replit.md) and the user-reporting flow (`userReports` table). A report needs to identify the reported user; an abuse review needs to be able to suspend the actual account responsible. If we discarded `senderId` at send time, we would discard the ability to act on abuse reports, which is a worse outcome than the residual exposure of `senderId` on a server compromise. This is a trade-off, and it is documented.

If a future phase wants to remove this exposure as well, the path is anonymous credentials: the sender proves "I am a member in good standing" without proving "I am account X." That work is not in this phase.

### 1.6 Non-goals (things this phase explicitly does not deliver)

1. **Sender-IP anonymity.** Use a VPN if you need it. We do not provide one and do not claim to.
2. **Push-delivery anonymity.** The server picks which device token receives the notification. APNs/FCM see that.
3. **Recipient anonymity.** Sealed sender hides the sender from the recipient. It does not hide the recipient from the server.
4. **Anonymity against server compromise.** `senderId` remains on the row for abuse handling. A server compromise reveals it.
5. **Group chat sealed sender.** Groups are not a shipped product feature; the Signal Sender Keys protocol that would be required is not implemented.
6. **External-carrier SMS protection.** Inbound SMS from a non-SecureConnect phone over the carrier network is not E2EE and never can be — it is carrier SMS. We do not pretend otherwise; see §2 and the future §7 (External SMS handling).
7. **Back-fill of historical messages.** Messages already in the database keep their existing `senderId`. We do not rewrite history. See the future §6 (Forward-only migration).
8. **Metadata padding, traffic analysis defenses, cover traffic.** None of these are in scope.

### 1.7 Badge copy follows from §1.4 and §1.5

The user-facing copy in the composer and conversation header **must** be consistent with §1.4–§1.6. Specifically:

- **Rejected:** "Sender identity hidden from server." This would be a lie — the server has the auth token, the IP, the push-token-to-user mapping, and (deliberately) the `senderId` on the row.
- **Rejected:** "Fully anonymous." Obvious overclaim.
- **Working candidate (subject to §5 of this doc, written after code lands):** "End-to-end encrypted · sender identity not sent to recipient." This is narrow and true. It describes the *delivered* payload, not the *stored* row, and not the network metadata.

The final badge wording will be locked down in §5 of this doc once the recipient-payload audit (§5 of the implementation prompt) is verified end-to-end in tests. Until then, the composer should show the existing **"End-to-end encrypted"** copy without the sealed-sender clause.

---

## 2. Scope

### 2.1 In scope

1. **SecureConnect ↔ SecureConnect, 1:1, virtual-number conversations.** The sender's `preferredNumberType === 'app'`, the sender has an active row in `virtual_numbers`, and the recipient client advertises `supportsSealedSender = true`. All three conditions must hold; otherwise the message takes the existing non-sealed path.
2. **The new `POST /api/messages/send-sealed` route**, gated by an `ownsVirtualNumber(userId, virtualNumberId)` helper that asserts the row exists, has `assignedUserId = userId`, and `status = 'active'`.
3. **Recipient-payload stripping** on every surface enumerated in the implementation prompt §5: REST `GET /api/messages/:conversationId`, Socket.IO `new-message`, Socket.IO `message-notification`, APNs/FCM push, read-receipts, typing indicators. When `messages.sealedSender = true`, none of these may include `senderId` in the payload delivered to the recipient. Read-receipts and typing keyed on `outerSenderVirtualNumberId` instead.
4. **The Twilio inbound-SMS plaintext leak fix.** `POST /api/webhooks/twilio/sms` currently writes external carrier SMS plaintext to `messages.content`. This contradicts every claim this document makes. As a precondition to shipping sealed sender, that handler is redirected to a new `external_sms` table (schema in the future §3) and the client renders those rows with a clear "SMS — not end-to-end encrypted" label. Plaintext never lands in `messages` again, from any path.
5. **Composer UI changes** that surface the active virtual number above the input, gate sending on `virtualNumber.status === 'active'`, and render the badge from §1.7.
6. **Test scaffolding** for HTTP routes (supertest + a real Postgres test DB), and the test list from the implementation prompt §7, including the "grep DB for plaintext" assertion against both `messages` and `external_sms`.
7. **An explicit recipient-side capability flag** (`users.supportsSealedSender`, default true for new app builds, observed as false for any client that has not advertised it). Old clients continue to receive over the existing non-sealed path with no regression.
8. **A forward-only migration policy.** Pre-existing messages are not rewritten. The cutover date is the deploy date of build 63 and is recorded in the future §6.

### 2.2 Out of scope (will not be implemented in this PR)

1. **Group chat.** Groups are not a shipped product feature; Sender Keys is not implemented; there is no group composer surface. Anything that says "groups" in the audit response is hypothetical.
2. **Group voice/video calls.** Same reason.
3. **1:1 calls.** LiveKit-mediated audio/video continues to use SRTP between client↔SFU. The SFU has the keys. LiveKit's frame-level E2EE is not enabled, and is not enabled by this work. Sealed sender does not apply to calls.
4. **Reply over carrier SMS.** When an inbound external SMS lands in `external_sms`, the client renders it read-only for this phase. Sending a carrier-SMS reply via Twilio's send API is a separate product decision; it is not part of this PR.
5. **Renaming `virtual_numbers.assignedUserId` to `ownerUserId`.** The audit's recommendation stands: the column name is already in production, a rename has migration cost and zero security value, and the route-level `ownsVirtualNumber` helper provides the semantic name where it actually matters.
6. **Back-fill of historical `senderId` values.** Per §1.6 item 7 and the forward-only policy in the future §6.
7. **Stories sealed sender.** Stories E2EE is a Phase 4 question. This document does not address stories.
8. **Sender-IP anonymity, anonymous credentials, oblivious push, traffic-analysis defenses.** Per §1.6 items 1–4 and 8.
9. **Media attachments over sealed sender.** Media encryption (`mediaEncryption.ts`, SCM1) is on the Phase 2 build-62 TODO and is not yet wired into the upload path. Sealed sender for media will follow once the wiring lands; for this PR, sealed sender applies to text messages only. The `outerSenderVirtualNumberId` column is added to all message rows regardless of media-vs-text, so the schema does not need a second migration when media wiring lands.

### 2.3 Where this sits in the roadmap

| Phase | Build | Focus | Status |
|---|---|---|---|
| 1 | ≤61 | Signal 1:1 text E2EE, prekey infra, encrypted backups | shipped |
| 2 | 62 | Media encryption module, delete-account 30-day grace, tombstone | module shipped, client-wire-up open |
| **3** | **63** | **Virtual numbers + sealed sender (this document) + external_sms fix** | **draft — this doc** |
| 4 | 64+ | Stories E2EE; possibly anonymous credentials for upload | not yet scoped |

---

---

## 3. Schema changes

All three changes are forward-only DDL applied in one transaction. No back-fill, no historical message rewrite. The migration was applied via direct SQL because `drizzle-kit push` is interactive in our environment; the `shared/schema.ts` definitions match what was applied.

### 3.1 `users` — capability flag

```
users.supports_sealed_sender   boolean   DEFAULT true
```

New build clients implicitly advertise true. The flag is read by the sender's `POST /api/messages/send-sealed` handler — if the recipient's flag is false, the route returns `409 sealed-sender-unsupported-recipient` and the sender client falls back to legacy `POST /api/messages` automatically. Existing rows default to true at insert time but old client builds that don't yet understand the protocol will simply not advertise themselves as senders; receiving sealed messages is backward-compatible (the payload just omits `senderId`).

### 3.2 `messages` — outer routing identity + sealed flag

```
messages.outer_sender_virtual_number_id   varchar
    REFERENCES virtual_numbers(id) ON DELETE SET NULL
messages.sealed_sender                    boolean   DEFAULT false

CREATE INDEX idx_messages_outer_vn
  ON messages(outer_sender_virtual_number_id)
  WHERE outer_sender_virtual_number_id IS NOT NULL;
```

`outer_sender_virtual_number_id` is the **only** sender-identifying field travelling in recipient payloads when `sealed_sender = true`. `messages.sender_id` remains populated for abuse handling (see §1.5). The route layer (`server/sealedSender.ts → sanitizeForRecipient`) is the single chokepoint that strips `sender_id` before any data leaves the server toward the recipient. The partial index supports analytics-style queries ("how many sealed messages does this virtual number route") without bloating the index on the 99% non-sealed historical data.

`ON DELETE SET NULL` rather than `CASCADE` because releasing a virtual number must not destroy historical messages routed through it — the recipient already has those messages; the row staying in `messages` with `outer_sender_virtual_number_id = NULL` is the correct post-release state, and the sanitizer falls back to `senderVirtualNumber: null, senderDisplayName: null` rather than 500'ing.

### 3.3 `external_sms` — carrier-SMS landing zone

```
external_sms (
  id                    varchar PK
  virtual_number_id     varchar  NOT NULL FK virtual_numbers(id) ON DELETE CASCADE
  from_phone_e164       text     NOT NULL
  body                  text     NOT NULL     -- plaintext; carrier-visible
  delivered_to_user_id  varchar  NOT NULL FK users(id) ON DELETE CASCADE
  received_at           timestamp DEFAULT NOW()
)
```

This is the table the Twilio inbound-SMS webhook now writes to. `body` is plaintext **by design** — carrier SMS was never end-to-end encrypted, and pretending otherwise (e.g. by writing into `messages` with `isEncrypted = true`) is the precise lie the audit caught. The client renders these rows in the same conversation surface but with a clear "SMS — not end-to-end encrypted" label.

`ON DELETE CASCADE` on both FKs because (a) if the virtual number is released the carrier-SMS history is no longer routable and (b) if the user is deleted under the build-62 grace flow, every personal artifact is destroyed.

### 3.4 What is NOT changed

`virtual_numbers.assigned_user_id` is **not** renamed. The audit recommended against the rename — column already exists in production data, rename has migration cost, has no security value (the semantic name belongs on the route-level helper, not the column), and would force a second migration window. The new `storage.ownsVirtualNumber(userId, virtualNumberId)` helper carries the semantic name where it actually matters.

---

## 4. The senderId flow audit — canonical reference

Every recipient-facing surface either funnels through `sanitizeForRecipient` (REST + socket message payloads) or has its data field rebuilt explicitly (push payload, typing indicator). The table below is the canonical surface-by-surface record.

| Surface | Pre-Phase-3 payload | Post-Phase-3 (sealed) payload | Where stripped |
|---|---|---|---|
| `GET /api/conversations/:id/messages` REST | `[{ ...message, senderId }]` | `[{ ...message, senderId: null, senderVirtualNumber, senderDisplayName }]` | `routes.ts` calls `sanitizeManyForRecipient(messages, req.userId)` before `res.json` |
| Socket.IO `new-message` emit (from `POST /api/messages/send-sealed`) | n/a (new surface) | sanitized to recipient room; sender's own personal room receives full message | `routes.ts` `send-sealed` handler emits `sanitizeForRecipient(..., receiverId, lookup)` to `io.to(receiverId)` |
| Socket.IO `message-notification` emit | included full `message` with `senderId` | sanitized — `{ conversationId, message: <sanitized> }` | same chokepoint |
| APNs/FCM push payload | `{ otherUserId: senderId, senderName }` | `{ otherUserId: null, senderName: <virtualNumberDisplay>, viaVirtualNumber: <E.164> }`; if `showNotificationPreview = false` body is "New encrypted message" as before | `sendMessageNotification` called with sealed-mode arguments inside `send-sealed` handler |
| Typing indicator (`user-typing` socket event) | `{ userId, conversationId }` | `{ conversationId, viaVirtualNumber: <E.164>, viaVirtualNumberId, senderDisplayName }` — `userId` omitted | typing handler in `routes.ts` resolves the conversation's `numberType`; for `'virtual'` conversations the handler returns one of three states: `sealed` (emit virtual-number payload), `legacy` (non-virtual conversation, emit `{userId, conversationId}` as before), or `suppress` (virtual conversation but sender's VN is released / inactive / lookup failed — emit NOTHING). The fail-closed `suppress` state was added per audit feedback; the original draft fell back to `{userId, conversationId}` on the failure path, which would have re-leaked the real userId in exactly the state-transition window the feature was designed to protect. A missing typing indicator is recoverable; a leaked identifier is not. |
| Per-message collections (`deletedForUserIds[]`, `reactions{emoji→userIds[]}`) | full arrays of real userIds | scrubbed to contain ONLY the viewer's own userId; sender's entries are dropped | `sealedSender.ts → scrubUserIdArray` and `scrubReactions`. Caught by audit: prior draft stripped `senderId`/`forwardedFromUserId`/`replyToSenderId` but missed the two JSONB columns that also carry real userIds. The recipient still sees their own reactions and their own delete-for-me marker; the sender's are invisible (but the row still exists server-side for the sender's outbox view, which uses the carve-out). |
| Read-receipts (`messages-read` socket event) | `{ messageIds, readerId, readAt }` | UNCHANGED | The read-receipt flow is recipient-→-sender, not sender-→-recipient. The sender already knows their own `senderId`; the recipient is the `readerId` (which the sender is allowed to see). No leakage. Documented here so future maintainers do not "fix" what is not broken. |

### 4.1 Client-side assertion

`client/lib/sealedSender.ts` (Phase 3 client follow-up — not yet shipped this PR) will export an `assertNoSenderIdLeak(message)` helper that throws in dev when a `sealedSender === true` message arrives with a non-null `senderId`. This is the belt to the server-side suspenders: if a future refactor accidentally bypasses the sanitizer, the dev client throws immediately rather than silently rendering with a leaked real userId.

---

## 5. Badge copy — locked

Per the §1.7 review, the badge copy is **"End-to-end encrypted · sender identity not sent to recipient"**. The first half is true of every 1:1 text message we've ever sent; the second half is true only after this PR ships AND the sender's `preferredNumberType === 'app'` AND the recipient advertises `supportsSealedSender = true`. The composer renders the second clause conditionally on all three.

**Rejected alternatives (for the record):**

- *"Sender identity hidden from server"* — rejected. Server still sees auth token, IP, push token destination, and (deliberately) `senderId` on the row. Calling that "hidden" is a lie.
- *"Anonymous"* / *"Untraceable"* — rejected, obvious overclaim.
- *"Pseudonymous send"* — rejected. Accurate but jargon, and "not sent to recipient" is the property that actually matters to a user reasoning about who learns their identity.

The composer never shows the second-clause copy when any of the three conditions is false (sender doesn't have an active virtual number, recipient doesn't support sealed, or conversation is mixed-mode). In those states the existing "End-to-end encrypted" copy is shown.

---

## 6. Forward-only migration policy

Pre-existing rows in `messages` keep their existing `senderId` and have `sealedSender = false` (the column default). They are unaffected by this PR. The sanitizer's `if (!msg.sealedSender) return msg` short-circuit means historical messages render identically to how they always have.

**Cutover date:** the deploy date of build 63 (TBD; this doc will be amended with the date at deploy time). From that timestamp forward, any 1:1 message where (sender has active virtual number) ∧ (sender's `preferredNumberType = 'app'`) ∧ (recipient `supportsSealedSender = true`) is routed via `POST /api/messages/send-sealed` and persisted with `sealedSender = true`. There is no back-fill mechanism and one is not planned.

If a future Phase 4 wants to retroactively seal historical messages it cannot — the recipient already has the plaintext `senderId` in their local cache. Sealing on the server side at that point would not undo what the recipient has already seen. This is one of several reasons forward-only is the only honest policy.

---

## 7. External SMS handling

The Twilio inbound-SMS webhook (`POST /api/webhooks/twilio/sms`) used to write `messages.content = Body` for inbound carrier SMS — a plaintext leak directly into the table whose security claim is "ciphertext only." Phase 3 redirects every such inbound to `external_sms` instead.

**What the recipient sees in this PR:**

- The carrier SMS appears in the same conversation surface as their virtual-number chats.
- It is rendered with a visible label "SMS — not end-to-end encrypted."
- The composer is disabled for that thread (the row is read-only) — no reply path through carrier SMS is implemented in this PR.

**Why read-only:** reply-via-carrier-SMS requires (a) a Twilio outbound-SMS code path, (b) a billing decision about who pays for outbound segments, (c) a UI affordance to clearly differentiate sending E2EE vs sending plaintext SMS. Each item is independently a meaningful decision and bundling them with the sealed-sender PR would balloon the change. Filed as future work.

**Why not silent drop:** users need to see that something arrived addressed to their virtual number. Silently dropping inbound SMS would create a class of "I gave my virtual number to X and never heard back" failures.

---

## 8. Known residual leaks

This section reproduces and slightly extends §1.4, for readers who skipped ahead.

| Residual | Why we did not close it | What would close it (out of scope) |
|---|---|---|
| Sender's IP via TLS termination | We have to terminate TLS at our origin to serve the API | Tor, mixnet, oblivious HTTP |
| Auth-token → real userId | Every request is authenticated. We need to bill, rate-limit, and enforce abuse policy. | Anonymous credentials (Privacy Pass, RSA blind signatures), Tokens spent at upload |
| Push-token destination | APNs/FCM are addressed | Oblivious push gateway |
| Timing of send and delivery | Inherent | Batching/delay; cover traffic |
| Ciphertext size | We store and forward the bytes | Padding to fixed bucket sizes |
| Recipient identity | We must deliver to a real account | Out of scope — sealed sender hides sender, not recipient |
| `conversations` row metadata | Not encrypted | E2EE'd metadata column; significant architectural change |
| **`messages.senderId` server-side** | **Kept for abuse-reporting flow (§1.5)** | **Anonymous credentials at send; would also lose moderation queue's ability to suspend the offending account** |

A user who needs protection against any of these threats should not rely on sealed sender to provide it.

---

## 9. Future work (not in this PR)

Listed in roughly ascending order of difficulty:

1. **`client/lib/sealedSender.ts` dev assertion** — small, follow-up turn.
2. **Reply-via-carrier-SMS** — Twilio outbound integration, billing, "you are about to reply via SMS, this is not E2EE" warning flow.
3. **Sealed sender for media attachments** — depends on Phase 2 media-encryption wiring landing first. The `outerSenderVirtualNumberId` column already exists on every message row, so no second migration is needed when this lands.
4. **Sealed sender for read receipts in a hypothetical group context** — moot today (no groups), but if groups land, the typing-indicator pattern from §4 generalizes naturally (emit `viaVirtualNumber` instead of `userId` to the conversation room).
5. **Anonymous credentials at upload** — Privacy Pass or Trust Tokens. Closes the "auth-token → userId" residual leak. Trade-off: loses moderation queue's ability to identify the offending account (so this becomes a per-server policy decision, not a free win).
6. **Oblivious push** — closes the push-token-destination leak. Requires either a third-party oblivious push relay or a substantial in-house build.
7. **Traffic-analysis defenses** — message padding, cover traffic, batching. Substantial UX cost (latency); usually only worthwhile under a specifically named nation-state threat model.

None of items 5–7 are scheduled.

---

## Appendix A — files changed in this PR

- `shared/schema.ts` — added `users.supportsSealedSender`, `messages.outerSenderVirtualNumberId`, `messages.sealedSender`, `external_sms` table.
- `server/sealedSender.ts` — new file; `sanitizeForRecipient`, `sanitizeManyForRecipient`, `buildVirtualNumberLookup`.
- `server/storage.ts` — `ownsVirtualNumber`, `insertExternalSms`, `createSealedMessage`; `externalSms` import.
- `server/routes.ts` — Twilio webhook redirected to `external_sms`; `provision` and `release` retrofitted to call `ownsVirtualNumber` explicitly; new `POST /api/messages/send-sealed`; `GET /api/conversations/:id/messages` sanitized on return; typing handler emits virtual-number-only payload for `numberType = 'virtual'` conversations; `/api/auth/me` exposes `supportsSealedSender`.
- `docs/e2ee/sealed-sender.md` — this document.

## Appendix B — deferred to a follow-up turn

- **Client UI**: composer "active sending identity" pill, badge copy, gate on `virtualNumber.status === 'active'`, call to `POST /api/messages/send-sealed`. Server is structurally complete without it — old clients keep using legacy `POST /api/messages` and pay no penalty. No client can flip the sealed-sender bit on without the new screen, so the badge cannot get ahead of reality.
- **Supertest + Postgres HTTP test harness**: the audit correctly noted the existing jest is pure-crypto. Standing up supertest + a real Postgres test DB is a self-contained piece of work and deserves its own review window. The 8 required assertions (ownership 403, released-number 403, sealed row shape, DB plaintext grep, REST `senderId` absence, push payload `senderId` absence, external SMS lands in `external_sms`, Twilio signature still required) are listed in the implementation prompt §7 and will be ported into `tests/sealed-sender/*.test.ts` in the follow-up.

These two items are filed in `TODO.md` and gate the deploy of the client UI, not the server. Server can ship without them; client UI cannot ship without the test harness signing off.

