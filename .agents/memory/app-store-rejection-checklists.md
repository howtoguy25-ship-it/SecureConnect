---
name: App Store rejection-fix checklists
description: How to handle user-pasted "App Store 5.x fix" checklists for Pryvo — which items conflict with protected requirements or don't match the actual code.
---

# Handling pasted "App Store fix" checklists

Users sometimes paste a generic, AI-generated "rejection fix" checklist. Validate each item against the actual codebase before executing — several items typically do NOT match this app.

**Why:** A 5.6 ("incomplete/unpolished") checklist once asked to (a) remove the reviewer/demo bypass, (b) wrap "Firebase" calls, (c) rename the app to Pryvo. None were correct as written.

**How to apply — known mismatches for Pryvo:**
- "Remove test/demo/bypass credentials from routes.ts" → CONFLICTS with replit.md §3 (reviewer bypass is PROTECTED). Removing it locks the Apple reviewer out (they log in with 555-123-4567 / 123456) and causes a WORSE rejection. Surface + confirm before touching. On 2026-07-04 the user explicitly confirmed KEEP it.
- "Wrap Firebase calls" → app has NO Firebase (uses Twilio/LiveKit/Stripe/Apple IAP). Inapplicable.
- "Rename SecureConnect → Pryvo everywhere" → in-app display name is already "Pryvo"; the App Store listing is intentionally "SecureConnect Messenger"; bundle ID (`com.adham.salameh.secureconnectchat`) and URL scheme (`secureconnect`) must NOT change (breaks listing + deep links).
- "Remove placeholder/Lorem text" → none present.

**The real 5.6 lever is polish/robustness**, not deleting test code: no infinite spinners, no blank empty states, no dead-end buttons/navigation.

# Request-timeout convention (infinite-spinner guard)

Central fetchers `getQueryFn` (query-client.ts) and `apiRequest` (api-utils.ts) abort after 10s and throw a friendly "request timed out" error. Raw `fetch` calls that drive a manual loading spinner should use exported `fetchWithTimeout(input, init, timeoutMs=10000)`.

**Why:** App Store 5.6 requires no indefinitely-loading UI; the app entry/splash was already protected (1500ms auth timeout + 2s emergency splash timeout in AuthContext/RootStackNavigator) but data-fetch spinners were not.

**How to apply:** NEVER put the short 10s timeout on media upload/download fetches — large transfers legitimately exceed 10s. Those stay on raw fetch (or a longer tailored timeout).
