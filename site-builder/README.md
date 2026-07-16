# SiteForge — iOS Site/Video/Social/Logo Builder (Phase 1)

An Expo + React Native + TypeScript app for building site pages, logo canvases, and
social/video-sized pages by hand: pick a theme, drag/resize elements, add text, images,
slideshows, and an announcement bar.

This is **Phase 1** of a much larger product (AI site builder, real auth, subscriptions,
domains — see `ROADMAP.md` for what's built vs. what's next and what real accounts each
later phase needs).

## Stack

- Expo SDK 57, React Native 0.86, TypeScript (strict)
- React Navigation (native-stack)
- `@react-native-async-storage/async-storage` for local project persistence (no backend
  yet — see Roadmap)
- `expo-image-picker` for photo library access
- `react-native-svg` for shape rendering, `@expo/vector-icons` for the icon library

## Project layout

```
App.tsx                        Provider tree + navigator mount
src/
  types/                        Project, Page, CanvasElement, Theme types
  data/
    themes.ts                    Theme catalog: blank, free, luxury ($189), luxury-crazy ($399)
    canvasSizes.ts                Per-page-type canvas dimensions + copy
    elementsLibrary.ts             Icons/shapes/buttons/flags library data
  storage/
    projectsStore.ts               AsyncStorage CRUD for projects
    unlockedThemesStore.ts         Tracks which paid themes are unlocked (demo purchase)
  context/EditorContext.tsx        Selected project/element state + mutations, autosaves
  components/
    canvas/                        Canvas, DraggableElement (drag+resize), ElementRenderer,
                                    AnnouncementBarView
    inspector/                     Per-element style controls (color, size, text, image)
    elements/                      ElementsPanel (library grid), AnnouncementPanel
  screens/
    ProjectsScreen.tsx              Dashboard + "+" create button
    NewProjectScreen.tsx            Page-type picker (Web/Video/Social/Logo)
    ThemeGalleryScreen.tsx          Theme picker with priced-tier unlock modal
    EditorScreen.tsx                Main canvas editor
  navigation/RootNavigator.tsx
```

## Setup

```
npm install
npx expo start        # then press i for iOS simulator, or scan the QR code in Expo Go
```

No environment variables or API keys are required for Phase 1 — everything runs and
persists on-device.

## What works today

- Create a project for Web Page, Video Page, Social (9:16) Page, or Logo Page.
- Pick Blank, a free theme, or a locked luxury theme ($189) / luxury-crazy theme ($399)
  — locked themes show a purchase modal (demo unlock, no real payment yet).
- Canvas editor: drag to move, corner-handle to resize, tap to select any element.
- Add text, images (from the photo library), shapes, icons, buttons, flags, and a
  slideshow block from the Elements tab.
- Page-level announcement bar: up to 2 bars, on/off toggle, auto-slide toggle, per-bar
  text/color editing.
- Projects list: rename (long-press), delete, reopen.

## Known gaps (see ROADMAP.md for the full breakdown)

- No accounts yet — everything is local to the device.
- Theme purchases and future credit/subscription purchases need real Apple In-App
  Purchase wiring, which needs your App Store Connect setup.
- Video Page's cut/split/audio-overlay tools aren't built yet — the New Project screen
  says so rather than pretending they work.
- The AI site builder, credits/subscriptions, AI chat assistant, and domain
  purchase/transfer are not part of this phase.
