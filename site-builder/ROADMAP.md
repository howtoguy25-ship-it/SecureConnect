# SiteForge — Roadmap

This app was scoped as a multi-phase build (see the original feature request). **Phase 1
(this commit)** is the manual site/logo/social/video-page builder: projects dashboard,
theme gallery with priced tiers, and a working drag/resize canvas editor with an elements
library, text/image/slideshow blocks, and a page-level announcement bar. Everything below
is *not yet built* and is ordered roughly by dependency.

## What's real vs. mocked right now

- Projects, elements, and unlocked-theme state persist locally via `AsyncStorage` — no
  backend or account system yet, so data lives on-device only.
- Theme purchases ($189 / $399 tiers) show a real price and unlock flow, but no money
  moves — the modal explicitly says "Demo mode". Wiring this to real payment requires
  Apple In-App Purchase (see below); Stripe/web checkout cannot be used for unlocking
  digital content inside an iOS app per App Store rules.
- Video Page and the 9:16 Social Page use the right canvas aspect ratio and share the
  same element editor, but the video-specific tools (cut, split, audio track overlay,
  picking a camera-roll clip as a sound source) are not built — the New Project screen
  labels this honestly rather than faking a working video editor.

## Phase 2 — Accounts & Auth (needs a Firebase project + Apple Developer account)

- Firebase Auth: Google Sign-In, Sign in with Apple, email+password, phone+SMS OTP.
- Real password reset (email) and resend-code (phone) flows via Firebase Auth.
- Move `projectsStore`/`unlockedThemesStore` from `AsyncStorage` to Firestore keyed by
  `uid`, so builds follow the signed-in account across devices.
- Needed from you: a Firebase project (Blaze plan for SMS), an Apple Developer account
  (for Sign in with Apple + later IAP), and OAuth client IDs for Google sign-in.

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
