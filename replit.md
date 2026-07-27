_Historical build notes live in [CHANGELOG.md](./CHANGELOG.md)._

# Overview

Pryvo (App Store listing "SecureConnect Messenger") is an encrypted messaging app: text, voice/video, status feed, hidden locker, virtual phone numbers, real-time location sharing. Target experience: "light, real, and fast."

# User Preferences

Preferred communication style: Simple, everyday language.

# Permanent Project Requirements — DO NOT REGRESS

Re-read this section at the start of every task. If a change would violate any item below, surface the conflict immediately rather than silently working around it.

## 1. ATT (App Tracking Transparency) prompt timing — CRITICAL

The ATT prompt MUST be shown before any ad or tracking request fires. If ATT runs after the first ad request, the SDK locks into non-personalized ads for the entire session, silently destroying revenue with no recovery without an app restart.

**Required ordering in `client/MainApp.tsx` (strict, top-to-bottom):**
1. ATT prompt — `requestTrackingPermissionsAsync()` awaited to completion FIRST
2. `AdsConsent.gatherConsent()` — UMP / GDPR consent gathered after ATT (UMP signals depend on the post-ATT IDFA state, per Google's AdMob sample code)
3. `mobileAds().initialize()` — only after both ATT and UMP resolve
4. `<AdBanner />` mounts — only after initialize resolves

**Core invariant:** nothing ad-related, no `mobileAds()` call, and no analytics/tracking SDK may fire before ATT resolves.

**Rules:**
- Do NOT mount any ad component, call `mobileAds()`, or fire any tracking/analytics SDK init before ATT resolves.
- Do NOT fire ATT in parallel with ad init — it must be awaited.
- Do NOT move ATT into a child component or any code path that can race with ad mounting.
- Any new ad surface, analytics SDK, or tracking library must be gated behind the same post-ATT barrier.

## 2. Authentication — Phone + OTP ONLY

This app uses phone + OTP as the sole authentication method (`client/screens/WelcomeScreen.tsx`). No Sign in with Apple, no Google, no Facebook, no email/password.

Because no third-party social login exists, Apple's "Sign in with Apple required" rule (Guideline 4.8) does NOT apply. Do not add Sign in with Apple "just in case" — adding any social provider would trigger that requirement.

**Rules:**
- Do NOT add Sign in with Apple, Google Sign-In, Facebook Login, or any other third-party social authentication.
- Do NOT add email/password auth as an alternative.
- Phone + OTP via `WelcomeScreen.tsx` is the only sign-in path.
- App Store description and Review Notes must NOT mention Sign in with Apple — the reviewer will look for it.

## 3. Reviewer bypass — PROTECTED, DO NOT REMOVE

`server/routes.ts:334–357` contains a deliberate bypass for the Apple App Review team. This is NOT dev cruft — it is the mechanism by which reviewers gain access to VIP/paid features during review without a real phone number. Removing it causes review rejection.

**Protected bypasses:**
- `TEST_PHONE_PATTERNS` (`5551234567` / `5550000000`) — Apple reviewer accounts; bypass OTP via demo code `123456` and grant free VIP. Must always log in successfully, must always be granted VIP, must never be rate-limited or geo-restricted.
- `VIP_PHONE_NUMBERS` (e.g. `+61 474 011 265`) — developer/tester accounts; also preserve.

**Rules:**
- Do NOT remove, "tighten," or refactor away these bypasses under any circumstance — including security audits, lint sweeps, or "removing test code before production."
- Do NOT log/alert/telemetry-flag these numbers in a way that could disable the account or trip fraud heuristics.
- Do NOT change the VIP entitlement these accounts receive — reviewers need the full paid experience.
- If you touch `routes.ts` around lines 334–367, leave both bypasses intact and re-verify after your change.
- If a reviewer-bypass refactor is genuinely needed (e.g., Apple requests a different test number), surface it explicitly and confirm before changing anything.
- The inline "DO NOT REMOVE" comment in `routes.ts` next to these arrays must be preserved.

## 4. Pre-submission verification — RUN BEFORE EVERY App Store SUBMISSION

The reviewer demo path must be verified working in BOTH App Store Connect and the live build. A failure on either side restarts the 3–7 day review cycle.

**Current demo credentials (must match `server/routes.ts`):**
- Phone: `555-123-4567` (or `555-000-0000`) — defined in `TEST_PHONE_PATTERNS` at `routes.ts:341–344`
- OTP code: `123456` — defined as `APPLE_DEMO_CODE` at `routes.ts:327`
- Demo bypass has an **always-on safety net** for `TEST_PHONE_PATTERNS` at `routes.ts:421–427` and `488–492` — it fires regardless of `REVIEW_MODE`, specifically so reviewers can sign in even if the env var is missing in prod.
- `REVIEW_MODE=true` (`routes.ts:331`) enables broader review-mode behaviors but is **not** required for the `5551234567` demo login to work.

### Part A — App Store Connect "App Review Information" (every submission)
- Sign-in required: **YES**
- Demo phone: `555-123-4567`
- Demo OTP: `123456`
- Contact name/email/phone: monitored during review (Apple gives ~24h to respond before auto-reject)
- Reviewer notes must explain: phone+OTP is the only auth method; enter the demo phone, enter `123456`, account has full VIP, where to find ad-supported screens and VIP features.
- If the demo OTP changes in `routes.ts`, update App Store Connect notes BEFORE submitting that build.

### Part B — In-app demo path (verify on the exact build being submitted, prod backend)
- [ ] Fresh install, cold start
- [ ] ATT prompt appears first (per §1)
- [ ] `WelcomeScreen` accepts `555-123-4567`
- [ ] OTP screen accepts `123456`
- [ ] Login succeeds, lands on main screen
- [ ] VIP entitlement active — no paywalls, no upgrade prompts
- [ ] Ads still render (do NOT hide ads for the reviewer; Apple needs to see the real experience)
- [ ] Sign out → sign back in with same number still works
- [ ] No rate-limit, geo-block, or fraud-flag triggers from repeated logins / new IPs

### Server-side checks against production backend
- [ ] `routes.ts:341–344` bypass present in DEPLOYED code (not just local repo)
- [ ] `REVIEW_MODE=true` set in the production environment for the submission window
- [ ] Deployed server grants `isVip=true` to `5551234567`
- [ ] No fraud system blocks the number
- [ ] Production logs show a successful test login from `5551234567` within 24h of submission

If ANY box is unchecked, do not submit. Fix it first.

# Current build (active)

- **Version**: `v1.0.5`, iOS buildNumber **76**
- **Bundle IDs**: iOS `com.adham.salameh.secureconnectchat`, Android `com.securechat.app`
- **App Store listing**: `6756967188 "SecureConnect Messenger"`
- **EAS production cache key**: `v57-build-76` — bump together with `buildNumber` for every new EAS build (v47 skipped after a corrupted-cache build failure on EAS; v54 AND v55 poisoned/failed the same way — Build 74 attempts failed with "The `expo` package was not found" / react-native-iap plugin `Cannot find module 'expo/config-plugins'` because the restored node_modules cache was corrupted, NOT a code/config problem — lockfile and pins were verified in sync)
- **Production domain**: `pryvoapp.com` (baked via `EXPO_PUBLIC_DOMAIN` in `eas.json`); `*.replit.app` also resolves. Migrated off `pryvomessenger.com` (Build 65) after that domain went to registrar `client hold`; Build 66 onward targets `pryvoapp.com` (registered at GoDaddy).
- **Build 64 fix**: `ITSAppUsesNonExemptEncryption: false` (mass-market exemption path — same as Signal/WhatsApp/Telegram). Builds 62/63 had this set to `true` while also claiming the exemption, which contradicts itself and tripped TestFlight error 90592.
- **Build status**: Build 74 also fixes "message won't send" (exclamation-mark bubble) for senders in Pryvo-number (app/VN) mode chatting in a personal-number conversation: client tried `/api/messages/send-sealed`, server correctly 400'd ("Sealed sender requires a virtual-number conversation"), and the client had no fallback. Fix: `sendSealedMessage` treats that specific 400 as fall-back-to-legacy (safe — personal conversations never hide sender identity), `GET /api/conversations/:id` now returns `numberType` (SERVER change, needs republish), and ConversationScreen skips the sealed attempt entirely when the conversation is known personal. Build 74 = Build 73 + status media fixes: (a) video statuses wouldn't play on iOS — media routes (`/objects/*`, `/api/media/encrypted/*`, `/public-objects/*`) streamed whole files with no HTTP Range support (AVPlayer requires byte ranges); `downloadObject` in `server/objectStorage.ts` now handles Range/206/416 + Accept-Ranges (SERVER change, needs republish); (b) status tiles rendered black for videos — `<Image>` can't render a video URL; new `VideoThumb` component extracts a frame via `expo-video-thumbnails@10.0.8` (SDK-54 pinned; web falls back to dark tile + play badge) in Your Status tiles and Recent Updates feed; (c) status upload now defaults to native editing — 9:16 portrait crop for photos, trim UI for videos. Also pinned `expo@54.0.35`, `expo-font@14.0.12`, `expo-updates@29.0.18`, `babel-preset-expo@54.0.10` — expo-doctor now 18/18 (the red "expo doctor failed" step on EAS was this non-fatal version check). Build 73 = Build 72 + four TestFlight bug fixes: (a) VN purchase "Invalid request origin" — webhook-host whitelist in `server/routes.ts` was missing `pryvoapp.com` (added + www; SERVER change, needs republish); (b) Last Seen privacy reset on re-entry — `/api/auth/me` never returned `lastSeenPrivacy` (added; SERVER change) + client screen now checks response.ok, refreshUser() after save, reverts+alerts on failure; (c) Settings version was hardcoded "1.0.0" — now real binary version via expo-application (`1.0.5 (73)`); (d) New Message modal content hidden under transparent header — added useHeaderHeight paddingTop. Build 72 = Build 71 + **ROOT-CAUSE FIX for the post-OTP TestFlight crash**: Build 71's telemetry captured `Invariant Violation: new NativeEventEmitter() requires a non-null argument` (stack: `get PushNotificationIOS` + Metro `importAll`) — caused by `await import('react-native')` in `client/lib/auth.ts` verifyCode(); Metro's async namespace import walks every react-native getter incl. deprecated PushNotificationIOS → `new NativeEventEmitter(null)` → fatal on device (fine on web). Fixed with static top-level `import { Platform } from 'react-native'`; NEVER dynamically import the react-native namespace anywhere. Also Build 72: tab-bar labels fully visible (`tabBarAllowFontScaling: false`, label fontSize 10, zero horizontal item padding) for the 6-tab bar on narrow iPhones. Build 71 = Build 70 + client fatal-crash telemetry AND auto-recovery (global JS error handler in `client/lib/crashReporter.ts` persists fatal errors, POSTs them to unauthenticated `/api/client-crash` which logs `[CLIENT CRASH]` in production logs, then in release builds reloads the JS bundle in place — one reload per run + 60s cross-launch guard — so a fatal error shows as a brief restart, not a dead app) + IncomingCallModal null guard (sealed calls have `callerId === null`; previous code crashed on `charCodeAt`) — added to diagnose a TestFlight SIGABRT ~150ms after OTP verify success on Build 70 (crash log showed expo error-recovery abort after a fatal JS error; message not in .ips, telemetry will capture it). Build 70 = Build 69 content + new official splash logo (cleaned Pryvo speech-bubble: "ryvo" transparent cutout filled solid white, watermark removed, `imageWidth` 200→280, splash now uses `assets/images/splash-icon.png`) + VerifyCodeScreen route-params null guard (crash hardening). Build 69 = same content as Build 68 (number bumped after Build 68's EAS attempt failed on a corrupted dependency download on Expo's build machine). Build 68 = tab-bar label fix (forced `tabBarLabelPosition: "below-icon"` + more height/less padding so tab names "Chats/Locker/Status/Location/Calls/Profile" render and aren't clipped on web + native) on top of the Build 67 App Store 5.6 polish (removed sign-in quiz gate, request timeouts, responsive width on iPad) and the Build 66 `pryvoapp.com` domain migration. Requires: (1) `pryvoapp.com` connected to the Replit deployment (DNS/routing/SSL green), (2) fresh EAS build with buildNumber `76` / cache key `v57-build-76`, (3) withdraw any in-review build and resubmit. Reviewer bypass intact, `REVIEW_MODE=true` live in shared env (covers prod).

# System Architecture (high-level)

- **Frontend**: React Native + Expo SDK 54, React Navigation v7, TanStack Query, Reanimated, `expo-audio`, `expo-updates`. iOS-26 liquid glass UI; themed light/dark.
- **Backend**: Express + TypeScript, Drizzle ORM on PostgreSQL, Socket.IO, JWT with token-versioning.
- **External**: Twilio (SMS + VNs), LiveKit (audio/video), Stripe (VIP web), Apple IAP (VIP + Ad Removal iOS, server-validated), Google AdMob + UMP, Google Cloud Storage, EAS.
- **Core auth/identity**: phone is primary identity; conversation IDs server-generated; token-version bump for cross-device logout and suspension.

For the full feature surface, schema migrations, endpoint inventory, and per-build history, see [CHANGELOG.md](./CHANGELOG.md).
