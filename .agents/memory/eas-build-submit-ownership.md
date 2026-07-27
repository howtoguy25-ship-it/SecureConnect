---
name: EAS build & App Store submit ownership
description: Who can run the iOS build/submit for Pryvo and what the agent can vs. cannot do
---

# EAS build + App Store submit cannot be run by the agent

The final `eas build` (iOS production) and `eas submit` to App Store Connect
**cannot be performed from the Replit environment by the agent**.

**Why:**
- `eas build` needs the user's Expo account auth. There is no `EXPO_TOKEN` secret,
  so EAS can only be driven interactively (`eas login`) by the user.
- `eas submit` to App Store needs Apple credentials + interactive 2FA (or a
  configured App Store Connect API key). Not available to the agent.
- EAS builds run 20-40 min on Expo's cloud, exceeding tool timeouts anyway.

**How to apply — what the agent CAN do to prep a submission:**
- Verify reviewer demo path intact in `server/routes.ts` (TEST_PHONE_PATTERNS
  `5551234567`, APPLE_DEMO_CODE `123456`) — replit.md §3/§4.
- Confirm `REVIEW_MODE=true` is live. It lives in the **shared** env var scope,
  which covers production automatically (no separate prod value needed).
- Keep `app.config.js` buildNumber + `eas.json` production cache key in lockstep
  (`v<NN>-build-<buildNumber>`) per replit.md.
- Publish the backend (Replit Deployment → pryvoapp.com) so the app has a live
  server. Client-only changes still require a fresh EAS build to reach the app.

**Then hand off to the user** with the exact commands:
`eas build --platform ios --profile production` then
`eas submit --platform ios --profile production`, and remind them to update the
App Store Connect "App Review Information" notes if the demo code changed.
