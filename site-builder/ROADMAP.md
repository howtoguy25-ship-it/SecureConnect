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

## Phase 4 — Credits, Subscriptions & Paywall — real purchases done

`SubscriptionScreen` (plans + credit packs) and `ThemeGalleryScreen` (luxury/luxury-crazy
tier unlocks) now trigger **real Apple In-App Purchase** instead of a demo close-the-screen
button, using `react-native-iap` (`src/services/iap.ts`):

- **9 real products** — see the exact product IDs/prices in `src/data/iapProducts.ts`
  (mirrored server-side in `firebase/functions/src/iapProducts.ts`): 3 auto-renewable
  subscriptions, 4 consumable credit packs, 2 non-consumable theme-tier unlocks (one
  tier purchase unlocks every theme currently in that tier, not per individual theme).
- **Server-authoritative verification.** `verifyApplePurchase` (Cloud Function) calls
  Apple's real App Store Server API (`firebase/functions/src/appStoreApi.ts`) to fetch
  and decode the actual signed transaction — the client never gets to just claim "I paid."
  Only after that succeeds does the function apply the real effect: top up credits,
  set the account's plan, or unlock a theme tier. Idempotent against Apple redelivering
  the same transaction (`processedAppleTransactions` collection).
- **Theme unlocks are no longer client-writable.** `users/{uid}/meta/unlockedThemes` was
  fully client-writable before (fine when it was a no-payment demo) — now that it's a
  real $189/$399 purchase, `firestore.rules` locks it to server-write-only so nobody can
  grant themselves a theme for free.
- **Untested territory, flagged in code:** like the Namecheap transfer API and Firebase
  Hosting Domains API before it, the App Store Server API integration hasn't been
  exercised against a real Apple transaction from this sandbox — treat the first real
  purchase as something to debug together from a screenshot.

**One-time setup needed from you** (in addition to the 9 App Store Connect products —
exact IDs/prices in `iapProducts.ts`):
1. App Store Connect → **Users and Access → Integrations → In-App Purchase** → generate
   a new key. Note the **Key ID** and **Issuer ID**, and download the `.p8` file (Apple
   only lets you download it once).
2. Set three secrets the same safe way as every other credential in this project
   (`firebase functions:secrets:set <NAME> --data-file <path>`, never pasted in chat):
   `APPLE_IAP_KEY_ID`, `APPLE_IAP_ISSUER_ID`, and `APPLE_IAP_PRIVATE_KEY` (the full
   contents of the downloaded `.p8` file).
3. `expo-video`/`expo-audio`-style native module — **`react-native-iap` needs a fresh
   `eas build`** (a JS-only reload/pull isn't enough) before purchases will work on a
   real device.

**Still not built:** a post-signup "here's what you get" offer modal, and the scheduled
weekly credit reset + minimum-usage enforcement for the Middle Class plan (the pricing
data models this via `minimumUsageNote`/`billingPeriod`, but no Cloud Scheduler function
enforces it yet).

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

## Phase 6 — Video Page Editor — done

Video is a real element type now (`VideoElement`), addable from the editor's **Video**
tab (picks a clip from the camera roll, same as Image/Slideshow):

- **Real trim.** `trimStartMs`/`trimEndMs` play back only that range — both in the app
  (via `expo-video`'s player, seeking/looping in `ElementRenderer.tsx`) and on a published
  page (`siteHtml.ts` renders a real `<video>` with a small inline script enforcing the
  same range). This is playback-time trimming, not physical re-encoding — no ffmpeg
  dependency, no native rebuild, and it's genuinely what plays back either way.
- **Real audio-track overlay.** Picking a second clip "for its sound" (`audioUri`) plays
  that clip's audio in sync with the main video's play/pause state, via `expo-audio` in
  the app and a synced `<audio>` element on the published page — with the main clip's own
  audio optionally muted (`muted`) so the picked track can replace or layer over it.
- **Real upload path for large files.** Video/audio don't fit through the
  base64-over-onCall approach images use (`uploadProjectImage`) — request bodies are
  capped well below what even a short clip needs. Instead `createUploadUrl` hands the
  client a short-lived signed **PUT** URL and it uploads bytes straight to Storage
  (`uploadLocalVideo` in `src/services/uploads.ts`), sidestepping that ceiling entirely.

Not built: a visual multi-clip timeline/splice UI (currently one video element at a time,
positioned/resized like any other canvas element) and physical video re-encoding (e.g. for
downloading a merged export) — both real, separate pieces of scope beyond in-app/published
playback.

## Phase 7 — Publishing & Domains — publish + connect-your-own-domain done

**Publishing (done).** `PublishScreen` (open via the cloud-upload icon in the editor
header) turns a project into a real, publicly reachable static page:

- The client uploads any locally-picked photos (device `file://` URIs) to Storage first
  (`uploadProjectImage`), since Cloud Functions can't reach a file that only exists on
  the user's phone.
- `publishProject` renders the project's canvas elements into real static HTML/CSS
  (`firebase/functions/src/siteHtml.ts`) and stores it in `publishedSites/{slug}`.
- **Free branded subdomain.** Every published project's default URL is a real subdomain
  of the product's own domain — `https://{slug}.buildsitespark.com` — not a generic
  Firebase URL. Because Firebase Hosting can't vary its rewrites/content by Host header
  (every custom domain attached to a Hosting site shares the same config), a single
  catch-all rewrite (`firebase.json`'s `hosting.rewrites`, `"source": "**"`) routes
  *every* request on *every* attached domain to `servePublishedSite`, which resolves
  what to serve purely from the request's hostname: a `{slug}.buildsitespark.com`
  subdomain maps directly to that project; the bare domain (or any unrecognized host)
  falls back to the product's own landing page (`renderLandingPageHtml` in
  `siteHtml.ts` — there's no static `public/index.html` anymore, since a static file
  would otherwise take priority over the rewrite and break per-subdomain routing);
  old `*.web.app/s/{slug}` links from before this domain existed still work too.
- `unpublishProject` takes it back down.

**One-time setup needed for the free-subdomain scheme:** add `*.buildsitespark.com`
(the literal wildcard) as a second custom domain on the same Firebase Hosting site that
already serves `buildsitespark.com` — Firebase Console → Hosting → Add custom domain →
`*.buildsitespark.com`. It'll ask for a wildcard DNS record (A or CNAME, per what
Firebase's UI shows) at GoDaddy, same as the root domain's setup.

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

**Buying a brand-new domain from inside the app (done).** `BuyDomainScreen` (from
Publish → Custom domain → "Buy a new domain") does a real search, real pricing, and a
real registration:

- `checkDomainAvailability` and `createDomainCheckout` call Namecheap's real XML API
  (`firebase/functions/src/namecheapApi.ts`) for availability + `users.getPricing`, and
  create a real Stripe Checkout session (`firebase/functions/src/stripeApi.ts`) —
  payment happens on Stripe's own hosted page (opened in an in-app browser), **not**
  native Apple IAP, since a registered domain is a real-world service, not digital app
  content (this is the same pattern Wix/Squarespace's iOS apps use).
- `stripeWebhook` (public `onRequest`, signature-verified) only registers the domain via
  `registerDomain` **after** Stripe confirms payment (`checkout.session.completed`), and
  is idempotent against Stripe's webhook retries — the domain is never registered
  without payment clearing, and never registered twice.
- A `DomainPurchase` record (`users/{uid}/domainPurchases/{id}`, owner-read/server-write
  only) tracks status (`pending → paid → registering → registered`/`failed`) for the
  client's live progress UI.
- Real WHOIS privacy (WhoisGuard) is requested automatically so the registrant's real
  contact info — required by ICANN, collected in the app's registrant form — isn't
  publicly exposed.
- Pricing is Namecheap's real cost plus a flat `DOMAIN_MARKUP_USD` (currently $5,
  `firebase/functions/src/index.ts`) — a business knob, change it there.

**One-time infrastructure this needed (already done for `sitespark-a5817`):**
Namecheap's API only accepts calls from a whitelisted IP, so Cloud Functions needed a
static outbound IP:
```
gcloud services enable compute.googleapis.com vpcaccess.googleapis.com
gcloud compute addresses create sitespark-nat-ip --region=us-central1
gcloud compute networks vpc-access connectors create sitespark-connector --region=us-central1 --network=default --range=10.8.0.0/28
gcloud compute routers create sitespark-router --region=us-central1 --network=default
gcloud compute routers nats create sitespark-nat --router=sitespark-router --region=us-central1 --nat-external-ip-pool=sitespark-nat-ip --nat-all-subnet-ip-ranges
```
That IP (`35.223.117.40`) is whitelisted on the Namecheap account and hardcoded as
`NAMECHEAP_CLIENT_IP` in `namecheapApi.ts` — if the address is ever recreated, update
both places. The functions that call Namecheap route through `sitespark-connector`
(`vpcConnector`/`vpcConnectorEgressSettings` in their options).

**Secrets required:** `NAMECHEAP_API_USER`, `NAMECHEAP_API_KEY`, `NAMECHEAP_USERNAME`,
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` — all set via
`firebase functions:secrets:set <NAME> --data-file <path>` (never pasted into a chat or
typed at an unmasked prompt). The Stripe webhook secret comes from creating the webhook
endpoint in the Stripe Dashboard (Developers → Webhooks → Add endpoint) pointing at the
deployed `stripeWebhook` function's URL, listening for `checkout.session.completed`.

**Not built:** auto-configuring DNS after registration — once a domain is bought here,
use the existing "Connect a domain you already own" flow above to point it at the
published site (Namecheap's own DNS records aren't wired to Firebase Hosting
automatically yet).

## Phase 7c — Inbound domain transfer — done (with real scoping limits)

`TransferDomainScreen` (Publish → Custom domain → "Own one elsewhere? Transfer it in")
brings a domain the user already owns at a **different** registrar into this Namecheap
account:

- `startDomainTransfer`/`getDomainTransferStatus` call Namecheap's real
  `domains.transfer.create`/`transfer.getStatus` API (`namecheapApi.ts`). The user
  supplies the domain, its EPP/auth code (from their current registrar — outside this
  app), and registrant contact.
- A `DomainTransfer` record (owner-read/server-write-only Firestore doc) tracks status
  for the "Check status" button — transfers are approved by the *losing* registrar and
  ICANN mandates a ~5-7 day window, so this is inherently slow and nothing any app can
  speed up.
- **Untested territory, flagged in code:** unlike domains.check/create/pricing (already
  run for real this session), the transfer API's exact response shape
  (`TransferCreateResult`/`DomainGetTransferStatusResult` fields) hasn't been exercised
  against a live account — treat the first real attempt as something to debug together.
- **Not charged.** Unlike buying a new domain, an inbound transfer isn't gated behind
  Stripe payment yet — the ~1 year renewal cost Namecheap charges on transfer completion
  is absorbed on the product's own Namecheap balance for now. Add a Stripe charge here
  before this scales past you personally testing it.
- **Outbound transfer** (moving a domain *out* of this Namecheap account to another
  registrar) is **not built**. That needs unlocking the domain and retrieving its EPP
  code — Namecheap's public API support for scripting that specific pair of actions
  isn't something I could confidently verify without testing against a live account, so
  rather than ship code that might silently not work, this is left as: use Namecheap's
  own dashboard directly (Domain List → Manage → unlock + "Get EPP Code") for now.

**The product's own domain:** `buildsitespark.com` (registered via GoDaddy) is
SiteSpark's official company site — the dynamically-rendered landing page
(`renderLandingPageHtml` in `siteHtml.ts`, see Phase 7 above) — **not** an end-user
project, so it's connected differently from the in-app "Connect a domain" feature
(which maps one user's domain to one published project via `domainMappings`). Instead
it's added as a native Firebase Hosting custom domain for the whole default site:
1. Firebase Console → Hosting → **Add custom domain** → enter `buildsitespark.com`
2. Add the TXT ownership-verification record it shows you, and the A records, at
   GoDaddy (My Products → DNS → Manage DNS)
3. Wait for Firebase to verify + issue the SSL cert (can take a few hours)
4. Repeat for `*.buildsitespark.com` (the wildcard needed for every project's free
   subdomain — see Phase 7 above) on the same Hosting site

## Phase 8 — Policies & Support — done

`AccountScreen` now links to three real screens instead of just a raw mailto/tel row:

- **Privacy Policy** (`PolicyScreen`, `policyType: 'privacy'`) — real content
  (`src/data/policies.ts`) describing what's actually collected and who it's actually
  shared with given what's built: Firebase (hosting/auth/data), OpenAI (AI Site Builder +
  assistant prompts), Stripe (domain payments), Namecheap (real registrant contact for
  domain purchases/transfers, WHOIS privacy noted), and Apple IAP (once live).
- **Return & Refund Policy** (`policyType: 'returns'`) — correctly splits Apple-handled
  refunds (subscriptions, credit packs, theme unlocks — all IAP) from Stripe-handled
  domain purchases/transfers (generally non-refundable once registered, standard
  industry/ICANN practice, with the app's own fail-safe: payment is only captured and the
  domain only registered once both succeed).
- **Support** (`SupportScreen`) — contact info plus a real FAQ reflecting actual features
  (credits, editing an AI-generated site afterward, unpublishing, custom domains, card
  data never touching SiteSpark's own servers).

**This is accurate-to-the-code, not legally reviewed.** Have an actual lawyer check this
before App Store submission — especially anything GDPR/CCPA-shaped depending on where
your users are, which this content doesn't attempt to cover.

## Phase 9 — Billing failure notifications & site suspension — done

"Monthly bill payment" maps to the one real recurring payment this app has: the
beginner/middle/advanced subscription (there's no separate "hosting fee" product). When a
renewal payment fails, the account gets a warning and a grace period; if it isn't resolved,
every site the account has published comes down automatically — and comes back the moment
payment succeeds.

- **Real inbound webhook, really verified.** `appStoreServerNotifications` (public
  `onRequest`) is Apple's **App Store Server Notifications V2** endpoint. Unlike every other
  Apple integration in this app (which only ever calls *out* to Apple, so trusting the HTTPS
  channel is enough), this is a URL anyone could POST a forged "payment failed"/"payment
  succeeded" event to — so every payload's JWS signature chain is verified against Apple's
  real root CA (`firebase/functions/src/appStoreNotifications.ts`, using Apple's own
  `@apple/app-store-server-library`, with online OCSP revocation checks enabled) before any
  of its contents are trusted.
- **Two-stage response, matching what was asked for:**
  1. First renewal-failure notification (`DID_FAIL_TO_RENEW`) → the account's `billingStatus`
     becomes `past_due` and a `billingNotice` is written — surfaced in the app as a real-time
     banner (`src/components/BillingBanner.tsx`, mounted alongside every signed-in screen,
     same pattern as the assistant's floating button) reading "Payment failed... your site
     will be taken offline automatically if this isn't resolved within a few hours." The
     site itself stays fully up during this window.
  2. `enforceBillingSuspensions` (scheduled function, every 15 minutes) suspends every
     published site once `paymentFailedAt` is older than `BILLING_GRACE_PERIOD_MS` (4 hours —
     the midpoint of the requested 3-5 hour window, change the constant in `index.ts` to
     adjust it). A suspended site serves a real "temporarily unavailable" page
     (`renderSuspendedSiteHtml` in `siteHtml.ts`) instead of a raw 404 or its real content.
  3. The moment Apple reports a successful renewal (`DID_RENEW`)/`SUBSCRIBED`, or the user
     buys/restores the subscription again from inside the app (`verifyApplePurchase`),
     `billingStatus` goes back to `active` and every suspended site is unsuspended in the
     same request — no manual re-publish needed.
- **Idempotent against Apple's own retry behavior.** Apple keeps retrying a failed renewal
  in the background for weeks; repeat `DID_FAIL_TO_RENEW` notifications for an account
  that's already `past_due` (or already `suspended`) don't reset the grace-period clock or
  re-fire the warning.
- **Mapping Apple's transaction IDs back to an account.** Apple's notifications only ever
  carry its own `originalTransactionId`, never this app's `uid` — `verifyApplePurchase`
  records that mapping (`appleOriginalTransactions/{originalTransactionId} -> {uid}`,
  Admin-SDK-only) the first time a subscription purchase is verified, so the webhook can
  look the right account up.

**Deliberately out of scope:** a *voluntary* cancellation (`Subtype.VOLUNTARY`) is not
treated as a billing failure and never suspends anything — same as Apple's own model, the
user keeps their site through the period they already paid for. What happens to their
plan/credits after that period fully lapses (downgrade to the free plan, etc.) is a
separate subscription-lifecycle feature, not built here. Push notifications (an actual OS
notification, not just an in-app banner) also aren't built — there's no APNs/device-token
infrastructure anywhere in this app yet, so "display a notification" is implemented as a
real-time in-app banner instead, which needed no new infrastructure and is seen the moment
the app is open, same as the assistant's chat history.

**One-time setup needed from you:** App Store Connect → your app → **App Store Server
Notifications** → set the **Production** and **Sandbox Server URLs** to the deployed
`appStoreServerNotifications` function's URL (same place/format as `stripeWebhook`'s Stripe
Dashboard setup in Phase 7 — `firebase deploy` prints the URL after deploying). No new
secrets are needed — verification uses Apple's public root certificate, embedded directly
in `appleRootCert.ts`.

## Notes on the "animal-tier" AI speed/strength framing

The Beginner/Immediate/Advanced plans map to different underlying model
choice/parameters (e.g., a smaller/faster model vs. a stronger one, different max
thinking budget) rather than literally "3x/5x speed" — actual latency depends on the
model provider. Phase 3 will pick concrete models per tier once the LLM provider is
chosen.
