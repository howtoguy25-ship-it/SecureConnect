# Phase A — Sealed-sender client UI (build 63)

Phase A turns the sealed-sender badge **on** for the client. The server
chokepoint (`POST /api/messages/send-sealed`) and the 8-assertion
integration harness landed in build 63. This phase wires the React
Native composer to call that chokepoint, surfaces the locked
"sender identity not sent to recipient" state in the UI, and proves —
with rendered JSON — that no sender identifier leaks to the recipient.

Out of scope: groups, encrypted media (Phase B), encrypted call
signaling (Phase C).

## 1. What changed

### Server (additive only, no schema migration)

- `GET /api/auth/me` now returns `virtualNumberId`, `preferredNumberType`,
  and a joined `virtualNumber: { id, phoneNumber, status, countryCode } | null`
  block. The composer reads `virtualNumber.status` to gate the send
  button when the VN is released/suspended.
- `GET /api/users/:userId/contact-info` now returns
  `supportsSealedSender`. The sender reads this to decide whether the
  recipient is on a new build (call `/send-sealed`) or an old build
  (call `/api/messages`). Defaults to `true` when the column is null.

### Client

- `client/lib/api-utils.ts` — `User` type gains
  `supportsSealedSender?: boolean` and `virtualNumber?: { ... } | null`.
- `client/lib/sealedSender.ts` — **new module**. Single source of
  truth for the sealed-vs-legacy branch:
  - `checkSealedSenderEligibility({ currentUser, recipientSupportsSealedSender })`
    returns `{ eligible, reason }`. The four blocking reasons match the
    server-side gate exactly (not-app-mode, no-virtual-number,
    virtual-number-inactive, recipient-unsupported).
  - `sendSealedMessage(payload)` POSTs to `/api/messages/send-sealed`.
    On HTTP 409 (`sealed-sender-unsupported-recipient`) it returns
    `{ fallbackToLegacy: true }` so the caller silently retries the
    legacy route — the recipient's old build is never left with an
    unreadable bubble.
  - `assertNoSenderIdLeak(message, context)` is a `__DEV__`-only
    assertion. It throws if any code path reads `senderId` from a
    sealed message the user did NOT send. The `isOwn === senderId === user.id`
    ownership comparison is safe (`null === user.id` is `false`), so we
    do **not** wrap it.
- `client/screens/ConversationScreen.tsx`:
  - `handleSend` now branches via `checkSealedSenderEligibility`.
    Eligible non-reply messages go through `sendSealedMessage`. Replies
    fall through to `/api/messages` because the sealed route does not
    accept `replyToSenderId` (passing it would re-introduce the
    identifier the route exists to strip).
  - A new identity surface above the composer renders **only in app
    mode**. Three states:
    1. Active VN + recipient supports sealed → lock badge +
       "End-to-end encrypted · sender identity not sent to recipient".
    2. Active VN + recipient on old build → lock badge +
       "End-to-end encrypted".
    3. Inactive VN (released/suspended) → amber banner +
       "Your virtual number is not active. Sending is disabled until
       it is restored." Every composer entry point (text send,
       attachment, camera, voice) is gated by `guardVnInactive` so
       "disabled" is true across the board, not just the send button.
  - **Decrypt fix** in `decryptMessageAsync`. Sealed-recipient messages
    carry `senderId: null`, which made the previous Signal session
    lookup fail silently. The peer in a 1:1 chat is unambiguous, so
    the code now falls back to `otherUserId` when `senderId` is null.
    A `__DEV__`-only `assertNoSenderIdLeak` guard fires if the server
    ever ships a sealed message with a non-null `senderId` (server
    regression detector).
  - **Text-like flows routed through sealed sender.** Location share
    and contact-card share are text-shaped messages (`signalEncrypt` →
    `enc.ciphertext`), so they now use the shared `sendTextLikeMessage`
    helper, which applies the same eligibility + 409 fallback as the
    text composer. Without this fix the identity badge would have
    been **lying** for those two entry points — the message would
    still have carried `senderId` to the recipient. Encrypted media
    upload (`E2EE_MEDIA_ENABLED`) and legacy media (image) remain on
    `/api/messages` — they're explicitly Phase B scope.

## Phase B — sealed sender for encrypted media

Phase B closes the last identity-leaking surface for 1:1 sealed chats:
encrypted media bubbles (image / video / audio). The header line is
short: **the message-row is text-shaped**, so we route media through
the same `/api/messages/send-sealed` endpoint as text and reuse the
sanitizer with zero server changes.

### Why this works with no new server code

`uploadAndSendMedia` (in `ConversationScreen.tsx`) already follows the
SCM1 contract:

1. Generate a fresh per-file `mediaKey`, encrypt the file bytes, upload
   the ciphertext to GCS (`/api/objects/upload` → signed PUT → normalize
   via `/api/objects/media`).
2. Build the envelope text `__SC_MEDIA_V1__{path,mk,mediaType,size}`.
3. Run that envelope text through `signalEncrypt(...)` — same Signal
   Protocol path as text.
4. POST `{content: outgoing.ciphertext, ...}` to the messages route.

In step 4 the server sees opaque ciphertext. It never knows there's
media inside — `mediaUrl`, `mediaType`, the GCS path, and the per-file
mediaKey are all inside the encrypted body. So pointing step 4 at
`/api/messages/send-sealed` instead of `/api/messages` is the only
change required; the existing `sanitizeForRecipient` strips `senderId`
exactly like a text bubble.

### Client change

- `client/screens/ConversationScreen.tsx` — `uploadAndSendMedia` (the
  `E2EE_MEDIA_ENABLED` branch, around L1198) now calls the shared
  `sendTextLikeMessage(enc, null)` helper instead of POSTing directly
  to `/api/messages`. Same eligibility check + 409 sentinel fallback
  + legacy POST as text / location / contact-card. The local cache
  prime (`decryptCacheRef`, `decryptedMediaUris`) is unchanged.

### Stop-gate — Phase B recipient payload (sealed media)

Captured live from the integration harness
(`[PHASE_B_STOP_GATE] recipient_payload=`):

```json
{
  "id": "ae3c3c92-b72b-435b-8fb4-3ff822036d99",
  "content": "U0NNRURJQVZFTk9QQVFVRUNJUEhFUlRFWFQ=",
  "mediaUrl": null,
  "mediaType": null,
  "isEncrypted": true,
  "encryptionVersion": "v2-signal",
  "sealedSender": true,
  "outerSenderVirtualNumberId": "d8aa1258-6b98-44fb-987e-9d552e39f15a",
  "senderId": null,
  "forwardedFromUserId": null,
  "replyToSenderId": null,
  "deletedForUserIds": [],
  "reactions": {},
  "senderVirtualNumber": "+1500TEST82973373",
  "senderDisplayName": "Sender Display"
}
```

Asserted by the harness:
- `senderId === null`
- `replyToSenderId === null`
- `forwardedFromUserId === null`
- `mediaUrl === null` (server stored zero plaintext media metadata)
- `mediaType === null`
- `senderVirtualNumber` is the VN's phoneNumber, not the sender's
- `JSON.stringify(payload).includes(sender.id) === false`

### Phase B hardening — broken access control + cold-start window

Two architect-flagged issues fixed alongside the media routing change:

**Server authz on `/api/messages/send-sealed`** (`server/routes.ts`,
~L1602):
- Sender must be a participant in `conversationId`
  (`isConversationParticipant`).
- Receiver must also be a participant in that row (no message
  injection into a stranger's inbox addressed to a non-participant).
- Self-send rejected.
- Conversation must be `numberType: "virtual"` — sealed sender is
  1:1 virtual-only, and personal-mode rows have no VN to substitute
  for the stripped `senderId`.
- New tests cover all four cases: sender-not-participant → 403,
  receiver-not-participant → 400, self-send → 400, personal-mode → 400.

**Cold-start capability window** (`client/lib/sealedSender.ts` +
both send paths in `ConversationScreen.tsx`):
- `checkSealedSenderEligibility` now returns a 3-way reason:
  `false → "recipient-unsupported"` (caller may fall back to legacy),
  `undefined → "recipient-capability-unknown"` (caller must NOT fall
  back; must resolve capability first), `true → eligible`.
- New `fetchRecipientCapability(userId)` does a one-shot
  `/api/users/:id/contact-info` lookup; returns `undefined` on
  network/5xx so the caller can fail closed.
- Both `handleSend` and `sendTextLikeMessage` resolve unknown
  capability synchronously, then **fail closed** if it's still
  unknown — they alert "Connection issue" and abort rather than
  downgrading to legacy. This closes the original first-message leak
  window where capability hadn't loaded yet.
- The fail-closed gate is restricted to `preferredNumberType === "app"
  && !vnInactive` (personal-mode and inactive-VN users were never
  eligible anyway) and exempts replies (which are legacy by design
  because the sealed route doesn't accept `replyToSenderId`).

### Out of scope (deferred to a future build)

- The GCS object path itself. Any party who simultaneously observes
  the recipient's `GET /api/media/encrypted/<path>` and the sender's
  earlier `PUT <path>` could correlate the two, since the path is the
  same string. Mitigation candidates: per-bubble path randomization,
  rotating object names, or a proxy-fetch with the recipient as the
  visible client. Tracked separately — outside Phase B's leak surface
  for the sealed-sender API contract.
- Group chats (still 1:1 only).
- Phase C — sealed-sender for call signaling (LiveKit room joins).

### Integration harness

- New `Assertion 7` — 409 fallback for opted-out recipients. Asserts
  the sentinel `error: "sealed-sender-unsupported-recipient"` and that
  no message row is persisted.
- New `Stop-gate — recipient REST payload dump` — prints the literal
  JSON the recipient receives and asserts `senderId === null`,
  `replyToSenderId === null`, `forwardedFromUserId === null`,
  `senderVirtualNumber` matches the VN row (not the sender's user id),
  and the sender's user.id does not appear anywhere in the rendered
  payload.

## 2. Run the harness

```bash
npx jest --config tests/integration/jest.config.js --forceExit --runInBand
```

Use `--runInBand`. The two suites (`sealedSender.test.ts`,
`externalSms.test.ts`) share a single Postgres pool and race on
parallel test workers; serial execution is reliable and only adds ~3s.

Current status: **12/12 passing**.

## 3. Stop-gate evidence

Captured directly from
`tests/integration/sealedSender.test.ts › Stop-gate — recipient REST payload dump`
on the recipient's `GET /api/conversations/:id/messages` response for a
freshly-sent sealed message. This is the JSON the recipient client
parses and renders — there is no second filter between this and the
chat bubble.

```json
{
  "id": "e06220ef-03df-46ae-90a4-1f7e26a52b21",
  "conversationId": "959b80a4-9216-438c-9bc5-f9426e144e17",
  "receiverId": "80fd670a-1e6e-481a-83bb-e04db4beecdb",
  "content": "U1RPUF9HQVRFX0NJUEhFUlRFWFRfQkFTRTY0",
  "mediaUrl": null,
  "mediaType": null,
  "transcription": null,
  "isEncrypted": true,
  "encryptionVersion": "v2-signal",
  "e2eeInitEnvelope": null,
  "isHidden": false,
  "status": "sent",
  "replyToMessageId": null,
  "replyToPreview": null,
  "forwarded": false,
  "deletedForEveryone": false,
  "expiresAt": null,
  "outerSenderVirtualNumberId": "8d53dfd8-8428-460a-b428-6b5a08762956",
  "sealedSender": true,
  "createdAt": "2026-05-21T08:55:23.946Z",
  "deliveredAt": null,
  "readAt": null,
  "readBy": null,
  "senderId": null,
  "forwardedFromUserId": null,
  "replyToSenderId": null,
  "deletedForUserIds": [],
  "reactions": {},
  "senderVirtualNumber": "+1500TEST446390721",
  "senderDisplayName": "Sender Display"
}
```

Verified properties:

| Field                    | Value                  | Why it's safe                                  |
| ------------------------ | ---------------------- | ---------------------------------------------- |
| `senderId`               | `null`                 | Stripped by `sanitizeForRecipient`             |
| `replyToSenderId`        | `null`                 | Sealed replies are not supported (see §1)      |
| `forwardedFromUserId`    | `null`                 | Forward chain is stripped                      |
| `senderVirtualNumber`    | `+1500TEST44639...`    | VN phone, not the sender's user id             |
| `senderDisplayName`      | `"Sender Display"`     | Display name only — leaked by design, not an id |
| Full-payload grep        | sender.id not present  | `expect(JSON.stringify(sealed).includes(sender.id)).toBe(false)` |

The same `sanitizeForRecipient` function feeds the `new-message` socket
emit (`server/routes.ts:1629`), so the socket payload is byte-identical
to the REST payload above.

## 4. What's next (Phase B preview)

Encrypted media — `mediaUrl`/`mediaType` for sealed messages currently
ride through the regular media pipeline, which still attaches sender
identity at upload time. Phase B replaces that with an opaque
upload-token flow so the storage backend never sees who uploaded what.
**Not started.** Do not begin until this phase is signed off.
