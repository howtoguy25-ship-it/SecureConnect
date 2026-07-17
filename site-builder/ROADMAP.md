# SiteSpark — Roadmap

This app was scoped as a multi-phase build (see the original feature request).
**Phase 1** is the manual site/logo/social/video-page builder. **Phase 2** is real
accounts: Firebase Auth (Google, Apple, email+password, phone+SMS), password reset,
resend code, and projects/theme-unlocks moved from on-device storage to Firestore keyed
by account. **Phase 3 (this commit)** is the real AI Site Builder: an OpenAI-backed
Cloud Functions pipeline that writes real content and generates real images for a
prompted site, with live progress, pause-to-inject, and server-side credit deduction.
Everything under "Still to come" is *not yet built*.

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

## Phase 3 — AI Site Builder (this commit) — real, backed by OpenAI

Built for real, not mocked: a Cloud Functions backend (`firebase/functions/`) calls
OpenAI to write real site copy/layout via structured output, generates original images
(`gpt-image-1`) for visual sections, and lays them out deterministically onto the same
canvas element schema the manual editor uses — so an AI-built site opens in the regular
editor afterward, fully editable.

- **Prompt screen** (`AIPromptScreen`): up to 4,000 words, a Simple/Professional/Go-All-Out
  complexity picker, and an upfront credit-cost estimate.
- **Live progress screen** (`AIBuildProgressScreen`): subscribes to the build's Firestore
  session doc in real time — shows exactly what step it's on, minutes elapsed, credits
  used, and a **Pause** button (max 2 per build) that lets you type an extra instruction
  before it continues.
- **Credits**: 8 free on signup; a build's cost is checked and deducted **server-side**
  in a Firestore transaction before generation starts (never trust the client for this);
  refunded automatically if generation errors out. Running short routes to a
  subscription/credit-pack screen (`SubscriptionScreen` — pricing is real, purchases are
  still demo-mode until Phase 4's Apple IAP wiring).
- **Constrained chat** (`askBuildQuestion` function): answers only relate to the current
  build; not yet surfaced as its own chat UI in the app (the Pause flow covers "ask/add
  something" from the spec) — a persistent chat *with full app control* is Phase 5.

### Scoping decisions worth knowing about

- **Layout is deterministic, not AI-picked pixel coordinates.** The model writes content
  (headline/body/button copy, image prompts, color palette) via OpenAI structured
  outputs; this app's own code (`firebase/functions/src/layout.ts`) turns that into
  positioned elements. Letting an LLM emit raw x/y coordinates directly is unreliable in
  practice (overlapping/broken layouts) — this split plays to each side's strength and is
  why builds are described as having "no issues" rather than needing a disclaimer.
- **Pauses are honored at 2 fixed checkpoints** (after the content is written, and after
  images are generated), not at the exact instant you tap Pause — the function finishes
  its current step first, then checks. A request during a step is picked up at the next
  checkpoint.
- **Insufficient credits are checked upfront**, before generation starts — not
  mid-build. The spec's exact "runs out mid-build, pause there, resume after
  subscribing" flow is a real refinement but adds a lot of extra state machinery; this
  version blocks cleanly before spending anything, which achieves the same practical
  goal (can't finish without enough credits) more simply.

### Setup — making the AI builder actually run

1. **OpenAI API key**: platform.openai.com → API keys → create one (attach a project,
   set a usage budget). Do **not** put this in `.env` — unlike Firebase's config, this key
   must never ship inside the client app, or anyone could extract it from the app bundle
   and spend your budget.
2. **Firebase Blaze plan** (pay-as-you-go): required for Cloud Functions to run at all,
   and already needed for Phone Auth SMS beyond the free 10/day.
3. Install the CLI and set the key as a Cloud Functions secret (server-side only):
   ```
   npm install -g firebase-tools
   firebase login
   cd site-builder
   firebase use --add          # pick sitespark-a5817 (or your project)
   firebase functions:secrets:set OPENAI_API_KEY
   ```
4. Deploy:
   ```
   firebase deploy --only functions,firestore:rules,storage
   ```
5. From then on, signing in provisions 8 free credits automatically, and the AI Site
   Builder button (New Project → pick a page type → "AI Site Builder") is live.

## Phase 4 — Credits, Subscriptions & Paywall

**Partially built in Phase 3**: the credit ledger itself is real (server-side balance,
transactional deduction, refund-on-failure — see `firebase/functions/src/index.ts`), and
`src/data/pricing.ts` has the real Beginner/Middle Class/Advanced plans and credit-pack
pricing you specified. `SubscriptionScreen` shows all of it. What's still missing:

- **Real purchases.** Selecting a plan or pack on `SubscriptionScreen` currently just
  closes the screen — no charge happens, matching the existing theme-purchase "demo mode"
  pattern. Making it real means Apple In-App Purchase / StoreKit, **not** card payments —
  Apple requires IAP for digital goods consumed inside an iOS app (guideline 3.1.1).
  Needed from you: App Store Connect access to create the IAP products (you have this
  now), plus server-side receipt validation wired into the same credit ledger.
- **Post-signup/sign-in offer modal** with a dismiss-after-5-seconds close button,
  shown until the user hits their credit limit — not built yet.
- **Weekly credit reset + minimum-usage requirement** for the Middle Class plan, and
  monthly resets for Beginner/Advanced — the pricing data models this
  (`minimumUsageNote`/`billingPeriod`) but no scheduled function enforces it yet.

## Phase 5 — AI Chat Assistant (full app control) — done

A persistent chat assistant ("Spark"), reachable via a floating button on every
signed-in screen (`src/components/assistant/AssistantLauncher.tsx`). Real OpenAI-backed
conversation, with structured-output actions the client executes to actually drive the
app rather than just describe what to do:

- **Real conversation** — `firebase/functions/src/assistant.ts`'s `chatWithAssistant` calls
  OpenAI with the user's current screen/credits/plan/project count as context, using the
  same `OPENAI_API_KEY` secret and per-plan model tier as the site builder (Phase 3).
- **Real app control** — the model's structured response can include up to 3 actions:
  `navigate` (Projects/NewProject/Subscription/Account), `startBuildFlow` (opens the
  AI-vs-manual picker for a page type), `startAIBuild` (opens the AI prompt screen
  pre-filled with a prompt it wrote from the conversation), `openSubscription`,
  `openAccount`. Actions only ever *open a screen* for the user to confirm — the
  assistant itself never spends credits or starts a paid build on its own.
- **Persistent history** — messages are stored per-account in
  `users/{uid}/assistantMessages` (client-owned, like projects — see `firestore.rules`),
  so the conversation survives app restarts.
- Navigation from outside the screen tree uses a `navigationRef`
  (`src/navigation/navigationRef.ts`), the standard React Navigation pattern for
  navigating from a component that isn't itself a screen.

Not covered yet: the assistant can't edit canvas elements directly (add/move/style a
specific element via chat) — that's a larger scope than "app control" navigation and
isn't part of this phase.

## Phase 6 — Video Page Editor

- Real cut/split timeline, an audio track layer, and picking a video from the camera
  roll to use as a sound source. This is a substantial native-video feature on its own
  (likely `expo-av`/`react-native-video` + a custom timeline UI) and was intentionally
  left out of Phase 1 rather than faked.

## Phase 7 — Publishing & Domains — publish + connect-your-own-domain done

**Publishing (done).** `PublishScreen` (open via the cloud-upload icon in the editor
header) turns a project into a real, publicly reachable static page:

- The client uploads any locally-picked photos (device `file://` URIs) to Storage first
  (`uploadProjectImage`), since Cloud Functions can't reach a file that only exists on
  the user's phone.
- `publishProject` renders the project's canvas elements into real static HTML/CSS
  (`firebase/functions/src/siteHtml.ts`) and stores it in `publishedSites/{slug}`.
- `servePublishedSite` (a Hosting rewrite, `firebase.json`'s `hosting.rewrites`) serves
  it publicly at `https://<project>.web.app/s/{slug}` — no auth required to view it.
- `unpublishProject` takes it back down.

**Connect your own domain (done, needs one manual IAM step).** Also in `PublishScreen`:
`connectDomain`/`getDomainStatus`/`disconnectDomain` call the real Firebase Hosting
Domains REST API (`firebase/functions/src/hostingApi.ts`) so a user can point a domain
they already own at their published site — just DNS records at whatever registrar they
already use, no new accounts. **One-time setup needed from you:** grant the Cloud
Functions service account the **Firebase Hosting Admin** IAM role (Google Cloud Console
→ IAM → find `<project-id>@appspot.gserviceaccount.com` → Edit → Add Role → "Firebase
Hosting Admin"), or `connectDomain` will fail with a permission error. This API surface
hasn't been exercised against your live project yet — treat the first real attempt as
something we debug together from a screenshot, like the rest of this build.

**Buying a brand-new domain from inside the app, and ownership transfer, are still not
built.** Both require becoming a reseller with a registrar (e.g. Namecheap, Cloudflare
Registrar, GoDaddy) with a real transactional API and your own payment processing (this
is a real-world good, not IAP digital content) — I can wire the integration once you
have that account and key, but can't create the account or hold funds on your behalf.
Transfer specifically also needs EPP/auth codes from the losing registrar and
ICANN-mandated wait periods outside any app's control.

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
