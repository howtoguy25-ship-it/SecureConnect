# App Store Submission Notes — Pryvo Build 74 (v1.0.5)

These notes accompany the Build 74 (v1.0.5) resubmission. This build focuses on
polish and completeness: the sign-in screen now goes straight to phone entry
(the earlier quiz gate was removed), loading states can no longer hang
indefinitely, the layout scales cleanly on larger screens such as iPad, and the
bottom tab bar now shows its labels (Chats, Locker, Status, Location, Calls,
Profile) clearly under each icon. The reviewer demo sign-in below is unchanged
and fully functional. Each section further down maps to a specific App Review
guideline.

---

## Sign-In Method & Reviewer Demo Account

**Sign-in method:** Pryvo uses **phone number + one-time SMS code (OTP) as its
only sign-in method.** There is no social or third-party login and no
email/password option — every user authenticates solely by verifying their
phone number over SMS.

**How to sign in as a reviewer (no real phone number needed):**

1. Launch the app. After the App Tracking Transparency prompt, you land
   directly on the "Enter your phone number" screen.
2. Enter phone number **`+1 (555) 123-4567`** (country US / +1).
3. Tap **Continue**.
4. On the verification screen, enter code **`123456`**.
5. You are signed in and land on the main screen.

**What the demo account has:**

- **Full VIP access** — no paywalls or upgrade prompts anywhere in the app.
- **Ads still display** — we intentionally do not hide ads for the reviewer, so
  you see the real shipping experience. Both VIP features and ad-supported
  screens are reachable from the main navigation.

This is a hardcoded reviewer bypass that exists only for App Review and is
documented in `server/routes.ts`. It skips real SMS delivery; every other phone
number receives a live SMS via Twilio. The demo number always signs in
successfully and is never rate-limited or geo-restricted.

---

## 1. Guideline 2.1(a) — OTP Delivery (Build 56 rejection cause)

**What was wrong:** The reviewer reported that the OTP code did not arrive.

**Fix:** We hardened the `/api/auth/send-code` and `/api/auth/verify-code`
endpoints with:

- Strict E.164 normalization of incoming phone numbers (handles spaces,
  parentheses, dashes, leading-zero trunks, missing `+`).
- Explicit error responses (`400` for malformed input vs `429` for rate limit
  vs `500` for Twilio failure) so the client can show actionable messages.
- A reviewer-bypass demo account (above) that does not require a live SMS.
- Twilio sender-ID and credential validation at boot so misconfiguration fails
  loudly in our logs, not silently in production.

**How to verify:** Send `+15551234567`, enter `123456`. Sign-in should succeed
in under one second.

---

## 2. Guideline 1.2 — User-Generated Content Moderation

SecureConnect carries user-generated content (messages, voice notes,
profile photos, status updates). Per Guideline 1.2 we provide:

- **In-app reporting** for any message or user (long-press a message → Report;
  user profile → Report). Reasons include harassment, spam,
  threats_or_violence, sexual_content, hate_speech, impersonation,
  scam_or_fraud, self_harm, and other.
- **Block** functionality on every user profile.
- **EULA with zero-tolerance copy** shown at signup, explicitly stating that
  objectionable content and abusive users are prohibited and will be removed
  within 24 hours.
- **Owner-side moderation queue** (Settings → Moderation Queue, owner-only)
  with five actions: dismiss, warn, suspend, unsuspend, mark reviewed. Suspend
  immediately disconnects the suspended user from all live sockets and forces
  a logout on every device by bumping their JWT `tokenVersion`. Suspended
  users receive a clear in-app message explaining why and how to appeal.
- **24-hour review SLA** for reported content, enforced operationally by the
  owner team.

Endpoints involved (server/routes.ts):

- `POST /api/reports` — create a report
- `GET  /api/admin/reports?status=` — owner-only triage list
- `POST /api/admin/reports/:id/action` — owner-only action

---

## 3. Guideline 3.1.1 — In-App Purchase

All paid features on iOS use **StoreKit / Apple In-App Purchase only**, via
the native `react-native-iap` module (linked in Build 58):

- **VIP subscription** — product ID `pryvo.vip.monthly.2025`
  (auto-renewable, monthly)
- **Ad Removal** — product ID `pryvo.removeads.2025`
  (non-consumable, one-time)

All Stripe-based payment UI has been removed from the iOS build. Stripe is
still used on the web companion, where Apple's IAP rules do not apply, but
iOS clients never see Stripe purchase flows.

**Server-side receipt verification** is performed against Apple's
`verifyReceipt` endpoint (`POST /api/iap/verify` in `server/routes.ts`) with
automatic sandbox fallback on status `21007`, using our App-Specific Shared
Secret. The server also validates that the claimed product ID is actually
present in the verified receipt before granting `isVip` or `isAdFree`
entitlements on the user record. Restoring purchases is supported via
`GET /api/iap/restore-status`.

---

## 4. Guideline 2.5.4 — VoIP / Background Modes

We removed `voip` from `UIBackgroundModes` because we do not currently use
PushKit / CallKit. Calls are delivered via standard push notifications and
LiveKit while the app is foregrounded or via a normal alert push when
backgrounded. This avoids the misuse of the VoIP background mode that has
caused recent rejections in this category.

---

## 5. Guideline 5.1.1 — Privacy / Permission Strings

The following permissions request strings are present in `app.json` /
`Info.plist` and explain exactly why each is needed:

- `NSCameraUsageDescription` — taking profile photos and capturing media to
  send in chats.
- `NSMicrophoneUsageDescription` — recording voice notes and making encrypted
  voice/video calls.
- `NSPhotoLibraryUsageDescription` — choosing photos to send in chats.
- `NSPhotoLibraryAddUsageDescription` — saving received media to the user's
  library.
- `NSContactsUsageDescription` — finding which of the user's existing contacts
  are already on SecureConnect (matching is done by hashed phone numbers).
- `NSLocationWhenInUseUsageDescription` — sharing real-time location in chats
  (opt-in per chat).
- `NSFaceIDUsageDescription` — protecting the hidden message locker with
  Face ID / Touch ID.
- `NSUserTrackingUsageDescription` — only requested if the user views ads, to
  show personalized ads via AdMob; the app is fully functional if denied.

---

## 6. End-to-End Encryption

Messages are end-to-end encrypted using the Signal Protocol (X3DH key
agreement + Double Ratchet). The server stores only ciphertext for messages
in transit. Encrypted key backups are protected by a user-only Recovery Code
that the server never sees in plaintext.

---

## 7. Account Deletion

Users can delete their account from Settings → Account → Delete Account. This
is a server-side hard delete that removes the user row, their messages, their
call history, their device records, and their push tokens. There is no soft
"deactivate" disguised as deletion.

---

If anything in the review process is unclear, please contact us at the support
email listed in App Store Connect and we will respond the same business day.
