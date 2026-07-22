# Stockly — Live Store Stock, Flavors & Announcements Marketplace

A separate app from TrackLine (this repo's other project) -- a marketplace where customers
discover local stores, follow their favorites, and get real notifications about restocks, new
items, and promotions; store owners get a dashboard to publish live stock/flavors/prices,
post announcements, verify their business, manage a team with granular permissions and
moderation (mute/kick/block), and optionally turn on a live group chat for their store.

## Stack

- React Native + Expo (SDK 57, TypeScript), React Navigation (bottom tabs + native stack)
- Firebase: Auth (email/password), Firestore (all app data), Storage (photos), Cloud Functions
  (verification, AI onboarding assist, push notifications), Cloud Messaging (real push)
- `expo-notifications` for native device push tokens, `expo-image-picker` for stock/menu photos

## Project layout

```
App.tsx                          Provider tree + root navigator mount
src/
  config/
    env.ts                        Reads API keys from app.config.js "extra"
    categories.ts                 Business category catalog -- drives per-industry item fields
                                   and labels (ice cream -> "Flavor", vape shop -> "Nicotine
                                   strength", etc.)
  types/index.ts                  Shared domain types (Business, Membership, StockItem, ...)
  services/
    firebase.ts                    Firebase app/auth/firestore/storage/functions init
    auth.ts                        Email/password sign up, sign in, sign out
    businesses.ts                  Business CRUD, publish/visibility, name & nearby search
    membership.ts                  Team roles/permissions, moderation (mute/kick/block staff)
    stock.ts                       Stock/flavor/menu item CRUD
    announcements.ts                Announcement CRUD + triggers a real push via Cloud Function
    follows.ts                     Follow/unfollow, per-channel notification preferences
    appNotifications.ts             In-app notification feed (mirrors what was pushed via FCM)
    notifications.ts                Device push-token registration (expo-notifications)
    verification.ts                 ABN/ACN checksum validation + calls verifyBusiness function
    aiOnboarding.ts                 Calls the AI store-research Cloud Function
    storage.ts                      Image upload to Firebase Storage
    chat.ts                         Real-time per-store group chat (send/watch/delete)
  context/                         Auth, Location React contexts
  navigation/RootNavigator.tsx      Auth stack <-> main tabs <-> owner/detail screens
  screens/
    auth/                           SignIn, SignUp
    customer/                       Discover, StoreDetail, FollowedStores, Notifications, Profile
    owner/                          Onboarding (+ AI assist), Verification, Dashboard,
                                     StockEditor, AnnouncementComposer, TeamManagement
    StoreChatScreen.tsx              Shared chat screen, opened from both StoreDetail (customer)
                                      and the owner Dashboard once a store turns chat on
  components/                      BusinessListItem, StockItemCard, AnnouncementCard,
                                    CategoryFieldForm
  utils/geo.ts                     Geohash encode + nearby-query bounds + haversine distance
functions/                         Firebase Cloud Functions (plain JS, Node 20)
  index.js                          Entry point, wires up all functions
  verifyBusiness.js                 ABN/ACN checksum + real ABR Lookup API cross-check
  aiDraftStoreProfile.js            Claude + web search -> draft business profile/menu
  sendBusinessNotification.js       Owner-triggered push to opted-in, unmuted, unblocked followers
  onStockChange.js                  Auto-notifies followers when an item restocks or is added
  lib/notify.js                     Shared follower-resolution + FCM send + in-app fan-out
firestore.rules / firestore.indexes.json / storage.rules
firebase.json                      Points at the three files above; deploy from this directory
```

## Setup

1. `npm install`
2. Create a Firebase project (separate from TrackLine's), enable Firestore, Storage,
   Authentication (Email/Password provider), and Cloud Messaging.
3. Copy `.env.example` to `.env` and fill in your Firebase web app config.
4. `firebase use --add` in this directory to point the Firebase CLI at that project.
5. `npx expo start` — auth, discovery, following, stock/announcements, dashboard, and team
   management all work immediately once `.env` is filled in (they only need Firestore/Auth).
6. Deploy the backend pieces:
   ```
   firebase deploy --only firestore:rules,firestore:indexes,storage,functions
   ```

## What's "real" vs. what needs your own credentials

Everything is implemented against real APIs with real request/response handling -- nothing is
faked -- but three pieces need credentials only you can obtain:

- **ABN/ACN verification** (`functions/verifyBusiness.js`): the checksum validation (ATO's ABN
  algorithm, ASIC's ACN algorithm) is fully real and works with zero setup. Cross-checking an
  ABN against the actual Australian Business Register needs a free GUID from
  [abr.business.gov.au/Tools/WebServices](https://abr.business.gov.au/Tools/WebServices) --
  set it with `firebase functions:secrets:set ABR_LOOKUP_GUID`. Without it, checksum-valid ABNs
  and all ACNs are marked "pending" for manual admin review rather than auto-verified (ASIC has
  no equivalent free public lookup API for ACNs).
- **AI-assisted onboarding** (`functions/aiDraftStoreProfile.js`): calls the Claude API with the
  web-search tool to research a named business and draft a description/category/starter item
  list. Requires `firebase functions:secrets:set ANTHROPIC_API_KEY`. It only ever proposes a
  *draft* for the owner to review, edit, or discard in the onboarding screen -- it never
  fabricates or auto-publishes photos, and nothing is written to a business's live profile
  without the owner explicitly hitting Create.
- **Real push notifications**: FCM delivery is fully wired (`functions/lib/notify.js` uses
  `firebase-admin`'s messaging API against real device tokens), but remote push does not work
  in Expo Go on current SDKs. You need an `expo-dev-client` build
  (`eas build --profile development`) with `GoogleService-Info.plist`/`google-services.json` in
  place. Until then, `registerDeviceForPush()` no-ops safely and every other feature (stock,
  announcements, the in-app Notifications tab, following) works normally -- announcements and
  restocks also fan out to each follower's `users/{uid}/notifications` feed regardless of push,
  so the in-app history is real even before a dev build exists.

## Data model & rules

See `src/types/index.ts` for the full shape. Key access rules enforced in `firestore.rules`
(not just hidden in the UI):

- A business is readable by anyone once `visibility: "public"` and `isPublished: true`; team
  members and the owner can always read it regardless of visibility ("private" = draft,
  "team" = staff-only).
- Only team members with `permissions.canEditStock` / `canPostAnnouncements` /
  `canSendNotifications` / `canManageTeam` can perform the corresponding writes -- these are
  set per role (owner/manager/staff) in `ROLE_DEFAULT_PERMISSIONS` (`src/types/index.ts`) and
  can be changed per-member from Team Management.
- A member can never edit their own role/status (no self-promotion or self-unmuting).
- A business can block a customer (`blockedUsers/{uid}`), which removes their read access to
  that business and its stock/announcements and excludes them from notifications, independent
  of team-member moderation (mute/kick), which governs staff who post on the business's behalf.
- **Group chat** (`chatMessages/{id}` per business) is off by default; a member with
  `canManageTeam` (owner or manager) switches it on from the Dashboard. While on, any active
  team member or real follower (checked against their own `users/{uid}/follows/{businessId}`
  doc) can read and post in real time; blocked users can't reach it at all (they can't view the
  business); a `canManageTeam` member can delete any message, anyone can delete their own.

## Known gaps for a production build

- "Add team member" and "block a customer" take a raw Firebase Auth UID rather than looking
  someone up by email/username -- a real invite flow needs a Cloud Function that maps an email
  to a UID (the client can't query Firebase Auth by email directly). Noted inline in
  `TeamManagementScreen`.
- Name search is a Firestore prefix ("starts with") match, not fuzzy full-text search --
  Firestore has no native full-text index; a production build would likely add Algolia or
  Typesense for that.
- No payments/subscriptions -- this is a pure discovery + stock/announcements + notifications
  MVP, matching what was asked for ("free marketing app" for stores).
