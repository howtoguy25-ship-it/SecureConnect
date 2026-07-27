---
name: Welcome/auth country picker
description: Why the country list lived where it does and the demo-login coupling to keep intact
---

# Country picker on the auth screens

- Shared source of truth: `client/constants/countries.ts` (`ALL_COUNTRIES`, ~195 entries, US & CA first then alphabetical). Both `WelcomeScreen.tsx` and `PhoneInputScreen.tsx` consume it. Do not reintroduce per-screen inline lists (one had corrupted `name: "l"` entries).

- The `/api/auth/geo-permissions` effect must **merge**, not **replace**. The original effect overwrote the full list with only the Twilio-configured countries, so the picker silently collapsed to US/Canada. Pattern: geo countries first (preferred), then append the rest of `ALL_COUNTRIES` deduped by ISO code.
  **Why:** users reported only 2 countries selectable even though a full list existed.
  **How to apply:** any change to that effect must keep the full list reachable.

- Demo/reviewer login coupling: `DEFAULT_COUNTRIES[0]` MUST stay United States (+1) because `handleDemoLogin` builds `+1 5551234567` from it. Keep US at index 0 in `ALL_COUNTRIES`. Server-side reviewer bypass is in `server/routes.ts` (protected, see replit.md) — never touch.

- Phone-input row overflow (mainly React Native Web): a `flex:1` TextInput won't shrink below the `<input>` intrinsic width unless `minWidth:0` is set. Fix used on both screens: input `{ flex:1, flexBasis:0, minWidth:0, flexShrink:1 }`, country selector `{ flexShrink:0 }`.
