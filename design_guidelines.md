# Design Guidelines: Encrypted Messaging App

## Authentication Architecture

**Auth Required:** SMS Verification
- Users must verify their phone number via Twilio SMS to create an account
- Include Apple Sign-In for iOS (App Store requirement)
- Authentication Flow:
  1. Welcome screen with "Get Started" CTA
  2. Phone number input screen with country code selector
  3. SMS verification code input (6-digit code)
  4. Profile setup (display name, avatar selection)
  5. Auto-redirect to main app after verification

**Profile Requirements:**
- User-selectable avatar from preset gallery (generate 6 minimal, professional avatars)
- Display name (required)
- Phone number (verified, display only)
- VIP status badge (if subscribed)

## Navigation Architecture

**Root Navigation:** Tab Bar (4 tabs)
- **Chats** - Main conversations list
- **Contacts** - Contact directory
- **Calls** - Call history
- **Profile** - User settings and VIP upgrade

**Additional Navigation:**
- Drawer Menu (accessible from top-left hamburger icon on Chats screen):
  - VIP Section (gold/premium badge)
  - Hidden Locker (VIP only)
  - Settings
  - Help & Support

**Core Actions:**
- New Message (floating action button on Chats tab)
- Start Call (in-conversation header buttons)

## Screen Specifications

### 1. Chats List Screen
**Purpose:** Display all active conversations with message previews

**Layout:**
- Header: Custom, transparent
  - Left: Hamburger menu icon (opens drawer)
  - Title: "Chats"
  - Right: Search icon
- Main content: Scrollable list (FlatList)
- Floating: New message FAB (bottom-right)
  - Position: 16px from right, insets.bottom + 80px from bottom
  - Shadow: width: 0, height: 2, opacity: 0.10, radius: 2

**Components:**
- Search bar (expandable from header icon)
- Conversation cells with:
  - Contact avatar (48px circle)
  - Contact name (bold, truncated)
  - Last message preview (1 line, gray)
  - Timestamp (top-right, small)
  - Unread badge (circle, accent color)
  - Encryption indicator icon (lock icon, 12px)

**Safe Area Insets:**
- Top: headerHeight + Spacing.xl
- Bottom: insets.bottom + Spacing.xl

### 2. Conversation Screen
**Purpose:** Send/receive messages, photos, videos; initiate calls

**Layout:**
- Header: Custom, solid background
  - Left: Back button
  - Center: Contact name + online status dot
  - Right: Audio call icon, Video call icon (both touchable)
- Main content: Inverted FlatList (messages)
- Bottom: Message input bar (fixed)

**Components:**
- Message bubbles:
  - Sent: Right-aligned, primary color background
  - Received: Left-aligned, light gray background
  - Timestamp below bubble (small, gray)
  - Delivery status indicators (sent/delivered/read)
  - Lock icon for encrypted messages (12px, subtle)
- Message input bar:
  - Photo/video picker button (left)
  - Text input (expandable, multi-line)
  - VIP-only: Hidden message button (lock icon)
  - Send button (right, accent color)
- Media preview thumbnails (tap to expand full-screen)
- Call UI overlays (modal sheets for incoming calls)

**Safe Area Insets:**
- Top: Spacing.xl (header not transparent)
- Bottom: insets.bottom + Spacing.md

### 3. Hidden Locker Screen (VIP Only)
**Purpose:** Access encrypted, PIN-protected message/photo vault

**Layout:**
- Header: Custom, with back button and "Hidden Locker" title
- Main content: Scrollable grid of locked items
- First-time access: PIN setup screen

**Components:**
- PIN entry UI (biometric option if available)
- Grid of hidden items (2 columns):
  - Thumbnail with lock overlay
  - Item type indicator (message/photo/video)
- "Add to Locker" option in conversation (long-press menu)

**Safe Area Insets:**
- Top: headerHeight + Spacing.xl
- Bottom: insets.bottom + Spacing.xl

### 4. VIP Upgrade Screen
**Purpose:** Present subscription benefits and payment flow

**Layout:**
- Header: Transparent, close button (top-right)
- Main content: Scrollable form
- Bottom: Subscribe button (fixed, full-width)

**Components:**
- Hero section: VIP badge icon (large, gold)
- Feature list with checkmarks:
  - "Hidden Message & Photo Locker"
  - "Priority Support"
  - "Exclusive Features"
- Pricing card: "$4.99 / month"
- Stripe payment UI (embedded)
- Legal links: Terms, Privacy Policy (small, bottom)

**Safe Area Insets:**
- Top: insets.top + Spacing.xl
- Bottom: insets.bottom + Spacing.xl

### 5. Call Screens
**Purpose:** Handle audio/video calls with Twilio

**Audio Call Layout:**
- Full-screen modal
- Contact avatar (large, centered)
- Contact name + call status ("Connecting...", "00:32")
- Control buttons (center-bottom):
  - Mute, Speaker, End Call (red, circular)
  
**Video Call Layout:**
- Full-screen video view
- Local camera preview (floating, top-right, draggable)
- Control bar (bottom, overlay):
  - Camera toggle, Mute, Speaker, End Call
  - Camera flip button

**Safe Area Insets:**
- All sides: Spacing.md (full-screen modals)

## Design System

### Color Palette
- **Primary:** #007AFF (iOS blue, for sent messages, CTAs, links)
- **Accent:** #FFD700 (gold, for VIP badges and features)
- **Background Root:** #000000 (pure black, all modes)
- **Background Default:** #0A0A0A (near-black, main content areas)
- **Background Secondary:** #1A1A1A (elevated surfaces, cards)
- **Background Tertiary:** #2A2A2A (highest elevation)
- **Text Primary:** #FFFFFF (white, main text on black backgrounds)
- **Text Secondary:** #A0A0A5 (gray, timestamps, subtitles)
- **Success:** #34C759 (online status, delivered)
- **Error:** #FF3B30 (call decline, errors)
- **Border:** #333333 (subtle dividers on dark backgrounds)

### Typography
- **Heading (Screen Titles):** SF Pro Display, 34pt, Bold
- **Body (Messages):** SF Pro Text, 17pt, Regular
- **Caption (Timestamps):** SF Pro Text, 13pt, Regular
- **Button Text:** SF Pro Text, 17pt, Semibold

### Spacing
- **xs:** 4px
- **sm:** 8px
- **md:** 12px
- **lg:** 16px
- **xl:** 24px
- **xxl:** 32px

### Interaction Design
- All buttons: Scale down to 0.95 on press, 100ms duration
- Message bubbles: Fade in with slide animation
- FAB: Scale + rotation animation on press
- Modals: Slide up from bottom with 300ms ease-out
- Swipe gestures: Enable swipe-to-delete on conversation cells

### Icons
- Use SF Symbols for iOS-native feel:
  - lock.fill (encryption indicator)
  - phone.fill (audio call)
  - video.fill (video call)
  - paperclip (attach media)
  - crown.fill (VIP badge)
- All icons: 20-24px for UI elements, 16px for inline indicators

## Assets Required

**Critical Assets:**
1. **User Avatars** (6 presets):
   - Minimal, geometric designs in muted colors
   - 256x256px resolution
   - Style: Modern, professional, gender-neutral
   
2. **VIP Badge Icon:**
   - Gold crown or diamond symbol
   - 64x64px high-resolution
   - Use throughout app for VIP users

3. **App Icon:**
   - Lock + message bubble combination
   - Gradient background (primary color)
   - 1024x1024px (App Store requirement)

4. **Placeholder Images:**
   - Empty state illustration for no conversations
   - Empty state for hidden locker

**DO NOT use:**
- Emojis in UI
- Stock photos
- Generic icons where SF Symbols are available

## Accessibility
- Minimum touch target: 44x44pt
- Color contrast ratio: 4.5:1 for text
- Support Dynamic Type (text scaling)
- VoiceOver labels on all interactive elements
- Haptic feedback for important actions (send message, call buttons)