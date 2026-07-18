# SiteSpark — iOS Site/Video/Social/Logo Builder (Phase 1 + 2 + 3 + 5 + 6 + 7)

An Expo + React Native + TypeScript app for building site pages, logo canvases, and
social/video-sized pages — by hand, or generated for you by a real AI builder — behind
real Firebase accounts, with a persistent AI chat assistant that can drive the app for
you, and real one-tap publishing to a live public URL.

This is **Phase 1 (manual editor) + Phase 2 (accounts/auth) + Phase 3 (AI site builder) +
Phase 5 (AI chat assistant) + Phase 7 (publishing & connect-your-domain)** of a larger
product (subscriptions/IAP, video editor, buying new domains — see `ROADMAP.md` for
what's built vs. what's next and what real accounts each later phase needs).

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
                                    stripeWebhook (real Namecheap + Stripe)
public/                           Firebase Hosting's static root (placeholder landing
                                    page) -- /s/** is rewritten to servePublishedSite
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
  2), and server-side credit deduction (8 free on signup).
- Real persistent AI chat assistant ("Spark"): a floating button on every signed-in
  screen opens a chat that answers questions and can drive the app for you — jump to
  your projects, open the build picker for a page type, or open the AI prompt screen
  pre-filled with a site description it wrote from your message. Conversation history
  is saved per-account so it's still there next time you open the app.
- Real one-tap publishing: tap the cloud icon in the editor header to make a project a
  real, publicly reachable website, connect a domain you already own to it, or buy a
  brand-new domain (real Namecheap registration, real Stripe payment) from inside the
  app — see `PublishScreen`, `BuyDomainScreen`, and Phase 7 in ROADMAP.md.
- Projects and unlocked themes are stored in Firestore per-account, so signing in
  restores your builds.
- Create a project for Web Page, Video Page, Social (9:16) Page, or Logo Page.
- Pick Blank, a free theme, or a locked luxury theme ($189) / luxury-crazy theme ($399)
  — locked themes show a purchase modal (demo unlock, no real payment yet).
- Canvas editor: drag to move, corner-handle to resize, tap to select any element.
- Add text, images (from the photo library), shapes, icons, buttons, flags, a
  slideshow block, and a real video block (trim in/out, loop, mute, and an optional
  second clip used just for its audio) from the Elements tab.
- Page-level announcement bar: up to 2 bars, on/off toggle, auto-slide toggle, per-bar
  text/color editing.
- Projects list: rename (long-press), delete, reopen. Account screen: sign out.

## Known gaps (see ROADMAP.md for the full breakdown)

- Theme purchases, credit packs, and subscriptions all show real pricing but no real
  charge yet — need Apple In-App Purchase wiring (App Store Connect setup).
- Video Page's cut/split/audio-overlay tools aren't built yet — the New Project screen
  says so rather than pretending they work.
- AI-build credit costs are checked and deducted upfront, not mid-build — see
  ROADMAP.md Phase 3 "Scoping decisions" for why.
- A persistent AI chat assistant with full app control, and real domain purchase/transfer,
  are not part of this phase.
