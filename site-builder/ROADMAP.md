# SiteSpark — Roadmap

This app was scoped as a multi-phase build (see the original feature request).
**Phase 1** is the manual site/logo/social/video-page builder. **Phase 2 (this commit)**
is real accounts: Firebase Auth (Google, Apple, email+password, phone+SMS), password
reset, resend code, and projects/theme-unlocks moved from on-device storage to Firestore
keyed by account. Everything under "Still to come" is *not yet built*.

## What's real vs. mocked right now

- Auth is wired to real Firebase Auth APIs (not mocked) — but it can't actually run until
  you create a Firebase project and drop its config into `.env` (see **Setup** below). No
  fake/demo sign-in path exists; without real config, every auth screen will show a real
  Firebase error rather than silently succeeding.
- Projects and unlocked-theme state now live in Firestore under `users/{uid}/...` —
  signing in on a new device restores your builds and purchases.
- Theme purchases ($189 / $399 tiers) show a real price and unlock flow, but no money
  moves — the modal explicitly says "Demo mode". Wiring this to real payment requires
  Apple In-App Purchase (see Phase 4); Stripe/web checkout cannot be used for unlocking
  digital content inside an iOS app per App Store rules.
- Video Page and the 9:16 Social Page use the right canvas aspect ratio and share the
  same element editor, but the video-specific tools (cut, split, audio track overlay,
  picking a camera-roll clip as a sound source) are not built — the New Project screen
  labels this honestly rather than faking a working video editor.
- Phone auth's reCAPTCHA step is a custom WebView component (`src/services/recaptcha/`)
  instead of the community `expo-firebase-recaptcha` package — that package is
  unmaintained and pulls in a nested `expo-firebase-core` dependency with several known
  vulnerable transitive packages (confirmed via `npm audit`). This does the same thing
  (solve Google's invisible reCAPTCHA inside a WebView, hand the token to Firebase's real
  `signInWithPhoneNumber`) without that baggage.

## Setup — making auth actually work

1. **Firebase project**: console.firebase.google.com → create a project → add an iOS app
   with bundle ID `com.sitespark.app` → Project Settings → General → copy the Web app
   config into `.env` (`EXPO_PUBLIC_FIREBASE_API_KEY`, `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN`,
   `EXPO_PUBLIC_FIREBASE_PROJECT_ID`, `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET`,
   `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`, `EXPO_PUBLIC_FIREBASE_APP_ID`). These use the
   `EXPO_PUBLIC_` prefix so Expo inlines them into the client bundle at build time — that's
   correct for Firebase's client config, which is meant to be public.
2. **Enable providers**: Firebase Console → Authentication → Sign-in method → enable
   Email/Password, Phone, Google, and Apple.
   - Phone auth requires the Blaze (pay-as-you-go) plan for SMS delivery.
   - Apple requires a Services ID + private key from your Apple Developer account, entered
     into Firebase's Apple provider config.
3. **Google Sign-In client IDs**: Google Cloud Console (same project Firebase created) →
   APIs & Services → Credentials → create an **iOS** OAuth client (bundle id
   `com.sitespark.app`) and a **Web** OAuth client. Put both into `.env` as
   `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` / `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`.
4. **Apple Sign-In**: needs an Apple Developer account with the "Sign in with Apple"
   capability enabled for `com.sitespark.app` (already declared in `app.config.js` via
   `ios.usesAppleSignIn`) — no extra client ID needed for the native flow.
5. **Deploy Firestore rules**: `firebase deploy --only firestore:rules,firestore:indexes`
   (rules restrict every doc to `users/{uid}/**` matching the signed-in account — see
   `firebase/firestore.rules`).
6. Copy `.env.example` to `.env`, fill in the values above, then `npx expo start`.

Until step 1–3 are done, the Welcome screen's buttons will call real Firebase/Google/Apple
APIs and get real "not configured" errors — that's expected, not a bug.

## Phase 3 — AI Site Builder (the app's centerpiece)

- Prompt box (max 4,000 words) → generation pipeline that writes real layout/content,
  not a template swap. Needs a backend service (Cloud Functions or similar) calling an
  LLM, plus an image-generation step for original art.
- Live "what the AI is doing" progress feed during generation, a pause button (max 2
  pauses per build) to let the user inject a follow-up instruction mid-build.
- Constrained chat: only answers questions about the site being built.
- Needed from you: an LLM API key/budget, and a decision on where generated images are
  hosted/stored.

## Phase 4 — Credits, Subscriptions & Paywall

- Credit ledger per account: 8 free credits on signup, metered per generation/minute per
  the pricing you specified (Beginner/Middle Class/Advanced tiers, weekly vs. monthly
  resets, add-on-minute costs).
- Post-signup/sign-in offer modal with a dismiss-after-5-seconds close button.
- Credit pack purchases (12/38/70/200-credit packs) and monthly subscriptions.
- **Must be implemented as Apple In-App Purchase / StoreKit**, not card payments,
  because credits and theme unlocks are digital goods consumed inside an iOS app —
  Apple requires IAP for this category. Needed from you: App Store Connect access to
  create the IAP products, plus a backend to validate receipts and update the credit
  ledger server-side (client-trusted credits are not safe).

## Phase 5 — AI Chat Assistant (full app control)

- An assistant that can act on the user's behalf across the app (find a setting, jump to
  a screen, explain a feature) when they're stuck. Needs the same backend/LLM piece as
  Phase 3, plus an action layer that can safely drive navigation/state rather than just
  answer in a chat bubble.

## Phase 6 — Video Page Editor

- Real cut/split timeline, an audio track layer, and picking a video from the camera
  roll to use as a sound source. This is a substantial native-video feature on its own
  (likely `expo-av`/`react-native-video` + a custom timeline UI) and was intentionally
  left out of Phase 1 rather than faked.

## Phase 7 — Domains

- Real domain search/purchase and **ownership transfer** requires a registrar with a
  transactional API (e.g., Namecheap, Cloudflare Registrar, GoDaddy) and real payment
  processing on your business entity — I can wire the integration once you have that
  account and key, but cannot create the account or hold funds on your behalf. Domain
  transfer specifically also requires EPP/auth codes from the losing registrar and
  ICANN-mandated wait periods that are outside any app's control.

## Phase 8 — Policies & Support

- Privacy Policy, Support, and Return/Refund Policy screens, populated with the contact
  details you gave (`+61 408 680 813`, `adisssal7@hotmail.com` — already wired into
  `app.config.js` under `extra.supportPhone` / `extra.supportEmail` for reuse). Return
  policy content should be reviewed against Apple's own subscription-refund rules (Apple
  handles IAP refunds, not the app) before publishing.

## Notes on the "animal-tier" AI speed/strength framing

The Beginner/Immediate/Advanced plans map to different underlying model
choice/parameters (e.g., a smaller/faster model vs. a stronger one, different max
thinking budget) rather than literally "3x/5x speed" — actual latency depends on the
model provider. Phase 3 will pick concrete models per tier once the LLM provider is
chosen.
