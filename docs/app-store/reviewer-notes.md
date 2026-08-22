# App Review Information — paste into App Store Connect

App: Pryvo
Bundle: `com.adham.salameh.secureconnectchat`
Build under review: 1.0.5 (133)

---

## Sign-in required

**YES**

## Demo account credentials

Field | Value
---|---
Phone number | `555-123-4567`
Country code | United States (+1)
Verification code (OTP) | `123456` — **do not wait for a text message, this code always works immediately, no SMS is ever sent for this number**

(Backup demo number, identical access: `555-000-0000`)

## If a second "Confirm It's You" screen appears asking two security questions

This build should skip that screen entirely for the demo account — but if it
appears anyway (e.g. on a cached/older build), here are the real, working
answers:

Field | Value
---|---
"What is your favourite dish?" | `pizza`
"Your 2 memorable words" | `blue sky`

## Contact information

Field | Value
---|---
First name | Adham
Last name | Salameh
Email | (the address on the developer account — Apple will reach you here)
Phone | (your reachable number — Apple's review team will call within ~24h if they have questions; auto-rejects happen if they can't reach you)

## Notes for the reviewer (paste this whole block)

Hi App Review team,

Thanks for taking the time. Here's everything you need to test the app end-to-end. The demo account is fully provisioned and gives you the complete paid experience.

### 1. How to sign in

Pryvo uses **phone number + SMS one-time-code as its only sign-in method.** There is no SecureConnect-branded login; the app is fully rebranded to Pryvo. There is no Sign in with Apple, no Google, no Facebook, no email/password — this is by design. Because the app does not offer any third-party social login, Apple's Guideline 4.8 "Sign in with Apple required" rule does not apply (it only applies when one or more third-party social logins are offered).

To sign in:

1. Launch the app fresh.
2. The App Tracking Transparency prompt appears first — please respond either Allow or Don't Allow; both work fine for testing. This must run before any ads load (Google's required ordering).
3. On the Welcome screen, tap **Get Started**.
4. Country: **United States** (+1). Phone number: `5551234567`. Tap **Continue**.
5. On the OTP screen, **immediately enter `123456` and tap Verify — do not wait for a text message to arrive, none will.** The screen text says "we sent a code" for every phone number (including this one), but for this specific demo number no SMS is ever actually dispatched — `123456` is accepted the instant you submit it. Waiting for an SMS here will time out with nothing arriving; that is expected, not a bug.
6. You'll land on the main Chats screen, signed in as the demo user. You should NOT see any further "Confirm It's You" / security-question screen — if you do, see the fallback answers in "Demo account credentials" above.

This demo number bypasses the real SMS pipeline. No actual SMS is sent. The bypass is server-side and is intentional — see "Why the demo number works without a real SMS" below.

### 2. What the demo account has

- **Full Pryvo Plus VIP entitlement** — no paywalls, no upgrade prompts anywhere in the app.
- Several pre-loaded contacts and conversations so you can immediately test messaging, calls, status feed, and location sharing without needing a second device.
- A pre-provisioned virtual phone number under Settings → Virtual Numbers.
- Status feed pre-populated with sample posts.
- Ads still render (we don't hide ads for review — Apple needs to see the real experience). VIP only removes the banner ad surface; interstitials between certain navigations are intentionally left visible so you can confirm AdMob integration works.

### 3. Where to find each feature

Feature | Where to find it
---|---
End-to-end encrypted text chat | Chats tab → open any conversation → type and send
Encrypted voice call | Open any conversation → phone icon in the header
Encrypted video call | Open any conversation → video icon in the header
Missed-call message in chat | Place a call and let it ring out (~30s) — a "Missed call" / "No answer" system bubble appears in the chat
Disappearing messages | Inside a conversation → three-dot menu → Disappearing Messages → pick a timer
Status feed | Status tab (bottom nav) → tap "+" to post; tap a circle to view
Hidden Locker | More tab → Hidden Locker → first time prompts for a 6-digit PIN (use any 6 digits, e.g. `123456`)
Virtual phone numbers | Settings → Virtual Numbers
Real-time location sharing | Inside a conversation → "+" attachment menu → Location → Share Live Location
Pryvo Plus IAP | Settings → Pryvo Plus (you'll see "Active" on the demo account; restore-purchases also works)
Ad Removal IAP | Settings → Remove Ads (one-time purchase, separate from Plus)

### 4. Why the demo number works without a real SMS

`server/routes.ts` contains a small allow-list of test phone numbers — `5551234567` and `5550000000`. When those numbers are used, the server accepts the demo OTP `123456` directly and auto-grants VIP, instead of trying to send an SMS through Twilio.

This is the only way to give Apple's review team access without a real phone, because Twilio cannot send a verification SMS to a number we don't own. The bypass is hard-coded to these two numbers only, is not exposed in any UI, and cannot be triggered by a real user. It's deliberate and stays in production specifically so review can always succeed.

### 5. Permissions you'll be asked for

Permission | When it's requested | Why
---|---|---
App Tracking Transparency | First launch, before anything else | For ad personalization (Google AdMob). The app works the same whether you Allow or not.
Notifications | When you open a chat for the first time, or via Settings | Incoming message / call alerts. Optional — app works without it.
Microphone | When you start a voice or video call | Required for the call to function.
Camera | When you start a video call, or attach a photo | Required for video calls and in-chat photo capture.
Photos | When you attach an existing photo or video | Read-only access to the picker; no library scan.
Contacts | When you tap "Find Friends" in Settings (optional) | Local-only match to find friends already on Pryvo. Contact hashes are sent, never raw numbers; we never upload your address book.
Location | When you tap Share Live Location inside a chat | Foreground only. Stops automatically when the share ends.

### 6. Encryption / export compliance

Pryvo uses standard end-to-end encryption primitives (Signal Protocol, AES-GCM via WebRTC, TLS) that qualify for the mass-market exemption under §740.17(b)(1) of the U.S. Export Administration Regulations — the same path Signal, WhatsApp, and Telegram use. `ITSAppUsesNonExemptEncryption` is set to `false` in `Info.plist` to reflect that.

### 7. Things to double-check

If anything below doesn't work as described, please contact us through the email above before rejecting — we monitor it 24/7 during your review window and can usually fix configuration issues within an hour:

- [ ] `5551234567` accepts OTP `123456` immediately, with no SMS wait.
- [ ] Sign-in lands directly on the main Chats screen — no second "Confirm It's You" screen. (If it does appear, the answers are `pizza` and `blue sky` — see above.)
- [ ] The signed-in account shows Pryvo Plus as Active in Settings (no paywall blocks anywhere).
- [ ] Outbound test calls between the demo account and any other Pryvo user connect within 5 seconds and audio is clear.
- [ ] Missed calls produce a system message in the chat — tap the bubble to call back.
- [ ] In-app purchases load their prices from App Store Connect (proves IAP wiring is correct).

### 9. What changed since the last review

Your last review flagged two sign-in issues on this account: no code arriving when prompted, and being stuck on a "further verification" screen with no way to answer it. Both are addressed above — the demo OTP was always meant to be entered immediately rather than waited for (now spelled out explicitly in step 5), and the demo account's security-question screen either no longer appears at all, or has real working answers documented if it does. Sorry for the friction on the last round — thank you for your patience.

### 8. Known cosmetic notes

- The first time the app launches on a clean install, the splash screen may sit for 2–3 seconds while the App Tracking prompt initializes. This is intentional — we must finish ATT before mounting any ad-bearing screen.
- On iOS Simulator the AdMob banner is replaced with a test ad placeholder. On a physical device you'll see a real (non-personalized if you tapped "Don't Allow") ad.

Thank you again for your time. If anything is unclear or you'd like a walkthrough video, please reach out to the contact email above and we'll send one within a few hours.

— The Pryvo team
