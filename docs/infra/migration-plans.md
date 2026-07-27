# Pryvo — Infrastructure Migration Plans

**STATUS: NOT YET EXECUTED. DO NOT RUN ANY OF THESE STEPS UNTIL APPLE APPROVES BUILD 65.**

Changing backend infrastructure during App Review = instant rejection if reviewers hit a broken endpoint. Wait for the green tick.

After approval, work through these in order:
1. Firebase Phone Auth (replace Twilio OTP) — cheapest win, ~1 hour
2. Self-host LiveKit (replace LiveKit Cloud) — when cloud bills cross ~$30/mo, ~1 Saturday
3. Plivo virtual numbers (replace Twilio numbers) — only if Twilio gets expensive, ~1 day

You stay editing in Replit. None of these change your editing workflow.

---

# Plan 1 — Replace Twilio OTP with Firebase Phone Authentication

## What you get

- Free up to 10,000 SMS verifications per month (Twilio charges ~$0.05 each = $500/month at that scale)
- Same SMS-OTP user experience — no app UX change
- Built-in fraud protection (Google blocks SIM-swap / botted numbers automatically)
- Twilio stays for virtual numbers only — your Twilio bill drops to roughly the cost of rented numbers

## What stays the same

- iOS app UI: WelcomeScreen → enter phone → OTP screen → enter code → in
- Server-side reviewer bypass at `server/routes.ts:341–367` — keep exactly as is, just route real phones through Firebase instead of Twilio
- `5551234567` / `123456` demo bypass — untouched
- Phone number is still primary identity in your Postgres `users` table

## Prerequisites

- Google account (use a dedicated one for Pryvo, not your personal)
- A credit card on file (Firebase requires it even for free tier — won't be charged unless you exceed quota)
- ~1 hour for setup + ~2 hours for code changes

## Step 1 — Create Firebase project (15 min)

1. Go to **console.firebase.google.com** → **Add project**
2. Project name: `pryvo-prod`
3. Disable Google Analytics for now (you can add later)
4. Once created, click the **iOS+** icon to add an iOS app
5. iOS bundle ID: `com.adham.salameh.secureconnectchat`
6. App nickname: `Pryvo iOS`
7. App Store ID: `6756967188`
8. Download `GoogleService-Info.plist` — **save it somewhere safe, don't commit it to git yet**
9. Skip the "Add Firebase SDK" step (we're using server-side verification, not the iOS SDK directly)

## Step 2 — Enable Phone Authentication (5 min)

1. In Firebase console, left sidebar → **Build → Authentication**
2. Click **Get Started**
3. **Sign-in method** tab → enable **Phone**
4. Add your test phone numbers (so you can test without using real SMS quota):
   - Phone: `+15551234567` → Code: `123456` (matches your reviewer bypass)
   - Phone: `+15550000000` → Code: `123456`
5. Save

## Step 3 — Generate a service account key (server-side auth) (10 min)

1. Firebase console → **Project Settings** (gear icon) → **Service Accounts** tab
2. Click **Generate new private key**
3. Downloads a JSON file like `pryvo-prod-firebase-adminsdk-xxxxx.json`
4. **Open it in a text editor.** You'll need three values:
   - `project_id`
   - `client_email`
   - `private_key`

## Step 4 — Add Firebase secrets to Replit (5 min)

In Replit Deployments → your prod environment → Secrets:

| Secret name | Value |
|---|---|
| `FIREBASE_PROJECT_ID` | from JSON `project_id` |
| `FIREBASE_CLIENT_EMAIL` | from JSON `client_email` |
| `FIREBASE_PRIVATE_KEY` | from JSON `private_key` (keep the `\n` characters as-is) |
| `USE_FIREBASE_OTP` | `true` |

Do the same on the dev environment if you want to test there too.

## Step 5 — Install Firebase Admin SDK (1 min)

In Replit shell:
```bash
npm install firebase-admin
```

## Step 6 — Add Firebase OTP service in your backend (~1 hour of coding)

Create `server/services/firebaseAuth.ts`:

```ts
import admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

export async function verifyFirebaseIdToken(idToken: string) {
  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    return { ok: true, uid: decoded.uid, phoneNumber: decoded.phone_number };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
```

**Key architectural change:** Firebase Phone Auth does the SMS+OTP step *on the client*. The iOS app sends the phone, gets the SMS, user types code, Firebase returns an `idToken`. The iOS app then sends `idToken` to your `/api/auth/verify` endpoint, and the server calls `verifyFirebaseIdToken()` to confirm.

This means **the iOS app needs the `@react-native-firebase/auth` SDK added**. That's an Expo dev-client change (not Expo Go compatible) — you'd need a new EAS build for it. **This is why we wait until after Build 65 ships.**

## Step 7 — Update server routes

In `server/routes.ts`, the existing flow has two endpoints:
- `POST /api/auth/send-otp` — Twilio sends SMS
- `POST /api/auth/verify-otp` — verifies the 6-digit code

After Firebase migration, the flow becomes:
- iOS app calls Firebase directly to send SMS and verify code (Firebase SDK does it locally)
- iOS app then sends the Firebase `idToken` to a new endpoint:
- `POST /api/auth/firebase-verify` — server calls `verifyFirebaseIdToken()`, finds/creates the user by phone number, returns your existing JWT

**Important — keep the reviewer bypass intact.** Add this logic at the top of `firebase-verify`:
```ts
// REVIEWER BYPASS — DO NOT REMOVE (replit.md §3)
const TEST_PHONE_PATTERNS = ['5551234567', '5550000000'];
const normalizedPhone = phone.replace(/\D/g, '').slice(-10);
if (TEST_PHONE_PATTERNS.includes(normalizedPhone) && otp === '123456') {
  // Skip Firebase, grant access directly with VIP
  return grantReviewerAccess(phone);
}
```

This means reviewers never touch Firebase, never touch SMS, and always succeed — same as today.

## Step 8 — Twilio fallback (recommended for first 2 weeks)

Keep both code paths live behind the `USE_FIREBASE_OTP` flag:
```ts
if (process.env.USE_FIREBASE_OTP === 'true' && !isReviewerNumber) {
  // Firebase path
} else {
  // Existing Twilio path
}
```

Roll out 10% → 50% → 100% over 2 weeks. If Firebase has issues, flip the flag back to `false` and you're instantly back on Twilio.

## Step 9 — Update iOS app (requires new EAS build)

Add to `app.config.js`:
```js
plugins: [
  // ... existing plugins
  '@react-native-firebase/app',
  '@react-native-firebase/auth',
]
```

Install:
```bash
npm install @react-native-firebase/app @react-native-firebase/auth
```

Place the `GoogleService-Info.plist` (downloaded in Step 1) at the project root and reference it in `app.config.js`:
```js
ios: {
  googleServicesFile: './GoogleService-Info.plist',
  // ...
}
```

Update `client/screens/WelcomeScreen.tsx` to call `auth().signInWithPhoneNumber(phone)` and `confirmation.confirm(code)` instead of your current Twilio-backed `apiRequest` calls.

Build a new EAS build (this will be Build 66+) and submit.

## Step 10 — Decommission Twilio OTP

Once Build 66+ is at 100% rollout and stable for 2 weeks:
- Remove the Twilio OTP code path from `routes.ts`
- Remove `TWILIO_*` env vars *only if* you're also moving virtual numbers off Twilio. Otherwise keep them — Twilio needs them for virtual numbers.

## Cost comparison

| Users/month | Twilio OTP | Firebase Phone Auth |
|---|---|---|
| 1,000 | ~$50 | $0 (free tier) |
| 10,000 | ~$500 | $0 (free tier) |
| 50,000 | ~$2,500 | ~$240 ($0.06 × 40K over free) |
| 100,000 | ~$5,000 | ~$540 |

---

# Plan 2 — Self-host LiveKit (replace LiveKit Cloud)

(Trigger: when LiveKit Cloud monthly bill exceeds ~$30, or for compliance/control reasons.)

## What you get

- Fixed cost (~$5/month VPS) instead of per-minute billing
- Full control over the calling infrastructure
- No vendor lock-in

## What you trade away

- You're the on-call SRE if the server crashes
- No automatic geo-routing (one server = one region; mitigate by picking a region close to users)
- Manual OS patching once a month

## Prerequisites

- A VPS provider account (Hetzner recommended)
- A subdomain on `pryvoapp.com` (e.g. `livekit.pryvoapp.com`)
- ~3 hours total

## Step 1 — Buy a VPS

1. **hetzner.com/cloud** → Sign up → New Project → Add Server
2. Location: closest to your users (Falkenstein EU / Ashburn US / Sydney AU)
3. Image: **Ubuntu 24.04**
4. Type: **CX22** (€4.50/mo, 2 vCPU, 4 GB RAM) — handles ~100 concurrent participants
5. SSH key: add yours
6. Name: `livekit-pryvo`
7. Create → note the **IPv4 address**

## Step 2 — DNS

In your DNS provider for `pryvoapp.com`:
- Type: A
- Host: `livekit`
- Value: Hetzner IPv4 from Step 1
- TTL: 300

Wait 5 min, verify: `dig livekit.pryvoapp.com`

## Step 3 — Install Docker on the VPS

```bash
ssh root@YOUR_HETZNER_IP
curl -fsSL https://get.docker.com | sh
```

## Step 4 — Generate LiveKit API keys

```bash
docker run --rm livekit/livekit-server generate-keys
```

Save the key + secret it prints. You'll need them in two places.

## Step 5 — Create LiveKit config

`/etc/livekit.yaml`:
```yaml
port: 7880
bind_addresses:
  - "0.0.0.0"
rtc:
  tcp_port: 7881
  port_range_start: 50000
  port_range_end: 60000
  use_external_ip: true
keys:
  YOUR_API_KEY: YOUR_API_SECRET
turn:
  enabled: true
  domain: livekit.pryvoapp.com
  tls_port: 5349
  udp_port: 3478
  external_tls: true
```

## Step 6 — Install Caddy for HTTPS

```bash
apt install -y caddy
```

`/etc/caddy/Caddyfile`:
```
livekit.pryvoapp.com {
    reverse_proxy localhost:7880
}
```

```bash
systemctl restart caddy
```

Caddy auto-fetches a free Let's Encrypt cert.

## Step 7 — Open firewall

```bash
ufw allow 22
ufw allow 80
ufw allow 443
ufw allow 3478/udp
ufw allow 5349
ufw allow 50000:60000/udp
ufw enable
```

## Step 8 — Run LiveKit

```bash
docker run -d \
  --name livekit \
  --restart always \
  --network host \
  -v /etc/livekit.yaml:/etc/livekit.yaml \
  livekit/livekit-server \
  --config /etc/livekit.yaml
```

Verify: `docker logs livekit` shows `starting LiveKit server`.

## Step 9 — Point Pryvo at your VPS

Replit Deployments → prod → Secrets:
- `LIVEKIT_URL` → `wss://livekit.pryvoapp.com`
- `LIVEKIT_API_KEY` → from Step 4
- `LIVEKIT_API_SECRET` → from Step 4

Redeploy backend. **No iOS app changes.**

## Step 10 — Test and monitor

- Place a call between two Pryvo accounts
- Watch `docker logs livekit -f` — should see participants join
- Set up free UptimeRobot monitor for `https://livekit.pryvoapp.com`
- Monthly: `apt update && apt upgrade -y`

## Cost comparison

| Daily callers | LiveKit Cloud | Self-hosted Hetzner |
|---|---|---|
| 100 | Free | $5/mo |
| 1,000 | ~$150/mo | $5/mo |
| 10,000 | ~$1,500/mo | $20–50/mo (bigger VPS) |
| 100,000 | ~$15,000/mo | $200/mo (multi-region cluster) |

---

# Plan 3 — Migrate Twilio Virtual Numbers to Plivo

(Trigger: only if Twilio virtual-number bill becomes annoying. Plivo is ~40% cheaper with an almost identical API.)

## What you get

- Same functionality (rent real US/AU/UK numbers, send/receive SMS + calls)
- Roughly half the cost at scale
- Identical API surface — your code changes are mostly find-and-replace

## What you trade away

- Plivo's UI is less polished than Twilio's
- Slightly worse documentation
- Smaller community / Stack Overflow presence

## Prerequisites

- Plivo account (plivo.com)
- A credit card on file
- A weekend for migration + ~1 month of testing in parallel

## Step 1 — Plivo signup + buy a number

1. **plivo.com** → Sign up → verify email
2. Add ~$10 credit
3. **Phone Numbers → Buy Numbers** → buy one US number for testing ($0.80/month vs Twilio's $1.15)
4. Note the Plivo **AUTH_ID** and **AUTH_TOKEN** under Account → API

## Step 2 — Add Plivo SDK + secrets

```bash
npm install plivo
```

Replit Secrets:
- `PLIVO_AUTH_ID`
- `PLIVO_AUTH_TOKEN`
- `PLIVO_DEFAULT_NUMBER` (the number you bought)
- `USE_PLIVO_NUMBERS` = `false` (start disabled)

## Step 3 — Write a provider abstraction

Create `server/services/smsProvider.ts`:

```ts
import twilio from 'twilio';
import plivo from 'plivo';

const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const plivoClient = new plivo.Client(process.env.PLIVO_AUTH_ID!, process.env.PLIVO_AUTH_TOKEN!);

const usePlivo = process.env.USE_PLIVO_NUMBERS === 'true';

export async function sendSMS(from: string, to: string, body: string) {
  if (usePlivo) {
    return plivoClient.messages.create({ src: from, dst: to, text: body });
  }
  return twilioClient.messages.create({ from, to, body });
}

export async function purchaseNumber(areaCode: string) {
  if (usePlivo) {
    const results = await plivoClient.phoneNumbers.search({ pattern: areaCode, country_iso: 'US' });
    if (!results.objects?.length) throw new Error('No numbers available');
    return plivoClient.numbers.buy(results.objects[0].number);
  }
  // existing Twilio purchase logic
}

export async function releaseNumber(phoneNumber: string) {
  if (usePlivo) {
    return plivoClient.numbers.delete(phoneNumber);
  }
  // existing Twilio release logic
}
```

## Step 4 — Update webhook URLs

Plivo posts inbound SMS to a different webhook format than Twilio. Add a Plivo handler:

`POST /api/webhooks/plivo/sms` — parses Plivo's payload shape (`{ From, To, Text, MessageUUID }`) and feeds it into the same downstream code your Twilio webhook uses.

Configure the Plivo webhook URL in Plivo console → Phone Number → Messaging → `https://pryvoapp.com/api/webhooks/plivo/sms`

## Step 5 — Run in parallel for 2 weeks

- Keep `USE_PLIVO_NUMBERS=false` in production
- Set `USE_PLIVO_NUMBERS=true` in a separate test deployment
- Buy 2–3 test numbers on Plivo, manually port some test accounts to them
- Monitor delivery rates, latency, cost

## Step 6 — Phased rollout

Week 1: route new virtual-number purchases through Plivo (existing Twilio numbers stay on Twilio)
Week 2: 100% new purchases on Plivo
Week 3+: migrate old Twilio numbers to Plivo one batch at a time (Plivo supports number porting — submit forms via Plivo console, takes 5–10 business days per batch)

## Step 7 — Decommission Twilio numbers

Once all numbers are on Plivo, release the Twilio numbers (you stop getting billed for them immediately).

If you also migrated OTP to Firebase (Plan 1), you can now close the Twilio account entirely.

## Cost comparison

| Resource | Twilio | Plivo | Savings |
|---|---|---|---|
| US local number/month | $1.15 | $0.80 | 30% |
| US SMS sent | $0.0079 | $0.0050 | 37% |
| US SMS received | $0.0075 | $0.0035 | 53% |
| US voice/min | $0.013 | $0.0080 | 38% |

Example: 1,000 active virtual-number users sending/receiving 50 SMS/month each:
- Twilio: ~$1,400/mo
- Plivo: ~$830/mo (saves ~$570/mo)

---

# Execution order summary

| When | Plan | Effort | Cost saved/month |
|---|---|---|---|
| Apple approves Build 65 + 2 weeks of stable production | Plan 1: Firebase OTP | ~1 hour server + new EAS build | $50–$500 |
| LiveKit Cloud bill crosses $30/mo | Plan 2: Self-host LiveKit | ~3 hours, no app build needed | $25–$1,500 |
| Twilio number bill crosses $200/mo | Plan 3: Plivo numbers | ~1 day setup + 1 month rollout | 30–50% of Twilio bill |

# Things to never change

- Bundle ID `com.adham.salameh.secureconnectchat` — locked by Apple permanently
- Reviewer bypass at `server/routes.ts:341–367` — required for App Review
- ATT-first ordering in `client/MainApp.tsx` — required for ad revenue
- Phone+OTP as sole auth method — required to avoid Sign in with Apple obligation

# Pre-flight checklist before running any migration

- [ ] Apple has approved Build 65 and it's been live for ≥2 weeks
- [ ] You have a recent database backup
- [ ] You have a rollback plan (env flag to flip back to old provider)
- [ ] You're running the migration on a low-traffic day (weekend morning)
- [ ] You've notified yourself (calendar block, no other commitments)
- [ ] Replit Deployment is on a paid plan (won't sleep mid-migration)
