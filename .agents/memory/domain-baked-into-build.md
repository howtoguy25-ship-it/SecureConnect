---
name: iOS build bakes API domain at build time (no runtime failover)
description: Why a custom-domain outage fully breaks the shipped/in-review iOS app and how that constrains domain changes
---

# Baked API domain, no runtime failover

The iOS app's backend base URL comes from `EXPO_PUBLIC_DOMAIN` (set in `eas.json`), baked into the binary at EAS build time. `getApiUrl` (client/lib/api-utils.ts) has **no `.replit.app` failover** — it only ever talks to that one baked domain.

**Consequence:** if the custom domain goes down (DNS/registrar issue), the *shipped or in-review* app is fully broken (login/OTP/messages all fail). You cannot point an already-built binary at a different domain.

**Why this matters for decisions:**
- A custom-domain outage during App Review = near-certain rejection (reviewer demo login fails).
- Registering/connecting a NEW domain does **not** fix an in-review build — that build still points to the old baked domain. A new domain only helps after a fresh EAS build (bump buildNumber) with the new `EXPO_PUBLIC_DOMAIN` + resubmit.

**How to apply:**
- Fastest fix for a domain outage = restore the *original* baked domain (e.g. lift a registrar `client hold`), not switch domains.
- Switching domains is the slow path: connect new domain to the Replit deployment, new build, withdraw + resubmit review.
- The production domain has historically been registered at name.com; a separate `pryvoapp.com` lives at GoDaddy. Connecting a custom domain in Replit Deployments goes through DNS check → routing → SSL, which can take minutes up to ~24–48h to all go green.
