---
name: Sealed sender is virtual-conversation-only
description: Why sends fail silently when a VN-mode sender messages a personal conversation, and the safe fallback rule.
---
The sealed-sender route rejects (400 "Sealed sender requires a virtual-number conversation") any conversation whose `numberType` isn't `virtual`. Client eligibility historically only checked the SENDER's mode, not the conversation type, so a VN-mode user in a personal chat got a silent failed bubble (exclamation mark, no alert, tap-to-retry).

**Rule:** falling back to legacy `/api/messages` on that specific 400 is NOT a senderId leak — personal conversations never hide sender identity; legacy is the designed route there. Never fall back to legacy on capability-unknown or generic errors though (that WOULD leak).

**How to apply:** any new composer entry point must either check the conversation's `numberType` (returned by `GET /api/conversations/:id`) before attempting sealed send, or rely on `sendSealedMessage`'s 400-sentinel fallback. Silent failed bubbles with no server-side POST in logs usually mean the request DID reach the server — grep prod logs for `send-sealed` with 4xx.
