---
name: Dynamic import('react-native') is fatal on device
description: Why `await import('react-native')` crashes iOS release builds and how the post-OTP TestFlight crash was found
---

**Rule:** Never `await import('react-native')` (or any dynamic namespace import of a package with deprecated/native-backed getters). Always statically import the needed named export (e.g. `import { Platform } from 'react-native'`).

**Why:** Metro's async namespace import (`importAll`) touches EVERY getter on the module's export object. react-native's deprecated `PushNotificationIOS` getter constructs `new NativeEventEmitter(null)` on device → fatal `Invariant Violation` (SIGABRT via expo error recovery). Works fine on web, so it hides from web testing. This was the long-standing "crashes right after OTP verify" TestFlight crash (Builds 66–71) — one dynamic import in the login path.

**How to apply:** When touching login/verify or adding lazy imports, grep for `import('react-native')` and dynamic namespace imports of heavy native libs. Diagnosing device-only fatals: the client crash telemetry (crashReporter → `/api/client-crash`, logs `[CLIENT CRASH]` in production deployment logs) captures the exact JS error that Apple's .ips files omit — check deployment logs before speculating.
