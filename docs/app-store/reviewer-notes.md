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
Phone number (active Pryvo Plus subscription) | `555-123-4567` (US, +1)
Phone number (no active subscription — to test the paywall/upgrade screen) | `555-000-0000` (US, +1)
Verification code (OTP), same for both | `123456`

## Contact information

Field | Value
---|---
First name | Adham
Last name | Salameh
Email | (the address on the developer account)
Phone | (your reachable number)

## Notes for the reviewer (paste this whole block)

Hi App Review team,

**How to sign in:** Tap Get Started → country United States (+1) → phone `5551234567` → Continue. On the code screen, **enter `123456` right away — don't wait for a text, none is sent for this number.** That's expected, not a bug. You'll land straight on the Chats screen, fully signed in with Pryvo Plus active.

**To test the paywall/upgrade flow:** sign out and repeat the same steps with `5550000000` instead — same fixed code `123456`, no SMS sent. This account intentionally has no active subscription, so the upgrade/paywall screen is reachable exactly as an ordinary non-subscribed user would see it.

**If a "Confirm It's You" screen with two security questions appears:** it shouldn't for this account, but if it does, the answers are:
- Favourite dish: `pizza`
- Two memorable words: `blue sky`

**Sign-in method:** Phone number + SMS code only — no Sign in with Apple/Google/email, so Guideline 4.8 doesn't apply here.

**What's pre-loaded:** Pryvo Plus (no paywalls), sample contacts/conversations, a virtual number, and a sample status feed — everything is testable immediately without a second device.

**Encryption:** Standard E2EE (Signal Protocol, AES-GCM, TLS) qualifying for the §740.17(b)(1) mass-market exemption, same as Signal/WhatsApp. `ITSAppUsesNonExemptEncryption` is `false`.

If anything doesn't work as described, please reply here before rejecting — we can usually fix it within an hour.

— The Pryvo team
