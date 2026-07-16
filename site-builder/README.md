# SiteSpark — iOS Site/Video/Social/Logo Builder (Phase 1 + 2)

An Expo + React Native + TypeScript app for building site pages, logo canvases, and
social/video-sized pages by hand: pick a theme, drag/resize elements, add text, images,
slideshows, and an announcement bar — now behind real Firebase accounts.

This is **Phase 1 (manual editor) + Phase 2 (accounts/auth)** of a much larger product (AI
site builder, subscriptions, domains — see `ROADMAP.md` for what's built vs. what's next
and what real accounts each later phase needs).

## Stack

- Expo SDK 57, React Native 0.86, TypeScript (strict)
- React Navigation (native-stack), gated by auth state
- Firebase Auth (Google, Apple, email+password, phone+SMS) and Firestore (projects,
  unlocked themes) — see `src/services/firebase.ts`
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
  components/
    canvas/                        Canvas, DraggableElement (drag+resize), ElementRenderer,
                                    AnnouncementBarView
    inspector/                     Per-element style controls (color, size, text, image)
    elements/                      ElementsPanel (library grid), AnnouncementPanel
  screens/
    auth/                          Welcome, EmailAuth, ForgotPassword, PhoneAuth, PhoneVerify
    AccountScreen.tsx               Signed-in identity + sign out
    ProjectsScreen.tsx              Dashboard + "+" create button
    NewProjectScreen.tsx            Page-type picker (Web/Video/Social/Logo)
    ThemeGalleryScreen.tsx          Theme picker with priced-tier unlock modal
    EditorScreen.tsx                Main canvas editor
  navigation/
    RootNavigator.tsx               Switches Auth stack vs. App stack on auth state
    AuthNavigator.tsx
firebase/firestore.rules          Restricts every doc to its owning uid
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
- Projects and unlocked themes are stored in Firestore per-account, so signing in
  restores your builds.
- Create a project for Web Page, Video Page, Social (9:16) Page, or Logo Page.
- Pick Blank, a free theme, or a locked luxury theme ($189) / luxury-crazy theme ($399)
  — locked themes show a purchase modal (demo unlock, no real payment yet).
- Canvas editor: drag to move, corner-handle to resize, tap to select any element.
- Add text, images (from the photo library), shapes, icons, buttons, flags, and a
  slideshow block from the Elements tab.
- Page-level announcement bar: up to 2 bars, on/off toggle, auto-slide toggle, per-bar
  text/color editing.
- Projects list: rename (long-press), delete, reopen. Account screen: sign out.

## Known gaps (see ROADMAP.md for the full breakdown)

- Theme purchases and future credit/subscription purchases need real Apple In-App
  Purchase wiring, which needs your App Store Connect setup.
- Video Page's cut/split/audio-overlay tools aren't built yet — the New Project screen
  says so rather than pretending they work.
- The AI site builder, credits/subscriptions, AI chat assistant, and domain
  purchase/transfer are not part of this phase.
