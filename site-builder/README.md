# SiteSpark — iOS Site/Video/Social/Logo Builder (Phase 1-11)

An Expo + React Native + TypeScript app for building site pages, logo canvases, and
social/video-sized pages — by hand, or generated for you by a real AI builder — behind
real Firebase accounts, with a persistent AI chat assistant that can drive the app for
you, real one-tap publishing to a live public URL, a real storefront (products or
real-life service bookings) with payouts to your own bank account, and real OS push
notifications.

> ⚠️ **This folder is nested inside a different app's repo** (the parent folder is
> TrackLine, a separate unrelated app) — always run commands from *this* folder, never the
> parent one. See the callout at the top of `ROADMAP.md` for why this matters.

This is **Phase 1 (manual editor) + Phase 2 (accounts/auth) + Phase 3 (AI site builder) +
Phase 4 (subscriptions/IAP) + Phase 5 (AI chat assistant) + Phase 6 (video editor) +
Phase 7 (publishing & domains) + Phase 8 (policies/support) + Phase 9 (billing-failure
notifications & site suspension) + Phase 10 (storefront/payouts) + Phase 10b (real-life
service bookings) + Phase 11 (real push notifications)** — see `ROADMAP.md` for what's
built vs. what's next and what real accounts each phase needs.

## Stack

- Expo SDK 57, React Native 0.86, TypeScript (strict)
- React Navigation (native-stack), gated by auth state
- Firebase Auth (Google, Apple, email+password, phone+SMS) and Firestore (projects,
  unlocked themes, credits, AI build sessions) — see `src/services/firebase.ts`
- Firebase Cloud Functions (`firebase/functions/`) calling OpenAI for real site
  copy/layout + image generation, with server-side credit deduction
- `expo-image-picker` for photo library access
- `react-native-svg` for shape rendering, `@expo/vector-icons` for the icon library

## Project layout

```
App.tsx                        Provider tree (Auth + Nav) + navigator mount
src/
  types/                        Project, Page, CanvasElement, Theme types
  config/env.ts                  Reads Firebase/Google config from app.config.js "extra"
  services/
    firebase.ts                   Firebase app/auth (RN-persisted)/firestore init
    recaptcha/                    Custom invisible-reCAPTCHA WebView for phone auth
    pushNotifications.ts           Real Expo push token registration/removal
  context/
    AuthContext.tsx                Firebase Auth state + email/phone/Google/Apple methods
    EditorContext.tsx               Selected project/element state + mutations, autosaves
  hooks/usePhoneVerification.ts   Wires the reCAPTCHA modal to Firebase phone sign-in
  data/
    themes.ts                    Theme catalog: blank, free, luxury ($189), luxury-crazy ($399)
    canvasSizes.ts                Per-page-type canvas dimensions + copy
    elementsLibrary.ts             Icons/shapes/buttons/flags library data
  storage/
    projectsStore.ts               Firestore CRUD for projects (users/{uid}/projects)
    unlockedThemesStore.ts         Firestore-backed unlocked-theme tracking
    userAccountStore.ts            Credit balance + plan (read-only client side)
    generationSessionStore.ts      Live AI-build progress subscription
    assistantMessagesStore.ts      Persistent chat-assistant message history
  data/pricing.ts                  Plans, credit packs, build-cost estimator (client copy)
  components/
    BillingBanner.tsx               Real-time in-app warning when a subscription payment
                                    fails, and when a site's been suspended over it
    OrderBanner.tsx                 Real-time in-app notice when a store order comes in
    canvas/                        Canvas, DraggableElement (drag+resize), ElementRenderer,
                                    AnnouncementBarView
    inspector/                     Per-element style controls (color, size, text, image)
    elements/                      ElementsPanel (library grid), AnnouncementPanel
    assistant/                     AssistantLauncher (floating button, every signed-in
                                    screen), AssistantChatScreen (chat UI + action execution)
  screens/
    auth/                          Welcome, EmailAuth, ForgotPassword, PhoneAuth, PhoneVerify
    AccountScreen.tsx               Signed-in identity, credit balance + sign out
    ProjectsScreen.tsx              Dashboard + "+" create button
    NewProjectScreen.tsx            Page-type picker (Web/Video/Social/Logo)
    BuildMethodScreen.tsx           Manual vs. AI Site Builder choice
    ThemeGalleryScreen.tsx          Theme picker with priced-tier unlock modal
    AIPromptScreen.tsx              4,000-word prompt + complexity + cost estimate
    AIBuildProgressScreen.tsx       Live status/credits/pause (max 2) while the AI builds
    SubscriptionScreen.tsx          Real plans/credit-pack pricing (demo purchase for now)
    EditorScreen.tsx                Main canvas editor
    PublishScreen.tsx               Publish/unpublish + connect-your-own-domain
    BuyDomainScreen.tsx             Real domain search, registrant form, Stripe checkout
    TransferDomainScreen.tsx        Inbound domain transfer (EPP code + registrant form)
    PolicyScreen.tsx                Privacy Policy / Return & Refund Policy
    SupportScreen.tsx               Contact info + FAQ
    SellerAccountScreen.tsx         Real Stripe Connect payout onboarding + dashboard link
    OrdersScreen.tsx                Real store orders, net of platform fee
  navigation/
    RootNavigator.tsx               Switches Auth stack vs. App stack on auth state
    AuthNavigator.tsx
firebase/
  firestore.rules                  Restricts every doc to its owning uid; credits/sessions
                                    are server-write-only
  storage.rules                    Locked down entirely (Admin SDK + signed URLs only)
  functions/                       Cloud Functions: startGeneration, requestPause,
                                    resumeGeneration, askBuildQuestion, ensureAccount,
                                    onUserCreated, assistantChat (OpenAI-backed),
                                    publishProject/unpublishProject/servePublishedSite,
                                    connectDomain/getDomainStatus/disconnectDomain,
                                    checkDomainAvailability/createDomainCheckout/
                                    stripeWebhook (real Namecheap + Stripe),
                                    startDomainTransfer/getDomainTransferStatus,
                                    verifyApplePurchase (real Apple IAP),
                                    appStoreServerNotifications (real Apple billing
                                    webhook, JWS-verified) + enforceBillingSuspensions
                                    (scheduled site suspension on payment failure),
                                    createSellerOnboardingLink/getSellerAccountStatus/
                                    createSellerDashboardLink (real Stripe Connect payouts),
                                    createStoreCheckout (public, real multi-item cart +
                                    booking checkout), stripeWebhook also creates real
                                    Order docs + decrements inventory on a completed store
                                    sale/booking, sends a real push notification
                                    (pushApi.ts, via Expo's push service) for billing
                                    warnings and new orders/bookings
public/                           Empty on purpose -- Firebase Hosting requires this dir
                                    to exist, but every request (any attached domain,
                                    any path) is rewritten to servePublishedSite, which
                                    renders content dynamically based on hostname. That
                                    includes buildsitespark.com's own real marketing site
                                    (home/pricing, /privacy, /returns, /support) --
                                    see siteHtml.ts's marketingShell and friends
```

## Setup

```
npm install
cp .env.example .env    # then fill in Firebase + Google config — see ROADMAP.md "Setup"
npx expo start          # then press i for iOS simulator, or scan the QR code in Expo Go
```

Auth will not work until `.env` has real Firebase project config — **ROADMAP.md** has the
exact Firebase Console / Google Cloud Console / Apple Developer steps.

## What works today

- Real Firebase Auth: Google, Apple, email+password (with reset), phone+SMS (with resend,
  30s cooldown) — once you've filled in `.env` per ROADMAP.md.
- Real AI Site Builder: describe a site in up to 4,000 words, pick a detail level, and a
  Cloud Functions backend calls OpenAI to write real copy and generate real images,
  laying them onto an editable canvas — with live progress, pause-to-add-something (max
  2), and server-side credit deduction (30 free on signup).
- Real persistent AI chat assistant ("Spark"): a floating button on every signed-in
  screen opens a chat that answers questions and can drive the app for you — jump to
  your projects, open the build picker for a page type, or open the AI prompt screen
  pre-filled with a site description it wrote from your message. Conversation history
  is saved per-account so it's still there next time you open the app.
- Real one-tap publishing: tap the cloud icon in the editor header to make a project a
  real, publicly reachable website at its own free `yourproject.buildsitespark.com`
  link, connect a domain you already own to it, or buy a brand-new domain (real
  Namecheap registration, real Stripe payment) from inside the app — see
  `PublishScreen`, `BuyDomainScreen`, and Phase 7 in ROADMAP.md.
- Projects and unlocked themes are stored in Firestore per-account, so signing in
  restores your builds.
- Create a project for Web Page, Video Page, Social (9:16) Page, or Logo Page.
- Pick Blank, a free theme, or a locked luxury theme ($189) / luxury-crazy theme ($399)
  — locked themes purchase via real Apple In-App Purchase, verified server-side before
  unlocking (see Phase 4 in ROADMAP.md).
- Canvas editor: drag to move, corner-handle to resize, tap to select any element.
- Add text, images (from the photo library), shapes, icons, buttons, flags, a
  slideshow block, and a real video block (trim in/out, loop, mute, and an optional
  second clip used just for its audio) from the Elements tab.
- Page-level announcement bar: up to 2 bars, on/off toggle, auto-slide toggle, per-bar
  text/color editing.
- Projects list: rename (long-press), delete, reopen. Account screen: sign out.
- Real billing-failure handling: if a subscription renewal fails, a real-time in-app
  banner warns you, your published sites stay up for a grace period, and if payment still
  isn't resolved they're automatically taken down (and automatically restored the moment
  payment succeeds) — see Phase 9 in ROADMAP.md.
- Real storefront: add Product blocks to any page, and buyers can add several to a real
  cart and check out for real — the money is split at checkout and lands directly in your
  own Stripe account (set up once in "My Store & Payouts"), never routed through
  SiteSpark's own balance. Real order records, a real-time in-app new-order banner, and a
  real email the moment someone buys something — see Phase 10 in ROADMAP.md.
- Each Product block picks what it is: a physical good (buyer chooses pickup/delivery/both)
  or a real-life service booking (buyer picks a date/time + notes, one real one-time
  payment, never a subscription) — mix both on the same page, e.g. a car wash's bookable
  wash plus a physical add-on. See Phase 10b in ROADMAP.md.
- Real OS push notifications for billing warnings and new orders/bookings, on top of the
  existing in-app banners and order emails — reaches you even with the app closed. See
  Phase 11 in ROADMAP.md.

## Known gaps (see ROADMAP.md for the full breakdown)

- A post-signup "here's what you get" offer modal, and scheduled weekly credit
  reset/minimum-usage enforcement for the Middle Class plan, aren't built yet.
- Buying a brand-new domain from inside the app requires you to have a registrar API
  account already set up (Namecheap) — done for this project, but a new deploy would
  need its own.
- Video's multi-clip timeline/splice UI and physical video re-encoding (for a merged
  export) aren't built — current support is one trimmed clip + optional audio overlay,
  played back at the trim in the app and on a published page.
- AI-build credit costs are checked and deducted upfront, not mid-build — see
  ROADMAP.md Phase 3 "Scoping decisions" for why.
- A voluntary subscription cancellation doesn't trigger any billing-failure handling (by
  design — see Phase 9), and what happens to a plan/credits after a cancelled
  subscription's period fully lapses isn't built yet.
- Bookings (Phase 10b) have no real calendar/time-slot availability — nothing stops two
  buyers from booking the same date/time for the same service; a seller confirms/manages
  their actual schedule outside the app for now.
- Storefront (Phase 10) doesn't support product variants (size/color), in-app refunds (use
  the Stripe Dashboard directly for now), or shipping/fulfillment tracking — a seller
  handles fulfillment themselves once they see an order, same as most small storefronts.
