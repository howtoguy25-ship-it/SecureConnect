# SecureConnect — App Store Release Notes

## Version 1.0.4 (Build 57)

> Paste this into App Store Connect → "What's New in This Version"
> Keep under 4000 characters. Plain text. No markdown.

---

This update fixes the sign-in problem some users saw on the phone-number screen and adds new account-protection tools.

• Fixed: a problem that could prevent the verification code (OTP) from being delivered, and that sometimes hid the real reason the code couldn't be sent.
• Clearer error messages on the phone-number screen — you now see exactly what went wrong (invalid number, blocked region, network issue) instead of a generic message.
• Resending the code now gives you immediate feedback if it fails, instead of silently restarting the timer.
• Safe Code — every account now gets a personal recovery code so you can prove it's really you if you ever lose access.
• New-login alerts — get notified instantly when your account is signed into on a new device.
• Login history — see the last 50 sign-ins to your account, with the device, time, and location.
• Sign out other devices — one tap to end every other session, anywhere in the world.
• Trusted devices — review and remove devices linked to your end-to-end encryption keys.
• A redesigned Security screen brings everything together in one place.

Plus general performance improvements and stability fixes.

---

### Submission notes — addresses Guideline 2.1(a) rejection of Build 56

**What Apple reported (Build 56, iPhone 17 Pro Max, iOS 26.4.2):**
> "An error message was displayed when we entered our phone number to obtain an OTP."

**Root cause:**
1. `PhoneInputScreen` mis-handled the `sendVerificationCode` return value — it treated an error result object as a success boolean (objects are always truthy in JavaScript), so the friendly server-side error message (e.g. "This phone number cannot receive SMS") never reached the user, and the screen would sometimes navigate forward into a broken state where the code field was empty.
2. The "resend code" action on `VerifyCodeScreen` discarded the result silently — if the resend failed, the timer just restarted with no message to the reviewer.
3. Server `/api/auth/send-code` and `/api/auth/verify-code` did not normalize phone numbers to E.164 before storing/looking up the verification record, which can cause a successful `send` to be followed by a "code not found" `verify`.

**Fixes shipped in Build 57:**
- `client/screens/PhoneInputScreen.tsx`: handles `SendCodeResult { success, error }` correctly and surfaces the server's user-facing error message.
- `client/screens/VerifyCodeScreen.tsx`: resend now displays an error and resets the cooldown if the SMS fails.
- `server/routes.ts`: both `/api/auth/send-code` and `/api/auth/verify-code` now normalize the input to E.164 (`+` prefix, digits only, 7–15 length) and return clear 400-level messages on bad input.
- Apple-reviewer demo account is unchanged and continues to bypass SMS entirely.

**Demo account for Apple review (unchanged, pre-verified, auto-grants VIP):**
- Phone: `+1 555-123-4567`
- Code: `123456`
- This number is intercepted server-side **before** Twilio is called, so it works on any device, in any region, with no SMS dependency.

**Reproduction (already verified before submission):**
1. Open the app → Welcome screen → tap "Sign in / Get started".
2. Country defaults to United States (+1). Enter `5551234567`. Tap Continue.
3. The code field auto-populates with `123456` and signs the reviewer in as a VIP user.

**Why we believe Build 56 may have shown the error:** if the reviewer entered a real number outside the geo-permissions configured on our Twilio account (we currently allow United States and Canada only), Twilio returned error `21408` ("Permission to send an SMS has not been enabled for the region") and the (now-fixed) client logic surfaced a generic message instead of guiding the reviewer to use the demo number. The fixes above resolve both the surfacing problem and the underlying control-flow bug.

In App Store Connect: create a new version "1.0.4", attach Build 57, paste the "What's New" text above, and submit.

---

## Version 1.0.3 (Build 56) — Submitted Apr 27, 2026

> What was shipped in the previous binary, for reference.

- Fixed Device ID privacy declaration to include "Third-Party Advertising" (used for tracking)
- Flattened opaque app icon (RGBA → opaque white) to satisfy App Store icon requirements
- Added 5 iPad screenshots (Conversations, Private Locker, Live Location, Secure Calls, Share Moments)
- AdMob banner/rewarded/interstitial integration with App Tracking Transparency prompt on first launch
- iPad universal support (UIDeviceFamily: [1, 2]), iOS 16.0 minimum, New Architecture enabled
- Migrated from `expo-av` to `expo-audio` for iOS 26 compatibility
- OTA update check changed to `ON_LOAD` (was `ALWAYS`) to prevent iOS 26 launch crashes
