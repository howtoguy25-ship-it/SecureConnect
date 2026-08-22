import express, { type Express, type Request, type Response } from "express";
import { createServer, type Server } from "node:http";
import { Server as SocketIOServer } from "socket.io";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import twilio from "twilio";
import QRCode from "qrcode";
import fs from "fs";
import path from "path";
import { storage } from "./storage";
import { sendVerificationSMS, sendPhoneChangeNoticeSMS, generateVerificationCode, getEnabledSmsCountries, isTwilioConfigured, searchAvailableNumbers, provisionPhoneNumber, releasePhoneNumber, validateTwilioWebhookSignature } from "./twilioClient";
import { verifyAppleIdentityToken, verifyGoogleIdToken, isGoogleSignInConfigured, signOAuthLinkToken, verifyOAuthLinkToken } from "./oauthVerify";
import { getUncachableStripeClient, getStripePublishableKey } from "./stripeClient";
import { getAppBaseUrl, getAllowedOrigins } from "./publicUrl";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import { ObjectPermission } from "./objectAcl";
import { getMockConversations, getMockMessages, isMockConversation, isMockUser, getMockUser, createMockBotReply, MOCK_USERS } from "./mock-data";
import { sendPushNotification, sendCallNotification, sendMissedCallNotification, sendMessageNotification, sendVoipCallPush } from "./pushNotifications";

// ─── Per-user in-memory rate limiters ────────────────────────────────────
//
// Fixed-window counter, isolated bucket Map per limiter so a flood on one
// endpoint can't starve another. Resets at process restart (acceptable: a
// fresh window after restart is not exploitable, and we run a single Node
// process today). All call sites MUST sit downstream of `authenticateToken`
// so `req.userId` is populated.
//
// TODO (TODO.md "Server hardening — rate limiters"): move to Redis or
// equivalent before horizontal scale. In-memory limits break silently
// across instances — each instance enforces its own quota, so a 600/min
// limit becomes 600*N/min across an N-instance fleet, and a misbehaving
// client can keep bouncing between sticky-sessions to avoid hitting any
// one bucket. Not blocking for ship today (we run one process).
function makePerUserRateLimiter(label: string, limit: number, windowMs: number) {
  const buckets = new Map<string, { count: number; windowStart: number }>();
  return function rateLimit(
    req: import("express").Request & { userId?: string },
    res: import("express").Response,
    next: import("express").NextFunction,
  ) {
    const userId = req.userId;
    if (!userId) return res.sendStatus(401);
    const now = Date.now();
    const bucket = buckets.get(userId);
    if (!bucket || now - bucket.windowStart >= windowMs) {
      buckets.set(userId, { count: 1, windowStart: now });
      return next();
    }
    if (bucket.count >= limit) {
      res.setHeader(
        "Retry-After",
        Math.ceil((windowMs - (now - bucket.windowStart)) / 1000).toString(),
      );
      return res.status(429).json({ error: `Too many ${label} requests` });
    }
    bucket.count++;
    return next();
  };
}

// Encrypted media fetch — 600/min/user (covers a chat scroll with dozens of
// media bubbles loading at once without leaving the door open for a scraper).
const encryptedMediaRateLimit = makePerUserRateLimiter("encrypted media", 600, 60_000);

// ─── E2EE prekey endpoints (Phase 1 carry-over, shipped build 62) ─────────
//
// SPK upload — 10/hour/user. Client debounces SPK rotation to ~hourly, so
// 10/hour is a soft cap that absorbs retries on transient failures while
// shutting down a buggy client looping on rotation.
const signedPrekeyRateLimit = makePerUserRateLimiter("signed prekey upload", 10, 60 * 60_000);

// One-time prekey batch upload — 5/hour/user. Each batch typically
// replenishes a full set of 100 OPKs, so 5/hour is enough headroom for
// 3-device users while preventing storage-flooding.
const oneTimePrekeyRateLimit = makePerUserRateLimiter("one-time prekey upload", 5, 60 * 60_000);

// Peer bundle fetch — 120/min/user. Legitimate clients hit this every time
// they start a new conversation or recover from a Double Ratchet reset.
const prekeyBundleRateLimit = makePerUserRateLimiter("prekey bundle fetch", 120, 60_000);

// Delete-account OTP request — 3/hour/user. Should never legitimately fire
// more than ~twice during a single deletion attempt (request + maybe one
// resend).
const deleteAccountOtpRateLimit = makePerUserRateLimiter("delete-account OTP", 3, 60 * 60_000);

// ─── Pre-auth rate limiter (Item 2 — production-readiness fix list) ──────
//
// `makePerUserRateLimiter` keys on `req.userId`, which is undefined for
// the public `/api/auth/verify-code` and `/api/auth/send-code` routes.
// A 6-digit OTP has 10⁶ possible values; with no rate limit a single
// attacker IP can brute-force the entire space in seconds, even though
// each individual code expires after a few minutes.
//
// We key on a composite of `ip + phoneNumber` (lowercased + normalized
// in the handler before this limiter runs). That way:
//   - One attacker IP cycling phone numbers can't exhaust a victim's
//     OTP budget (the bucket is per-phone).
//   - One phone behind a NAT can't be DOS'd from a single IP either.
// Window: 10 attempts per 10 minutes per (ip, phone). Stricter than
// real-user behaviour by 3-4×, but well below the brute-force threshold.
function makePreAuthRateLimiter(label: string, limit: number, windowMs: number) {
  const buckets = new Map<string, { count: number; windowStart: number }>();
  return function rateLimit(
    keyFn: (req: import("express").Request) => string | null,
    req: import("express").Request,
    res: import("express").Response,
  ): boolean {
    const key = keyFn(req);
    if (!key) return true; // can't key — let through; the handler will 400.
    const now = Date.now();
    const bucket = buckets.get(key);
    if (!bucket || now - bucket.windowStart >= windowMs) {
      buckets.set(key, { count: 1, windowStart: now });
      return true;
    }
    if (bucket.count >= limit) {
      res.setHeader(
        "Retry-After",
        Math.ceil((windowMs - (now - bucket.windowStart)) / 1000).toString(),
      );
      res.status(429).json({ error: `Too many ${label} attempts. Try again later.` });
      return false;
    }
    bucket.count++;
    return true;
  };
}

// 10 verify attempts / 10 min / (ip, phone). Brute-forcing a 6-digit OTP
// would need ~100k attempts — this caps a single window at 10, and the
// code itself expires inside the same window. Effective attempts before
// expiry/issue-rotation: bounded at single digits.
const verifyCodeRateLimit = makePreAuthRateLimiter("verify-code", 10, 10 * 60_000);

// 5 send-code attempts / 10 min / (ip, phone). Caps SMS-budget drain on
// the unauthenticated OTP endpoint. A real user re-requesting a code
// (e.g. didn't receive it, switched carrier) won't hit this; an attacker
// trying to rack up Twilio charges on our account will. Composite key
// stops both "one IP cycling phones" and "one phone DOS'd from one IP"
// patterns.
const sendCodeRateLimit = makePreAuthRateLimiter("send-code", 5, 10 * 60_000);
// 3 emergency-reset attempts / hour / (ip, phone). This path immediately
// destroys an account on SMS possession alone (no Account ID, no security
// questions) — it's scoped to the owner's number only (see isOwnerPhone
// gate on the routes below), but still rate-limited like any other
// pre-auth OTP surface in case that number's SIM is ever compromised.
const emergencyResetRateLimit = makePreAuthRateLimiter("emergency-reset", 3, 60 * 60_000);
// 5 invite sends / 10 min / (userId, target-phone). The endpoint is
// authenticated but a compromised account could still loop on it to
// SMS-bomb a number on our dime — this caps the per-user-per-target
// blast radius.
const inviteSendRateLimit = makePreAuthRateLimiter("invite-send", 5, 10 * 60_000);

const AccessToken = twilio.jwt.AccessToken;
const VideoGrant = AccessToken.VideoGrant;

let socketIO: SocketIOServer | null = null;
export function getIO(): SocketIOServer | null {
  return socketIO;
}

// Fail-closed: refuse to boot a production server with the placeholder secret.
// In dev we still allow the fallback so local work isn't blocked.
const JWT_SECRET = (() => {
  const fromEnv = process.env.SESSION_SECRET;
  if (fromEnv && fromEnv.length >= 32) return fromEnv;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "SESSION_SECRET is required in production and must be at least 32 characters. " +
      "Set it in the deployment environment variables before booting.",
    );
  }
  return fromEnv || "securechat-secret-key-dev-only-do-not-use-in-prod";
})();

interface AuthRequest extends Request {
  userId?: string;
  deviceId?: string;
}

function authenticateToken(req: AuthRequest, res: Response, next: Function) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; tv?: number; did?: string };
    req.userId = decoded.userId;
    req.deviceId = decoded.did;
    // Validate token version (allows server-side invalidation of old tokens)
    storage.getUser(decoded.userId).then((user) => {
      if (!user) {
        return res.status(403).json({ error: 'User not found' });
      }
      // Enforce account suspension (Apple Guideline 1.2 — eject abusive users).
      // For AI-imposed TIMED suspensions (24h / 7d / 30d), the moderator stamps
      // `chatLimitUntil` with the suspension end date. Auto-clear the suspension
      // here once that timestamp has passed so timed bans don't behave as
      // permanent ones. Permanent bans leave `chatLimitUntil` NULL.
      // Tombstoned (account-deleted) users can never authenticate. Belt and
      // braces — tokenVersion was bumped at request time so the JWT is
      // already invalid, but block here too in case of forged/replayed
      // tokens. Returns 410 GONE so the client knows this is terminal
      // (different from 401, which the client typically retries with
      // a refresh).
      if (user.isDeletedPlaceholder) {
        return res.status(410).json({
          error: 'Account deleted',
          accountDeleted: true,
        });
      }
      if (user.isSuspended) {
        const until = user.chatLimitUntil ? new Date(user.chatLimitUntil).getTime() : null;
        if (until !== null && until <= Date.now()) {
          storage.unsuspendUser(decoded.userId)
            .then(() => next())
            .catch(() => res.status(500).json({ error: 'Auth check failed' }));
          return;
        }
        return res.status(403).json({
          error: 'Account suspended',
          reason: user.suspensionReason || 'Violation of community guidelines',
          suspended: true,
        });
      }
      const currentTv = user.tokenVersion ?? 0;
      const tokenTv = decoded.tv ?? 0;
      if (tokenTv < currentTv) {
        return res.status(401).json({ error: 'Session expired. Please sign in again.' });
      }
      next();
    }).catch(() => res.status(500).json({ error: 'Auth check failed' }));
  } catch (error) {
    return res.status(403).json({ error: 'Invalid token' });
  }
}

function getClientIp(req: Request): string | null {
  const fwd = (req.headers['x-forwarded-for'] as string) || '';
  const ip = fwd.split(',')[0].trim() || req.socket.remoteAddress || '';
  return ip || null;
}

import crypto from "crypto";
import { encryptSmsBody } from "./smsEncryption";

function generateSafeCode(): string {
  // 24 hex chars (96 bits), formatted as XXXX-XXXX-XXXX-XXXX-XXXX-XXXX
  const bytes = crypto.randomBytes(12).toString('hex').toUpperCase();
  return bytes.match(/.{1,4}/g)!.join('-');
}

function hashSafeCode(code: string): string {
  // Normalize (strip dashes, uppercase) then bcrypt
  const normalized = code.replace(/[-\s]/g, '').toUpperCase();
  return bcrypt.hashSync(normalized, 10);
}

function verifySafeCode(code: string, hash: string): boolean {
  const normalized = code.replace(/[-\s]/g, '').toUpperCase();
  return bcrypt.compareSync(normalized, hash);
}

// Deterministic HMAC used ONLY to look up which user a submitted Account ID
// (Safe Code) belongs to during unauthenticated recovery — bcrypt hashes
// can't be searched by value since they're salted per-call. The bcrypt hash
// in `safeCodeHash` remains the actual credential check; this is purely an
// index.
function lookupHashSafeCode(code: string): string {
  const normalized = code.replace(/[-\s]/g, '').toUpperCase();
  return crypto.createHmac('sha256', JWT_SECRET).update(normalized).digest('hex');
}

// ─── Security questions (account recovery 2nd factor) ─────────────────────
// Answers are low-entropy secrets (a favourite dish, two memorable words),
// so they're normalized aggressively before hashing to avoid users getting
// locked out by incidental casing/whitespace differences, and bcrypt-hashed
// like the locker PIN — never stored, logged, or transmitted back in
// plaintext once hashed.
function normalizeSecurityAnswer(answer: string): string {
  return answer.trim().toLowerCase().replace(/\s+/g, ' ');
}

function hashSecurityAnswer(answer: string): string {
  return bcrypt.hashSync(normalizeSecurityAnswer(answer), 10);
}

function verifySecurityAnswer(answer: string, hash: string): boolean {
  return bcrypt.compareSync(normalizeSecurityAnswer(answer), hash);
}

function isValidTwoWordAnswer(answer: string): boolean {
  const words = normalizeSecurityAnswer(answer).split(' ').filter(Boolean);
  return words.length === 2 && words.every((w) => w.length >= 1);
}

const SECURITY_Q_MAX_ATTEMPTS = 5;
const SECURITY_Q_LOCKOUT_MS = 30 * 60_000; // 30 minutes

// 3-20 chars, must start with a letter, lowercase letters/digits/underscore
// only. Stored/compared lowercase — the unique index and every lookup here
// assume the canonical form.
const USERNAME_REGEX = /^[a-z][a-z0-9_]{2,19}$/;
const USERNAME_CHANGE_COOLDOWN_DAYS = 30;

export async function registerRoutes(app: Express): Promise<Server> {
  const connectedUsers = new Map<string, Set<string>>();

  // Privacy Policy page
  app.get('/privacy', (req, res) => {
    const privacyPath = path.resolve(process.cwd(), 'server', 'templates', 'privacy-policy.html');
    const html = fs.readFileSync(privacyPath, 'utf-8');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(html);
  });

  // Support page (same as privacy for App Store Connect)
  app.get('/support', (req, res) => {
    const supportPath = path.resolve(process.cwd(), 'server', 'templates', 'support.html');
    const html = fs.readFileSync(supportPath, 'utf-8');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(html);
  });

  // Terms of Service page
  app.get('/terms', (req, res) => {
    const termsPath = path.resolve(process.cwd(), 'server', 'templates', 'terms-of-service.html');
    const html = fs.readFileSync(termsPath, 'utf-8');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(html);
  });

  app.get('/api/auth/geo-permissions', (req, res) => {
    try {
      const result = getEnabledSmsCountries();
      res.json({
        twilioConfigured: isTwilioConfigured(),
        countriesConfigured: result.configured,
        countries: result.countries,
        message: result.message,
      });
    } catch (error) {
      console.error('Error getting geo permissions:', error);
      res.status(500).json({
        twilioConfigured: false,
        countriesConfigured: false,
        countries: [
          { isoCode: "US", name: "United States", dialCode: "+1" },
          { isoCode: "CA", name: "Canada", dialCode: "+1" },
        ],
        message: 'Error loading country configuration',
      });
    }
  });

  app.get('/api/stats/announcement', async (req, res) => {
    try {
      const stats = await storage.getAnnouncementStats();
      res.json(stats);
    } catch (error) {
      console.error('Error getting announcement stats:', error);
      res.json({
        activeUsers: 0,
        totalUsers: 0,
        recentMessage: "Welcome to Pryvo",
      });
    }
  });

  // Client fatal-crash telemetry. Unauthenticated on purpose — the app may
  // crash before login. Payload is size-capped and only logged, never stored.
  const clientCrashRateLimit = makePreAuthRateLimiter("client-crash report", 10, 10 * 60_000);
  app.post('/api/client-crash', express.json({ limit: '16kb' }), (req, res) => {
    if (!clientCrashRateLimit((r) => r.ip || "unknown", req, res)) return;
    try {
      const { message, stack, isFatal, platform, at } = req.body || {};
      console.error(
        `[CLIENT CRASH] fatal=${!!isFatal} platform=${String(platform).slice(0, 40)} at=${String(at).slice(0, 40)}\n` +
        `message: ${String(message).slice(0, 1000)}\n` +
        `stack: ${String(stack).slice(0, 4000)}`
      );
    } catch (e) {
      console.error('[CLIENT CRASH] unparseable payload');
    }
    res.json({ ok: true });
  });

  // Apple App Store reviewer demo account configuration
  // APPLE_REVIEW_TEST_DIGITS: The subscriber digits to match (e.g., "5551234567")
  // When a phone number ends with these digits (any country code), it uses demo mode
  // Demo verification code is always "123456"
  const APPLE_REVIEW_TEST_DIGITS = process.env.APPLE_REVIEW_TEST_DIGITS || '5551234567';
  const APPLE_DEMO_CODE = '123456';

  // Module-scoped so /api/auth/verify-code can gate the demo bypass on it.
  // Fail-closed default: only opens when explicitly enabled (Apple review window).
  // Was a bare in-memory variable with no persistence — every server
  // restart/redeploy silently reset it back to the env-var default,
  // discarding whatever the owner had toggled in Settings. Seed it from the
  // durable app_settings row (falls back to the env default if never set)
  // and have the POST handler below write through to that row too.
  let reviewModeEnabled = (process.env.REVIEW_MODE || 'false').toLowerCase() === 'true';
  try {
    const persisted = await storage.getAppSetting('reviewModeEnabled');
    if (persisted !== undefined) reviewModeEnabled = persisted === 'true';
  } catch (e) {
    console.error('Failed to load persisted review-mode setting, using env default:', e);
  }
  
  // DO NOT REMOVE — Apple App Review reviewer account.
  // 555-1234567 bypasses OTP and grants VIP access so reviewers
  // can evaluate paid features. Removing this will cause App
  // Store rejection. See replit.md "Permanent Project Requirements"
  // section #3 for the full policy.
  const TEST_PHONE_PATTERNS = [
    '5551234567',   // +1 555-123-4567 or any country code — APPLE REVIEWER
    '5550000000',   // +1 555-000-0000 or any country code — APPLE REVIEWER
  ];

  // DO NOT REMOVE — Developer/tester accounts. Protected by replit.md
  // "Permanent Project Requirements" section #3.
  const VIP_PHONE_NUMBERS = [
    '61474011265',  // +61 474 011 265 (developer account)
  ];
  
  // Helper to check if phone number matches test patterns (Apple review or developer testing)
  const isAppleReviewTestNumber = (phoneNumber: string): boolean => {
    // Extract only digits from the phone number
    const digitsOnly = phoneNumber.replace(/\D/g, '');
    // Check against all test patterns
    // Check if it ends with any test pattern or contains any test pattern
    const matchesTestPattern = TEST_PHONE_PATTERNS.some(pattern => 
      digitsOnly.endsWith(pattern) || digitsOnly.includes(pattern)
    );
    // Also check the legacy APPLE_REVIEW_TEST_DIGITS for backwards compatibility
    const endsWithTestDigits = digitsOnly.endsWith(APPLE_REVIEW_TEST_DIGITS);
    const containsTestPattern = digitsOnly.includes(APPLE_REVIEW_TEST_DIGITS);
    return matchesTestPattern || endsWithTestDigits || containsTestPattern;
  };
  
  // Helper to check if phone number is in the VIP list (developer/tester accounts)
  const isVipPhoneNumber = (phoneNumber: string): boolean => {
    const digitsOnly = phoneNumber.replace(/\D/g, '');
    return VIP_PHONE_NUMBERS.some(vipNumber => digitsOnly.endsWith(vipNumber) || digitsOnly === vipNumber);
  };
  
  // Combined check for auto-VIP access (Apple reviewer OR VIP list)
  const shouldGetFreeVip = (phoneNumber: string): boolean => {
    return isAppleReviewTestNumber(phoneNumber) || isVipPhoneNumber(phoneNumber);
  };

  // Helper to check if a user ID belongs to an Apple reviewer (for mock chat injection)
  const isAppleReviewerUser = async (userId: string): Promise<boolean> => {
    try {
      const user = await storage.getUser(userId);
      if (!user) return false;
      return isAppleReviewTestNumber(user.phoneNumber);
    } catch {
      return false;
    }
  };

  // Check if we're in development mode (not production deployment)
  const isDevMode = (): boolean => {
    return process.env.REPLIT_DEPLOYMENT !== '1' && process.env.NODE_ENV !== 'production';
  };

  // Lets the client hide sign-in buttons for providers that aren't
  // configured on this deployment instead of showing a button that 500s.
  app.get('/api/auth/oauth-config', (req, res) => {
    res.json({ appleEnabled: true, googleEnabled: isGoogleSignInConfigured() });
  });

  // Shared by both /api/auth/oauth/apple and /api/auth/oauth/google below.
  // If this identity is already linked to an account, log straight in (no
  // phone/SMS needed). Otherwise hand back a short-lived link token — the
  // client carries it through the normal phone-verification flow so the
  // OAuth identity gets attached to whichever account comes out the other
  // end (new signup or an existing phone-based account).
  async function handleOAuthSignIn(
    req: Request,
    res: Response,
    provider: 'apple' | 'google',
    lookup: (sub: string) => Promise<any>,
    identity: { sub: string; email?: string },
  ) {
    const existingUser = await lookup(identity.sub);
    if (existingUser) {
      const tokenVersion = existingUser.tokenVersion ?? 0;
      const token = jwt.sign({ userId: existingUser.id, tv: tokenVersion }, JWT_SECRET, { expiresIn: '30d' });
      const ipAddress = getClientIp(req);
      storage.recordLoginEvent({
        userId: existingUser.id,
        deviceId: null,
        deviceName: null,
        platform: null,
        ipAddress,
        userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
        isNewDevice: false,
      }).catch(err => console.error('Failed to record login event:', err));

      return res.json({
        linked: true,
        success: true,
        token,
        user: {
          id: existingUser.id,
          phoneNumber: existingUser.phoneNumber,
          displayName: existingUser.displayName,
          avatarIndex: existingUser.avatarIndex,
          avatarUrl: existingUser.avatarUrl,
          isVip: existingUser.isVip,
          isAdFree: existingUser.isAdFree,
          vipStartedAt: existingUser.vipStartedAt,
          lastNameChangeAt: existingUser.lastNameChangeAt,
          notificationsEnabled: existingUser.notificationsEnabled ?? false,
          safeCodeAcknowledged: existingUser.safeCodeAcknowledged ?? false,
          hasSafeCode: !!existingUser.safeCodeHash,
          hasSecurityQuestions: !!existingUser.securityQ1Hash,
          isAppleReviewAccount: isAppleReviewTestNumber(existingUser.phoneNumber),
        },
      });
    }

    // Not linked to any account yet — the client must complete phone
    // verification and pass this token to /api/auth/verify-code to link it.
    const linkToken = signOAuthLinkToken(provider, identity, JWT_SECRET);
    res.json({ linked: false, needsPhoneLink: true, linkToken, email: identity.email ?? null });
  }

  app.post('/api/auth/oauth/apple', async (req, res) => {
    try {
      const { identityToken } = req.body;
      if (!identityToken || typeof identityToken !== 'string') {
        return res.status(400).json({ error: 'Missing Apple identity token' });
      }
      const identity = await verifyAppleIdentityToken(identityToken);
      await handleOAuthSignIn(req, res, 'apple', (sub) => storage.getUserByAppleId(sub), identity);
    } catch (error) {
      console.error('Apple sign-in verification failed:', error);
      res.status(401).json({ error: "Couldn't verify Sign in with Apple. Please try again." });
    }
  });

  app.post('/api/auth/oauth/google', async (req, res) => {
    try {
      const { idToken } = req.body;
      if (!idToken || typeof idToken !== 'string') {
        return res.status(400).json({ error: 'Missing Google ID token' });
      }
      const identity = await verifyGoogleIdToken(idToken);
      await handleOAuthSignIn(req, res, 'google', (sub) => storage.getUserByGoogleId(sub), identity);
    } catch (error) {
      console.error('Google sign-in verification failed:', error);
      res.status(401).json({ error: "Couldn't verify Google sign-in. Please try again." });
    }
  });

  app.post('/api/auth/send-code', async (req, res) => {
    try {
      const { phoneNumber: rawPhone } = req.body;

      if (!rawPhone || typeof rawPhone !== 'string') {
        return res.status(400).json({ error: 'Please enter your phone number.' });
      }

      // Normalize to E.164: keep digits, prepend "+" if missing.
      const digitsOnly = rawPhone.replace(/\D/g, '');
      if (digitsOnly.length < 7 || digitsOnly.length > 15) {
        return res.status(400).json({ error: 'Please enter a valid phone number with country code.' });
      }
      const phoneNumber = rawPhone.trim().startsWith('+') ? `+${digitsOnly}` : `+${digitsOnly}`;

      // SMS-budget shield. Keyed (ip, normalized-phone) AFTER E.164
      // normalization so attackers can't bypass by varying punctuation.
      // Apple reviewer demo numbers fall through this gate too — they
      // hit DB-only, no real Twilio send, so 5/10min is plenty headroom.
      const sendIpKey = getClientIp(req) ?? "unknown-ip";
      const sendAllowed = sendCodeRateLimit(
        () => `${sendIpKey}|${phoneNumber}`,
        req,
        res,
      );
      if (!sendAllowed) return; // 429 already written

      // Apple App Store reviewer demo account.
      // The reserved fictional numbers (NANP 555-01XX block, e.g. +1 555-123-4567
      // and +1 555-000-0000) cannot be assigned to real subscribers, so we ALWAYS
      // honor the demo bypass for these regardless of REVIEW_MODE. This guarantees
      // App Store reviewers can sign in even if the REVIEW_MODE flag is missing on
      // a given deployment.
      if (isAppleReviewTestNumber(phoneNumber)) {
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour for demo
        await storage.createVerificationCode(phoneNumber, APPLE_DEMO_CODE, expiresAt);
        console.log(`[APPLE REVIEW] Demo verification ready for: ${phoneNumber} (code: ${APPLE_DEMO_CODE}) [reviewMode=${reviewModeEnabled}]`);
        return res.json({ success: true, message: 'Verification code sent' });
      }

      const code = generateVerificationCode();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      await storage.createVerificationCode(phoneNumber, code, expiresAt);
      
      const twilioConfigured = (process.env.TWILIO_ACCOUNT_SID || process.env.Twilio_Account_SID) && 
                               (process.env.TWILIO_AUTH_TOKEN || process.env.Twilio_Auth_Token) && 
                               (process.env.TWILIO_PHONE_NUMBER || process.env.Twilio_Phone_Number);
      
      if (twilioConfigured) {
        const result = await sendVerificationSMS(phoneNumber, code);
        if (!result.success) {
          return res.status(400).json({
            error: result.userMessage || 'Failed to send verification code',
          });
        }
      } else {
        console.log(`[DEV MODE] Verification code for ${phoneNumber}: ${code}`);
      }

      res.json({ success: true, message: 'Verification code sent' });
    } catch (error) {
      console.error('Error sending code:', error);
      res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  });

  app.post('/api/auth/verify-code', async (req, res) => {
    try {
      const { phoneNumber: rawPhone, code, deviceId, deviceName, platform, oauthLinkToken } = req.body;

      if (!rawPhone || !code || typeof rawPhone !== 'string' || typeof code !== 'string') {
        return res.status(400).json({ error: 'Phone number and code are required' });
      }

      // Validate the OAuth link token (if the client is completing a "Sign
      // in with Apple/Google, then verify this phone to link it" flow)
      // BEFORE touching the DB, so a bad/expired token fails fast with a
      // clear error instead of silently skipping the link after the phone
      // verification already succeeded.
      let oauthLinkClaims: { provider: 'apple' | 'google'; sub: string; email?: string } | null = null;
      if (oauthLinkToken && typeof oauthLinkToken === 'string') {
        try {
          oauthLinkClaims = verifyOAuthLinkToken(oauthLinkToken, JWT_SECRET);
        } catch {
          return res.status(400).json({ error: 'Your sign-in session expired. Please try again.' });
        }
      }

      // Normalize to match what /send-code stored (E.164 with leading "+").
      const verifyDigits = rawPhone.replace(/\D/g, '');
      if (verifyDigits.length < 7 || verifyDigits.length > 15) {
        return res.status(400).json({ error: 'Please enter a valid phone number with country code.' });
      }
      const phoneNumber = `+${verifyDigits}`;

      // Brute-force shield. Keyed on (client-ip, phone) so neither a
      // single attacker IP cycling phones nor a single victim phone
      // attacked from one IP can exhaust the search space. Runs AFTER
      // input normalization so the bucket uses canonical E.164.
      const ipKey = getClientIp(req) ?? "unknown-ip";
      const allowed = verifyCodeRateLimit(
        () => `${ipKey}|${phoneNumber}`,
        req,
        res,
      );
      if (!allowed) return; // 429 already written

      // Apple reviewer / demo account: bypass DB lookup entirely.
      // The reserved NANP fictional numbers (555-123-4567 / 555-000-0000) can
      // never belong to a real subscriber, so we honor the demo code on them
      // regardless of REVIEW_MODE. This is the safety net so App Store reviewers
      // can always sign in if a deployment is missing the env flag.
      const isDemoBypass =
        isAppleReviewTestNumber(phoneNumber) &&
        code === APPLE_DEMO_CODE;

      if (!isDemoBypass) {
        const verificationCode = await storage.getVerificationCode(phoneNumber, code);

        if (!verificationCode) {
          return res.status(400).json({ error: 'Invalid verification code' });
        }

        if (new Date() > verificationCode.expiresAt) {
          return res.status(400).json({ error: 'Verification code expired' });
        }

        await storage.markCodeVerified(verificationCode.id);
      } else {
        console.log(`[APPLE REVIEW] Demo bypass accepted for: ${phoneNumber}`);
      }

      let user = await storage.getUserByPhone(phoneNumber);
      let isNewUser = false;
      
      if (!user) {
        user = await storage.createUser({ phoneNumber });
        isNewUser = true;
        
        storage.processNewUserJoined(phoneNumber).catch(err => {
          console.error('Error processing new user join notifications:', err);
        });
      }

      // Grant VIP access to Apple review test accounts and VIP phone numbers
      const grantVip = isDemoBypass || isAppleReviewTestNumber(phoneNumber) || isVipPhoneNumber(phoneNumber);
      if (grantVip && !user.isVip) {
        user = await storage.updateUser(user.id, { isVip: true, vipStartedAt: new Date() }) || user;
        console.log(`[AUTO VIP] Granted VIP access to: ${phoneNumber}`);
      }

      // Attach the verified Apple/Google identity to whichever account this
      // phone verification landed on (new signup or pre-existing account).
      // Best-effort: a failed link (e.g. that identity got linked to a
      // different account in the meantime) should never block the phone
      // login itself, which already succeeded.
      if (oauthLinkClaims) {
        try {
          const field = oauthLinkClaims.provider === 'apple' ? 'appleUserId' : 'googleUserId';
          const alreadyLinkedElsewhere = user[field] && user[field] !== oauthLinkClaims.sub;
          if (!alreadyLinkedElsewhere && user[field] !== oauthLinkClaims.sub) {
            user = await storage.updateUser(user.id, { [field]: oauthLinkClaims.sub } as any) || user;
          }
        } catch (e) {
          console.error('Failed to link OAuth identity to user:', e);
        }
      }

      const tokenVersion = user.tokenVersion ?? 0;
      const token = jwt.sign({ userId: user.id, tv: tokenVersion, did: deviceId ?? undefined }, JWT_SECRET, { expiresIn: '30d' });

      // Auto-generate a Safe Code for first-time signups so the user is
      // immediately routed through the SafeCodeScreen (gate fires on
      // hasSafeCode=true && safeCodeAcknowledged=false). Plaintext is
      // returned exactly once in this response and never stored.
      let pendingSafeCode: string | undefined;
      if (isNewUser && !user.safeCodeHash) {
        try {
          const generated = generateSafeCode();
          const hash = hashSafeCode(generated);
          const lookupHash = lookupHashSafeCode(generated);
          await storage.updateUser(user.id, { safeCodeHash: hash, safeCodeAcknowledged: false, safeCodeLookupHash: lookupHash });
          user = { ...user, safeCodeHash: hash, safeCodeAcknowledged: false, safeCodeLookupHash: lookupHash };
          pendingSafeCode = generated;
        } catch (e) {
          console.error('Failed to auto-generate Safe Code at signup:', e);
        }
      }

      // Determine if this is a new device login (only if device info supplied)
      let isNewDevice = false;
      if (deviceId) {
        try {
          const existingDevices = await storage.listDevices(user.id);
          isNewDevice = !existingDevices.some((d) => d.deviceId === deviceId);
        } catch {
          isNewDevice = !isNewUser;
        }
      }

      // Record login event (fire and forget — don't block auth response)
      const ipAddress = getClientIp(req);
      const userAgent = req.headers['user-agent'] || null;
      storage.recordLoginEvent({
        userId: user.id,
        deviceId: deviceId ?? null,
        deviceName: deviceName ?? null,
        platform: platform ?? null,
        ipAddress,
        userAgent: typeof userAgent === 'string' ? userAgent : null,
        isNewDevice: isNewDevice && !isNewUser,
      }).catch(err => console.error('Failed to record login event:', err));

      // Concurrent-session / account-hijack alert: if this account already has
      // a LIVE socket connection from a device other than the one logging in
      // right now, warn that original session in real time instead of letting
      // a second session join silently. We deliberately compare deviceId (not
      // just "any existing connection") so a normal reconnect from the same
      // device/app instance never falsely trips this.
      try {
        const existingSocketIds = socketIO ? connectedUsers.get(user.id) : null;
        if (existingSocketIds && existingSocketIds.size > 0 && socketIO) {
          for (const sid of existingSocketIds) {
            const existingSocket = socketIO.sockets.sockets.get(sid);
            if (!existingSocket) continue;
            const existingDeviceId = (existingSocket as any).deviceId ?? null;
            if (deviceId && existingDeviceId && existingDeviceId === deviceId) continue;
            existingSocket.emit('concurrent-session-alert', {
              newDeviceName: deviceName ?? null,
              newPlatform: platform ?? null,
              ipAddress,
              at: new Date().toISOString(),
            });
          }
        }
      } catch (e) {
        console.error('Failed to emit concurrent-session-alert:', e);
      }

      // If new device for existing user, push-notify previously registered devices
      if (isNewDevice && !isNewUser && user.pushToken && user.notificationsEnabled !== false) {
        const where = deviceName ? ` from ${deviceName}` : '';
        sendPushNotification(
          user.pushToken,
          'New login detected',
          `New login to your Pryvo account${where}. If this wasn't you, secure your account.`,
          { type: 'security-alert', subtype: 'new-login' },
          'activity'
        ).catch(err => console.error('Failed to send new-login notification:', err));
      }

      res.json({
        success: true,
        token,
        user: {
          id: user.id,
          phoneNumber: user.phoneNumber,
          displayName: user.displayName,
          avatarIndex: user.avatarIndex,
          avatarUrl: user.avatarUrl,
          isVip: user.isVip,
          isAdFree: user.isAdFree,
          vipStartedAt: user.vipStartedAt,
          lastNameChangeAt: user.lastNameChangeAt,
          notificationsEnabled: user.notificationsEnabled ?? false,
          safeCodeAcknowledged: user.safeCodeAcknowledged ?? false,
          hasSafeCode: !!user.safeCodeHash,
          hasSecurityQuestions: !!user.securityQ1Hash,
          // Root cause of Apple's "unable to sign in when further
          // verification was required" rejection (Guideline 2.1): the
          // reviewer/demo account has security questions set from earlier
          // testing, so after the OTP bypass succeeds it still hits the
          // "Confirm It's You" second factor — answers nobody currently
          // signing in with the demo code can know. The client exempts
          // this account from both the setup and verify security-question
          // gates using this flag rather than lying about
          // hasSecurityQuestions, which stayed accurate but got
          // overwritten by the next GET /api/auth/me and flapped between
          // "needs setup" and "needs verify" mid-session.
          isAppleReviewAccount: isAppleReviewTestNumber(user.phoneNumber),
        },
        isNewUser,
        isNewDevice,
        // Returned exactly once at signup; the client persists this in
        // SecureStore until the user acknowledges saving it.
        pendingSafeCode,
      });
    } catch (error) {
      console.error('Error verifying code:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ─── Safe Code (account recovery code) ───────────────────────────────────
  app.post('/api/auth/safe-code/generate', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const user = await storage.getUser(req.userId!);
      if (!user) return res.status(404).json({ error: 'User not found' });
      if (user.safeCodeHash) {
        return res.status(400).json({ error: 'Safe code already exists. It cannot be regenerated for security reasons.' });
      }
      const code = generateSafeCode();
      const hash = hashSafeCode(code);
      const lookupHash = lookupHashSafeCode(code);
      await storage.updateUser(user.id, { safeCodeHash: hash, safeCodeAcknowledged: false, safeCodeLookupHash: lookupHash });
      res.json({ success: true, code });
    } catch (error) {
      console.error('Error generating safe code:', error);
      res.status(500).json({ error: 'Could not generate safe code' });
    }
  });

  app.post('/api/auth/safe-code/acknowledge', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const user = await storage.getUser(req.userId!);
      if (!user) return res.status(404).json({ error: 'User not found' });
      if (!user.safeCodeHash) {
        return res.status(400).json({ error: 'No safe code generated yet. Generate one before acknowledging.' });
      }
      await storage.updateUser(req.userId!, { safeCodeAcknowledged: true });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Could not save acknowledgement' });
    }
  });

  // ─── Security questions (set once, required on every fresh login, and ────
  // combined with the Account ID for self-service account recovery) ────────
  app.post('/api/auth/security-questions/set', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const user = await storage.getUser(req.userId!);
      if (!user) return res.status(404).json({ error: 'User not found' });
      if (user.securityQ1Hash) {
        return res.status(400).json({ error: 'Security questions are already set.' });
      }
      const { dishAnswer, twoWordsAnswer } = req.body;
      if (!dishAnswer || typeof dishAnswer !== 'string' || !normalizeSecurityAnswer(dishAnswer)) {
        return res.status(400).json({ error: 'Please answer the first question.' });
      }
      if (!twoWordsAnswer || typeof twoWordsAnswer !== 'string' || !isValidTwoWordAnswer(twoWordsAnswer)) {
        return res.status(400).json({ error: 'Please enter exactly two words separated by a space.' });
      }
      await storage.updateUser(user.id, {
        securityQ1Hash: hashSecurityAnswer(dishAnswer),
        securityQ2Hash: hashSecurityAnswer(twoWordsAnswer),
        securityQuestionsSetAt: new Date(),
      });
      // Answers exist only in this request's memory — never echoed back,
      // never logged, discarded the instant the hashes are computed above.
      res.json({ success: true });
    } catch (error) {
      console.error('Error setting security questions:', error);
      res.status(500).json({ error: 'Could not save security questions' });
    }
  });

  // DO NOT REMOVE — Apple App Review support.
  // The demo/reviewer account already has security-question answers set
  // from earlier internal testing (nobody currently signing in with the
  // public demo OTP knows them), and the client already exempts
  // isAppleReviewAccount from ever being routed to the "Confirm It's You"
  // screen (see RootStackNavigator's needsSecurityQuestionsSetup/Verify).
  // This route exists purely as defense-in-depth for the App Store Connect
  // reviewer notes: it lets the demo account's answers be overwritten to a
  // known value we can document verbatim, in case a reviewer's device ever
  // shows that screen anyway (a stale cached build, a retried older
  // TestFlight build, etc). The normal /security-questions/set route 400s
  // once answers already exist, which is why this is a separate endpoint —
  // and it is hard-locked to the two fixed review/demo phone numbers, so it
  // can never be used to reset a real user's answers.
  app.post('/api/auth/security-questions/reset-demo', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const user = await storage.getUser(req.userId!);
      if (!user || !isAppleReviewTestNumber(user.phoneNumber)) {
        return res.status(403).json({ error: 'Not available for this account' });
      }
      const { dishAnswer, twoWordsAnswer } = req.body;
      if (!dishAnswer || typeof dishAnswer !== 'string' || !normalizeSecurityAnswer(dishAnswer)) {
        return res.status(400).json({ error: 'Please answer the first question.' });
      }
      if (!twoWordsAnswer || typeof twoWordsAnswer !== 'string' || !isValidTwoWordAnswer(twoWordsAnswer)) {
        return res.status(400).json({ error: 'Please enter exactly two words separated by a space.' });
      }
      await storage.updateUser(user.id, {
        securityQ1Hash: hashSecurityAnswer(dishAnswer),
        securityQ2Hash: hashSecurityAnswer(twoWordsAnswer),
        securityQuestionsSetAt: new Date(),
        securityQFailedAttempts: 0,
        securityQLockedUntil: null,
      });
      res.json({ success: true });
    } catch (error) {
      console.error('Error resetting demo security questions:', error);
      res.status(500).json({ error: 'Could not reset security questions' });
    }
  });

  app.post('/api/auth/security-questions/verify', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const user = await storage.getUser(req.userId!);
      if (!user || !user.securityQ1Hash || !user.securityQ2Hash) {
        return res.status(400).json({ error: 'No security questions on file' });
      }
      if (user.securityQLockedUntil && new Date() < new Date(user.securityQLockedUntil)) {
        const retryAfterSec = Math.ceil((new Date(user.securityQLockedUntil).getTime() - Date.now()) / 1000);
        res.setHeader('Retry-After', retryAfterSec.toString());
        return res.status(429).json({ error: 'Too many incorrect attempts. Please try again later.' });
      }
      const { dishAnswer, twoWordsAnswer } = req.body;
      const valid =
        typeof dishAnswer === 'string' &&
        typeof twoWordsAnswer === 'string' &&
        verifySecurityAnswer(dishAnswer, user.securityQ1Hash) &&
        verifySecurityAnswer(twoWordsAnswer, user.securityQ2Hash);

      if (!valid) {
        const attempts = (user.securityQFailedAttempts ?? 0) + 1;
        const lockedUntil = attempts >= SECURITY_Q_MAX_ATTEMPTS ? new Date(Date.now() + SECURITY_Q_LOCKOUT_MS) : null;
        await storage.updateUser(user.id, {
          securityQFailedAttempts: attempts >= SECURITY_Q_MAX_ATTEMPTS ? 0 : attempts,
          securityQLockedUntil: lockedUntil,
        });
        return res.json({ valid: false });
      }

      await storage.updateUser(user.id, { securityQFailedAttempts: 0, securityQLockedUntil: null });
      res.json({ valid: true });
    } catch (error) {
      console.error('Error verifying security questions:', error);
      res.status(500).json({ error: 'Verification failed' });
    }
  });

  // ─── Account recovery (lost phone number) ──────────────────────────────
  // Fully automatic, no manual review: Account ID + both security answers
  // is treated as sufficient proof of ownership, matching a password-reset
  // flow. To still guard against pure account takeover from a leaked/guessed
  // Account ID, the flow does NOT relink the phone number until the caller
  // also proves live possession of the NEW number via a real OTP — the
  // recovery answers alone only unlock a short-lived recovery token, they
  // never directly change the login-bound phone number.
  const recoverVerifyIpRateLimit = makePreAuthRateLimiter("account-recovery", 8, 15 * 60_000);
  const RECOVERY_TOKEN_TTL_MIN = 10;

  app.post('/api/auth/recover/verify', async (req, res) => {
    try {
      const { accountId, dishAnswer, twoWordsAnswer } = req.body;
      if (!accountId || typeof accountId !== 'string' || !dishAnswer || !twoWordsAnswer) {
        return res.status(400).json({ error: 'Account ID and both answers are required.' });
      }

      // IP-wide throttle first so a single attacker can't hammer the lookup
      // itself (which is O(1) and cheap) before we even find a user to
      // apply the slower bcrypt + per-account lockout to.
      const ipKey = getClientIp(req) ?? "unknown-ip";
      const ipAllowed = recoverVerifyIpRateLimit(() => ipKey, req, res);
      if (!ipAllowed) return; // 429 already written

      const lookupHash = lookupHashSafeCode(accountId);
      const user = await storage.getUserBySafeCodeLookupHash(lookupHash);

      // Same generic failure for "no such account ID" and "wrong answers" —
      // never reveal which part was incorrect.
      const genericFail = () => res.json({ valid: false });

      if (!user || !user.safeCodeHash || !user.securityQ1Hash || !user.securityQ2Hash) {
        return genericFail();
      }

      if (user.securityQLockedUntil && new Date() < new Date(user.securityQLockedUntil)) {
        const retryAfterSec = Math.ceil((new Date(user.securityQLockedUntil).getTime() - Date.now()) / 1000);
        res.setHeader('Retry-After', retryAfterSec.toString());
        return res.status(429).json({ error: 'Too many incorrect attempts. Please try again later.' });
      }

      const valid =
        verifySafeCode(accountId, user.safeCodeHash) &&
        verifySecurityAnswer(dishAnswer, user.securityQ1Hash) &&
        verifySecurityAnswer(twoWordsAnswer, user.securityQ2Hash);

      if (!valid) {
        const attempts = (user.securityQFailedAttempts ?? 0) + 1;
        const lockedUntil = attempts >= SECURITY_Q_MAX_ATTEMPTS ? new Date(Date.now() + SECURITY_Q_LOCKOUT_MS) : null;
        await storage.updateUser(user.id, {
          securityQFailedAttempts: attempts >= SECURITY_Q_MAX_ATTEMPTS ? 0 : attempts,
          securityQLockedUntil: lockedUntil,
        });
        return genericFail();
      }

      await storage.updateUser(user.id, { securityQFailedAttempts: 0, securityQLockedUntil: null });

      const recoveryToken = jwt.sign(
        { userId: user.id, purpose: 'account-recovery' },
        JWT_SECRET,
        { expiresIn: `${RECOVERY_TOKEN_TTL_MIN}m` },
      );
      res.json({ valid: true, recoveryToken });
    } catch (error) {
      console.error('Error verifying account recovery:', error);
      res.status(500).json({ error: 'Recovery verification failed' });
    }
  });

  function verifyRecoveryToken(token: unknown): string | null {
    if (!token || typeof token !== 'string') return null;
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; purpose?: string };
      if (decoded.purpose !== 'account-recovery') return null;
      return decoded.userId;
    } catch {
      return null;
    }
  }

  app.post('/api/auth/recover/send-code', async (req, res) => {
    try {
      const { recoveryToken, phoneNumber: rawPhone } = req.body;
      const userId = verifyRecoveryToken(recoveryToken);
      if (!userId) {
        return res.status(401).json({ error: 'Recovery session expired. Please verify your Account ID and answers again.' });
      }
      if (!rawPhone || typeof rawPhone !== 'string') {
        return res.status(400).json({ error: 'Please enter your new phone number.' });
      }
      const digitsOnly = rawPhone.replace(/\D/g, '');
      if (digitsOnly.length < 7 || digitsOnly.length > 15) {
        return res.status(400).json({ error: 'Please enter a valid phone number with country code.' });
      }
      const phoneNumber = `+${digitsOnly}`;

      const existingOwner = await storage.getUserByPhone(phoneNumber);
      if (existingOwner && existingOwner.id !== userId) {
        return res.status(400).json({ error: 'That phone number is already linked to another account.' });
      }

      const sendIpKey = getClientIp(req) ?? "unknown-ip";
      const sendAllowed = sendCodeRateLimit(() => `recover|${sendIpKey}|${phoneNumber}`, req, res);
      if (!sendAllowed) return;

      const code = generateVerificationCode();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      await storage.createVerificationCode(phoneNumber, code, expiresAt);

      const twilioConfigured = (process.env.TWILIO_ACCOUNT_SID || process.env.Twilio_Account_SID) &&
        (process.env.TWILIO_AUTH_TOKEN || process.env.Twilio_Auth_Token) &&
        (process.env.TWILIO_PHONE_NUMBER || process.env.Twilio_Phone_Number);

      if (twilioConfigured) {
        const result = await sendVerificationSMS(phoneNumber, code);
        if (!result.success) {
          return res.status(400).json({ error: result.userMessage || 'Failed to send verification code' });
        }
      } else {
        console.log(`[DEV MODE] Recovery verification code for ${phoneNumber}: ${code}`);
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Error sending recovery code:', error);
      res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  });

  app.post('/api/auth/recover/complete', async (req, res) => {
    try {
      const { recoveryToken, phoneNumber: rawPhone, code, deviceId, deviceName, platform } = req.body;
      const userId = verifyRecoveryToken(recoveryToken);
      if (!userId) {
        return res.status(401).json({ error: 'Recovery session expired. Please verify your Account ID and answers again.' });
      }
      if (!rawPhone || !code || typeof rawPhone !== 'string' || typeof code !== 'string') {
        return res.status(400).json({ error: 'Phone number and code are required' });
      }
      const digitsOnly = rawPhone.replace(/\D/g, '');
      if (digitsOnly.length < 7 || digitsOnly.length > 15) {
        return res.status(400).json({ error: 'Please enter a valid phone number with country code.' });
      }
      const phoneNumber = `+${digitsOnly}`;

      const ipKey = getClientIp(req) ?? "unknown-ip";
      const allowed = verifyCodeRateLimit(() => `recover|${ipKey}|${phoneNumber}`, req, res);
      if (!allowed) return;

      const verificationCode = await storage.getVerificationCode(phoneNumber, code);
      if (!verificationCode) {
        return res.status(400).json({ error: 'Invalid verification code' });
      }
      if (new Date() > verificationCode.expiresAt) {
        return res.status(400).json({ error: 'Verification code expired' });
      }
      await storage.markCodeVerified(verificationCode.id);

      const existingOwner = await storage.getUserByPhone(phoneNumber);
      if (existingOwner && existingOwner.id !== userId) {
        return res.status(400).json({ error: 'That phone number is already linked to another account.' });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: 'Account not found' });
      }

      // Relink the account to the new number and bump tokenVersion so any
      // session on the old (possibly lost/compromised) device is invalidated
      // immediately — a recovery event is exactly when old sessions should
      // stop being trusted.
      const newTokenVersion = (user.tokenVersion ?? 0) + 1;
      const updated = await storage.updateUser(userId, {
        phoneNumber,
        tokenVersion: newTokenVersion,
      });
      if (!updated) {
        return res.status(500).json({ error: 'Could not complete recovery' });
      }

      const token = jwt.sign({ userId: updated.id, tv: newTokenVersion, did: deviceId ?? undefined }, JWT_SECRET, { expiresIn: '30d' });

      const ipAddress = getClientIp(req);
      const userAgent = req.headers['user-agent'] || null;
      storage.recordLoginEvent({
        userId: updated.id,
        deviceId: deviceId ?? null,
        deviceName: deviceName ?? null,
        platform: platform ?? null,
        ipAddress,
        userAgent: typeof userAgent === 'string' ? userAgent : null,
        isNewDevice: true,
      }).catch(err => console.error('Failed to record recovery login event:', err));

      res.json({
        success: true,
        token,
        user: {
          id: updated.id,
          phoneNumber: updated.phoneNumber,
          displayName: updated.displayName,
          avatarIndex: updated.avatarIndex,
          avatarUrl: updated.avatarUrl,
          isVip: updated.isVip,
          isAdFree: updated.isAdFree,
          vipStartedAt: updated.vipStartedAt,
          lastNameChangeAt: updated.lastNameChangeAt,
          notificationsEnabled: updated.notificationsEnabled ?? false,
          safeCodeAcknowledged: updated.safeCodeAcknowledged ?? false,
          hasSafeCode: !!updated.safeCodeHash,
          hasSecurityQuestions: !!updated.securityQ1Hash,
        },
      });
    } catch (error) {
      console.error('Error completing account recovery:', error);
      res.status(500).json({ error: 'Could not complete recovery' });
    }
  });

  app.post('/api/auth/safe-code/verify', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { code } = req.body;
      if (!code) return res.status(400).json({ error: 'Code required' });
      const user = await storage.getUser(req.userId!);
      if (!user || !user.safeCodeHash) {
        return res.status(400).json({ error: 'No safe code on file' });
      }
      const valid = verifySafeCode(code, user.safeCodeHash);
      res.json({ valid });
    } catch (error) {
      res.status(500).json({ error: 'Verification failed' });
    }
  });

  // ─── Login events / history ──────────────────────────────────────────────
  app.get('/api/auth/login-events', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const events = await storage.getLoginEvents(req.userId!, 50);
      res.json(events);
    } catch (error) {
      res.status(500).json({ error: 'Could not fetch login history' });
    }
  });

  // Sign-out for THIS device: clears the push token (so the device stops
  // receiving notifications even if the user uninstalls before the OS reaps
  // the token), bumps tokenVersion so the JWT we just used is dead, and
  // force-disconnects this user's sockets. Best-effort: failures here must
  // not block the client-side wipe in AuthContext.logout().
  app.post('/api/auth/logout', authenticateToken, async (req: AuthRequest, res) => {
    try {
      await storage.updateUser(req.userId!, { pushToken: null });
      await storage.bumpTokenVersion(req.userId!, req.deviceId ?? null);
      try {
        if (socketIO) {
          const room = await socketIO.in(req.userId!).fetchSockets();
          for (const s of room) {
            try { s.disconnect(true); } catch {}
          }
        }
      } catch (e) {
        console.error('Failed to disconnect sockets on logout:', e);
      }
      res.json({ success: true });
    } catch (error) {
      console.error('Logout error:', error);
      // Always 200 — the client is going to clear local state regardless,
      // and a 500 here would just trigger a noisy error in the UI for
      // something the user already considers "done".
      res.json({ success: true, warning: 'partial' });
    }
  });

  app.post('/api/auth/logout-all-others', authenticateToken, async (req: AuthRequest, res) => {
    try {
      // Bumping token version invalidates all existing JWTs (including the current one).
      // Caller should immediately re-issue a fresh token using the new version.
      // Pass current deviceId so other devices' login events are demoted from
      // isCurrentSession=true while this device's stays current.
      const newVersion = await storage.bumpTokenVersion(req.userId!, req.deviceId ?? null);
      const newToken = jwt.sign(
        { userId: req.userId, tv: newVersion, did: req.deviceId ?? undefined },
        JWT_SECRET,
        { expiresIn: '30d' }
      );

      // Force-disconnect all currently-connected sockets for this user.
      // The current device will immediately reconnect using the freshly-issued token.
      try {
        if (socketIO) {
          const room = await socketIO.in(req.userId!).fetchSockets();
          for (const s of room) {
            try { s.disconnect(true); } catch {}
          }
        }
      } catch (e) {
        console.error('Failed to disconnect sockets on logout-all-others:', e);
      }

      res.json({ success: true, token: newToken });
    } catch (error) {
      res.status(500).json({ error: 'Logout failed' });
    }
  });

  app.get('/api/auth/me', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const user = await storage.getUser(req.userId!);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      // Build 63 Phase A: look up the joined virtual-number row so the
      // client composer can gate on `status === 'active'` without a
      // second round trip on every chat-screen open.
      const virtualNumberRow = user.virtualNumberId
        ? await storage.getVirtualNumber(user.virtualNumberId)
        : null;

      // Disable conditional caching so the client always sees fresh
      // safeCodeAcknowledged / hasSafeCode flags after mutations. We also
      // override the ETag with a unique per-request value so Express's
      // freshness check can never short-circuit to a 304 with stale flags.
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('ETag', `W/"me-${Date.now()}-${Math.random().toString(36).slice(2)}"`);
      res.json({
        id: user.id,
        phoneNumber: user.phoneNumber,
        displayName: user.displayName,
        avatarIndex: user.avatarIndex,
        avatarUrl: user.avatarUrl,
        isVip: user.isVip,
        isAdFree: user.isAdFree,
        vipStartedAt: user.vipStartedAt,
        lastNameChangeAt: user.lastNameChangeAt,
        notificationsEnabled: user.notificationsEnabled ?? false,
        safeCodeAcknowledged: user.safeCodeAcknowledged ?? false,
        hasSafeCode: !!user.safeCodeHash,
        hasSecurityQuestions: !!user.securityQ1Hash,
        // See the matching flag on /api/auth/verify-code — exempts the
        // Apple reviewer/demo account from the security-questions gates.
        isAppleReviewAccount: isAppleReviewTestNumber(user.phoneNumber),
        // Privacy & messaging preferences (build 59)
        readReceiptsEnabled: user.readReceiptsEnabled ?? true,
        typingIndicatorsEnabled: user.typingIndicatorsEnabled ?? true,
        showNotificationPreview: user.showNotificationPreview ?? true,
        defaultDisappearingTimer: user.defaultDisappearingTimer ?? 0,
        keepMutedChatsArchived: user.keepMutedChatsArchived ?? false,
        username: user.username ?? null,
        lastUsernameChangeAt: user.lastUsernameChangeAt ?? null,
        paymentPaypalMeHandle: user.paymentPaypalMeHandle ?? null,
        paymentPayId: user.paymentPayId ?? null,
        paymentBtcAddress: user.paymentBtcAddress ?? null,
        showActiveStatus: user.showActiveStatus ?? true,
        // Stories preferences
        storiesEnabled: user.storiesEnabled ?? true,
        storyPrivacyMode: user.storyPrivacyMode ?? 'everyone',
        storyPrivacyExceptIds: user.storyPrivacyExceptIds ?? [],
        storyPrivacyOnlyIds: user.storyPrivacyOnlyIds ?? [],
        storyViewReceiptsEnabled: user.storyViewReceiptsEnabled ?? true,
        // Account deletion (build 62)
        pendingDeletionAt: user.pendingDeletionAt,
        deletionInitiatedAt: user.deletionInitiatedAt,
        // Sealed sender capability flag (build 63, Phase 3).
        // The sender uses this to decide whether to call /send-sealed
        // (recipient supports it) or fall back to legacy /messages
        // (recipient is on an older build).
        supportsSealedSender: user.supportsSealedSender ?? true,
        virtualNumberId: user.virtualNumberId ?? null,
        preferredNumberType: user.preferredNumberType ?? 'personal',
        // Last-seen privacy: without this field the client privacy screen
        // resets to "everyone" every time it re-mounts (TestFlight bug).
        lastSeenPrivacy: user.lastSeenPrivacy ?? 'everyone',
        // Phase A (build 63 client completion): the client composer needs
        // the VN row's status to disable sending when the number is
        // released or suspended. Returning the joined row keeps the
        // composer self-sufficient — no extra round trip per chat open.
        virtualNumber: virtualNumberRow
          ? {
              id: virtualNumberRow.id,
              phoneNumber: virtualNumberRow.phoneNumber,
              status: virtualNumberRow.status,
              countryCode: virtualNumberRow.countryCode,
            }
          : null,
      });
    } catch (error) {
      console.error('Error getting user:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.put('/api/auth/profile', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { displayName, avatarIndex } = req.body;
      
      const oldUser = await storage.getUser(req.userId!);
      if (!oldUser) {
        return res.status(404).json({ error: 'User not found' });
      }

      const isNameChanging = displayName && oldUser.displayName && displayName !== oldUser.displayName;
      
      if (isNameChanging && oldUser.lastNameChangeAt) {
        const lastChange = new Date(oldUser.lastNameChangeAt);
        const daysSinceChange = (Date.now() - lastChange.getTime()) / (1000 * 60 * 60 * 24);
        
        if (daysSinceChange < 30) {
          const daysRemaining = Math.ceil(30 - daysSinceChange);
          return res.status(400).json({ 
            error: `You can change your name again in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}`,
            daysRemaining,
            nextChangeDate: new Date(lastChange.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          });
        }
      }

      const updateData: any = { avatarIndex };
      if (displayName !== undefined) {
        updateData.displayName = displayName;
        if (isNameChanging || (!oldUser.displayName && displayName)) {
          updateData.lastNameChangeAt = new Date();
        }
      }

      const user = await storage.updateUser(req.userId!, updateData);
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      if (displayName && !oldUser.displayName && user.phoneNumber) {
        storage.processNewUserJoined(user.phoneNumber, displayName).catch(err => {
          console.error('Error processing join notifications after profile setup:', err);
        });
      }

      res.json({
        id: user.id,
        phoneNumber: user.phoneNumber,
        displayName: user.displayName,
        avatarIndex: user.avatarIndex,
        avatarUrl: user.avatarUrl,
        isVip: user.isVip,
        isAdFree: user.isAdFree,
        lastNameChangeAt: user.lastNameChangeAt,
      });
    } catch (error) {
      console.error('Error updating profile:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Username availability check (used for live validation while typing).
  app.get('/api/users/username-available', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const raw = String(req.query.username || '').trim().toLowerCase();
      if (!USERNAME_REGEX.test(raw)) {
        return res.json({ available: false, reason: 'invalid' });
      }
      const existing = await storage.getUserByUsername(raw);
      const available = !existing || existing.id === req.userId;
      res.json({ available, reason: available ? null : 'taken' });
    } catch (error) {
      console.error('Error checking username availability:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.patch('/api/users/me/username', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const raw = String(req.body?.username || '').trim().toLowerCase();
      if (!USERNAME_REGEX.test(raw)) {
        return res.status(400).json({
          error: 'Username must be 3-20 characters, start with a letter, and use only lowercase letters, numbers, and underscores.',
        });
      }

      const oldUser = await storage.getUser(req.userId!);
      if (!oldUser) return res.status(404).json({ error: 'User not found' });

      if (oldUser.username === raw) {
        return res.json({ username: oldUser.username, lastUsernameChangeAt: oldUser.lastUsernameChangeAt });
      }

      if (oldUser.username && oldUser.lastUsernameChangeAt) {
        const lastChange = new Date(oldUser.lastUsernameChangeAt);
        const daysSinceChange = (Date.now() - lastChange.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceChange < USERNAME_CHANGE_COOLDOWN_DAYS) {
          const daysRemaining = Math.ceil(USERNAME_CHANGE_COOLDOWN_DAYS - daysSinceChange);
          return res.status(400).json({
            error: `You can change your username again in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}`,
            daysRemaining,
            nextChangeDate: new Date(lastChange.getTime() + USERNAME_CHANGE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000).toISOString(),
          });
        }
      }

      const existing = await storage.getUserByUsername(raw);
      if (existing && existing.id !== req.userId) {
        return res.status(409).json({ error: 'That username is already taken.' });
      }

      const updated = await storage.updateUser(req.userId!, { username: raw, lastUsernameChangeAt: new Date() });
      if (!updated) return res.status(404).json({ error: 'User not found' });
      res.json({ username: updated.username, lastUsernameChangeAt: updated.lastUsernameChangeAt });
    } catch (error: any) {
      // Unique-index race: two concurrent requests both pass the pre-check.
      if (error?.code === '23505') {
        return res.status(409).json({ error: 'That username is already taken.' });
      }
      console.error('Error updating username:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ─── Change Phone Number (build 133) ───────────────────────────────────
  // The account's real identity is its phone number, so this is a real SMS
  // OTP proof of ownership of the NEW number — same rate limiting and
  // verification-code machinery as sign-in — gated behind the caller
  // already being authenticated as the account being changed.
  app.post('/api/auth/change-phone/send-code', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { newPhoneNumber: rawPhone } = req.body ?? {};
      if (!rawPhone || typeof rawPhone !== 'string') {
        return res.status(400).json({ error: 'Please enter a phone number.' });
      }
      const digitsOnly = rawPhone.replace(/\D/g, '');
      if (digitsOnly.length < 7 || digitsOnly.length > 15) {
        return res.status(400).json({ error: 'Please enter a valid phone number with country code.' });
      }
      const newPhoneNumber = `+${digitsOnly}`;

      const currentUser = await storage.getUser(req.userId!);
      if (!currentUser) return res.status(404).json({ error: 'User not found' });
      if (newPhoneNumber === currentUser.phoneNumber) {
        return res.status(400).json({ error: 'That\'s already your current phone number.' });
      }

      const existing = await storage.getUserByPhone(newPhoneNumber);
      if (existing) {
        return res.status(409).json({ error: 'That phone number is already registered to another account.' });
      }

      const ipKey = getClientIp(req) ?? "unknown-ip";
      const allowed = sendCodeRateLimit(() => `change-phone|${ipKey}|${req.userId}|${newPhoneNumber}`, req, res);
      if (!allowed) return;

      const code = generateVerificationCode();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      await storage.createVerificationCode(newPhoneNumber, code, expiresAt);

      if (isTwilioConfigured()) {
        const result = await sendVerificationSMS(newPhoneNumber, code);
        if (!result.success) {
          return res.status(400).json({ error: result.userMessage || 'Failed to send verification code' });
        }
      } else {
        console.log(`[CHANGE PHONE] Code for ${newPhoneNumber}: ${code}`);
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Error sending change-phone code:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/auth/change-phone/verify', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { newPhoneNumber: rawPhone, code } = req.body ?? {};
      if (!rawPhone || !code || typeof rawPhone !== 'string' || typeof code !== 'string') {
        return res.status(400).json({ error: 'Phone number and code are required' });
      }
      const digitsOnly = rawPhone.replace(/\D/g, '');
      const newPhoneNumber = `+${digitsOnly}`;

      const ipKey = getClientIp(req) ?? "unknown-ip";
      const allowed = verifyCodeRateLimit(() => `change-phone|${ipKey}|${req.userId}|${newPhoneNumber}`, req, res);
      if (!allowed) return;

      const vc = await storage.getVerificationCode(newPhoneNumber, code);
      if (!vc || new Date(vc.expiresAt).getTime() < Date.now()) {
        return res.status(400).json({ error: 'Invalid or expired verification code' });
      }

      // Re-check uniqueness right before committing — closes the race where
      // someone else claimed the number between send-code and now.
      const existing = await storage.getUserByPhone(newPhoneNumber);
      if (existing) {
        return res.status(409).json({ error: 'That phone number is already registered to another account.' });
      }

      const oldUser = await storage.getUser(req.userId!);
      if (!oldUser) return res.status(404).json({ error: 'User not found' });

      await storage.markCodeVerified(vc.id);
      const updated = await storage.updateUser(req.userId!, { phoneNumber: newPhoneNumber });
      if (!updated) return res.status(404).json({ error: 'User not found' });

      // Best-effort security notice to the number being replaced — never
      // blocks the change itself on SMS delivery.
      if (isTwilioConfigured() && oldUser.phoneNumber && !oldUser.phoneNumber.startsWith('deleted:')) {
        sendPhoneChangeNoticeSMS(oldUser.phoneNumber).catch((e) => {
          console.error('Error sending phone-change notice:', e);
        });
      }

      res.json({ success: true, phoneNumber: updated.phoneNumber });
    } catch (error) {
      console.error('Error verifying change-phone code:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ─── Account Data Export (build 133) ───────────────────────────────────
  // Right-to-access style export of everything the server holds about the
  // caller. Deliberately excludes message CONTENT — Pryvo's messages are
  // end-to-end encrypted so the server never has plaintext to hand back
  // anyway, and the raw ciphertext blobs are useless without the client-
  // held keys (and would drag other people's messages into one person's
  // export). The client encrypts this payload with a passphrase only the
  // user has before saving it to disk — see ExportDataScreen.
  app.get('/api/account/export-data', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const user = await storage.getUser(req.userId!);
      if (!user) return res.status(404).json({ error: 'User not found' });

      const [personalConvos, appConvos, friendsList, blocked] = await Promise.all([
        storage.getConversations(req.userId!, 'personal'),
        storage.getConversations(req.userId!, 'app'),
        storage.getFriends(req.userId!),
        storage.getBlockedUsers(req.userId!),
      ]);

      const virtualNumber = user.virtualNumberId ? await storage.getVirtualNumber(user.virtualNumberId) : null;

      const conversationSummaries = [...personalConvos, ...appConvos].map((c: any) => ({
        withDisplayName: c.otherUser?.displayName ?? null,
        withPhoneNumber: c.otherUser?.phoneNumber ?? null,
        numberType: c.numberType,
        lastMessageAt: c.lastMessageAt,
        createdAt: c.createdAt,
        folder: c.folder,
        isArchived: c.isArchived,
        isMuted: c.isMuted,
        isLocked: c.isLocked,
        note: 'Message content is end-to-end encrypted and is not included — Pryvo\'s servers cannot read it.',
      }));

      const exportPayload = {
        exportedAt: new Date().toISOString(),
        profile: {
          id: user.id,
          phoneNumber: user.phoneNumber,
          displayName: user.displayName,
          username: user.username,
          avatarUrl: user.avatarUrl,
          isVip: !!user.isVip,
          vipStartedAt: user.vipStartedAt,
          isAdFree: !!user.isAdFree,
        },
        settings: {
          readReceiptsEnabled: user.readReceiptsEnabled ?? true,
          typingIndicatorsEnabled: user.typingIndicatorsEnabled ?? true,
          showNotificationPreview: user.showNotificationPreview ?? true,
          defaultDisappearingTimer: user.defaultDisappearingTimer ?? 0,
          keepMutedChatsArchived: !!user.keepMutedChatsArchived,
          lastSeenPrivacy: user.lastSeenPrivacy ?? 'everyone',
          notificationsEnabled: !!user.notificationsEnabled,
          preferredNumberType: user.preferredNumberType ?? 'personal',
          storiesEnabled: user.storiesEnabled ?? true,
          storyPrivacyMode: user.storyPrivacyMode ?? 'everyone',
        },
        security: {
          hasSafeCode: !!user.safeCodeHash,
          hasSecurityQuestions: !!user.securityQ1Hash,
          appleSignInLinked: !!user.appleUserId,
          googleSignInLinked: !!user.googleUserId,
        },
        virtualNumber: virtualNumber ? {
          phoneNumber: virtualNumber.phoneNumber,
          status: virtualNumber.status,
          countryCode: virtualNumber.countryCode,
        } : null,
        friends: friendsList.map((f: any) => ({ displayName: f.displayName })),
        blockedContacts: blocked.map((b: any) => ({ displayName: b.displayName })),
        conversations: conversationSummaries,
      };

      res.json(exportPayload);
    } catch (error) {
      console.error('Error building account data export:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ─── Payment link-out (build 133) ───────────────────────────────────────
  // Receive-only identifiers the user shares with chat partners — Pryvo
  // never touches money, holds custody, or records transactions. Sending
  // happens entirely in the external provider's own app/site.
  app.patch('/api/users/me/payment-methods', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { paypalMeHandle, payId, btcAddress } = req.body ?? {};
      const update: Record<string, string | null> = {};

      if (paypalMeHandle !== undefined) {
        const trimmed = String(paypalMeHandle ?? '').trim();
        if (trimmed && !/^[a-zA-Z0-9_-]{1,50}$/.test(trimmed)) {
          return res.status(400).json({ error: 'Invalid PayPal.me handle.' });
        }
        update.paymentPaypalMeHandle = trimmed || null;
      }
      if (payId !== undefined) {
        const trimmed = String(payId ?? '').trim();
        if (trimmed.length > 100) {
          return res.status(400).json({ error: 'PayID is too long.' });
        }
        update.paymentPayId = trimmed || null;
      }
      if (btcAddress !== undefined) {
        const trimmed = String(btcAddress ?? '').trim();
        if (trimmed && !/^[a-zA-Z0-9]{20,90}$/.test(trimmed)) {
          return res.status(400).json({ error: 'That doesn\'t look like a valid Bitcoin address.' });
        }
        update.paymentBtcAddress = trimmed || null;
      }

      if (Object.keys(update).length === 0) {
        return res.status(400).json({ error: 'No payment method fields provided.' });
      }

      const updated = await storage.updateUser(req.userId!, update as any);
      if (!updated) return res.status(404).json({ error: 'User not found' });

      res.json({
        paymentPaypalMeHandle: updated.paymentPaypalMeHandle,
        paymentPayId: updated.paymentPayId,
        paymentBtcAddress: updated.paymentBtcAddress,
      });
    } catch (error) {
      console.error('Error updating payment methods:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ─── Payment balance (self-reported ledger, build 133) ───────────────────
  // Pryvo never touches the actual money — every transfer happens entirely
  // in PayPal/the banking app/the wallet app via the link-out above. These
  // routes just let a user record that a transfer happened, so a running
  // balance can be shown. It is what users tell us happened, not something
  // Pryvo can verify or a store of real funds.
  const PAYMENT_METHODS = new Set(['paypal', 'payid', 'btc', 'other']);
  const PAYMENT_DIRECTIONS = new Set(['sent', 'received']);
  // Minor-unit denominator per currency (cents for fiat, satoshis for BTC).
  const PAYMENT_CURRENCY_DECIMALS: Record<string, number> = { AUD: 2, USD: 2, GBP: 2, EUR: 2, NZD: 2, CAD: 2, BTC: 8 };

  app.post('/api/payments/transactions', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { counterpartyId, direction, method, amount, currency, note } = req.body ?? {};

      if (!counterpartyId || typeof counterpartyId !== 'string') {
        return res.status(400).json({ error: 'A contact is required.' });
      }
      if (counterpartyId === req.userId) {
        return res.status(400).json({ error: "You can't log a payment with yourself." });
      }
      const counterparty = await storage.getUser(counterpartyId);
      if (!counterparty) {
        return res.status(404).json({ error: 'That contact could not be found.' });
      }
      if (typeof direction !== 'string' || !PAYMENT_DIRECTIONS.has(direction)) {
        return res.status(400).json({ error: 'Direction must be "sent" or "received".' });
      }
      if (typeof method !== 'string' || !PAYMENT_METHODS.has(method)) {
        return res.status(400).json({ error: 'Invalid payment method.' });
      }
      const currencyCode = typeof currency === 'string' ? currency.trim().toUpperCase() : '';
      const decimals = PAYMENT_CURRENCY_DECIMALS[currencyCode];
      if (decimals === undefined) {
        return res.status(400).json({ error: 'Unsupported currency.' });
      }
      const amountNum = typeof amount === 'number' ? amount : parseFloat(amount);
      if (!Number.isFinite(amountNum) || amountNum <= 0) {
        return res.status(400).json({ error: 'Enter a valid amount greater than zero.' });
      }
      const amountMinorUnits = Math.round(amountNum * Math.pow(10, decimals));
      if (typeof note === 'string' && note.length > 200) {
        return res.status(400).json({ error: 'Note is too long.' });
      }

      const tx = await storage.createPaymentTransaction(req.userId!, {
        counterpartyId,
        direction,
        method,
        amountMinorUnits,
        currency: currencyCode,
        note: typeof note === 'string' ? note.trim() || null : null,
      });
      res.json(tx);
    } catch (error) {
      console.error('Error logging payment transaction:', error);
      res.status(500).json({ error: 'Could not log this payment.' });
    }
  });

  app.get('/api/payments/transactions', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const counterpartyId = typeof req.query.counterpartyId === 'string' ? req.query.counterpartyId : undefined;
      const rows = await storage.getPaymentTransactions(req.userId!, counterpartyId);
      res.json(rows);
    } catch (error) {
      console.error('Error fetching payment transactions:', error);
      res.status(500).json({ error: 'Could not load payment history.' });
    }
  });

  app.get('/api/payments/balance', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const balance = await storage.getPaymentBalance(req.userId!);
      res.json(balance);
    } catch (error) {
      console.error('Error fetching payment balance:', error);
      res.status(500).json({ error: 'Could not load your balance.' });
    }
  });

  app.post("/api/keys", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { publicKey } = req.body;
      if (!publicKey) {
        return res.status(400).json({ error: "publicKey required" });
      }

      await storage.updateUser(req.userId!, { publicKey });

      res.json({ ok: true });
    } catch (error) {
      console.error('Error saving public key:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get("/api/keys/:userId", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const user = await storage.getUser(req.params.userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json({ publicKey: user.publicKey || null });
    } catch (error) {
      console.error('Error fetching public key:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ─── E2EE Signal Protocol endpoints ───────────────────────────────────────

  app.post("/api/e2ee/devices/register", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { deviceId, identityPublicKey, signingPublicKey } = req.body;
      if (!deviceId || !identityPublicKey || !signingPublicKey) {
        return res.status(400).json({ error: "deviceId, identityPublicKey, signingPublicKey required" });
      }
      const device = await storage.registerDevice(req.userId!, deviceId, identityPublicKey, signingPublicKey);
      res.json({ ok: true, deviceId: device.deviceId });
    } catch (error) {
      res.status(500).json({ error: "Failed to register device" });
    }
  });

  app.post("/api/e2ee/prekeys/signed", authenticateToken, signedPrekeyRateLimit, async (req: AuthRequest, res) => {
    try {
      const { keyId, publicKey, signature } = req.body;
      if (!keyId || !publicKey || !signature) {
        return res.status(400).json({ error: "keyId, publicKey, signature required" });
      }
      await storage.upsertSignedPrekey(req.userId!, keyId, publicKey, signature);
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to upload signed prekey" });
    }
  });

  app.post("/api/e2ee/prekeys/onetime", authenticateToken, oneTimePrekeyRateLimit, async (req: AuthRequest, res) => {
    try {
      const { keys } = req.body;
      if (!Array.isArray(keys) || keys.length === 0) {
        return res.status(400).json({ error: "keys array required" });
      }
      const sanitised = keys
        .filter((k: any) => typeof k.id === "string" && typeof k.publicKey === "string")
        .map((k: any) => ({ keyId: k.id, publicKey: k.publicKey }));
      if (sanitised.length === 0) {
        return res.status(400).json({ error: "No valid keys provided" });
      }
      await storage.addOneTimePrekeys(req.userId!, sanitised);
      res.json({ ok: true, count: sanitised.length });
    } catch (error) {
      res.status(500).json({ error: "Failed to upload one-time prekeys" });
    }
  });

  // Side-effect-free identity-key lookup. Unlike the prekey bundle route
  // below, this does NOT consume a one-time prekey — safe to call on a
  // hot path (e.g. every location-sharing tick) without burning through a
  // recipient's OTPK supply. Long-term identity keys change rarely, so
  // callers are expected to cache the result client-side.
  app.get("/api/e2ee/identity-key/:userId", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const device = await storage.getDeviceForUser(req.params.userId);
      if (!device) return res.status(404).json({ error: "no_keys" });
      res.json({ identityPublicKey: device.identityPublicKey, signingPublicKey: device.signingPublicKey });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch identity key" });
    }
  });

  app.get("/api/e2ee/prekeys/bundle/:userId", authenticateToken, prekeyBundleRateLimit, async (req: AuthRequest, res) => {
    try {
      const targetUserId = req.params.userId;
      if (targetUserId === req.userId) {
        return res.status(400).json({ error: "Cannot fetch your own bundle" });
      }
      const bundle = await storage.getPreKeyBundle(targetUserId);
      if (!bundle) {
        return res.status(404).json({ error: "no_keys" });
      }
      res.json(bundle);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch prekey bundle" });
    }
  });

  app.get("/api/e2ee/prekeys/count", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const count = await storage.countUnusedOneTimePrekeys(req.userId!);
      res.json({ count });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch prekey count" });
    }
  });

  // ─── E2EE: Device management ────────────────────────────────────────────

  app.get("/api/e2ee/devices", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const devices = await storage.listDevices(req.userId!);
      res.json(devices);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch devices" });
    }
  });

  app.delete("/api/e2ee/devices/:deviceId", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { deviceId } = req.params;
      const revoked = await storage.revokeDevice(req.userId!, deviceId);
      if (!revoked) return res.status(404).json({ error: "Device not found" });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to revoke device" });
    }
  });

  // ─── E2EE: Encrypted backups ─────────────────────────────────────────────

  app.post("/api/e2ee/backup", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { deviceId, encryptedBlob, salt, nonce } = req.body;
      if (!deviceId || !encryptedBlob || !salt || !nonce) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      await storage.upsertBackup(req.userId!, deviceId, encryptedBlob, salt, nonce);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to save backup" });
    }
  });

  app.get("/api/e2ee/backup", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const backup = await storage.getBackup(req.userId!);
      if (!backup) return res.status(404).json({ error: "No backup found" });
      res.json(backup);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch backup" });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────

  // ─── Account deletion (build 62) ───────────────────────────────────────
  //
  // Two-phase delete with 30-day grace + tombstone:
  //   1. POST /api/auth/account/delete/request-otp → sends OTP to user's
  //      registered phone via existing Twilio flow.
  //   2. POST /api/auth/account/delete/confirm { otp } → verifies OTP,
  //      sets pendingDeletionAt = now + 30d, bumps tokenVersion (forces
  //      sign-out on all devices), returns { scheduledFor }.
  //   3. POST /api/auth/account/delete/cancel { otp } → verifies OTP,
  //      clears pendingDeletionAt, bumps tokenVersion.
  //   4. Server sweep (every 6h) calls storage.executeHardDelete on rows
  //      whose pendingDeletionAt has passed. See bottom of registerRoutes.
  //
  // Client-side adds a biometric prompt (expo-local-authentication) BEFORE
  // calling these endpoints where available, with OTP-only fallback.
  //
  // The legacy DELETE /api/auth/account is preserved as a 410 GONE so old
  // build-61 clients show a clear "update your app" error instead of a
  // silent immediate deletion (the previous behavior).

  app.delete("/api/auth/account", authenticateToken, async (req: AuthRequest, res) => {
    res.status(410).json({
      error: 'This endpoint has been replaced. Update Pryvo to delete your account.',
      replacedBy: '/api/auth/account/delete/request-otp',
    });
  });

  app.post("/api/auth/account/delete/request-otp", authenticateToken, deleteAccountOtpRateLimit, async (req: AuthRequest, res) => {
    try {
      const user = await storage.getUser(req.userId!);
      if (!user) return res.status(404).json({ error: 'User not found' });

      // Apple reviewer / demo account: same bypass as /api/auth/send-code.
      // The reserved NANP fictional numbers (+1 555-123-4567 / 555-000-0000)
      // can never receive a real SMS — Twilio correctly rejects them as
      // invalid destinations — so without this a reviewer tapping Delete
      // Account on the demo account (or anyone testing it) always got a
      // confusing "please enter a valid phone number" error instead of the
      // account-deletion confirmation flow actually working.
      if (isAppleReviewTestNumber(user.phoneNumber)) {
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
        await storage.createVerificationCode(user.phoneNumber, APPLE_DEMO_CODE, expiresAt);
        console.log(`[APPLE REVIEW] Delete-account demo code ready for: ${user.phoneNumber}`);
        return res.json({ success: true });
      }

      const code = generateVerificationCode();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      await storage.createVerificationCode(user.phoneNumber, code, expiresAt);

      const twilioConfigured = (process.env.TWILIO_ACCOUNT_SID || process.env.Twilio_Account_SID) &&
                               (process.env.TWILIO_AUTH_TOKEN || process.env.Twilio_Auth_Token) &&
                               (process.env.TWILIO_PHONE_NUMBER || process.env.Twilio_Phone_Number);
      if (twilioConfigured) {
        const result = await sendVerificationSMS(user.phoneNumber, code);
        if (!result.success) {
          return res.status(400).json({ error: result.userMessage || 'Failed to send verification code' });
        }
      } else {
        console.log(`[DEV MODE] Delete-account OTP for ${user.phoneNumber}: ${code}`);
      }

      res.json({ success: true });
    } catch (error) {
      console.error('[delete-account] request-otp error:', error);
      res.status(500).json({ error: 'Failed to send verification code' });
    }
  });

  app.post("/api/auth/account/delete/confirm", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { otp } = req.body ?? {};
      if (!otp || typeof otp !== 'string') {
        return res.status(400).json({ error: 'Verification code required' });
      }
      const user = await storage.getUser(req.userId!);
      if (!user) return res.status(404).json({ error: 'User not found' });

      const vc = await storage.getVerificationCode(user.phoneNumber, otp);
      if (!vc || new Date(vc.expiresAt).getTime() < Date.now()) {
        return res.status(400).json({ error: 'Invalid or expired verification code' });
      }
      await storage.markCodeVerified(vc.id);

      const { scheduledFor } = await storage.requestAccountDeletion(req.userId!);
      console.log(`[ACCOUNT DELETION SCHEDULED] User ${req.userId} (${user.phoneNumber}) — executes at ${scheduledFor.toISOString()}`);

      // Disconnect this user's live sockets so the pending-deletion state
      // is reflected on every device immediately.
      const ioRef = getIO();
      if (ioRef) {
        const sockets = connectedUsers.get(req.userId!);
        if (sockets) {
          for (const sid of sockets) {
            ioRef.to(sid).emit('account-pending-deletion', { scheduledFor });
            ioRef.to(sid).disconnectSockets(true);
          }
        }
      }

      res.json({ success: true, scheduledFor });
    } catch (error) {
      console.error('[delete-account] confirm error:', error);
      res.status(500).json({ error: 'Failed to schedule account deletion' });
    }
  });

  app.post("/api/auth/account/delete/cancel", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { otp } = req.body ?? {};
      if (!otp || typeof otp !== 'string') {
        return res.status(400).json({ error: 'Verification code required' });
      }
      const user = await storage.getUser(req.userId!);
      if (!user) return res.status(404).json({ error: 'User not found' });
      if (!user.pendingDeletionAt) {
        return res.status(400).json({ error: 'No pending deletion to cancel' });
      }

      const vc = await storage.getVerificationCode(user.phoneNumber, otp);
      if (!vc || new Date(vc.expiresAt).getTime() < Date.now()) {
        return res.status(400).json({ error: 'Invalid or expired verification code' });
      }
      await storage.markCodeVerified(vc.id);

      await storage.cancelAccountDeletion(req.userId!);
      console.log(`[ACCOUNT DELETION CANCELLED] User ${req.userId} (${user.phoneNumber})`);
      res.json({ success: true });
    } catch (error) {
      console.error('[delete-account] cancel error:', error);
      res.status(500).json({ error: 'Failed to cancel account deletion' });
    }
  });

  app.post("/api/push-token", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { pushToken } = req.body;
      const tokenValue = pushToken || null;

      await storage.updateUser(req.userId!, { pushToken: tokenValue });
      console.log(`Push token ${tokenValue ? 'registered' : 'cleared'} for user ${req.userId}`);

      res.json({ ok: true });
    } catch (error) {
      console.error('Error saving push token:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // PushKit VoIP token — separate from the regular Expo pushToken above.
  // Only ever consumed by sendVoipCallPush (real CallKit ringing); a
  // missing/cleared token here just means that recipient falls back to
  // the regular push notification for incoming calls.
  app.post("/api/push-token/voip", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { voipPushToken } = req.body;
      const tokenValue = voipPushToken || null;

      await storage.updateUser(req.userId!, { voipPushToken: tokenValue });
      console.log(`VoIP push token ${tokenValue ? 'registered' : 'cleared'} for user ${req.userId}`);

      res.json({ ok: true });
    } catch (error) {
      console.error('Error saving VoIP push token:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.put("/api/notifications/settings", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { enabled } = req.body;
      
      await storage.updateUser(req.userId!, { notificationsEnabled: enabled });

      res.json({ ok: true, notificationsEnabled: enabled });
    } catch (error) {
      console.error('Error updating notification settings:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Owner-only endpoint to view all registered users
  // Server-side verification ensures only the owner can access this data
  // Owner phone MUST be set in environment variable (full E.164 format without +)
  const OWNER_PHONE_FULL = process.env.OWNER_PHONE_NUMBER;
  
  if (!OWNER_PHONE_FULL) {
    console.warn('[SECURITY] OWNER_PHONE_NUMBER environment variable not set - admin endpoints disabled');
  }
  
  // Helper function to verify if a user is the owner (server-side only)
  // Uses strict exact match - no suffix matching for security
  const isOwnerPhone = (phoneNumber: string): boolean => {
    // Fail closed if owner phone not configured
    if (!OWNER_PHONE_FULL) {
      return false;
    }
    
    const digitsOnly = phoneNumber.replace(/\D/g, '');
    const ownerDigits = OWNER_PHONE_FULL.replace(/\D/g, '');
    
    // Strict exact match only - no suffix matching
    return digitsOnly === ownerDigits;
  };

  // ─── Owner emergency account reset ────────────────────────────────────
  // Last-resort recovery for the ONE number that already bypasses the
  // normal owner-gated admin routes: if the owner forgets a security-
  // question answer, they can't log in (fresh sessions require it) AND
  // can't use /recover/verify (which itself requires both answers). This
  // path proves identity with SMS possession alone and immediately
  // hard-deletes the account (skipping the normal 30-day grace period) so
  // the number is free to sign up again right away. Deliberately NOT
  // exposed for any other phone number — regular users keep the stronger
  // Account-ID + two-answers recovery flow, since SMS-only account
  // destruction would otherwise be a real downgrade in account security.
  app.post('/api/auth/account/emergency-reset/request-otp', async (req, res) => {
    try {
      const { phoneNumber: rawPhone } = req.body;
      if (!rawPhone || typeof rawPhone !== 'string') {
        return res.status(400).json({ error: 'Please enter your phone number.' });
      }
      const digitsOnly = rawPhone.replace(/\D/g, '');
      if (digitsOnly.length < 7 || digitsOnly.length > 15) {
        return res.status(400).json({ error: 'Please enter a valid phone number with country code.' });
      }
      const phoneNumber = `+${digitsOnly}`;

      if (!isOwnerPhone(phoneNumber)) {
        return res.status(403).json({ error: 'This reset path is not available for this number.' });
      }

      const ipKey = getClientIp(req) ?? "unknown-ip";
      const allowed = emergencyResetRateLimit(() => `${ipKey}|${phoneNumber}`, req, res);
      if (!allowed) return;

      const user = await storage.getUserByPhone(phoneNumber);
      if (!user) {
        // Nothing to reset. Respond success anyway so this can't be used
        // to probe whether a number has an account.
        return res.json({ success: true });
      }

      const code = generateVerificationCode();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      await storage.createVerificationCode(phoneNumber, code, expiresAt);

      const twilioConfigured = (process.env.TWILIO_ACCOUNT_SID || process.env.Twilio_Account_SID) &&
                               (process.env.TWILIO_AUTH_TOKEN || process.env.Twilio_Auth_Token) &&
                               (process.env.TWILIO_PHONE_NUMBER || process.env.Twilio_Phone_Number);
      if (twilioConfigured) {
        const result = await sendVerificationSMS(phoneNumber, code);
        if (!result.success) {
          return res.status(400).json({ error: result.userMessage || 'Failed to send verification code' });
        }
      } else {
        console.log(`[EMERGENCY RESET] Code for ${phoneNumber}: ${code}`);
      }

      res.json({ success: true });
    } catch (error) {
      console.error('[emergency-reset] request-otp error:', error);
      res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  });

  app.post('/api/auth/account/emergency-reset/confirm', async (req, res) => {
    try {
      const { phoneNumber: rawPhone, code } = req.body;
      if (!rawPhone || !code || typeof rawPhone !== 'string' || typeof code !== 'string') {
        return res.status(400).json({ error: 'Phone number and code are required' });
      }
      const digitsOnly = rawPhone.replace(/\D/g, '');
      if (digitsOnly.length < 7 || digitsOnly.length > 15) {
        return res.status(400).json({ error: 'Please enter a valid phone number with country code.' });
      }
      const phoneNumber = `+${digitsOnly}`;

      if (!isOwnerPhone(phoneNumber)) {
        return res.status(403).json({ error: 'This reset path is not available for this number.' });
      }

      const ipKey = getClientIp(req) ?? "unknown-ip";
      const allowed = verifyCodeRateLimit(() => `emergency-reset|${ipKey}|${phoneNumber}`, req, res);
      if (!allowed) return;

      const vc = await storage.getVerificationCode(phoneNumber, code);
      if (!vc || new Date(vc.expiresAt).getTime() < Date.now()) {
        return res.status(400).json({ error: 'Invalid or expired verification code' });
      }
      await storage.markCodeVerified(vc.id);

      const user = await storage.getUserByPhone(phoneNumber);
      if (!user) {
        return res.json({ success: true }); // already gone / never existed
      }

      console.log(`[EMERGENCY RESET] Immediate account deletion for ${phoneNumber} (user ${user.id})`);
      await storage.emergencyDeleteAccount(user.id);

      res.json({ success: true });
    } catch (error) {
      console.error('[emergency-reset] confirm error:', error);
      res.status(500).json({ error: 'Failed to reset account' });
    }
  });

  // ─── Admin login (web sign-in "Admin" shortcut) ───────────────────────
  // Same phone+SMS-OTP proof as normal sign-in, but gated to the owner
  // number BEFORE a code is ever sent (normal /api/auth/send-code has no
  // such gate — it'll happily text and auto-create an account for any
  // number). Issues a short-lived token scoped to a single admin-dashboard
  // visit; deliberately never touches the normal login session — the web
  // client keeps this token local to the admin screens only.
  app.post('/api/auth/admin-login/send-code', async (req, res) => {
    try {
      const { phoneNumber: rawPhone } = req.body;
      if (!rawPhone || typeof rawPhone !== 'string') {
        return res.status(400).json({ error: 'Please enter your phone number.' });
      }
      const digitsOnly = rawPhone.replace(/\D/g, '');
      if (digitsOnly.length < 7 || digitsOnly.length > 15) {
        return res.status(400).json({ error: 'Please enter a valid phone number with country code.' });
      }
      const phoneNumber = `+${digitsOnly}`;

      if (!isOwnerPhone(phoneNumber)) {
        return res.status(403).json({ error: 'This sign-in is for the app owner only.' });
      }

      const ipKey = getClientIp(req) ?? "unknown-ip";
      const allowed = sendCodeRateLimit(() => `admin-login|${ipKey}|${phoneNumber}`, req, res);
      if (!allowed) return;

      const code = generateVerificationCode();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      await storage.createVerificationCode(phoneNumber, code, expiresAt);

      const twilioConfigured = (process.env.TWILIO_ACCOUNT_SID || process.env.Twilio_Account_SID) &&
                               (process.env.TWILIO_AUTH_TOKEN || process.env.Twilio_Auth_Token) &&
                               (process.env.TWILIO_PHONE_NUMBER || process.env.Twilio_Phone_Number);
      if (twilioConfigured) {
        const result = await sendVerificationSMS(phoneNumber, code);
        if (!result.success) {
          return res.status(400).json({ error: result.userMessage || 'Failed to send verification code' });
        }
      } else {
        console.log(`[ADMIN LOGIN] Code for ${phoneNumber}: ${code}`);
      }

      res.json({ success: true });
    } catch (error) {
      console.error('[admin-login] send-code error:', error);
      res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  });

  app.post('/api/auth/admin-login/verify', async (req, res) => {
    try {
      const { phoneNumber: rawPhone, code } = req.body;
      if (!rawPhone || !code || typeof rawPhone !== 'string' || typeof code !== 'string') {
        return res.status(400).json({ error: 'Phone number and code are required' });
      }
      const digitsOnly = rawPhone.replace(/\D/g, '');
      if (digitsOnly.length < 7 || digitsOnly.length > 15) {
        return res.status(400).json({ error: 'Please enter a valid phone number with country code.' });
      }
      const phoneNumber = `+${digitsOnly}`;

      if (!isOwnerPhone(phoneNumber)) {
        return res.status(403).json({ error: 'This sign-in is for the app owner only.' });
      }

      const ipKey = getClientIp(req) ?? "unknown-ip";
      const allowed = verifyCodeRateLimit(() => `admin-login|${ipKey}|${phoneNumber}`, req, res);
      if (!allowed) return;

      const vc = await storage.getVerificationCode(phoneNumber, code);
      if (!vc || new Date(vc.expiresAt).getTime() < Date.now()) {
        return res.status(400).json({ error: 'Invalid or expired verification code' });
      }
      await storage.markCodeVerified(vc.id);

      let user = await storage.getUserByPhone(phoneNumber);
      if (!user) {
        user = await storage.createUser({ phoneNumber });
      }

      // Shorter-lived than the normal 30-day session token — this one is
      // meant for a single admin-dashboard visit, not an ongoing session.
      const tokenVersion = user.tokenVersion ?? 0;
      const token = jwt.sign({ userId: user.id, tv: tokenVersion }, JWT_SECRET, { expiresIn: '12h' });

      res.json({ success: true, token });
    } catch (error) {
      console.error('[admin-login] verify error:', error);
      res.status(500).json({ error: 'Failed to verify code' });
    }
  });

  app.get('/api/review-mode', (req, res) => {
    res.json({ reviewMode: reviewModeEnabled });
  });

  app.post('/api/admin/review-mode', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const requestingUser = await storage.getUser(req.userId!);
      if (!requestingUser || !isOwnerPhone(requestingUser.phoneNumber)) {
        return res.status(403).json({ error: 'Unauthorized - Owner access only' });
      }

      const { enabled } = req.body;
      if (typeof enabled !== 'boolean') {
        return res.status(400).json({ error: 'enabled must be a boolean' });
      }

      reviewModeEnabled = enabled;
      await storage.setAppSetting('reviewModeEnabled', String(enabled));
      console.log(`[ADMIN] Review mode ${enabled ? 'ENABLED' : 'DISABLED'} by owner`);
      res.json({ success: true, reviewMode: reviewModeEnabled });
    } catch (error) {
      console.error('Error toggling review mode:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Endpoint to check if current user is an owner (for UI purposes)
  app.get('/api/admin/check-owner', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const user = await storage.getUser(req.userId!);
      if (!user) {
        return res.json({ isOwner: false });
      }
      res.json({ isOwner: isOwnerPhone(user.phoneNumber) });
    } catch (error) {
      res.json({ isOwner: false });
    }
  });
  
  app.get('/api/admin/users', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const requestingUser = await storage.getUser(req.userId!);
      if (!requestingUser) {
        return res.status(403).json({ error: 'Unauthorized' });
      }
      
      // Server-side owner verification using secure config
      if (!isOwnerPhone(requestingUser.phoneNumber)) {
        console.log(`[ADMIN] Unauthorized access attempt from user ${req.userId}`);
        return res.status(403).json({ error: 'Unauthorized - Owner access only' });
      }
      
      console.log(`[ADMIN] Owner accessed user list`);
      const allUsers = await storage.listAllUsers();
      
      // Return only essential fields for privacy
      res.json(allUsers.map(user => ({
        id: user.id,
        phoneNumber: user.phoneNumber,
        displayName: user.displayName || 'Not set',
        createdAt: user.createdAt,
        isSuspended: !!user.isSuspended,
        suspensionReason: user.suspensionReason ?? null,
      })));
    } catch (error) {
      console.error('Error fetching admin users:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ─── Admin: Moderation queue (Apple Guideline 1.2 — UGC review SLA) ───────
  app.get('/api/admin/reports', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const requestingUser = await storage.getUser(req.userId!);
      if (!requestingUser || !isOwnerPhone(requestingUser.phoneNumber)) {
        return res.status(403).json({ error: 'Unauthorized - Owner access only' });
      }
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const limit = req.query.limit ? Math.max(1, Math.min(500, Number(req.query.limit))) : 100;
      const reports = await storage.listReports({ status, limit });
      res.json(reports);
    } catch (error) {
      console.error('[ADMIN] list reports failed:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/admin/reports/:id/action', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const requestingUser = await storage.getUser(req.userId!);
      if (!requestingUser || !isOwnerPhone(requestingUser.phoneNumber)) {
        return res.status(403).json({ error: 'Unauthorized - Owner access only' });
      }
      const { id } = req.params;
      const { action, notes } = req.body || {};
      const ALLOWED_ACTIONS = ['dismiss', 'warn', 'suspend', 'unsuspend', 'reviewed'] as const;
      if (!ALLOWED_ACTIONS.includes(action)) {
        return res.status(400).json({ error: `action must be one of ${ALLOWED_ACTIONS.join(', ')}` });
      }
      // Reject oversized notes payloads up front (defense in depth — express.json
      // already enforces a body-size limit, this is for the per-field shape).
      if (notes !== undefined && notes !== null && typeof notes !== 'string') {
        return res.status(400).json({ error: 'notes must be a string' });
      }
      if (typeof notes === 'string' && notes.length > 2000) {
        return res.status(400).json({ error: 'notes must be 2000 characters or fewer' });
      }
      const report = await storage.getReport(id);
      if (!report) return res.status(404).json({ error: 'Report not found' });

      const now = new Date();
      const noteSuffix = notes ? ` — ${String(notes).slice(0, 500)}` : '';
      let nextStatus = report.status;
      let actionTaken: string | null = report.actionTaken ?? null;

      if (action === 'dismiss') {
        nextStatus = 'dismissed';
        actionTaken = `dismissed${noteSuffix}`;
      } else if (action === 'reviewed') {
        nextStatus = 'reviewed';
        actionTaken = `reviewed_no_action${noteSuffix}`;
      } else if (action === 'warn') {
        nextStatus = 'actioned';
        actionTaken = `warned${noteSuffix}`;
      } else if (action === 'suspend') {
        nextStatus = 'actioned';
        actionTaken = `suspended${noteSuffix}`;
        await storage.suspendUser(report.reportedUserId, `Reported for ${report.reason}${noteSuffix}`);
        // Force-disconnect all live sockets for the suspended user (Apple 1.2 ejection).
        try {
          if (socketIO) {
            const sockets = await socketIO.in(report.reportedUserId).fetchSockets();
            for (const s of sockets) {
              try { s.emit('account-suspended', { reason: report.reason }); } catch {}
              try { s.disconnect(true); } catch {}
            }
          }
        } catch (e) {
          console.error('[ADMIN] Failed to disconnect suspended user sockets:', e);
        }
        console.log(`[ADMIN][SUSPEND] user=${report.reportedUserId} by=${req.userId} report=${id}`);
      } else if (action === 'unsuspend') {
        nextStatus = 'reviewed';
        actionTaken = `unsuspended${noteSuffix}`;
        await storage.unsuspendUser(report.reportedUserId);
        console.log(`[ADMIN][UNSUSPEND] user=${report.reportedUserId} by=${req.userId} report=${id}`);
      }

      const updated = await storage.updateReport(id, {
        status: nextStatus,
        reviewedAt: now,
        reviewedBy: req.userId!,
        actionTaken,
      });
      res.json({ success: true, report: updated });
    } catch (error) {
      console.error('[ADMIN] action on report failed:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ─── Admin: direct suspend/unsuspend (not tied to a report) ───────────────
  app.post('/api/admin/users/:id/suspend', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const requestingUser = await storage.getUser(req.userId!);
      if (!requestingUser || !isOwnerPhone(requestingUser.phoneNumber)) {
        return res.status(403).json({ error: 'Unauthorized - Owner access only' });
      }
      const { id } = req.params;
      const { reason } = req.body || {};
      if (reason !== undefined && (typeof reason !== 'string' || reason.length > 500)) {
        return res.status(400).json({ error: 'reason must be a string of 500 characters or fewer' });
      }
      const target = await storage.getUser(id);
      if (!target) return res.status(404).json({ error: 'User not found' });

      await storage.suspendUser(id, reason || 'Suspended by admin');
      // Force-disconnect all live sockets for the suspended user (Apple 1.2 ejection).
      try {
        if (socketIO) {
          const sockets = await socketIO.in(id).fetchSockets();
          for (const s of sockets) {
            try { s.emit('account-suspended', { reason: reason || 'Suspended by admin' }); } catch {}
            try { s.disconnect(true); } catch {}
          }
        }
      } catch (e) {
        console.error('[ADMIN] Failed to disconnect suspended user sockets:', e);
      }
      console.log(`[ADMIN][SUSPEND] user=${id} by=${req.userId} (direct, no report)`);
      res.json({ success: true });
    } catch (error) {
      console.error('[ADMIN] direct suspend failed:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/admin/users/:id/unsuspend', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const requestingUser = await storage.getUser(req.userId!);
      if (!requestingUser || !isOwnerPhone(requestingUser.phoneNumber)) {
        return res.status(403).json({ error: 'Unauthorized - Owner access only' });
      }
      const { id } = req.params;
      const target = await storage.getUser(id);
      if (!target) return res.status(404).json({ error: 'User not found' });

      await storage.unsuspendUser(id);
      console.log(`[ADMIN][UNSUSPEND] user=${id} by=${req.userId} (direct, no report)`);
      res.json({ success: true });
    } catch (error) {
      console.error('[ADMIN] direct unsuspend failed:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ─── Admin: broadcast a message from "Pryvo Team" to every user ───────────
  // Sent as a plaintext (encryptionVersion='none'), server-authored system
  // message -- same mechanism already used for missed-call event rows, NOT
  // a substitute for real E2EE chat: it's explicitly labeled and rendered
  // as an official/system bubble client-side (mediaType='admin_broadcast'),
  // never pretending to be end-to-end encrypted. Auto-expires 10 minutes
  // after send via the existing disappearing-message sweep; recipients can
  // also delete it immediately like any other message.
  const PRYVO_TEAM_PHONE = '+10000000000';
  async function getOrCreatePryvoTeamUser() {
    let team = await storage.getUserByPhone(PRYVO_TEAM_PHONE);
    if (!team) {
      team = await storage.createUser({ phoneNumber: PRYVO_TEAM_PHONE, displayName: 'Pryvo Team' } as any);
    }
    return team;
  }

  app.post('/api/admin/broadcast', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const requestingUser = await storage.getUser(req.userId!);
      if (!requestingUser || !isOwnerPhone(requestingUser.phoneNumber)) {
        return res.status(403).json({ error: 'Unauthorized - Owner access only' });
      }
      const { message } = req.body || {};
      if (typeof message !== 'string' || !message.trim()) {
        return res.status(400).json({ error: 'message is required' });
      }
      if (message.length > 1000) {
        return res.status(400).json({ error: 'message must be 1000 characters or fewer' });
      }

      const team = await getOrCreatePryvoTeamUser();
      const allUsers = await storage.listAllUsers();
      const recipients = allUsers.filter((u) => u.id !== team.id && !u.isSuspended);
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      let sent = 0;
      for (const recipient of recipients) {
        try {
          const conversation = await storage.getOrCreateConversation(team.id, recipient.id);
          const broadcastMessage = await storage.createMessage(
            {
              conversationId: conversation.id,
              senderId: team.id,
              receiverId: recipient.id,
              content: message.trim(),
              mediaType: 'admin_broadcast',
              mediaUrl: null,
              isHidden: false,
            } as any,
            { isEncrypted: false, encryptionVersion: 'none', expiresAt },
          );
          if (socketIO) {
            socketIO.to(`conversation:${conversation.id}`).emit('new-message', broadcastMessage);
            socketIO.to(recipient.id).emit('new-message', broadcastMessage);
          }
          // Notification content is deliberately generic, same policy as
          // every other push in this app -- never the message body.
          if (recipient.pushToken && recipient.notificationsEnabled !== false) {
            sendPushNotification(
              recipient.pushToken,
              'Pryvo Team',
              'New announcement',
              { type: 'message', conversationId: conversation.id },
              'message',
            ).catch(() => {});
          }
          sent++;
        } catch (e) {
          console.error(`[ADMIN][BROADCAST] failed for user ${recipient.id}:`, e);
        }
      }

      console.log(`[ADMIN][BROADCAST] by=${req.userId} sent=${sent}/${recipients.length}`);
      res.json({ success: true, sent, total: recipients.length });
    } catch (error) {
      console.error('[ADMIN] broadcast failed:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/users/search', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { phone, username } = req.query;

      let user;
      if (typeof username === 'string' && username.trim()) {
        const normalized = username.trim().replace(/^@/, '').toLowerCase();
        user = await storage.getUserByUsername(normalized);
      } else if (typeof phone === 'string' && phone) {
        user = await storage.getUserByPhone(phone);
      } else {
        return res.json([]);
      }

      if (!user || user.id === req.userId) {
        return res.json([]);
      }

      res.json([{
        id: user.id,
        displayName: user.displayName,
        username: user.username,
        phoneNumber: user.phoneNumber,
        avatarIndex: user.avatarIndex,
        isVip: user.isVip,
      }]);
    } catch (error) {
      console.error('Error searching users:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/users/:userId/contact-info', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { userId } = req.params;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const virtualNumber = user.virtualNumberId 
        ? await storage.getVirtualNumber(user.virtualNumberId)
        : null;

      res.json({
        phoneNumber: user.phoneNumber,
        username: user.username ?? null,
        virtualNumber: virtualNumber?.phoneNumber,
        preferredNumberType: user.preferredNumberType || 'personal',
        // Receive-only payment identifiers this person has chosen to share
        // with people they chat with — see the payment-methods endpoint
        // header comment for why this carries no custody/processing risk.
        paymentPaypalMeHandle: user.paymentPaypalMeHandle ?? null,
        paymentPayId: user.paymentPayId ?? null,
        paymentBtcAddress: user.paymentBtcAddress ?? null,
        // Build 63 Phase A — the sender's client reads this to decide
        // whether to call /api/messages/send-sealed (recipient is on a
        // new build) or fall back to /api/messages (recipient is on an
        // old build and would receive an unrenderable payload through
        // the sealed path). Defaults to true via schema; old rows that
        // were never updated also flip to true here so the surface is
        // consistent across build dates.
        supportsSealedSender: user.supportsSealedSender ?? true,
      });
    } catch (error) {
      console.error('Error fetching user contact info:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/invite/send', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { phoneNumber: rawPhone } = req.body;

      if (!rawPhone || typeof rawPhone !== 'string') {
        return res.status(400).json({ error: 'Phone number is required' });
      }

      // E.164 normalization parity with /api/auth/send-code — strip
      // non-digits, validate length, force leading "+". Without this,
      // a caller could pass arbitrary strings ("Bobby Tables") straight
      // to Twilio and chew through quota on garbage requests.
      const digitsOnly = rawPhone.replace(/\D/g, '');
      if (digitsOnly.length < 7 || digitsOnly.length > 15) {
        return res.status(400).json({ error: 'Please enter a valid phone number with country code.' });
      }
      const phoneNumber = `+${digitsOnly}`;

      // Per-user-per-target invite limiter. Keyed (userId, target-phone)
      // so a legit user can still invite many different people, but a
      // compromised account can't loop on a single victim number.
      const inviteAllowed = inviteSendRateLimit(
        () => `${req.userId}|${phoneNumber}`,
        req,
        res,
      );
      if (!inviteAllowed) return; // 429 already written

      const existingUser = await storage.getUserByPhone(phoneNumber);
      if (existingUser) {
        return res.status(400).json({ error: 'This user is already on Pryvo' });
      }

      const sender = await storage.getUser(req.userId!);
      if (!sender) {
        return res.status(400).json({ error: 'Sender not found' });
      }

      await storage.addPendingContact(req.userId!, phoneNumber);

      const senderName = sender.displayName || 'Someone';
      
      const twilioConfigured = (process.env.TWILIO_ACCOUNT_SID || process.env.Twilio_Account_SID) && 
                               (process.env.TWILIO_AUTH_TOKEN || process.env.Twilio_Auth_Token) && 
                               (process.env.TWILIO_PHONE_NUMBER || process.env.Twilio_Phone_Number);
      
      if (!twilioConfigured) {
        console.log(`[DEV MODE] Invite to ${phoneNumber} from ${senderName}: Join Pryvo to start messaging!`);
        return res.json({ success: true, message: 'Invite sent (dev mode)' });
      }

      const { sendInviteSMS } = await import('./twilioClient');
      const sent = await sendInviteSMS(phoneNumber, senderName);
      // phoneNumber here is the normalized E.164 from above, not raw input.
      
      if (!sent) {
        return res.status(500).json({ error: 'Failed to send SMS invite' });
      }

      res.json({ success: true, message: 'Invite sent' });
    } catch (error) {
      console.error('Error sending invite:', error);
      res.status(500).json({ error: 'Failed to send invite' });
    }
  });

  app.post('/api/contacts/add-pending', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { phoneNumber } = req.body;
      
      if (!phoneNumber) {
        return res.status(400).json({ error: 'Phone number is required' });
      }

      const existingUser = await storage.getUserByPhone(phoneNumber);
      if (existingUser) {
        const conversation = await storage.getOrCreateConversation(req.userId!, existingUser.id);
        return res.json({ 
          success: true, 
          userExists: true, 
          conversationId: conversation.id,
          user: {
            id: existingUser.id,
            displayName: existingUser.displayName,
            phoneNumber: existingUser.phoneNumber,
          }
        });
      }

      await storage.addPendingContact(req.userId!, phoneNumber);
      
      res.json({ 
        success: true, 
        userExists: false,
        message: 'Contact added. You will be notified when they join.' 
      });
    } catch (error) {
      console.error('Error adding pending contact:', error);
      res.status(500).json({ error: 'Failed to add contact' });
    }
  });

  app.get('/api/notifications/joins', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const notifications = await storage.getJoinNotifications(req.userId!);
      res.json(notifications);
    } catch (error) {
      console.error('Error getting join notifications:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.put('/api/notifications/joins/:id/read', authenticateToken, async (req: AuthRequest, res) => {
    try {
      await storage.markJoinNotificationRead(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error('Error marking notification read:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Get user by ID for QR code scanning
  app.get('/api/users/:id/profile', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const userId = req.params.id;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      // Don't allow scanning your own QR code
      if (userId === req.userId) {
        return res.status(400).json({ error: 'Cannot add yourself' });
      }
      
      res.json({
        id: user.id,
        displayName: user.displayName || 'User',
        avatarIndex: user.avatarIndex || 0,
      });
    } catch (error) {
      console.error('Error getting user profile:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Generate QR code image for user
  app.get('/api/qrcode/:userId', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { userId } = req.params;
      const color = req.query.color as string || '#2563EB';
      
      const qrValue = `secureconnect://user/${userId}`;
      
      const qrDataUrl = await QRCode.toDataURL(qrValue, {
        width: 400,
        margin: 2,
        color: {
          dark: color,
          light: '#FFFFFF',
        },
        errorCorrectionLevel: 'M',
      });
      
      // Return the data URL as JSON
      res.json({ dataUrl: qrDataUrl });
    } catch (error) {
      console.error('Error generating QR code:', error);
      res.status(500).json({ error: 'Failed to generate QR code' });
    }
  });

  app.get('/api/conversations', authenticateToken, async (req: AuthRequest, res) => {
    try {
      // Get numberType from query parameter, default to 'personal'
      const numberType = (req.query.numberType as string) || 'personal';
      const conversations = await storage.getConversations(req.userId!, numberType);
      
      // Inject mock conversations for Apple reviewers in dev mode (only for personal mode)
      const isReviewer = await isAppleReviewerUser(req.userId!);
      if (isReviewer && isDevMode() && numberType === 'personal') {
        const mockConvs = getMockConversations(req.userId!);
        // Combine real conversations with mock ones (mock first for visibility)
        const combinedConversations = [...mockConvs, ...conversations];
        return res.json(combinedConversations);
      }
      
      res.json(conversations);
    } catch (error) {
      console.error('Error getting conversations:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/conversations', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { otherUserId, numberType } = req.body;
      
      if (!otherUserId) {
        return res.status(400).json({ error: 'Other user ID is required' });
      }

      // Use numberType from request body, default to 'personal'
      const conversationNumberType = numberType || 'personal';
      // Message-request flow: only a genuinely brand-new pairing becomes a
      // request — see getOrCreateConversationAsRequest.
      const conversation = await storage.getOrCreateConversationAsRequest(req.userId!, otherUserId, conversationNumberType);
      res.json(conversation);
    } catch (error) {
      console.error('Error creating conversation:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/conversations/:id/messages', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const conversationId = req.params.id;
      
      // Handle mock conversations for Apple reviewers
      if (isMockConversation(conversationId) && isDevMode()) {
        const isReviewer = await isAppleReviewerUser(req.userId!);
        if (isReviewer) {
          const mockMessages = getMockMessages(conversationId, req.userId!);
          return res.json(mockMessages);
        }
      }

      // Access control: only conversation participants may read messages.
      const isParticipant = await storage.isConversationParticipant(conversationId, req.userId!);
      if (!isParticipant) {
        return res.status(403).json({ error: 'Not a participant in this conversation' });
      }

      const messages = await storage.getConversationMessages(conversationId, 50, req.userId!);

      // Honor reader's read-receipt privacy toggle: if disabled, do NOT
      // mark-read or broadcast read events to senders.
      const reader = await storage.getUser(req.userId!);
      const readReceiptsOn = reader?.readReceiptsEnabled !== false;
      const updated = readReceiptsOn
        ? await storage.markMessagesRead(conversationId, req.userId!)
        : [];
      if (updated.length > 0) {
        const readAt = updated[0].readAt;
        const messageIds = updated.map((u) => u.id);
        // Broadcast to the conversation room (sender's open chat will update live).
        io.to(`conversation:${conversationId}`).emit('messages-read', {
          conversationId,
          messageIds,
          readerId: req.userId,
          readAt,
        });
        // Also notify each unique sender on their personal room (covers the
        // case where they don't have the chat open).
        const uniqueSenders = Array.from(new Set(updated.map((u) => u.senderId)));
        for (const senderId of uniqueSenders) {
          if (senderId !== req.userId) {
            io.to(senderId).emit('messages-read', {
              conversationId,
              messageIds: updated.filter((u) => u.senderId === senderId).map((u) => u.id),
              readerId: req.userId,
              readAt,
            });
          }
        }
      }

      // Build 63, Phase 3: sanitize sealed-sender rows before returning to
      // the recipient. sanitizeManyForRecipient is a no-op for messages
      // where sealedSender !== true (legacy + historical messages), and
      // for rows the viewer authored (their own outbox). All other rows
      // have `senderId`, `forwardedFromUserId`, and `replyToSenderId`
      // stripped and `senderVirtualNumber`/`senderDisplayName` substituted.
      const { sanitizeManyForRecipient } = await import('./sealedSender');
      const sanitized = await sanitizeManyForRecipient(messages as any, req.userId!);
      res.json(sanitized);
    } catch (error) {
      console.error('Error getting messages:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ── POST /api/messages/send-sealed (build 63, Phase 3) ───────────────
  // Sender-side sealed-sender entry point. The sender's client calls THIS
  // route (not POST /api/messages) when all three conditions hold:
  //   1. Sender has preferredNumberType='app' AND an active virtual number
  //   2. Recipient.supportsSealedSender === true (from /api/auth/me)
  //   3. Conversation numberType is virtual (1:1 only — no groups yet)
  // The route is the SINGLE chokepoint where senderId-stripping is applied
  // to the recipient socket emit AND the push payload. See sealedSender.ts
  // for the sanitizer and docs/e2ee/sealed-sender.md §4 for the surface
  // audit table.
  app.post('/api/messages/send-sealed', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { conversationId, receiverId, content, encryptionVersion, e2eeInitEnvelope, replyToMessageId } = req.body;
      if (!conversationId || !receiverId || !content) {
        return res.status(400).json({ error: 'conversationId, receiverId, and content are required' });
      }

      const sender = await storage.getUser(req.userId!);
      if (!sender) return res.status(404).json({ error: 'Sender not found' });
      if (!sender.virtualNumberId) {
        return res.status(403).json({ error: 'You need an active Pryvo number to send sealed messages.' });
      }

      // The route-level ownership check. Released or suspended virtual
      // numbers fail here, even though `sender.virtualNumberId` still
      // points at the row.
      const owns = await storage.ownsVirtualNumber(sender.id, sender.virtualNumberId);
      if (!owns) {
        return res.status(403).json({ error: 'Your Pryvo number is not active. Re-provision it.' });
      }

      // Block list check — identical semantics to /api/messages.
      const isBlocked = await storage.isBlockedByEither(sender.id, receiverId);
      if (isBlocked) {
        return res.status(403).json({ error: 'Cannot send message. User is blocked.' });
      }

      // Build 63 Phase B — broken-access-control fix.
      //
      // The route used to trust the client-supplied `conversationId` /
      // `receiverId`. With a valid sender token, a caller could inject
      // a sealed message into ANY conversation whose id they knew (and
      // sanitizeForRecipient would happily strip senderId for whoever
      // GETs the conversation). We now mirror the same authz pattern
      // `/api/messages` uses:
      //   1. The sender must be a participant in `conversationId`.
      //   2. `receiverId` must be the *other* participant in that row
      //      (no cross-conversation message injection).
      //   3. The conversation must be of `numberType: "virtual"` —
      //      sealed-sender is explicitly 1:1 virtual-number only, and
      //      personal-mode conversations have no VN to substitute for
      //      the stripped senderId.
      // Conversations are M:N via `conversation_participants`. Both
      // sender AND receiver must be members of the row; this prevents
      // a valid token from being used to inject a sealed message into
      // an unrelated conversation, or addressed to a non-participant.
      const senderInConv = await storage.isConversationParticipant(conversationId, sender.id);
      if (!senderInConv) {
        return res.status(403).json({ error: 'Not a participant in this conversation' });
      }
      const receiverInConv = await storage.isConversationParticipant(conversationId, receiverId);
      if (!receiverInConv) {
        return res
          .status(400)
          .json({ error: 'receiverId is not a participant in this conversation' });
      }
      // Reject self-addressed sends — would create an orphan row and
      // sanitizeForRecipient has no meaningful "other party" to render.
      if (receiverId === sender.id) {
        return res.status(400).json({ error: 'Cannot send sealed message to yourself' });
      }
      const convRow = await storage.getConversationById(conversationId);
      if (!convRow) {
        return res.status(404).json({ error: 'Conversation not found' });
      }
      if ((convRow.numberType ?? 'personal') !== 'virtual') {
        return res
          .status(400)
          .json({ error: 'Sealed sender requires a virtual-number conversation' });
      }

      // Recipient capability check. Old builds default to true via the
      // schema default, but if a client has explicitly disabled it (e.g.
      // a future "I don't want sealed-sender messages" privacy toggle),
      // 409 tells the sender client to fall back to legacy /api/messages.
      const recipient = await storage.getUser(receiverId);
      if (!recipient) return res.status(404).json({ error: 'Recipient not found' });
      if (recipient.supportsSealedSender === false) {
        return res.status(409).json({ error: 'sealed-sender-unsupported-recipient' });
      }

      // Chat-limit gate (same as /api/messages).
      const { checkAndConsumeChatLimit } = await import('./aiModerator');
      const limit = await checkAndConsumeChatLimit(sender.id);
      if (!limit.allowed) {
        return res.status(429).json({
          error: limit.reason || 'Daily message limit reached.',
          chatLimited: true,
          perDay: limit.perDay,
          resetAt: limit.resetAt,
        });
      }
      if (typeof limit.remaining === 'number') {
        res.setHeader('X-Chat-Limit-Remaining', String(limit.remaining));
        res.setHeader('X-Chat-Limit-Per-Day', String(limit.perDay ?? ''));
      }

      const message = await storage.createSealedMessage({
        conversationId,
        senderId: sender.id,
        receiverId,
        outerSenderVirtualNumberId: sender.virtualNumberId,
        content,
        encryptionVersion,
        e2eeInitEnvelope,
        replyToMessageId: replyToMessageId ?? null,
      });

      // Sanitize ONCE for the recipient view; reuse the same object for
      // both socket emits and the push payload so the senderId-strip is
      // applied in exactly one place.
      const { sanitizeForRecipient, buildVirtualNumberLookup } = await import('./sealedSender');
      const lookup = await buildVirtualNumberLookup([message.outerSenderVirtualNumberId]);
      const recipientView = sanitizeForRecipient(message as any, receiverId, lookup);
      const senderView = message; // sender sees their own message in full

      // Masked identity for the recipient's UI — the outer virtual-number
      // display, never the real sender. Computed here (not just at push
      // time below) so the in-app banner gets the same non-leaking name.
      const sealedVn = lookup.get(sender.virtualNumberId);
      const sealedSenderName = sealedVn?.displayName || sealedVn?.phoneNumber || 'Someone';

      // Emit to recipient's personal room with SANITIZED payload.
      io.to(receiverId).emit('new-message', recipientView);
      io.to(receiverId).emit('message-notification', {
        conversationId,
        // No real senderId leaks here — deliberately omitted (the field is
        // also null on the sealed message row itself). senderName is the
        // masked virtual-number identity, not the real sender. No message
        // body/ciphertext travels on this event at all — the client's
        // notification handler never needs it (see NotificationContext.tsx).
        senderName: sealedSenderName,
      });

      // Emit to sender's personal room with FULL payload (their outbox).
      // io.to(sender.id) is distinct from io.to(receiverId), so we are
      // not accidentally re-broadcasting the unsanitized payload to the
      // recipient. The conversation-room emit is omitted because joining
      // a conversation room is a personal-id thing in this codebase; both
      // participants get the message via their personal rooms.
      io.to(sender.id).emit('new-message', senderView);

      // Push payload. We deliberately drop `otherUserId: senderId` and
      // substitute `viaVirtualNumber`. The recipient's push handler is
      // updated (client-side follow-up) to render this in the
      // notification banner. If recipient.showNotificationPreview is off,
      // sendMessageNotification still falls back to "New encrypted
      // message" because that check lives inside that function.
      if (recipient.pushToken && recipient.notificationsEnabled !== false) {
        const senderName = sealedSenderName;
        try {
          // Build 63: we bypass `sendMessageNotification` here because its
          // signature hard-codes `otherUserId: senderId` into the payload,
          // which would re-leak the very identifier the route is designed
          // to strip. Calling the lower-level `sendPushNotification`
          // directly lets us assemble a sealed-mode data dict that omits
          // otherUserId entirely. The body honors the recipient's
          // showNotificationPreview preference for parity with /messages.
          const previewOff = recipient.showNotificationPreview === false;
          const body = previewOff ? 'New encrypted message' : 'Sent a message';
          await sendPushNotification(
            recipient.pushToken,
            senderName,
            body,
            {
              conversationId,
              messageId: message.id,
              sealedSender: true,
              viaVirtualNumber: sealedVn?.phoneNumber ?? null,
              senderName,
            },
            'message',
          );
        } catch (err) {
          console.error('Sealed push notification failed:', err);
        }
      }

      res.json(senderView);
    } catch (error) {
      console.error('send-sealed failed:', error);
      res.status(500).json({ error: 'Failed to send sealed message' });
    }
  });

  app.post('/api/messages', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const {
        conversationId, receiverId, content, mediaUrl, mediaType, isHidden,
        encryptionVersion, e2eeInitEnvelope,
        replyToMessageId, replyToSenderId,
        forwarded, forwardedFromUserId,
        expiresAt: clientExpiresAt,
      } = req.body;
      
      // Check if either user has blocked the other
      if (receiverId) {
        const isBlocked = await storage.isBlockedByEither(req.userId!, receiverId);
        if (isBlocked) {
          return res.status(403).json({ error: 'Cannot send message. User is blocked.' });
        }
      }

      // Message-request flow: the recipient of a still-pending request must
      // accept before they can reply (they can already read it — this only
      // blocks sending). The initiator is unaffected and can keep sending.
      if (conversationId && !isMockConversation(conversationId)) {
        const pendingRequestId = await storage.getPendingRequestForRecipient(conversationId, req.userId!);
        if (pendingRequestId) {
          return res.status(403).json({ error: 'Accept this conversation before replying.', pendingRequestId });
        }
      }

      // Enforce AI-imposed chat limits. If the sender has been chat-limited
      // by moderation, atomically check + consume one of their daily slots.
      // Mock conversations are exempt so Apple reviewer flows always work.
      if (!isMockConversation(conversationId)) {
        const { checkAndConsumeChatLimit } = await import('./aiModerator');
        const limit = await checkAndConsumeChatLimit(req.userId!);
        if (!limit.allowed) {
          return res.status(429).json({
            error: limit.reason || 'Daily message limit reached.',
            chatLimited: true,
            perDay: limit.perDay,
            resetAt: limit.resetAt,
          });
        }
        // Surface the remaining count on the response header so clients can
        // show "3 of 5 left today" without a separate request.
        if (typeof limit.remaining === 'number') {
          res.setHeader('X-Chat-Limit-Remaining', String(limit.remaining));
          res.setHeader('X-Chat-Limit-Per-Day', String(limit.perDay ?? ''));
        }
      }
      
      // Handle mock conversations for Apple reviewers (no database writes)
      if (isMockConversation(conversationId) && isDevMode()) {
        const isReviewer = await isAppleReviewerUser(req.userId!);
        if (isReviewer && isMockUser(receiverId)) {
          // Return a synthetic message without saving to DB
          const mockMessage = {
            id: `mock-msg-${Date.now()}-rest`,
            conversationId,
            senderId: req.userId!,
            receiverId,
            content,
            mediaUrl: mediaUrl || null,
            mediaType: mediaType || null,
            createdAt: new Date().toISOString(),
            isEncrypted: true,
            status: 'sent',
          };
          
          // Emit the user's message via Socket.IO so it appears in real-time
          io.to(`conversation:${conversationId}`).emit('new-message', mockMessage);
          
          // Schedule a bot auto-reply after 1-3 seconds (via Socket.IO)
          const replyDelay = 1000 + Math.random() * 2000;
          setTimeout(() => {
            const botReply = createMockBotReply(conversationId, receiverId, req.userId!);
            io.to(`conversation:${conversationId}`).emit('new-message', botReply);
            const botUser = getMockUser(receiverId);
            io.to(req.userId!).emit('message-notification', {
              conversationId,
              senderId: receiverId,
              senderName: botUser?.displayName || 'Someone',
            });
          }, replyDelay);
          
          return res.json(mockMessage);
        }
      }
      
      let message;
      try {
        message = await storage.createMessage({
          conversationId,
          senderId: req.userId!,
          receiverId,
          content,
          mediaUrl,
          mediaType,
          isHidden,
        }, {
          encryptionVersion: encryptionVersion ?? "v2-signal",
          e2eeInitEnvelope: e2eeInitEnvelope ?? null,
          replyToMessageId: replyToMessageId ?? null,
          // Never persist a plaintext reply preview server-side. Recipients
          // render quoted replies by looking up replyToMessageId in their own
          // decrypted local cache.
          replyToPreview: null,
          replyToSenderId: replyToSenderId ?? null,
          forwarded: forwarded === true,
          forwardedFromUserId: forwarded === true ? (forwardedFromUserId ?? null) : null,
          expiresAt: typeof clientExpiresAt === 'number' && clientExpiresAt > Date.now()
            ? new Date(clientExpiresAt)
            : (typeof clientExpiresAt === 'string' && !Number.isNaN(Date.parse(clientExpiresAt)))
              ? new Date(clientExpiresAt)
              : null,
        });
      } catch (e) {
        // The chat-limit slot was already consumed above; refund it so the
        // user is not penalized for a send that didn't actually persist.
        if (!isMockConversation(conversationId)) {
          try {
            const { refundChatLimitSlot } = await import('./aiModerator');
            await refundChatLimitSlot(req.userId!);
          } catch {}
        }
        throw e;
      }

      // If the receiver is online, optimistically mark the message as delivered
      // server-side so that even if the receiver's client crashes before acking,
      // the sender still sees double ticks. The receiver client will further
      // confirm via the 'message-delivered' socket event.
      if (receiverId && connectedUsers.has(receiverId)) {
        const delivered = await storage.markMessageDelivered(message.id, receiverId);
        if (delivered) message = delivered;
      }

      // Broadcast message via Socket.IO to conversation room for real-time updates
      io.to(`conversation:${conversationId}`).emit('new-message', {
        ...message,
        conversationId,
      });

      // If we marked delivered above, also tell the sender's other devices via
      // their personal room (they may not be in the conversation room yet).
      if (message.status === 'delivered' && message.deliveredAt) {
        io.to(req.userId!).emit('message-status', {
          conversationId,
          messageId: message.id,
          status: 'delivered',
          deliveredAt: message.deliveredAt,
        });
      }

      if (receiverId) {
        const receiver = await storage.getUser(receiverId);
        const sender = await storage.getUser(req.userId!);

        // Also emit to receiver's personal room for notifications. Include
        // the sender's name/avatar flat so the in-app banner can render
        // "<Name> sent a message" without needing a separate lookup — and,
        // like the push path, deliberately does NOT include message
        // content or a content-type hint: the banner shows a fixed generic
        // body, never the real text.
        const senderNameForNotif = sender?.displayName || sender?.phoneNumber || 'Someone';
        io.to(receiverId).emit('message-notification', {
          conversationId,
          senderId: req.userId!,
          senderName: senderNameForNotif,
          senderAvatar: sender?.avatarUrl ?? null,
        });
        const receiverOnline = connectedUsers.has(receiverId);

        if (!receiverOnline && receiver?.pushToken && receiver?.notificationsEnabled !== false) {
          const senderName = sender?.displayName || sender?.phoneNumber || 'Someone';

          // Notification preview privacy: never put message content — or
          // even a content-type hint like "Sent a photo" — in a push
          // notification. The lock screen / notification-center preview is
          // outside the app's control once it leaves the device, so the
          // body is always the fixed "Sent a message" regardless of what
          // was actually sent. Full content only ever renders once the
          // conversation is opened in-app. When the recipient also turned
          // previews off, the title drops the sender's name too.
          const previewOff = receiver.showNotificationPreview === false;
          const pushTitle = previewOff ? 'Pryvo' : senderName;
          const pushBody = previewOff ? 'New encrypted message' : 'Sent a message';

          sendMessageNotification(
            receiver.pushToken,
            pushTitle,
            pushBody,
            conversationId,
            req.userId!,
          ).catch(err => console.error('Push notification failed:', err));
        }
      }

      res.json(message);
    } catch (error) {
      console.error('Error creating message:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Delete-for-me: hides the message only for the calling user.
  // Both sender and receiver may call this on any message in their conversation.
  app.delete('/api/messages/:id', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const messageId = req.params.id;
      const ok = await storage.deleteMessageForMe(messageId, req.userId!);
      if (!ok) return res.status(404).json({ error: 'Message not found or not allowed' });
      res.json({ success: true, scope: 'me' });
    } catch (error) {
      console.error('Error deleting message for me:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Delete-for-everyone: only the sender, within 1 hour. Replaces the row
  // with a tombstone and broadcasts to all participants.
  app.post('/api/messages/:id/delete-for-everyone', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const messageId = req.params.id;
      const result = await storage.deleteMessageForEveryone(messageId, req.userId!);
      if ('error' in result) {
        // Distinct, honest reasons instead of one generic "cannot delete" —
        // a user hitting the 404 or the 1-hour-expiry case has no way to
        // tell those apart from a real bug without this.
        const messages: Record<typeof result.error, string> = {
          not_found: 'This message no longer exists.',
          not_sender: 'You can only delete your own messages for everyone.',
          expired: 'Delete for everyone is only available within 1 hour of sending.',
        };
        return res.status(403).json({ error: messages[result.error], reason: result.error });
      }
      const updated = result.message;
      const ioRef = getIO();
      if (ioRef) {
        ioRef.to(`conversation:${updated.conversationId}`).emit('message-deleted-for-everyone', {
          messageId: updated.id,
          conversationId: updated.conversationId,
          deletedBy: req.userId,
        });
      }
      res.json({ success: true, scope: 'everyone', message: updated });
    } catch (error) {
      console.error('Error deleting message for everyone:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Forward an existing message into another conversation. Server treats
  // payload as an opaque ciphertext blob — no plaintext is inspected.
  app.post('/api/messages/:id/forward', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const messageId = req.params.id;
      const { conversationIds } = req.body as { conversationIds?: string[] };
      if (!Array.isArray(conversationIds) || conversationIds.length === 0) {
        return res.status(400).json({ error: 'conversationIds[] is required' });
      }
      if (conversationIds.length > 20) {
        return res.status(400).json({ error: 'Cannot forward to more than 20 chats at once' });
      }

      const ioRef = getIO();
      const { checkAndConsumeChatLimit, refundChatLimitSlot } = await import('./aiModerator');
      const results: Array<{ conversationId: string; ok: boolean; messageId?: string; reason?: string }> = [];
      let chatLimited: { perDay?: number; resetAt?: string } | null = null;
      const forwarder = await storage.getUser(req.userId!);
      const forwarderName = forwarder?.displayName || forwarder?.phoneNumber || 'Someone';

      for (const targetConvId of conversationIds) {
        // The forwarder must be a participant in the target chat.
        const isPart = await storage.isConversationParticipant(targetConvId, req.userId!);
        if (!isPart) { results.push({ conversationId: targetConvId, ok: false, reason: 'not_participant' }); continue; }

        // Resolve the other participant (receiverId for 1:1 chats) by
        // peeking at the most recent message in the target conversation.
        const recent = await storage.getConversationMessages(targetConvId, 1).catch(() => []);
        let receiverId: string | null = null;
        const last = recent[recent.length - 1];
        if (last) {
          receiverId = last.senderId === req.userId ? (last.receiverId ?? null) : last.senderId;
        }

        // Block check: refuse forward if either party blocked the other.
        if (receiverId) {
          try {
            const blocked = await storage.isBlockedByEither(req.userId!, receiverId);
            if (blocked) { results.push({ conversationId: targetConvId, ok: false, reason: 'blocked' }); continue; }
          } catch (e) {
            // Fail-closed
            results.push({ conversationId: targetConvId, ok: false, reason: 'block_check_failed' });
            continue;
          }
        }

        // Enforce AI chat limits per forwarded copy so a moderated user can't
        // bypass the cap by spamming forwards.
        let consumed = false;
        try {
          const limit = await checkAndConsumeChatLimit(req.userId!);
          if (!limit.allowed) {
            chatLimited = { perDay: limit.perDay, resetAt: limit.resetAt };
            results.push({ conversationId: targetConvId, ok: false, reason: 'chat_limited' });
            continue;
          }
          consumed = true;
        } catch (e) {
          console.error('[AI-MOD] forward limit check failed (fail-closed):', e);
          results.push({ conversationId: targetConvId, ok: false, reason: 'limit_check_failed' });
          continue;
        }

        const fwd = await storage.forwardMessage(messageId, targetConvId, req.userId!, receiverId).catch((e) => {
          console.error('forwardMessage failed:', e);
          return null;
        });
        if (!fwd) {
          // Refund the slot if we consumed but failed to persist.
          if (consumed) await refundChatLimitSlot(req.userId!);
          results.push({ conversationId: targetConvId, ok: false, reason: 'persist_failed' });
          continue;
        }

        if (ioRef) {
          ioRef.to(`conversation:${targetConvId}`).emit('new-message', fwd);
          if (receiverId) {
            ioRef.to(receiverId).emit('message-notification', {
              conversationId: targetConvId,
              senderId: req.userId!,
              senderName: forwarderName,
              senderAvatar: forwarder?.avatarUrl ?? null,
            });
          }
        }
        results.push({ conversationId: targetConvId, ok: true, messageId: fwd.id });
      }

      res.json({ success: true, results, chatLimited });
    } catch (error) {
      console.error('Error forwarding message:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Pin / unpin a message in a conversation.
  // Conversation metadata (pinnedMessageId, disappearingTimer, etc.) for the
  // current user. Returns 404 if not a participant.
  app.get('/api/conversations/:id', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const conversationId = req.params.id;
      const isParticipant = await storage.isConversationParticipant(conversationId, req.userId!);
      if (!isParticipant) return res.status(403).json({ error: 'Not a participant' });
      const conv = await storage.getConversationById(conversationId);
      if (!conv) return res.status(404).json({ error: 'Conversation not found' });
      // Message-request flow: non-null only when the CALLER is the one who
      // must accept/decline before replying (the sender's own view never
      // sees this — they're free to keep messaging while it's pending).
      const pendingRequestId = await storage.getPendingRequestForRecipient(conversationId, req.userId!);
      res.json({
        id: conv.id,
        pinnedMessageId: (conv as any).pinnedMessageId ?? null,
        disappearingTimer: (conv as any).disappearingTimer ?? 0,
        // Build 74 — the client reads this to skip the sealed-sender
        // attempt entirely on personal-number conversations (the sealed
        // route 400s on them by design).
        numberType: (conv as any).numberType ?? 'personal',
        createdAt: conv.createdAt,
        pendingRequestId,
      });
    } catch (e) {
      console.error('GET /api/conversations/:id error', e);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/conversations/:id/pin', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const conversationId = req.params.id;
      const { messageId } = req.body as { messageId?: string };
      if (!messageId) return res.status(400).json({ error: 'messageId is required' });
      const ok = await storage.pinMessage(conversationId, messageId, req.userId!);
      if (!ok) return res.status(403).json({ error: 'Cannot pin this message' });
      const ioRef = getIO();
      if (ioRef) ioRef.to(`conversation:${conversationId}`).emit('message-pinned', { conversationId, messageId, pinnedBy: req.userId });
      res.json({ success: true, pinnedMessageId: messageId });
    } catch (error) {
      console.error('Error pinning message:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.delete('/api/conversations/:id/pin', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const conversationId = req.params.id;
      const ok = await storage.unpinMessage(conversationId, req.userId!);
      if (!ok) return res.status(403).json({ error: 'Cannot unpin in this conversation' });
      const ioRef = getIO();
      if (ioRef) ioRef.to(`conversation:${conversationId}`).emit('message-unpinned', { conversationId, unpinnedBy: req.userId });
      res.json({ success: true });
    } catch (error) {
      console.error('Error unpinning message:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // "Save" hold-menu action — private per-user bookmark, backed by the
  // message_saves table so it survives reinstalls/new devices instead of
  // living only in local AsyncStorage. Unlike pin/unpin above, this is
  // never broadcast over the socket — the other participant never learns
  // what you've saved.
  app.get('/api/conversations/:id/saved-messages', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const ids = await storage.getSavedMessageIds(req.userId!, req.params.id);
      res.json({ savedMessageIds: ids });
    } catch (error) {
      console.error('Error fetching saved messages:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/messages/:id/save', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const ok = await storage.saveMessage(req.userId!, req.params.id);
      if (!ok) return res.status(403).json({ error: 'Cannot save this message' });
      res.json({ success: true });
    } catch (error) {
      console.error('Error saving message:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.delete('/api/messages/:id/save', authenticateToken, async (req: AuthRequest, res) => {
    try {
      await storage.unsaveMessage(req.userId!, req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error('Error unsaving message:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Per-chat disappearing-message timer (seconds; 0 = off).
  app.patch('/api/conversations/:id/timer', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const conversationId = req.params.id;
      const { seconds } = req.body as { seconds?: number };
      if (typeof seconds !== 'number' || seconds < 0 || seconds > 60 * 60 * 24 * 7) {
        return res.status(400).json({ error: 'seconds must be a number 0..604800' });
      }
      const ok = await storage.setConversationTimer(conversationId, req.userId!, Math.floor(seconds));
      if (!ok) return res.status(403).json({ error: 'Not a participant in this conversation' });
      const ioRef = getIO();
      if (ioRef) ioRef.to(`conversation:${conversationId}`).emit('disappearing-timer-changed', {
        conversationId, seconds: Math.floor(seconds), changedBy: req.userId,
      });
      res.json({ success: true, seconds: Math.floor(seconds) });
    } catch (error) {
      console.error('Error setting disappearing timer:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // User privacy settings (read receipts, typing, notification preview, default disappearing timer).
  app.patch('/api/users/me/privacy', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { readReceiptsEnabled, typingIndicatorsEnabled, showNotificationPreview, defaultDisappearingTimer, keepMutedChatsArchived } = req.body ?? {};
      const updated = await storage.updateUserPrivacy(req.userId!, {
        readReceiptsEnabled: typeof readReceiptsEnabled === 'boolean' ? readReceiptsEnabled : undefined,
        typingIndicatorsEnabled: typeof typingIndicatorsEnabled === 'boolean' ? typingIndicatorsEnabled : undefined,
        showNotificationPreview: typeof showNotificationPreview === 'boolean' ? showNotificationPreview : undefined,
        defaultDisappearingTimer: typeof defaultDisappearingTimer === 'number' ? defaultDisappearingTimer : undefined,
        keepMutedChatsArchived: typeof keepMutedChatsArchived === 'boolean' ? keepMutedChatsArchived : undefined,
      });
      if (!updated) return res.status(404).json({ error: 'User not found' });
      res.json({
        readReceiptsEnabled: updated.readReceiptsEnabled,
        typingIndicatorsEnabled: updated.typingIndicatorsEnabled,
        showNotificationPreview: updated.showNotificationPreview,
        defaultDisappearingTimer: updated.defaultDisappearingTimer,
        keepMutedChatsArchived: updated.keepMutedChatsArchived,
      });
    } catch (error) {
      console.error('Error updating privacy:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.patch('/api/users/me/story-privacy', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { storiesEnabled, storyPrivacyMode, storyPrivacyExceptIds, storyPrivacyOnlyIds, storyViewReceiptsEnabled } = req.body ?? {};
      const validModes = ['everyone', 'contacts', 'except', 'only'];
      if (typeof storyPrivacyMode === 'string' && !validModes.includes(storyPrivacyMode)) {
        return res.status(400).json({ error: 'Invalid storyPrivacyMode' });
      }
      const sanitizeIds = (arr: any) =>
        Array.isArray(arr)
          ? Array.from(new Set(arr.filter((x: any) => typeof x === 'string' && x.trim().length > 0)))
          : undefined;
      const updated = await storage.updateStoryPrivacy(req.userId!, {
        storiesEnabled: typeof storiesEnabled === 'boolean' ? storiesEnabled : undefined,
        storyPrivacyMode: typeof storyPrivacyMode === 'string' ? storyPrivacyMode : undefined,
        storyPrivacyExceptIds: sanitizeIds(storyPrivacyExceptIds),
        storyPrivacyOnlyIds: sanitizeIds(storyPrivacyOnlyIds),
        storyViewReceiptsEnabled: typeof storyViewReceiptsEnabled === 'boolean' ? storyViewReceiptsEnabled : undefined,
      });
      if (!updated) return res.status(404).json({ error: 'User not found' });
      res.json({
        storiesEnabled: updated.storiesEnabled,
        storyPrivacyMode: updated.storyPrivacyMode,
        storyPrivacyExceptIds: updated.storyPrivacyExceptIds || [],
        storyPrivacyOnlyIds: updated.storyPrivacyOnlyIds || [],
        storyViewReceiptsEnabled: updated.storyViewReceiptsEnabled,
      });
    } catch (error) {
      console.error('Error updating story privacy:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/messages/:id/unsend', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const messageId = req.params.id;
      const message = await storage.getMessage(messageId);
      
      if (!message) {
        return res.status(404).json({ error: 'Message not found' });
      }
      
      if (message.senderId !== req.userId) {
        return res.status(403).json({ error: 'You can only unsend your own messages' });
      }
      
      const messageTime = message.createdAt ? new Date(message.createdAt).getTime() : 0;
      const now = Date.now();
      const fiveMinutes = 5 * 60 * 1000;
      
      if (now - messageTime > fiveMinutes) {
        return res.status(400).json({ error: 'Messages can only be unsent within 5 minutes' });
      }
      
      await storage.deleteMessage(messageId);
      res.json({ success: true });
    } catch (error) {
      console.error('Error unsending message:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/messages/:id/react', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const messageId = req.params.id;
      const { emoji } = req.body;
      const userId = req.userId!;

      if (!emoji || typeof emoji !== 'string') {
        return res.status(400).json({ error: 'emoji is required' });
      }

      const updated = await storage.addMessageReaction(messageId, userId, emoji);
      if (!updated) {
        return res.status(404).json({ error: 'Message not found' });
      }

      const io = getIO();
      if (io && updated.conversationId) {
        io.to(`conversation:${updated.conversationId}`).emit('message-reaction', {
          messageId,
          reactions: updated.reactions,
          userId,
          emoji,
        });
      }

      res.json({ reactions: updated.reactions });
    } catch (error) {
      console.error('Error reacting to message:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/calls', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const userId = req.userId!;
      const calls = await storage.getCalls(userId);

      // Enrich calls with user names. Phase C.1: on sealed calls, when the
      // current user is the RECEIVER, redact callerId / callerName /
      // callerAvatarIndex and substitute the caller's virtual-number string.
      // The caller side (who made the call) always sees the full receiver
      // identity — sealing only hides the originator from the recipient.
      const enrichedCalls = await Promise.all(calls.map(async (call) => {
        const isReceiverViewing = call.receiverId === userId;
        const sealed = !!call.sealedCall && isReceiverViewing;

        const caller = sealed ? null : await storage.getUser(call.callerId);
        const receiver = await storage.getUser(call.receiverId);

        let sealedCallerLabel: string | null = null;
        if (sealed && call.outerCallerVirtualNumberId) {
          const vn = await storage.getVirtualNumber(call.outerCallerVirtualNumberId);
          sealedCallerLabel = vn?.phoneNumber ?? null;
        }

        return {
          ...call,
          callerId: sealed ? null : call.callerId,
          callerName: sealed
            ? (sealedCallerLabel ?? 'Unknown number')
            : (caller?.displayName || caller?.phoneNumber || 'Unknown'),
          receiverName: receiver?.displayName || receiver?.phoneNumber || 'Unknown',
          callerAvatarIndex: sealed ? 0 : (caller ? Math.abs(caller.id.charCodeAt(0)) % 6 : 0),
          receiverAvatarIndex: receiver ? Math.abs(receiver.id.charCodeAt(0)) % 6 : 0,
        };
      }));

      res.json(enrichedCalls);
    } catch (error) {
      console.error('Error getting calls:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/calls', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { receiverId, type } = req.body;

      // Check if either user has blocked the other
      const isBlocked = await storage.isBlockedByEither(req.userId!, receiverId);
      if (isBlocked) {
        return res.status(403).json({ error: 'Cannot make call. User is blocked.' });
      }

      // Phase C.1: server-side sealed-call eligibility decision.
      // Server has ground truth for both users' capability flags so there
      // is no "unknown" branch and no client fail-closed dance — the
      // decision is deterministic and made once at call creation time.
      // Eligibility:
      //   1. Caller is in app-number mode AND has a virtualNumberId
      //   2. Recipient client supports sealed-sender (same version cohort)
      const caller = await storage.getUser(req.userId!);
      const receiver = await storage.getUser(receiverId);

      let sealedCall = false;
      let outerCallerVirtualNumberId: string | null = null;
      if (
        caller?.preferredNumberType === 'app' &&
        caller?.virtualNumberId &&
        receiver?.supportsSealedSender !== false
      ) {
        const callerVn = await storage.getVirtualNumber(caller.virtualNumberId);
        if (callerVn) {
          sealedCall = true;
          outerCallerVirtualNumberId = callerVn.id;
        }
      }

      const call = await storage.createCall(req.userId!, receiverId, type, {
        sealedCall,
        outerCallerVirtualNumberId,
      });

      // Receiver phone number for the caller's outgoing-call UI (caller
      // always sees who they are calling — sealing only hides the
      // originator from the recipient, never the other way around).
      let receiverPhoneNumber = receiver?.phoneNumber;
      if (receiver?.preferredNumberType === 'app' && receiver?.virtualNumberId) {
        const virtualNum = await storage.getVirtualNumber(receiver.virtualNumberId);
        if (virtualNum) {
          receiverPhoneNumber = virtualNum.phoneNumber;
        }
      }

      res.json({ ...call, receiverPhoneNumber });
    } catch (error) {
      console.error('Error creating call:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.put('/api/calls/:id', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const userId = req.userId!;
      // Whitelist what the client can patch — never let the client overwrite
      // sealedCall / outerCallerVirtualNumberId / callerId / receiverId.
      const allowed: Partial<typeof req.body> = {};
      for (const k of ['status', 'startedAt', 'endedAt', 'duration'] as const) {
        if (k in req.body) (allowed as any)[k] = req.body[k];
      }

      // Authz: only participants of the call can update it.
      const existing = await storage.getCall(req.params.id);
      if (!existing) return res.status(404).json({ error: 'Call not found' });
      if (existing.callerId !== userId && existing.receiverId !== userId) {
        return res.status(403).json({ error: 'Not authorized for this call' });
      }

      const call = await storage.updateCall(req.params.id, allowed);
      if (!call) return res.status(404).json({ error: 'Call not found' });

      // Phase C.1: same recipient-side redaction we apply on GET — strip
      // callerId from the response when a sealed-call recipient is the
      // one updating the row.
      const isReceiverViewing = call.receiverId === userId;
      const sealed = !!call.sealedCall && isReceiverViewing;
      const sanitized = sealed ? { ...call, callerId: null } : call;
      res.json(sanitized);
    } catch (error) {
      console.error('Error updating call:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.delete('/api/calls/:id', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const deleted = await storage.deleteCall(req.params.id, req.userId!);
      if (!deleted) {
        return res.status(404).json({ error: 'Call not found' });
      }
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting call:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.delete('/api/calls', authenticateToken, async (req: AuthRequest, res) => {
    try {
      await storage.clearCallHistory(req.userId!);
      res.json({ success: true });
    } catch (error) {
      console.error('Error clearing call history:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/video/token', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { callId } = req.body;

      if (!callId) {
        return res.status(400).json({ error: 'Call ID is required' });
      }

      const call = await storage.getCall(callId);
      if (!call) {
        return res.status(404).json({ error: 'Call not found' });
      }

      if (call.callerId !== req.userId && call.receiverId !== req.userId) {
        return res.status(403).json({ error: 'Not authorized for this call' });
      }

      const livekitApiKey = process.env.LIVEKIT_API_KEY;
      const livekitApiSecret = process.env.LIVEKIT_API_SECRET;
      const livekitUrl = process.env.LIVEKIT_URL;

      if (!livekitApiKey || !livekitApiSecret || !livekitUrl) {
        console.error('Missing LiveKit credentials');
        return res.status(503).json({
          error: 'Calling service not configured',
          code: 'LIVEKIT_NOT_CONFIGURED',
        });
      }

      const user = await storage.getUser(req.userId!);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const { AccessToken: LKAccessToken } = await import('livekit-server-sdk');

      const roomName = `call_${callId}`;

      // Phase C.2: Pseudonymize the LiveKit `identity` claim so the SFU,
      // its logs, and the other participant can never tie a room handle
      // back to a phone number, displayName, or userId. We HMAC
      // (callId, userId) with the server secret, base64url-encode the
      // digest, and keep the first 22 chars (~132 bits of entropy —
      // collision-safe well past any plausible call volume). The mapping
      // is stable across reconnects in the same call (so LiveKit
      // dropped-track recovery still works) but rotates per call, and
      // the secret never leaves the server.
      const cryptoMod = await import('node:crypto');
      const pseudoSecret =
        process.env.LIVEKIT_IDENTITY_SECRET ||
        process.env.SESSION_SECRET ||
        livekitApiSecret;
      const identity =
        'p_' +
        cryptoMod
          .createHmac('sha256', pseudoSecret)
          .update(`${callId}:${req.userId!}`)
          .digest('base64url')
          .slice(0, 22);

      const at = new LKAccessToken(livekitApiKey, livekitApiSecret, {
        identity,
        ttl: '1h',
      });

      at.addGrant({
        roomJoin: true,
        room: roomName,
        canPublish: true,
        canSubscribe: true,
      });

      const token = await at.toJwt();

      res.json({
        token,
        identity,
        roomName,
        callId,
        livekitUrl,
      });
    } catch (error) {
      console.error('Error generating call token:', error);
      res.status(500).json({ error: 'Failed to generate call token' });
    }
  });

  // Phase C.3: ephemeral X25519 pubkey exchange for media-frame E2EE.
  // The server is a dumb relay — it stores each side's public half so
  // the other side can fetch it, but never sees the shared secret
  // (which is derived locally from the peer's pubkey + your private
  // scalar, which never leaves the device).
  app.post('/api/calls/:id/e2ee-key', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const userId = req.userId!;
      const callId = req.params.id;
      const { publicKey, signature } = req.body as { publicKey?: string; signature?: string };

      // 32 bytes of base64 is always 44 chars (incl. one '=' pad).
      if (typeof publicKey !== 'string' || publicKey.length < 43 || publicKey.length > 48) {
        return res.status(400).json({ error: 'publicKey (base64, 32 bytes) is required' });
      }
      // Validate base64 + length so we don't store garbage.
      try {
        const decoded = Buffer.from(publicKey, 'base64');
        if (decoded.length !== 32) {
          return res.status(400).json({ error: 'publicKey must decode to 32 bytes' });
        }
      } catch {
        return res.status(400).json({ error: 'publicKey must be base64' });
      }
      // Optional Ed25519 detached signature (64 bytes) over the pubkey
      // above — lets the peer verify it actually came from this device's
      // identity, not a substituted key from a compromised server.
      if (signature !== undefined) {
        try {
          const decodedSig = Buffer.from(signature, 'base64');
          if (decodedSig.length !== 64) {
            return res.status(400).json({ error: 'signature must decode to 64 bytes' });
          }
        } catch {
          return res.status(400).json({ error: 'signature must be base64' });
        }
      }

      const call = await storage.getCall(callId);
      if (!call) return res.status(404).json({ error: 'Call not found' });
      if (call.callerId !== userId && call.receiverId !== userId) {
        return res.status(403).json({ error: 'Not authorized for this call' });
      }

      const isCaller = call.callerId === userId;
      const patch: any = isCaller
        ? { callerE2eePubkey: publicKey, callerE2eeSig: signature ?? null }
        : { receiverE2eePubkey: publicKey, receiverE2eeSig: signature ?? null };
      await storage.updateCall(callId, patch);

      res.json({ ok: true });
    } catch (error) {
      console.error('Error posting call e2ee key:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/calls/:id/e2ee-key', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const userId = req.userId!;
      const callId = req.params.id;

      const call = await storage.getCall(callId);
      if (!call) return res.status(404).json({ error: 'Call not found' });
      if (call.callerId !== userId && call.receiverId !== userId) {
        return res.status(403).json({ error: 'Not authorized for this call' });
      }

      const isCaller = call.callerId === userId;
      // The "peer" pubkey is whichever side this user is NOT.
      const peerPublicKey = isCaller
        ? call.receiverE2eePubkey ?? null
        : call.callerE2eePubkey ?? null;
      const myPublicKey = isCaller
        ? call.callerE2eePubkey ?? null
        : call.receiverE2eePubkey ?? null;
      const peerPublicKeySig = isCaller
        ? call.receiverE2eeSig ?? null
        : call.callerE2eeSig ?? null;

      res.json({ myPublicKey, peerPublicKey, peerPublicKeySig });
    } catch (error) {
      console.error('Error reading call e2ee key:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/contacts/check', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { phoneNumbers } = req.body;
      if (!phoneNumbers || !Array.isArray(phoneNumbers)) {
        return res.status(400).json({ error: 'Phone numbers array required' });
      }

      const normalizedNumbers = phoneNumbers.map((p: string) => p.replace(/\D/g, ''));
      const users = await storage.findUsersByPhoneNumbers(normalizedNumbers, req.userId!);
      
      res.json({ users });
    } catch (error) {
      console.error('Error checking contacts:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/invite/track', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { phoneNumber } = req.body;
      if (!phoneNumber) {
        return res.status(400).json({ error: 'Phone number required' });
      }

      await storage.addPendingContact(req.userId!, phoneNumber);
      res.json({ success: true });
    } catch (error) {
      console.error('Error tracking invite:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.put('/api/user/avatar', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { avatarUrl } = req.body;
      const user = await storage.updateUser(req.userId!, { avatarUrl });
      res.json(user);
    } catch (error) {
      console.error('Error updating avatar:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Server-side avatar upload — single round trip, no signed-URL CORS dance.
  // Client POSTs the raw image bytes with Content-Type: image/<jpeg|png|...>.
  // We upload to GCS, set public ACL, save the URL on the user record, and
  // return the cache-busted URL. Works identically on web/iOS/Android.
  app.post(
    '/api/user/avatar/upload',
    authenticateToken,
    express.raw({ type: 'image/*', limit: '10mb' }),
    async (req: AuthRequest, res) => {
      try {
        const buffer = req.body as Buffer;
        if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
          return res.status(400).json({ error: 'Empty image upload' });
        }

        // Allowlist raster image types only. Reject SVG (XSS via embedded
        // <script>), and anything with extra params we didn't whitelist.
        const rawType = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
        const ALLOWED_IMAGE_TYPES = new Set([
          'image/jpeg',
          'image/png',
          'image/webp',
          'image/heic',
          'image/heif',
          'image/gif',
        ]);
        if (!ALLOWED_IMAGE_TYPES.has(rawType)) {
          return res.status(415).json({
            error: 'Unsupported image type. Allowed: jpeg, png, webp, heic, heif, gif',
          });
        }

        const { ObjectStorageService } = await import('./objectStorage');
        const svc = new ObjectStorageService();
        const objectPath = await svc.uploadBuffer(buffer, rawType, req.userId!);

        // Build URL from a trusted source — NEVER from request headers
        // (Host/X-Forwarded-Proto can be spoofed and would persist a
        // poisoned URL on the user record). EXPO_PUBLIC_DOMAIN is the
        // canonical origin baked into the app; fall back to a relative
        // path which the client resolves via its own getApiUrl().
        const canonicalOrigin = process.env.EXPO_PUBLIC_DOMAIN
          ? (process.env.EXPO_PUBLIC_DOMAIN.startsWith('http')
              ? process.env.EXPO_PUBLIC_DOMAIN
              : `https://${process.env.EXPO_PUBLIC_DOMAIN}`)
          : '';
        const cacheBust = `?v=${Date.now()}`;
        const avatarUrl = canonicalOrigin
          ? `${canonicalOrigin}${objectPath}${cacheBust}`
          : `${objectPath}${cacheBust}`;

        const user = await storage.updateUser(req.userId!, { avatarUrl });
        res.json({ avatarUrl, user });
      } catch (error: any) {
        console.error('Error uploading avatar:', error);
        res.status(500).json({ error: error?.message || 'Failed to upload avatar' });
      }
    },
  );

  app.get('/api/user/chat-background', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const user = await storage.getUser(req.userId!);
      res.json({ chatBackgroundUrl: user?.chatBackgroundUrl || null });
    } catch (error) {
      console.error('Error getting chat background:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.put('/api/user/chat-background', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const user = await storage.getUser(req.userId!);
      if (!user?.isVip) {
        return res.status(403).json({ error: 'VIP subscription required for custom chat backgrounds' });
      }

      const { chatBackgroundUrl } = req.body;
      const updatedUser = await storage.updateUser(req.userId!, { chatBackgroundUrl });
      res.json({ chatBackgroundUrl: updatedUser?.chatBackgroundUrl || null });
    } catch (error) {
      console.error('Error updating chat background:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.delete('/api/user/chat-background', authenticateToken, async (req: AuthRequest, res) => {
    try {
      await storage.updateUser(req.userId!, { chatBackgroundUrl: null });
      res.json({ success: true });
    } catch (error) {
      console.error('Error removing chat background:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/locker', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const user = await storage.getUser(req.userId!);
      if (!user?.isVip) {
        return res.status(403).json({ error: 'VIP subscription required' });
      }

      const items = await storage.getHiddenLockerItems(req.userId!);
      res.json(items);
    } catch (error) {
      console.error('Error getting locker items:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Validates a base64 string against an expected byte length range.  Used
  // for the destructive ciphertext/nonce paths so a malformed POST can't
  // null out plaintext columns before encryption has actually happened.
  const isValidB64 = (s: unknown, minBytes: number, maxBytes: number): s is string => {
    if (typeof s !== 'string' || s.length === 0 || s.length > 1_000_000) return false;
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(s)) return false;
    try {
      const len = Buffer.from(s, 'base64').length;
      return len >= minBytes && len <= maxBytes;
    } catch { return false; }
  };

  app.post('/api/locker', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const user = await storage.getUser(req.userId!);
      if (!user?.isVip) {
        return res.status(403).json({ error: 'VIP subscription required' });
      }
      // Encryption-only: client must send a tweetnacl secretbox blob
      // (≥17 bytes: 16-byte Poly1305 tag + ≥1 byte ciphertext) and a
      // 24-byte XSalsa20 nonce.  No plaintext path.
      const { ciphertext, nonce, type, messageId } = req.body ?? {};
      if (!isValidB64(ciphertext, 17, 2_000_000)) {
        return res.status(400).json({ error: 'ciphertext (base64) required' });
      }
      if (!isValidB64(nonce, 24, 24)) {
        return res.status(400).json({ error: 'nonce must be exactly 24 bytes (base64)' });
      }
      const item = await storage.addToLocker(req.userId!, {
        ciphertext, nonce,
        type: typeof type === 'string' ? type : 'message',
        messageId: typeof messageId === 'string' ? messageId : null,
      } as any);
      res.json(item);
    } catch (error) {
      console.error('Error adding to locker:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.delete('/api/locker/reset', authenticateToken, async (req: AuthRequest, res) => {
    try {
      await storage.resetLocker(req.userId!);
      res.json({ success: true });
    } catch (error) {
      console.error('Error resetting locker:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.delete('/api/locker/:id', authenticateToken, async (req: AuthRequest, res) => {
    try {
      await storage.removeFromLocker(req.params.id, req.userId!);
      res.json({ success: true });
    } catch (error) {
      console.error('Error removing from locker:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Minimum strength: 6 digits OR 6+ char alphanumeric.  Old 4-digit users
  // are forced through a one-time upgrade flow on next change.
  const isStrongLockerPin = (pin: unknown): pin is string =>
    typeof pin === 'string' && pin.length >= 6 && pin.length <= 128;

  app.post('/api/locker/pin', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const user = await storage.getUser(req.userId!);
      if (!user?.isVip) {
        return res.status(403).json({ error: 'VIP subscription required' });
      }
      // Closes the PIN-reset bypass: if a PIN already exists, force the
      // caller through /change-pin (which requires the current PIN and is
      // covered by the lockout ladder).  /api/locker/pin is INITIAL setup
      // only.
      if (user.lockerPin) {
        return res.status(409).json({ error: 'PIN already configured — use /api/locker/change-pin' });
      }
      const { pin, salt } = req.body;
      if (!isStrongLockerPin(pin)) {
        return res.status(400).json({ error: 'PIN must be at least 6 characters' });
      }
      if (typeof salt !== 'string' || salt.length < 16) {
        return res.status(400).json({ error: 'Client-generated salt required' });
      }
      const hashedPin = await bcrypt.hash(pin, 10);
      await storage.setLockerPin(req.userId!, hashedPin, salt);
      res.json({ success: true });
    } catch (error) {
      console.error('Error setting locker pin:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/locker/has-pin', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const user = await storage.getUser(req.userId!);
      res.json({
        hasPin: !!user?.lockerPin,
        hasSalt: !!user?.lockerSalt,
      });
    } catch (error) {
      console.error('Error checking pin:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/locker/verify-pin', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const user = await storage.getUser(req.userId!);
      if (!user?.lockerPin) {
        return res.json({ valid: false, hasPin: false });
      }
      // Lockout gate: if locker_locked_until is in the future, refuse even
      // before checking the PIN, so an attacker can't tell whether the PIN
      // would have been correct.
      const lockState = await storage.getLockerLockoutState(req.userId!);
      if (lockState.lockedUntil && lockState.lockedUntil.getTime() > Date.now()) {
        return res.status(429).json({
          valid: false,
          hasPin: true,
          lockedUntil: lockState.lockedUntil.toISOString(),
          error: 'Locker is temporarily locked due to failed attempts',
        });
      }
      const { pin } = req.body;
      if (!pin) {
        return res.json({ valid: false, hasPin: true });
      }
      const valid = await bcrypt.compare(pin, user.lockerPin);
      if (!valid) {
        const bump = await storage.bumpLockerFailedAttempts(req.userId!);
        // 20 fails → wipe the locker entirely.  The data is unrecoverable
        // anyway because we don't have the key; wiping the rows just hides
        // the ciphertext from a future correct-PIN guess.
        if (bump.attempts >= 20) {
          await storage.resetLocker(req.userId!);
          return res.status(429).json({
            valid: false,
            hasPin: false,
            wiped: true,
            error: 'Too many failed attempts. Locker contents have been wiped.',
          });
        }
        return res.status(401).json({
          valid: false,
          hasPin: true,
          attempts: bump.attempts,
          lockedUntil: bump.lockedUntil?.toISOString() ?? null,
        });
      }
      await storage.resetLockerFailedAttempts(req.userId!);
      // Hand back the salt so the client can derive the master key.
      res.json({ valid: true, hasPin: true, salt: user.lockerSalt });
    } catch (error) {
      console.error('Error verifying pin:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/locker/change-pin', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { currentPin, newPin, salt } = req.body;
      if (!isStrongLockerPin(newPin)) {
        return res.status(400).json({ error: 'New PIN must be at least 6 characters' });
      }
      if (typeof salt !== 'string' || salt.length < 16) {
        return res.status(400).json({ error: 'Client-generated salt required' });
      }
      const user = await storage.getUser(req.userId!);
      if (!user?.lockerPin) {
        return res.status(400).json({ error: 'No PIN is currently configured' });
      }
      // Honor the lockout window — same gate as verify-pin so an attacker
      // can't dodge it by hammering change-pin instead.
      const lockState = await storage.getLockerLockoutState(req.userId!);
      if (lockState.lockedUntil && lockState.lockedUntil.getTime() > Date.now()) {
        return res.status(429).json({
          error: 'Locker is temporarily locked due to failed attempts',
          lockedUntil: lockState.lockedUntil.toISOString(),
        });
      }
      const valid = await bcrypt.compare(currentPin, user.lockerPin);
      if (!valid) {
        // Counter wrong-PIN attempts on change-pin too, so it can't be
        // used as an unmonitored brute-force oracle.
        const bump = await storage.bumpLockerFailedAttempts(req.userId!);
        if (bump.attempts >= 20) {
          await storage.resetLocker(req.userId!);
          return res.status(429).json({
            error: 'Too many failed attempts. Locker contents have been wiped.',
            wiped: true,
          });
        }
        return res.status(401).json({
          error: 'Current PIN is incorrect',
          attempts: bump.attempts,
          lockedUntil: bump.lockedUntil?.toISOString() ?? null,
        });
      }
      await storage.resetLockerFailedAttempts(req.userId!);
      // NOTE: changing PIN also rotates the salt.  The client is responsible
      // for re-encrypting all v2 items under the new key before/just after
      // calling this endpoint — until they do, decrypts will fail and the
      // user must re-migrate.  Locker is "all encrypted under one key", so a
      // rotation IS effectively a full re-encrypt.
      const hashedPin = await bcrypt.hash(newPin, 10);
      await storage.setLockerPin(req.userId!, hashedPin, salt);
      res.json({ success: true });
    } catch (error) {
      console.error('Error changing locker PIN:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ─── Locked Chats (build 133) ────────────────────────────────────────────
  // A separate PIN from Hidden Locker's — no VIP gate, no salt/derive-key
  // step, since it only controls whether individually-locked conversations
  // are visible, not an encrypted vault.
  app.get('/api/chat-lock/has-pin', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const user = await storage.getUser(req.userId!);
      res.json({ hasPin: !!user?.chatLockPinHash });
    } catch (error) {
      console.error('Error checking chat-lock pin:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/chat-lock/pin', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const user = await storage.getUser(req.userId!);
      if (user?.chatLockPinHash) {
        return res.status(409).json({ error: 'PIN already configured — use /api/chat-lock/change-pin' });
      }
      const { pin } = req.body ?? {};
      if (typeof pin !== 'string' || pin.length < 4) {
        return res.status(400).json({ error: 'PIN must be at least 4 characters' });
      }
      const hashedPin = await bcrypt.hash(pin, 10);
      await storage.setChatLockPin(req.userId!, hashedPin);
      res.json({ success: true });
    } catch (error) {
      console.error('Error setting chat-lock pin:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/chat-lock/verify-pin', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const user = await storage.getUser(req.userId!);
      if (!user?.chatLockPinHash) {
        return res.json({ valid: false, hasPin: false });
      }
      const lockState = await storage.getChatLockLockoutState(req.userId!);
      if (lockState.lockedUntil && lockState.lockedUntil.getTime() > Date.now()) {
        return res.status(429).json({
          valid: false,
          hasPin: true,
          lockedUntil: lockState.lockedUntil.toISOString(),
          error: 'Locked Chats is temporarily locked due to failed attempts',
        });
      }
      const { pin } = req.body ?? {};
      if (!pin) {
        return res.json({ valid: false, hasPin: true });
      }
      const valid = await bcrypt.compare(pin, user.chatLockPinHash);
      if (!valid) {
        const bump = await storage.bumpChatLockFailedAttempts(req.userId!);
        return res.status(401).json({
          valid: false,
          hasPin: true,
          attempts: bump.attempts,
          lockedUntil: bump.lockedUntil?.toISOString() ?? null,
        });
      }
      await storage.resetChatLockFailedAttempts(req.userId!);
      res.json({ valid: true, hasPin: true });
    } catch (error) {
      console.error('Error verifying chat-lock pin:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/chat-lock/change-pin', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { currentPin, newPin } = req.body ?? {};
      if (typeof newPin !== 'string' || newPin.length < 4) {
        return res.status(400).json({ error: 'New PIN must be at least 4 characters' });
      }
      const user = await storage.getUser(req.userId!);
      if (!user?.chatLockPinHash) {
        return res.status(400).json({ error: 'No PIN is currently configured' });
      }
      const lockState = await storage.getChatLockLockoutState(req.userId!);
      if (lockState.lockedUntil && lockState.lockedUntil.getTime() > Date.now()) {
        return res.status(429).json({
          error: 'Locked Chats is temporarily locked due to failed attempts',
          lockedUntil: lockState.lockedUntil.toISOString(),
        });
      }
      const valid = await bcrypt.compare(currentPin, user.chatLockPinHash);
      if (!valid) {
        const bump = await storage.bumpChatLockFailedAttempts(req.userId!);
        return res.status(401).json({
          error: 'Current PIN is incorrect',
          attempts: bump.attempts,
          lockedUntil: bump.lockedUntil?.toISOString() ?? null,
        });
      }
      await storage.resetChatLockFailedAttempts(req.userId!);
      const hashedPin = await bcrypt.hash(newPin, 10);
      await storage.setChatLockPin(req.userId!, hashedPin);
      res.json({ success: true });
    } catch (error) {
      console.error('Error changing chat-lock pin:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/conversations/:conversationId/lock', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { conversationId } = req.params;
      await storage.lockConversation(conversationId, req.userId!, true);
      res.json({ success: true });
    } catch (error) {
      console.error('Error locking conversation:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/conversations/:conversationId/unlock', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { conversationId } = req.params;
      await storage.lockConversation(conversationId, req.userId!, false);
      res.json({ success: true });
    } catch (error) {
      console.error('Error unlocking conversation:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Re-encrypt a legacy plaintext item under the user's master key.  Client
  // sends ciphertext+nonce, server atomically swaps the plaintext columns to
  // null.  Bounded by the same VIP + ownership check as add.
  app.post('/api/locker/:id/migrate', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const user = await storage.getUser(req.userId!);
      if (!user?.isVip) {
        return res.status(403).json({ error: 'VIP subscription required' });
      }
      const { ciphertext, nonce } = req.body ?? {};
      if (!isValidB64(ciphertext, 17, 2_000_000)) {
        return res.status(400).json({ error: 'ciphertext (base64) required' });
      }
      if (!isValidB64(nonce, 24, 24)) {
        return res.status(400).json({ error: 'nonce must be exactly 24 bytes (base64)' });
      }
      const updated = await storage.migrateLockerItemToV2(
        req.params.id,
        req.userId!,
        ciphertext,
        nonce,
      );
      if (!updated) return res.status(404).json({ error: 'Item not found' });
      res.json(updated);
    } catch (error) {
      console.error('Error migrating locker item:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ===== Virtual Phone Numbers (VIP Feature) =====

  // Get user's virtual number status
  app.get('/api/virtual-number', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const user = await storage.getUser(req.userId!);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const virtualNumber = user.virtualNumberId 
        ? await storage.getVirtualNumber(user.virtualNumberId)
        : null;

      res.json({
        hasVirtualNumber: !!virtualNumber,
        virtualNumber: virtualNumber ? {
          phoneNumber: virtualNumber.phoneNumber,
          countryCode: virtualNumber.countryCode,
          capabilities: virtualNumber.capabilities,
          status: virtualNumber.status,
        } : null,
        preferredNumberType: user.preferredNumberType || 'personal',
        isVip: user.isVip,
      });
    } catch (error) {
      console.error('Error getting virtual number:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Search available numbers to purchase (VIP only)
  app.get('/api/virtual-number/available', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const user = await storage.getUser(req.userId!);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const countryCode = (req.query.country as string) || 'US';
      const areaCode = req.query.areaCode as string | undefined;

      const result = await searchAvailableNumbers(countryCode, areaCode);
      
      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      res.json({ numbers: result.numbers });
    } catch (error) {
      console.error('Error searching available numbers:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Provision (purchase) a virtual number (available to all users)
  app.post('/api/virtual-number/provision', authenticateToken, async (req: AuthRequest, res) => {
    try {
      console.log('Virtual number provision request:', req.body);
      
      const user = await storage.getUser(req.userId!);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      console.log('User requesting virtual number:', user.id);

      // Check if user already has a virtual number.
      // Build 63, Phase 3: at provision time the new row does not exist yet,
      // so `ownsVirtualNumber` is not applicable here. The relevant invariant
      // is "user does not already own an active number" — enforced by the
      // back-pointer check below. The explicit `ownsVirtualNumber` helper is
      // used by routes that operate on an existing row (delete, send-sealed).
      if (user.virtualNumberId) {
        const alreadyOwnsActive = await storage.ownsVirtualNumber(user.id, user.virtualNumberId);
        if (alreadyOwnsActive) {
          return res.status(400).json({ error: 'You already have a Pryvo number. Release it first to get a new one.' });
        }
        // Stale back-pointer (number was released out-of-band) — clear it.
        await storage.updateUser(user.id, { virtualNumberId: null });
      }

      const { phoneNumber, countryCode } = req.body;
      if (!phoneNumber || !countryCode) {
        return res.status(400).json({ error: 'Phone number and country code are required' });
      }

      // Get webhook base URL from trusted sources only
      // Priority: PUBLIC_API_URL env var > validated request headers
      let webhookBaseUrl: string | undefined;
      
      // First, try explicit PUBLIC_API_URL environment variable (most secure)
      if (process.env.PUBLIC_API_URL) {
        webhookBaseUrl = process.env.PUBLIC_API_URL;
      } else {
        // Fall back to request headers with domain validation
        const forwardedHost = req.headers['x-forwarded-host'] as string;
        const host = req.headers.host as string;
        const hostToUse = forwardedHost || host;
        
        // Whitelist of allowed domains for webhooks
        const allowedDomains = [
          'pryvoapp.com',
          'www.pryvoapp.com',
          'pryvomessenger.com',
          'www.pryvomessenger.com',
          'secureconnectchat.com',
          'www.secureconnectchat.com',
          /\.replit\.dev$/,  // Replit development domains
          /\.replit\.app$/,  // Replit deployment domains
          /\.riker\.replit\.dev$/,  // Replit internal domains
        ];
        
        const isAllowed = allowedDomains.some(pattern => {
          if (typeof pattern === 'string') {
            return hostToUse === pattern;
          }
          return pattern.test(hostToUse);
        });
        
        if (!isAllowed) {
          console.error('Invalid host for webhook URL:', hostToUse);
          return res.status(400).json({ error: 'Invalid request origin. Please try again.' });
        }
        
        const protocol = req.headers['x-forwarded-proto'] as string || 'https';
        webhookBaseUrl = `${protocol}://${hostToUse}`;
      }
      
      if (!webhookBaseUrl) {
        console.error('No valid webhook base URL found');
        return res.status(500).json({ error: 'Server configuration error. Please try again.' });
      }
      
      console.log('Attempting to provision number:', phoneNumber, 'country:', countryCode, 'webhook:', webhookBaseUrl);

      // VN Recycling: before going to Twilio for a fresh number, try to
      // reassign a quarantine-expired number from our own pool. This is the
      // "30-day cooldown then recycle" half of the policy. The reassign call
      // is race-safe (status='released' + recyclableAt<=now in the WHERE
      // clause) — if a concurrent provision claimed it, we fall through to
      // Twilio. Country must match so a US-released number is never handed
      // to a UK user.
      let virtualNumber: Awaited<ReturnType<typeof storage.createVirtualNumber>> | null = null;
      const recyclable = await storage.getRecyclableNumber(countryCode, user.id);
      if (recyclable) {
        const reassigned = await storage.reassignVirtualNumber(recyclable.id, user.id);
        if (reassigned) {
          console.log('Recycled VN from pool:', reassigned.phoneNumber, '(was quarantined since', recyclable.releasedAt, ')');
          virtualNumber = reassigned;
        }
      }

      if (!virtualNumber) {
        // Pool empty (or lost a race) — provision a fresh number through Twilio.
        const result = await provisionPhoneNumber(phoneNumber, `Pryvo-${user.id.slice(0, 8)}`, webhookBaseUrl);
        console.log('Provision result:', result.success ? 'success' : 'failed', result.error || '');
        if (!result.success || !result.number) {
          return res.status(400).json({ error: result.error || 'Failed to get your Pryvo number. Please try again.' });
        }
        virtualNumber = await storage.createVirtualNumber({
          phoneNumber: result.number.phoneNumber,
          countryCode,
          twilioSid: result.number.sid,
          capabilities: result.number.capabilities,
          assignedUserId: user.id,
        });
      }

      // Update user with virtual number reference
      await storage.updateUser(user.id, { 
        virtualNumberId: virtualNumber.id,
        preferredNumberType: 'app', // Auto-switch to app number
      });

      res.json({
        success: true,
        virtualNumber: {
          phoneNumber: virtualNumber.phoneNumber,
          countryCode: virtualNumber.countryCode,
          capabilities: virtualNumber.capabilities,
        },
      });
    } catch (error) {
      console.error('Error provisioning virtual number:', error);
      res.status(500).json({ error: 'Failed to get your Pryvo number. Please try again.' });
    }
  });

  // Release (give up) a virtual number
  app.delete('/api/virtual-number', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const user = await storage.getUser(req.userId!);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      if (!user.virtualNumberId) {
        return res.status(400).json({ error: 'You do not have a Pryvo number to release' });
      }

      // Build 63, Phase 3: explicit ownership check via storage helper.
      // Even though `user.virtualNumberId` is the user's own back-pointer,
      // we route through `ownsVirtualNumber` so this surface uses the same
      // helper as the new send-sealed route — one consistent authz pattern.
      const owns = await storage.ownsVirtualNumber(user.id, user.virtualNumberId);
      if (!owns) {
        return res.status(403).json({ error: 'You do not own this Pryvo number, or it is not active.' });
      }

      const virtualNumber = await storage.getVirtualNumber(user.virtualNumberId);
      if (!virtualNumber) {
        return res.status(404).json({ error: 'Virtual number not found' });
      }

      // VN Recycling (30-day quarantine): do NOT call Twilio's
      // releasePhoneNumber here. We keep the number in our Twilio account
      // for 30 days so stale SMS / 2FA codes addressed to that E.164 land
      // in our (now-unassigned) row and get dropped by the inbound webhook
      // — instead of being delivered to whoever next claims this number
      // from Twilio's global pool. `storage.releaseVirtualNumber` sets
      // status='released', clears assignedUserId, and stamps recyclableAt
      // = now + 30d. A future /provision call (same country) will recycle
      // the row via `reassignVirtualNumber` after the 30d window passes.
      await storage.releaseVirtualNumber(virtualNumber.id, user.id);
      await storage.updateUser(user.id, {
        virtualNumberId: null,
        preferredNumberType: 'personal',
      });

      // Disposable numbers: the number itself is burned (30-day Twilio
      // quarantine, see above), but the conversation AND its message
      // history now stay intact — disposing only retires the phone number,
      // it doesn't erase what was said through it. Provisioning a new
      // number later reuses this same 'virtual' conversation with the same
      // contact, so history carries forward continuously across numbers.

      res.json({ success: true });
    } catch (error) {
      console.error('Error releasing virtual number:', error);
      res.status(500).json({ error: 'Failed to release your Pryvo number' });
    }
  });

  // Update number preference (personal vs app)
  app.put('/api/virtual-number/preference', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const user = await storage.getUser(req.userId!);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const { preferredNumberType } = req.body;
      console.log('[VIRTUAL] User', user.id, 'updating preference to:', preferredNumberType);
      
      if (!preferredNumberType || !['personal', 'app'].includes(preferredNumberType)) {
        return res.status(400).json({ error: 'Invalid preference. Use "personal" or "app".' });
      }

      // Can only use app number if they have one
      if (preferredNumberType === 'app' && !user.virtualNumberId) {
        return res.status(400).json({ error: 'You need a Pryvo number to use this option' });
      }

      await storage.updateUser(user.id, { preferredNumberType });
      console.log('[VIRTUAL] User', user.id, 'preference updated successfully to:', preferredNumberType);

      res.json({ success: true, preferredNumberType });
    } catch (error) {
      console.error('Error updating number preference:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/stripe/publishable-key', async (req, res) => {
    try {
      const publishableKey = await getStripePublishableKey();
      res.json({ publishableKey });
    } catch (error) {
      console.error('Error getting Stripe key:', error);
      res.status(500).json({ error: 'Stripe not configured' });
    }
  });

  app.post('/api/stripe/checkout', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const user = await storage.getUser(req.userId!);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const stripe = await getUncachableStripeClient();
      
      let customerId = user.stripeCustomerId;
      if (!customerId) {
        const customer = await stripe.customers.create({
          phone: user.phoneNumber,
          metadata: { userId: user.id },
        });
        customerId = customer.id;
        await storage.updateUser(user.id, { stripeCustomerId: customerId });
      }

      const baseUrl = getAppBaseUrl();
      
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'SecureChat VIP',
              description: 'Unlock Hidden Locker, Priority Support, and Exclusive Features',
            },
            unit_amount: 499,
            recurring: { interval: 'month' },
          },
          quantity: 1,
        }],
        mode: 'subscription',
        success_url: `${baseUrl}/vip-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/vip-cancel`,
      });

      res.json({ url: session.url });
    } catch (error) {
      console.error('Error creating checkout:', error);
      res.status(500).json({ error: 'Failed to create checkout session' });
    }
  });

  app.post('/api/stripe/checkout/remove-ads', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const user = await storage.getUser(req.userId!);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      if (user.isAdFree) {
        return res.status(400).json({ error: 'You already have ad-free access' });
      }

      const stripe = await getUncachableStripeClient();
      
      let customerId = user.stripeCustomerId;
      if (!customerId) {
        const customer = await stripe.customers.create({
          phone: user.phoneNumber,
          metadata: { userId: user.id },
        });
        customerId = customer.id;
        await storage.updateUser(user.id, { stripeCustomerId: customerId });
      }

      const baseUrl = getAppBaseUrl();
      
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'aud',
            product_data: {
              name: 'Remove Ads Forever',
              description: 'Lifetime ad-free experience in Pryvo',
            },
            unit_amount: 2999,
          },
          quantity: 1,
        }],
        mode: 'payment',
        metadata: {
          userId: user.id,
          purchaseType: 'ad_removal',
          productId: 'prod_TcFdeE3YbLninV',
        },
        success_url: `${baseUrl}/ad-removal-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/ad-removal-cancel`,
      });

      res.json({ url: session.url });
    } catch (error) {
      console.error('Error creating ad removal checkout:', error);
      res.status(500).json({ error: 'Failed to create checkout session' });
    }
  });

  app.post('/api/stripe/webhook/ad-removal', async (req, res) => {
    try {
      const stripe = await getUncachableStripeClient();
      const sig = req.headers['stripe-signature'] as string;
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
      
      if (!webhookSecret) {
        console.log('No webhook secret configured');
        return res.status(400).json({ error: 'Webhook not configured' });
      }
      
      let event;
      try {
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
      } catch (err: any) {
        console.error('Webhook signature verification failed:', err.message);
        return res.status(400).json({ error: 'Invalid signature' });
      }

      if (event.type === 'checkout.session.completed') {
        const session = event.data.object as any;
        if (session.metadata?.purchaseType === 'ad_removal') {
          const userId = session.metadata.userId;
          await storage.updateUser(userId, { 
            isAdFree: true, 
            adRemovalPurchasedAt: new Date() 
          });
          console.log(`User ${userId} purchased ad removal`);
        }
      }

      res.json({ received: true });
    } catch (error) {
      console.error('Webhook error:', error);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  });

  // Apple In-App Purchase receipt verification
  // Known valid product IDs (must match App Store Connect)
  const VALID_PRODUCT_IDS = new Set([
    'pryvo.removeads.2025',
    'pryvo.vip.monthly.2025',
  ]);
  
  // Helper to verify receipt with Apple's servers
  async function verifyAppleReceipt(receiptData: string, useSandbox: boolean = false): Promise<any> {
    const url = useSandbox 
      ? 'https://sandbox.itunes.apple.com/verifyReceipt'
      : 'https://buy.itunes.apple.com/verifyReceipt';
    
    const sharedSecret = process.env.APPLE_SHARED_SECRET;
    
    const payload: any = {
      'receipt-data': receiptData,
      'exclude-old-transactions': true,
    };
    
    if (sharedSecret) {
      payload['password'] = sharedSecret;
    }
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    
    return response.json();
  }
  
  // Helper to extract product IDs from Apple receipt response
  function extractPurchasedProducts(receiptResponse: any): Set<string> {
    const products = new Set<string>();
    
    // Check in_app array (for non-consumables and non-renewing subscriptions)
    if (receiptResponse.receipt?.in_app) {
      for (const purchase of receiptResponse.receipt.in_app) {
        if (purchase.product_id) {
          products.add(purchase.product_id);
        }
      }
    }
    
    // Check latest_receipt_info (for auto-renewable subscriptions)
    if (receiptResponse.latest_receipt_info) {
      for (const purchase of receiptResponse.latest_receipt_info) {
        if (purchase.product_id) {
          // Check if subscription is still active
          const expiresDate = purchase.expires_date_ms ? parseInt(purchase.expires_date_ms) : null;
          if (!expiresDate || expiresDate > Date.now()) {
            products.add(purchase.product_id);
          }
        }
      }
    }
    
    return products;
  }
  
  app.post('/api/iap/verify', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { receipt, platform, productId } = req.body;
      
      if (!receipt) {
        return res.status(400).json({ error: 'Receipt is required' });
      }
      
      // Validate productId is in our known list
      if (!productId || !VALID_PRODUCT_IDS.has(productId)) {
        console.log(`[IAP] Invalid product ID: ${productId}`);
        return res.status(400).json({ error: 'Invalid product ID' });
      }

      const user = await storage.getUser(req.userId!);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      console.log(`[IAP] Verifying ${platform} receipt for user ${user.id}, product: ${productId}`);
      
      // Verify receipt with Apple's servers
      let receiptResponse = await verifyAppleReceipt(receipt, false);
      
      // Status 21007 means it's a sandbox receipt - retry with sandbox
      if (receiptResponse.status === 21007) {
        console.log('[IAP] Production receipt failed, trying sandbox...');
        receiptResponse = await verifyAppleReceipt(receipt, true);
      }
      
      // Check for valid receipt status
      // Status 0 = valid, other statuses indicate issues
      if (receiptResponse.status !== 0) {
        console.log(`[IAP] Apple receipt verification failed with status: ${receiptResponse.status}`);
        return res.status(400).json({ 
          error: 'Receipt verification failed',
          status: receiptResponse.status 
        });
      }
      
      // Extract purchased products from the verified receipt
      const purchasedProducts = extractPurchasedProducts(receiptResponse);
      console.log(`[IAP] Verified products in receipt:`, Array.from(purchasedProducts));
      
      // Check if the claimed product is actually in the receipt
      if (!purchasedProducts.has(productId)) {
        console.log(`[IAP] Product ${productId} not found in receipt`);
        return res.status(400).json({ error: 'Product not found in receipt' });
      }
      
      // Handle different product types - only grant privileges for verified purchases
      if (productId === 'pryvo.removeads.2025') {
        await storage.updateUser(user.id, {
          isAdFree: true,
          adRemovalPurchasedAt: new Date(),
        });
        console.log(`[IAP] User ${user.id} purchased ad removal via Apple IAP (verified)`);
      } else if (productId === 'pryvo.vip.monthly.2025') {
        await storage.updateUser(user.id, {
          isVip: true,
          vipStartedAt: new Date(),
        });
        console.log(`[IAP] User ${user.id} subscribed to VIP via Apple IAP (verified)`);
      }

      res.json({ success: true, verified: true });
    } catch (error) {
      console.error('[IAP] Verification error:', error);
      res.status(500).json({ error: 'Receipt verification failed' });
    }
  });

  // Apple In-App Purchase restore check
  app.get('/api/iap/restore-status', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const user = await storage.getUser(req.userId!);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json({
        isAdFree: user.isAdFree || false,
        isVip: user.isVip || false,
        adRemovalPurchasedAt: user.adRemovalPurchasedAt,
        vipStartedAt: user.vipStartedAt,
      });
    } catch (error) {
      console.error('[IAP] Restore status error:', error);
      res.status(500).json({ error: 'Failed to get restore status' });
    }
  });

  app.get('/api/stripe/subscription-status', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const user = await storage.getUser(req.userId!);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      if (!user.stripeSubscriptionId) {
        return res.json({ isVip: false, subscription: null });
      }

      const stripe = await getUncachableStripeClient();
      const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);

      const isActive = subscription.status === 'active' || subscription.status === 'trialing';
      
      if (isActive !== user.isVip) {
        const updateData: any = { isVip: isActive };
        // Set/reset vipStartedAt when user becomes VIP (new or reactivated subscription)
        if (isActive) {
          updateData.vipStartedAt = new Date();
        }
        await storage.updateUser(user.id, updateData);
      }

      res.json({
        isVip: isActive,
        subscription: {
          status: subscription.status,
          currentPeriodEnd: (subscription as any).current_period_end,
        },
      });
    } catch (error) {
      console.error('Error getting subscription:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/objects/upload', authenticateToken, async (req: AuthRequest, res) => {
    try {
      console.log('Getting upload URL for user:', req.userId);
      const objectStorageService = new ObjectStorageService();
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      console.log('Upload URL generated successfully');
      res.json({ uploadURL });
    } catch (error: any) {
      console.error('Error getting upload URL:', error?.message || error);
      res.status(500).json({ error: error?.message || 'Failed to get upload URL' });
    }
  });

  app.put('/api/objects/media', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { mediaURL } = req.body;
      if (!mediaURL) {
        return res.status(400).json({ error: 'mediaURL is required' });
      }

      const objectStorageService = new ObjectStorageService();
      const objectPath = await objectStorageService.trySetObjectEntityAclPolicy(
        mediaURL,
        {
          owner: req.userId!,
          visibility: "public",
        },
      );

      res.json({ objectPath });
    } catch (error) {
      console.error('Error setting media ACL:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Bare "*" (not "*objectPath") — this project is on Express 4, whose
  // bundled path-to-regexp@0.1.x has no concept of a NAMED wildcard segment.
  // It parses "*objectPath" as an unnamed wildcard capture immediately
  // followed by the LITERAL string "objectPath", so the compiled regex only
  // matches a URL that literally ends in the word "objectPath" — i.e.
  // effectively never. That silently 404'd every request through this route
  // (Express's own catch-all "Cannot GET" page, not this handler's 404s)
  // regardless of what object actually existed. The handler already reads
  // the path from req.path rather than a named param, so switching to the
  // bare wildcard needs no other changes.
  app.get("/objects/*", async (req, res) => {
    const objectStorageService = new ObjectStorageService();
    try {
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      objectStorageService.downloadObject(objectFile, res, 3600, req.headers.range);
    } catch (error) {
      console.error("Error serving object:", error);
      if (error instanceof ObjectNotFoundError) {
        return res.sendStatus(404);
      }
      return res.sendStatus(500);
    }
  });

  // ─── Phase 2 build 62 — encrypted media fetch ─────────────────────────────
  //
  // GET /api/media/encrypted/<objectPath...> serves the SAME ciphertext blobs
  // as the public /objects/* route, but adds three layers of defense in depth
  // on top of the cryptographic guarantee:
  //
  //   1. Requires a valid Bearer token (authenticateToken).
  //   2. Per-user rate limit (encryptedMediaRateLimit) — caps download
  //      requests at 600/min/user. A leaked envelope URL still can't be
  //      hammered into a bandwidth-amplification attack.
  //   3. Authorization is intentionally trust-by-claim: the CIPHERTEXT is
  //      opaque without the 32-byte mediaKey, which is only delivered inside
  //      the E2EE-encrypted message body. We do NOT try to enforce
  //      per-conversation membership here because doing so would require
  //      the server to track which objectPath belongs to which message —
  //      leaking exactly the metadata E2EE is meant to hide. The crypto IS
  //      the access control.
  //
  // The OLD public /objects/*objectPath route stays alive until the
  // 60-day legacy sunset (see docs/e2ee/phase-2-media.md §11) so build-60
  // clients that send plaintext media keep working during cutover.
  const ENC_PATH_PREFIX = "/api/media/encrypted";
  // Same Express-4/path-to-regexp@0.1.x bare-"*" fix as the /objects/* route
  // above — "*objectPath" was matching nothing in production, meaning every
  // encrypted chat photo/video/voice-message and every encrypted Story had
  // been silently un-fetchable. Handler reads req.path, unaffected.
  app.get(
    `${ENC_PATH_PREFIX}/*`,
    authenticateToken,
    encryptedMediaRateLimit,
    async (req: AuthRequest, res) => {
      try {
        // req.path = "/api/media/encrypted/objects/uploads/<uuid>"
        // Strip the API prefix to leave "/objects/uploads/<uuid>", which is
        // what getObjectEntityFile expects.
        const innerPath = req.path.slice(ENC_PATH_PREFIX.length);
        if (!innerPath.startsWith("/objects/")) {
          return res.status(400).json({ error: "Invalid object path" });
        }
        const objectStorageService = new ObjectStorageService();
        const objectFile = await objectStorageService.getObjectEntityFile(innerPath);
        return objectStorageService.downloadObject(objectFile, res, 3600, req.headers.range);
      } catch (error) {
        if (error instanceof ObjectNotFoundError) {
          return res.sendStatus(404);
        }
        console.error("Error serving encrypted object:", error);
        return res.sendStatus(500);
      }
    },
  );

  // Same Express-4 bare-"*" fix as the two routes above.
  app.get("/public-objects/*", async (req, res) => {
    // Extract filePath from the URL path after /public-objects/
    const filePath = req.path.replace('/public-objects/', '');
    const objectStorageService = new ObjectStorageService();
    try {
      const file = await objectStorageService.searchPublicObject(filePath);
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }
      objectStorageService.downloadObject(file, res, 3600, req.headers.range);
    } catch (error) {
      console.error("Error searching for public object:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get('/api/message-requests', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const user = await storage.getUser(req.userId!);
      const requests = await storage.getMessageRequests(req.userId!);
      res.json({
        requests,
        setting: user?.messageRequestSetting || "everyone",
      });
    } catch (error) {
      console.error('Error getting message requests:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/message-requests/pending/count', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const count = await storage.getPendingMessageRequestCount(req.userId!);
      res.json({ count });
    } catch (error) {
      console.error('Error getting pending request count:', error);
      res.json({ count: 0 });
    }
  });

  app.put('/api/message-requests/settings', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { setting } = req.body;
      if (!["everyone", "contacts_only"].includes(setting)) {
        return res.status(400).json({ error: 'Invalid setting' });
      }
      await storage.updateUser(req.userId!, { messageRequestSetting: setting });
      res.json({ success: true });
    } catch (error) {
      console.error('Error updating message request setting:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Last seen privacy setting
  app.put('/api/privacy/last-seen', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { setting } = req.body;
      if (!["everyone", "contacts", "vip", "nobody"].includes(setting)) {
        return res.status(400).json({ error: 'Invalid setting' });
      }
      await storage.updateUser(req.userId!, { lastSeenPrivacy: setting });
      res.json({ success: true });
    } catch (error) {
      console.error('Error updating last seen privacy:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/users/:userId/last-seen', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { userId } = req.params;
      const canSee = await storage.canSeeLastSeen(req.userId!, userId);
      if (!canSee) {
        return res.json({ lastSeen: null, hidden: true });
      }
      const user = await storage.getUser(userId);
      res.json({ lastSeen: user?.lastSeen, hidden: false });
    } catch (error) {
      console.error('Error getting last seen:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Real-time "Active Now" presence (build 133) — independent on/off toggle
  // from last-seen privacy. Backed by the live connectedUsers socket map
  // (see the io.on('connection') handler), never a fake/hardcoded status.
  app.put('/api/privacy/active-status', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { enabled } = req.body ?? {};
      if (typeof enabled !== 'boolean') {
        return res.status(400).json({ error: 'enabled (boolean) is required' });
      }
      await storage.updateUser(req.userId!, { showActiveStatus: enabled });
      res.json({ success: true, showActiveStatus: enabled });
    } catch (error) {
      console.error('Error updating active-status privacy:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/users/:userId/active-status', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { userId } = req.params;
      const target = await storage.getUser(userId);
      if (!target) return res.status(404).json({ error: 'User not found' });
      if (target.showActiveStatus === false) {
        return res.json({ active: false, hidden: true });
      }
      const blocked = await storage.isBlockedByEither(req.userId!, userId).catch(() => true);
      if (blocked) {
        return res.json({ active: false, hidden: true });
      }
      const active = connectedUsers.has(userId) && connectedUsers.get(userId)!.size > 0;
      res.json({ active, hidden: false });
    } catch (error) {
      console.error('Error getting active status:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Archive/Unarchive conversations
  app.post('/api/conversations/:conversationId/archive', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { conversationId } = req.params;
      await storage.archiveConversation(conversationId, req.userId!);
      res.json({ success: true });
    } catch (error) {
      console.error('Error archiving conversation:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/conversations/:conversationId/unarchive', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { conversationId } = req.params;
      await storage.unarchiveConversation(conversationId, req.userId!);
      res.json({ success: true });
    } catch (error) {
      console.error('Error unarchiving conversation:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Mute/Unmute conversations
  app.post('/api/conversations/:conversationId/mute', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { conversationId } = req.params;
      await storage.muteConversation(conversationId, req.userId!, true);
      res.json({ success: true });
    } catch (error) {
      console.error('Error muting conversation:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/conversations/:conversationId/unmute', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { conversationId } = req.params;
      await storage.muteConversation(conversationId, req.userId!, false);
      res.json({ success: true });
    } catch (error) {
      console.error('Error unmuting conversation:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Chat folders
  app.put('/api/conversations/:conversationId/folder', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { conversationId } = req.params;
      const { folder } = req.body;
      if (!["none", "randoms", "friends", "family"].includes(folder)) {
        return res.status(400).json({ error: 'Invalid folder' });
      }
      await storage.updateChatFolder(conversationId, req.userId!, folder);
      res.json({ success: true });
    } catch (error) {
      console.error('Error updating chat folder:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Message search
  app.get('/api/conversations/:conversationId/search', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { conversationId } = req.params;
      const { q } = req.query;
      if (!q || typeof q !== 'string') {
        return res.status(400).json({ error: 'Search query required' });
      }
      const results = await storage.searchMessages(conversationId, q);
      res.json(results);
    } catch (error) {
      console.error('Error searching messages:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Scheduled messages
  app.get('/api/scheduled-messages', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const scheduled = await storage.getScheduledMessages(req.userId!);
      res.json(scheduled);
    } catch (error) {
      console.error('Error getting scheduled messages:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/scheduled-messages', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { conversationId, receiverId, content, mediaUrl, mediaType, scheduledFor } = req.body;
      if (!conversationId || !scheduledFor) {
        return res.status(400).json({ error: 'conversationId and scheduledFor are required' });
      }
      const scheduled = await storage.createScheduledMessage({
        conversationId,
        senderId: req.userId!,
        receiverId,
        content,
        mediaUrl,
        mediaType,
        scheduledFor: new Date(scheduledFor),
      });
      res.json(scheduled);
    } catch (error) {
      console.error('Error creating scheduled message:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.delete('/api/scheduled-messages/:id', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      await storage.cancelScheduledMessage(id, req.userId!);
      res.json({ success: true });
    } catch (error) {
      console.error('Error cancelling scheduled message:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GIF search — supports Tenor (Google) OR GIPHY. Picks whichever key is set.
  // Both providers return slightly different shapes, so we normalize the response
  // into Tenor's `{ results: [{ id, media_formats: { gif:{url}, tinygif:{url} }}]}`
  // shape that the existing GifPicker client already understands.
  type NormalizedGif = { id: string; media_formats: { gif: { url: string }; tinygif: { url: string } } };

  const normalizeGiphy = (data: any): { results: NormalizedGif[] } => {
    const items = Array.isArray(data?.data) ? data.data : [];
    return {
      results: items.map((g: any) => ({
        id: String(g.id),
        media_formats: {
          gif: { url: g?.images?.original?.url || g?.images?.downsized_large?.url || '' },
          tinygif: { url: g?.images?.fixed_width?.url || g?.images?.preview_gif?.url || g?.images?.original?.url || '' },
        },
      })).filter((g: NormalizedGif) => g.media_formats.gif.url),
    };
  };

  const normalizeTenor = (data: any): { results: NormalizedGif[] } => {
    const items = Array.isArray(data?.results) ? data.results : [];
    return {
      results: items.map((g: any) => ({
        id: String(g.id),
        media_formats: {
          gif: { url: g?.media_formats?.gif?.url || '' },
          tinygif: { url: g?.media_formats?.tinygif?.url || g?.media_formats?.gif?.url || '' },
        },
      })).filter((g: NormalizedGif) => g.media_formats.gif.url),
    };
  };

  app.get('/api/gifs/search', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { q, limit = 20 } = req.query;
      const tenorKey = process.env.TENOR_API_KEY;
      const giphyKey = process.env.GIPHY_API_KEY;
      if (!tenorKey && !giphyKey) {
        return res.status(503).json({ error: 'GIF service not configured', results: [] });
      }
      if (giphyKey) {
        const url = `https://api.giphy.com/v1/gifs/search?api_key=${giphyKey}&q=${encodeURIComponent(q as string)}&limit=${limit}&rating=pg-13`;
        const r = await fetch(url);
        const d = await r.json();
        return res.json(normalizeGiphy(d));
      }
      const url = `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(q as string)}&key=${tenorKey}&limit=${limit}&media_filter=gif`;
      const response = await fetch(url);
      const data = await response.json();
      res.json(normalizeTenor(data));
    } catch (error) {
      console.error('Error searching GIFs:', error);
      res.status(500).json({ error: 'Internal server error', results: [] });
    }
  });

  app.get('/api/gifs/trending', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { limit = 20 } = req.query;
      const tenorKey = process.env.TENOR_API_KEY;
      const giphyKey = process.env.GIPHY_API_KEY;
      if (!tenorKey && !giphyKey) {
        return res.status(503).json({ error: 'GIF service not configured', results: [] });
      }
      if (giphyKey) {
        const url = `https://api.giphy.com/v1/gifs/trending?api_key=${giphyKey}&limit=${limit}&rating=pg-13`;
        const r = await fetch(url);
        const d = await r.json();
        return res.json(normalizeGiphy(d));
      }
      const url = `https://tenor.googleapis.com/v2/featured?key=${tenorKey}&limit=${limit}&media_filter=gif`;
      const response = await fetch(url);
      const data = await response.json();
      res.json(normalizeTenor(data));
    } catch (error) {
      console.error('Error getting trending GIFs:', error);
      res.status(500).json({ error: 'Internal server error', results: [] });
    }
  });

  app.post('/api/message-requests/:requestId/accept', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { requestId } = req.params;
      const result = await storage.acceptMessageRequest(requestId, req.userId!);
      if (!result) {
        return res.status(404).json({ error: 'Request not found' });
      }
      res.json({ success: true, conversationId: result.conversationId });
    } catch (error) {
      console.error('Error accepting request:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/message-requests/:requestId/decline', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { requestId } = req.params;
      await storage.declineMessageRequest(requestId, req.userId!);
      res.json({ success: true });
    } catch (error) {
      console.error('Error declining request:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Status routes
  app.get('/api/statuses', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const statuses = await storage.getStatuses(req.userId!);
      res.json(statuses);
    } catch (error) {
      console.error('Error getting statuses:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/statuses/mine', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const statuses = await storage.getMyStatuses(req.userId!);
      res.json(statuses);
    } catch (error) {
      console.error('Error getting my statuses:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/statuses', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { mediaUrl, mediaType, caption, privacy, customViewers, isEncrypted, encryptedCaption, captionNonce, mediaKeyWraps, trimStartMs, trimEndMs } = req.body;

      let statusData: Parameters<typeof storage.createStatus>[1];
      if (isEncrypted === true) {
        // E2EE path (closed-audience privacy modes): mediaUrl here is an
        // SCM1-ciphertext object path (the client already encrypted it via
        // uploadEncryptedMedia), and the media key is delivered wrapped
        // per-viewer rather than travelling in the clear.
        if (!mediaKeyWraps || typeof mediaKeyWraps !== 'object' || Array.isArray(mediaKeyWraps)) {
          return res.status(400).json({ error: 'mediaKeyWraps is required for an encrypted status' });
        }
        const wraps: Record<string, { wrappedKey: string; nonce: string }> = {};
        for (const viewerId of Object.keys(mediaKeyWraps)) {
          const entry = mediaKeyWraps[viewerId];
          // nacl.box of a 32-byte key is always exactly 48 bytes (32 + 16-byte Poly1305 tag).
          if (!isValidB64(entry?.wrappedKey, 48, 48)) continue;
          if (!isValidB64(entry?.nonce, 24, 24)) continue;
          wraps[viewerId] = { wrappedKey: entry.wrappedKey, nonce: entry.nonce };
        }
        if (Object.keys(wraps).length === 0) {
          return res.status(400).json({ error: 'mediaKeyWraps must contain at least one valid entry' });
        }
        if (encryptedCaption !== undefined && encryptedCaption !== null) {
          if (!isValidB64(encryptedCaption, 17, 5_000)) {
            return res.status(400).json({ error: 'invalid encryptedCaption' });
          }
          if (!isValidB64(captionNonce, 24, 24)) {
            return res.status(400).json({ error: 'invalid captionNonce' });
          }
        }
        statusData = {
          mediaUrl, mediaType, privacy, customViewers,
          isEncrypted: true,
          encryptedCaption: encryptedCaption ?? null,
          captionNonce: captionNonce ?? null,
          mediaKeyWraps: wraps,
          trimStartMs, trimEndMs,
        };
      } else {
        statusData = { mediaUrl, mediaType, caption, privacy, customViewers, trimStartMs, trimEndMs };
      }

      const status = await storage.createStatus(req.userId!, statusData);
      res.json(status);
    } catch (error: any) {
      if (error?.message === 'STORIES_DISABLED') {
        return res.status(403).json({ error: 'Stories are turned off in your settings.' });
      }
      console.error('Error creating status:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/statuses/:statusId/view', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { statusId } = req.params;
      // Body is optional & backward-compatible: pre-1.0.6 clients send no body
      // and we just record a plain view (watchDurationMs=0, completed=false).
      const { watchDurationMs, completed } = (req.body ?? {}) as { watchDurationMs?: number; completed?: boolean };
      await storage.viewStatus(statusId, req.userId!, { watchDurationMs, completed });
      res.json({ success: true });
    } catch (error: any) {
      if (error?.message === 'STATUS_NOT_FOUND') {
        return res.status(404).json({ error: 'Status not found' });
      }
      console.error('Error viewing status:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/statuses/:statusId/viewers', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { statusId } = req.params;
      const viewers = await storage.getStatusViewers(statusId, req.userId!);
      res.json(viewers);
    } catch (error: any) {
      console.error('Error getting status viewers:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Aggregate analytics for the owner: total views, completion rate, avg watch.
  // Owner-only — anyone else gets 403.
  app.get('/api/statuses/:statusId/analytics', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { statusId } = req.params;
      const analytics = await storage.getStatusAnalytics(statusId, req.userId!);
      if (!analytics) return res.status(403).json({ error: 'Not authorized' });
      res.json(analytics);
    } catch (error: any) {
      console.error('Error getting status analytics:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Mute a poster's stories from the viewer's feed. One-way; does not block
  // messaging/calls. Idempotent: re-muting an already-muted user is a no-op.
  // Validates target existence up-front so a bad/non-existent userId returns
  // a controlled 400 instead of leaking a 500 from an FK violation.
  app.post('/api/statuses/mute/:userId', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const targetId = req.params.userId;
      if (!targetId || targetId === req.userId) {
        return res.status(400).json({ error: 'Invalid target user' });
      }
      const target = await storage.getUser(targetId);
      if (!target) {
        return res.status(400).json({ error: 'Invalid target user' });
      }
      await storage.muteStatusUser(req.userId!, targetId);
      res.json({ success: true });
    } catch (error) {
      console.error('Error muting status user:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.delete('/api/statuses/mute/:userId', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const targetId = req.params.userId;
      if (!targetId || targetId === req.userId) {
        return res.status(400).json({ error: 'Invalid target user' });
      }
      await storage.unmuteStatusUser(req.userId!, targetId);
      res.json({ success: true });
    } catch (error) {
      console.error('Error unmuting status user:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/statuses/mutes', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const rows = await storage.getStatusMutes(req.userId!);
      res.json(rows);
    } catch (error) {
      console.error('Error listing status mutes:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Reply to a status: returns the conversation between the viewer and the
  // status author (creating it if needed) plus a small reply-context payload
  // the client can use to seed its input bar / reply preview. The actual
  // message is sent through the existing E2EE /api/messages pipeline — the
  // server never sees the reply content, only that a conversation was
  // resolved. Authorization mirrors getStatuses: the viewer must be allowed
  // to see the status under its privacy rules, and must not have it muted
  // (mute should also block reply, otherwise we'd leak that the muter is
  // still watching the muted user's stories).
  app.post('/api/statuses/:statusId/reply-context', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { statusId } = req.params;
      const ctx = await storage.getStatusReplyContext(statusId, req.userId!);
      if (!ctx) return res.status(404).json({ error: 'Status not available' });
      res.json(ctx);
    } catch (error: any) {
      console.error('Error getting status reply context:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.delete('/api/statuses/:statusId', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { statusId } = req.params;
      await storage.deleteStatus(statusId, req.userId!);
      res.json({ success: true });
    } catch (error: any) {
      if (error?.message === 'STATUS_NOT_FOUND') {
        return res.status(404).json({ error: 'Status not found' });
      }
      if (error?.message === 'NOT_AUTHORIZED') {
        return res.status(403).json({ error: 'Not authorized to delete this status' });
      }
      console.error('Error deleting status:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Friends routes
  // Friends: request-then-accept. GET returns only mutual (accepted) friends.
  app.get('/api/friends', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const friends = await storage.getFriends(req.userId!);
      res.json(friends);
    } catch (error) {
      console.error('Error getting friends:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Pending requests the CURRENT user has received and can accept/decline.
  app.get('/api/friends/requests', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const requests = await storage.getPendingFriendRequests(req.userId!);
      res.json(requests);
    } catch (error) {
      console.error('Error getting friend requests:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Relationship state with one specific user — drives the "Add Friend" /
  // "Request Sent" / "Accept Request" / "Friends" affordance in a chat.
  app.get('/api/friends/status/:otherUserId', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const result = await storage.getFriendshipStatus(req.userId!, req.params.otherUserId);
      res.json(result);
    } catch (error) {
      console.error('Error getting friendship status:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/friends', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { friendId } = req.body;
      if (!friendId || typeof friendId !== 'string') {
        return res.status(400).json({ error: 'friendId is required' });
      }
      if (friendId === req.userId) {
        return res.status(400).json({ error: 'You cannot send yourself a friend request' });
      }
      const isBlocked = await storage.isBlockedByEither(req.userId!, friendId);
      if (isBlocked) {
        return res.status(403).json({ error: 'Cannot send a friend request to this user' });
      }
      const { request, autoAccepted } = await storage.sendFriendRequest(req.userId!, friendId);

      // Notify the recipient — a fresh pending request needs a push (they
      // may not have the app open); an auto-accept resulting from their own
      // earlier request just needs a live UI nudge if they're online.
      const sender = await storage.getUser(req.userId!);
      const ioRef = getIO();
      if (autoAccepted) {
        if (ioRef) ioRef.to(friendId).emit('friend-request-accepted', { requestId: request.id, byUserId: req.userId });
      } else {
        if (ioRef) ioRef.to(friendId).emit('friend-request-received', { requestId: request.id, senderId: req.userId });
        const recipient = await storage.getUser(friendId);
        if (recipient?.pushToken && recipient.notificationsEnabled !== false) {
          sendPushNotification(
            recipient.pushToken,
            'New friend request',
            `${sender?.displayName || 'Someone'} wants to add you as a friend`,
            { type: 'friend-request', requestId: request.id },
            'activity',
          ).catch(err => console.error('Failed to send friend-request notification:', err));
        }
      }

      res.json({ ...request, autoAccepted });
    } catch (error: any) {
      if (error?.message === 'CANNOT_FRIEND_SELF') {
        return res.status(400).json({ error: 'You cannot send yourself a friend request' });
      }
      console.error('Error sending friend request:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/friends/requests/:requestId/accept', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const accepted = await storage.acceptFriendRequest(req.params.requestId, req.userId!);
      if (!accepted) {
        return res.status(404).json({ error: 'Request not found' });
      }
      const ioRef = getIO();
      if (ioRef) ioRef.to(accepted.userId).emit('friend-request-accepted', { requestId: accepted.id, byUserId: req.userId });
      res.json({ success: true });
    } catch (error) {
      console.error('Error accepting friend request:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/friends/requests/:requestId/decline', authenticateToken, async (req: AuthRequest, res) => {
    try {
      await storage.declineFriendRequest(req.params.requestId, req.userId!);
      res.json({ success: true });
    } catch (error) {
      console.error('Error declining friend request:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.delete('/api/friends/:friendId', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { friendId } = req.params;
      await storage.removeFriend(req.userId!, friendId);
      res.json({ success: true });
    } catch (error) {
      console.error('Error removing friend:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Block user routes
  app.get('/api/blocks', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const blocks = await storage.getBlockedUsers(req.userId!);
      res.json(blocks);
    } catch (error) {
      console.error('Error getting blocked users:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/blocks', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { blockedId } = req.body;
      if (!blockedId) {
        return res.status(400).json({ error: 'blockedId is required' });
      }
      const block = await storage.blockUser(req.userId!, blockedId);
      res.json(block);
    } catch (error) {
      console.error('Error blocking user:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.delete('/api/blocks/:blockedId', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { blockedId } = req.params;
      await storage.unblockUser(req.userId!, blockedId);
      res.json({ success: true });
    } catch (error) {
      console.error('Error unblocking user:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/blocks/check/:userId', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { userId } = req.params;
      const isBlocked = await storage.isBlocked(req.userId!, userId);
      const blockedByThem = await storage.isBlocked(userId, req.userId!);
      res.json({ isBlocked, blockedByThem });
    } catch (error) {
      console.error('Error checking block status:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ─── User reports (App Store Guideline 1.2 — UGC abuse moderation) ─────────
  app.post('/api/reports', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { reportedUserId, reportedMessageId, reason, details } = req.body || {};

      if (!reportedUserId || typeof reportedUserId !== 'string') {
        return res.status(400).json({ error: 'reportedUserId is required' });
      }
      if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
        return res.status(400).json({ error: 'reason is required' });
      }
      if (reportedUserId === req.userId) {
        return res.status(400).json({ error: 'You cannot report yourself' });
      }

      const reportedUser = await storage.getUser(reportedUserId);
      if (!reportedUser) {
        return res.status(404).json({ error: 'Reported user not found' });
      }

      const ALLOWED_REASONS = [
        'spam',
        'harassment',
        'hate_speech',
        'sexual_content',
        'threats_or_violence',
        'csam',
        'impersonation',
        'scam_or_fraud',
        'other',
      ];
      const safeReason = ALLOWED_REASONS.includes(reason) ? reason : 'other';
      const safeDetails = typeof details === 'string' ? details.slice(0, 2000) : null;
      const safeMessageId =
        typeof reportedMessageId === 'string' && reportedMessageId.length > 0
          ? reportedMessageId
          : null;

      // Rate-limit: same reporter -> same target/message within 1 hour = duplicate.
      const isDuplicate = await storage.hasRecentReport(
        req.userId!,
        reportedUserId,
        safeMessageId,
      );
      if (isDuplicate) {
        return res.status(200).json({
          success: true,
          duplicate: true,
          message: 'You have already reported this. Our team will review it.',
        });
      }

      const report = await storage.createUserReport({
        reporterId: req.userId!,
        reportedUserId,
        reportedMessageId: safeMessageId,
        reason: safeReason,
        details: safeDetails,
        status: 'pending',
      });

      console.log(
        `[REPORT] reporter=${req.userId} reported=${reportedUserId} ` +
          `messageId=${safeMessageId ?? 'none'} reason=${safeReason} id=${report.id}`,
      );

      // Fire-and-forget AI evaluation. The user gets an immediate "thanks"
      // response; the AI runs within seconds and updates the report row +
      // applies suspension / chat-limit automatically when warranted.
      const { evaluateReport } = await import('./aiModerator');
      evaluateReport(report.id).catch((e) =>
        console.error('[AI-MOD] evaluateReport threw:', e),
      );

      res.json({
        success: true,
        reportId: report.id,
        message:
          'Thanks for the report. Our AI Trust & Safety system is reviewing this now and will take action within seconds if it violates our rules.',
      });
    } catch (error) {
      console.error('Error creating report:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Location routes (VIP only)
  app.get('/api/location/me', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const user = await storage.getUser(req.userId!);
      if (!user?.isVip) {
        return res.status(403).json({ error: 'VIP subscription required' });
      }
      const share = await storage.getLocationShare(req.userId!);
      // Trim to what the client actually needs — no reason to ship our own
      // outgoing ciphertext blobs back down on every poll.
      res.json({ isSharing: share?.isSharing ?? false });
    } catch (error) {
      console.error('Error getting location share:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // The set of users currently allowed to see my location — exactly the
  // recipient set the client must encrypt each location tick against.
  app.get('/api/location/approved-friend-ids', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const user = await storage.getUser(req.userId!);
      if (!user?.isVip) {
        return res.status(403).json({ error: 'VIP subscription required' });
      }
      const ids = await storage.getApprovedFriendIds(req.userId!);
      res.json({ ids });
    } catch (error) {
      console.error('Error getting approved friend ids:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/location/update', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const user = await storage.getUser(req.userId!);
      if (!user?.isVip) {
        return res.status(403).json({ error: 'VIP subscription required' });
      }
      // E2EE (location-sharing phase 1): the client sends one sealed blob
      // per currently-approved viewer — a nacl.box of {lat, lng} under
      // that viewer's identity key — instead of raw coordinates. The
      // server only ever stores/relays opaque ciphertext.
      const { encryptedForFriends } = req.body ?? {};
      if (!encryptedForFriends || typeof encryptedForFriends !== 'object' || Array.isArray(encryptedForFriends)) {
        return res.status(400).json({ error: 'encryptedForFriends is required' });
      }

      // Defense in depth: only persist/relay entries for viewers who are
      // actually approved right now, so a client can't get the server to
      // fan a location out to anyone beyond who was actually granted
      // access, regardless of what keys the payload includes.
      const approvedSet = new Set(await storage.getApprovedFriendIds(req.userId!));
      const sealed: Record<string, { ciphertext: string; nonce: string }> = {};
      for (const friendId of Object.keys(encryptedForFriends)) {
        if (!approvedSet.has(friendId)) continue;
        const entry = encryptedForFriends[friendId];
        if (!isValidB64(entry?.ciphertext, 17, 2_000)) continue;
        if (!isValidB64(entry?.nonce, 24, 24)) continue;
        sealed[friendId] = { ciphertext: entry.ciphertext, nonce: entry.nonce };
      }

      await storage.updateLocationShare(req.userId!, { encryptedLocations: sealed, isSharing: true });
      const lastUpdated = new Date().toISOString();

      for (const friendId of Object.keys(sealed)) {
        io.to(friendId).emit('friend-location-update', {
          userId: req.userId!,
          ciphertext: sealed[friendId].ciphertext,
          nonce: sealed[friendId].nonce,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
          lastUpdated,
          isSharing: true,
        });
      }

      res.json({ success: true, lastUpdated });
    } catch (error) {
      console.error('Error updating location:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/location/toggle', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const user = await storage.getUser(req.userId!);
      if (!user?.isVip) {
        return res.status(403).json({ error: 'VIP subscription required' });
      }
      const { isSharing } = req.body;
      // Clear any sealed blobs when sharing turns off so nothing lingers
      // server-side once the user stops sharing.
      const share = await storage.updateLocationShare(req.userId!, {
        isSharing,
        ...(isSharing ? {} : { encryptedLocations: {} }),
      });
      res.json({ isSharing: share.isSharing });
    } catch (error) {
      console.error('Error toggling location sharing:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/location/requests', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const user = await storage.getUser(req.userId!);
      if (!user?.isVip) {
        return res.status(403).json({ error: 'VIP subscription required' });
      }
      const requests = await storage.getLocationRequests(req.userId!);
      res.json(requests);
    } catch (error) {
      console.error('Error getting location requests:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/location/request', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const user = await storage.getUser(req.userId!);
      if (!user?.isVip) {
        return res.status(403).json({ error: 'VIP subscription required' });
      }
      const { targetId } = req.body;
      const request = await storage.createLocationRequest(req.userId!, targetId);
      res.json(request);
    } catch (error) {
      console.error('Error creating location request:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/location/requests/:requestId/respond', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const user = await storage.getUser(req.userId!);
      if (!user?.isVip) {
        return res.status(403).json({ error: 'VIP subscription required' });
      }
      const { requestId } = req.params;
      const { accept } = req.body;
      await storage.respondToLocationRequest(requestId, req.userId!, accept);

      if (accept) {
        await storage.updateLocationShare(req.userId!, { isSharing: true });

        const request = await storage.getLocationRequestById(requestId);
        if (request) {
          const otherUserId = request.requesterId === req.userId! ? request.targetId : request.requesterId;
          await storage.updateLocationShare(otherUserId, { isSharing: true });

          io.to(otherUserId).emit('location-request-accepted', {
            acceptedBy: req.userId!,
            acceptedByName: user.displayName,
          });

          io.to(req.userId!).emit('location-sharing-enabled', {
            friendId: otherUserId,
          });
          io.to(otherUserId).emit('location-sharing-enabled', {
            friendId: req.userId!,
          });
        }
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Error responding to location request:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/location/friends', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const user = await storage.getUser(req.userId!);
      if (!user?.isVip) {
        return res.status(403).json({ error: 'VIP subscription required' });
      }
      const locations = await storage.getFriendLocations(req.userId!);
      res.json(locations);
    } catch (error) {
      console.error('Error getting friend locations:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ===== Twilio Webhooks for Virtual Numbers =====
  // These endpoints receive incoming SMS/calls to virtual numbers

  // Incoming SMS to virtual number
  app.post('/api/webhooks/twilio/sms', async (req, res) => {
    try {
      // Validate Twilio webhook signature for security
      const twilioSignature = req.headers['x-twilio-signature'] as string | undefined;
      const webhookUrl = `https://${req.headers.host}${req.originalUrl}`;
      
      if (!validateTwilioWebhookSignature(twilioSignature, webhookUrl, req.body)) {
        console.warn('Invalid Twilio webhook signature for SMS');
        res.status(403).send('Forbidden');
        return;
      }

      const { From, To, Body } = req.body;
      console.log(`Incoming SMS: From ${From} to ${To}: ${Body}`);

      // Find the virtual number that received this message
      const virtualNumber = await storage.getVirtualNumberByPhone(To);
      if (!virtualNumber || !virtualNumber.assignedUserId) {
        console.log('Virtual number not found or not assigned:', To);
        res.type('text/xml').send('<Response></Response>');
        return;
      }

      // Build 63, Phase 3: inbound carrier SMS lands in `external_sms`,
      // NEVER in `messages`. Carrier SMS is plaintext on the wire — pretending
      // otherwise by writing into the E2EE message table would directly
      // contradict the security claim in docs/e2ee/sealed-sender.md §2.1 #4.
      // The client renders external_sms rows in the same inbox surface with
      // a "SMS — not end-to-end encrypted" label and the composer is
      // read-only for them in this PR.
      const receiver = await storage.getUser(virtualNumber.assignedUserId);
      if (!receiver) {
        console.log('Virtual number assigned to missing user:', virtualNumber.assignedUserId);
        res.type('text/xml').send('<Response></Response>');
        return;
      }

      // Encrypt at rest before it ever touches the database — see
      // shared/schema.ts's externalSms header comment and
      // server/smsEncryption.ts. The live socket emission and push
      // notification below still use the plaintext `Body` we already have
      // in memory; only the persisted copy is encrypted.
      const externalRow = await storage.insertExternalSms({
        virtualNumberId: virtualNumber.id,
        fromPhoneE164: From,
        body: encryptSmsBody(Body),
        isEncrypted: true,
        deliveredToUserId: receiver.id,
      });

      // Tell the recipient's open client about the new external SMS row.
      // Note: distinct event name from `new-message` so client renders the
      // "not E2EE" label and disables reply. No userId of the external
      // sender is attached because external senders are by definition NOT
      // Pryvo users — only the raw E.164 they sent from.
      socketIO?.to(receiver.id).emit('new-external-sms', {
        id: externalRow.id,
        virtualNumberId: virtualNumber.id,
        fromPhoneE164: From,
        body: Body,
        receivedAt: externalRow.receivedAt,
      });

      if (receiver.pushToken && receiver.notificationsEnabled !== false) {
        // Carrier SMS is plaintext by nature (never E2EE — see externalSms's
        // schema comment), but that's a reason to be MORE careful with the
        // notification preview, not less: real SMS content (2FA codes,
        // etc.) shouldn't sit on a lock screen any more than a chat message
        // should. Same fixed-body rule as the E2EE paths.
        const previewOff = receiver.showNotificationPreview === false;
        const pushTitle = previewOff ? 'Pryvo' : `SMS from ${From}`;
        const pushBody = previewOff ? 'New SMS (not end-to-end encrypted)' : 'New SMS';

        sendPushNotification(
          receiver.pushToken,
          pushTitle,
          pushBody,
          {
            kind: 'external_sms',
            externalSmsId: externalRow.id,
            virtualNumberId: virtualNumber.id,
            // No sender userId — external SMS is by definition from a
            // non-Pryvo phone number. The fromPhoneE164 is the
            // only sender-identifying field, and it's plaintext on the
            // carrier network anyway.
            fromPhoneE164: From,
          }
        ).catch(err => console.error('Push notification failed for external SMS:', err));
      }

      console.log(`Routed external SMS from ${From} to external_sms row ${externalRow.id} for user ${receiver.id}`);

      // Acknowledge receipt to Twilio
      res.type('text/xml').send('<Response></Response>');
    } catch (error) {
      console.error('Error handling incoming SMS:', error);
      res.type('text/xml').send('<Response></Response>');
    }
  });

  // Incoming voice call to virtual number
  app.post('/api/webhooks/twilio/voice', async (req, res) => {
    try {
      // Validate Twilio webhook signature for security
      const twilioSignature = req.headers['x-twilio-signature'] as string | undefined;
      const webhookUrl = `https://${req.headers.host}${req.originalUrl}`;
      
      if (!validateTwilioWebhookSignature(twilioSignature, webhookUrl, req.body)) {
        console.warn('Invalid Twilio webhook signature for voice');
        res.status(403).send('Forbidden');
        return;
      }

      const { From, To, CallSid } = req.body;
      console.log(`Incoming call: From ${From} to ${To}, CallSid: ${CallSid}`);

      // Find the virtual number that received this call
      const virtualNumber = await storage.getVirtualNumberByPhone(To);
      if (!virtualNumber || !virtualNumber.assignedUserId) {
        console.log('Virtual number not found or not assigned:', To);
        // Reject the call with a message
        res.type('text/xml').send(`
          <Response>
            <Say>This number is not currently accepting calls.</Say>
            <Hangup/>
          </Response>
        `);
        return;
      }

      // Find if caller is a Pryvo user
      const caller = await storage.getUserByPhone(From);
      const receiver = await storage.getUser(virtualNumber.assignedUserId);

      if (caller && receiver) {
        console.log(`Call from ${From} to user ${receiver.id} via virtual number - routing to app`);
        
        const call = await storage.createCall(caller.id, receiver.id, 'audio');
        
        socketIO?.to(receiver.id).emit('incoming-call', {
          callerId: caller.id,
          callId: call.id,
          type: 'audio',
          callerName: caller.displayName || caller.phoneNumber,
          callerPhoneNumber: From,
          viaVirtualNumber: true,
        });

        if (receiver.pushToken && receiver.notificationsEnabled !== false) {
          const callerName = caller.displayName || caller.phoneNumber || 'Someone';
          sendCallNotification(
            receiver.pushToken,
            callerName,
            'audio',
            call.id,
            caller.id,
            undefined
          ).catch(err => console.error('Virtual number call push notification failed:', err));

          if (receiver.voipPushToken) {
            sendVoipCallPush(receiver.voipPushToken, {
              uuid: call.id,
              callerName,
              handle: callerName,
              hasVideo: false,
              callId: call.id,
              callerId: caller.id,
            }).catch(err => console.error('Virtual number VoIP push notification failed:', err));
          }
        }

        res.type('text/xml').send(`
          <Response>
            <Say>Connecting your call through Pryvo. Please wait.</Say>
            <Pause length="30"/>
            <Say>The person you are calling is not available right now. Please try again through the app.</Say>
            <Hangup/>
          </Response>
        `);
      } else {
        res.type('text/xml').send(`
          <Response>
            <Say>This number only accepts calls from Pryvo users. Please download Pryvo to call this number.</Say>
            <Hangup/>
          </Response>
        `);
      }
    } catch (error) {
      console.error('Error handling incoming call:', error);
      res.type('text/xml').send(`
        <Response>
          <Say>An error occurred. Please try again later.</Say>
          <Hangup/>
        </Response>
      `);
    }
  });

  const httpServer = createServer(app);

  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: getAllowedOrigins(),
      credentials: true,
    },
  });
  socketIO = io;
  // Expose globally so server-side helpers (e.g. AI moderator) can push events
  // without each module needing the io instance threaded through.
  (global as any).__socketIO = io;

  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; tv?: number; did?: string };
      // Enforce token version against current DB value so stale tokens
      // (e.g. after logout-all-others) cannot maintain realtime sessions.
      try {
        const u = await storage.getUser(decoded.userId);
        const currentTv = u?.tokenVersion ?? 0;
        const tokenTv = decoded.tv ?? 0;
        if (!u || tokenTv !== currentTv) {
          return next(new Error('Session revoked'));
        }
      } catch {
        return next(new Error('Authentication failed'));
      }
      (socket as any).userId = decoded.userId;
      (socket as any).tokenVersion = decoded.tv ?? 0;
      // Carried through from the JWT so the concurrent-session-alert logic
      // (see /api/auth/verify-code) can tell "same device reconnecting" apart
      // from "a genuinely different device just logged in".
      (socket as any).deviceId = decoded.did ?? null;
      // Snapshot at connect time so the presence broadcast below doesn't need
      // an extra DB round trip per connect/disconnect. Can go briefly stale
      // if the user flips the setting mid-session without reconnecting — the
      // REST active-status endpoint always re-checks fresh, so that's a
      // self-correcting worst case, not a real leak.
      const u2 = await storage.getUser(decoded.userId);
      (socket as any).showActiveStatus = u2?.showActiveStatus ?? true;
      next();
    } catch (error) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const userId = (socket as any).userId;
    console.log(`User ${userId} connected`);

    const wasAlreadyOnline = connectedUsers.has(userId) && connectedUsers.get(userId)!.size > 0;
    if (!connectedUsers.has(userId)) connectedUsers.set(userId, new Set());
    connectedUsers.get(userId)!.add(socket.id);

    socket.join(userId);

    // Real-time "Active Now" (build 133): only the first socket for a user
    // going online is a real state transition worth telling watchers about
    // — a second tab/device connecting doesn't change whether they're
    // active. Gated on the privacy toggle snapshotted at auth time.
    if (!wasAlreadyOnline && (socket as any).showActiveStatus) {
      io.to(`presence:${userId}`).emit('user-active-changed', { userId, active: true });
    }

    socket.on('join-conversation', (conversationId: string) => {
      socket.join(`conversation:${conversationId}`);
    });

    socket.on('leave-conversation', (conversationId: string) => {
      socket.leave(`conversation:${conversationId}`);
    });

    // Presence watching: mirrors join/leave-conversation. A client opens
    // this exactly while a ConversationScreen with that peer is mounted —
    // see ConversationScreen's presence effect.
    socket.on('watch-presence', (targetUserId: string) => {
      if (typeof targetUserId === 'string' && targetUserId) {
        socket.join(`presence:${targetUserId}`);
      }
    });

    socket.on('unwatch-presence', (targetUserId: string) => {
      if (typeof targetUserId === 'string' && targetUserId) {
        socket.leave(`presence:${targetUserId}`);
      }
    });

    socket.on('send-message', async (data) => {
      // Handle mock conversations for Apple reviewers (no database writes)
      if (isMockConversation(data.conversationId) && isDevMode()) {
        const isReviewer = await isAppleReviewerUser(userId);
        if (isReviewer && isMockUser(data.receiverId)) {
          // Create a fake user message (not saved to DB)
          const userMessage = {
            id: `mock-msg-${Date.now()}-user`,
            conversationId: data.conversationId,
            senderId: userId,
            receiverId: data.receiverId,
            content: data.content,
            mediaUrl: data.mediaUrl || null,
            mediaType: data.mediaType || null,
            createdAt: new Date().toISOString(),
            isEncrypted: true,
            status: 'sent',
          };
          
          // Emit the user's message immediately
          io.to(`conversation:${data.conversationId}`).emit('new-message', userMessage);
          
          // Schedule a bot auto-reply after 1-3 seconds
          const replyDelay = 1000 + Math.random() * 2000;
          setTimeout(() => {
            const botReply = createMockBotReply(data.conversationId, data.receiverId, userId);
            io.to(`conversation:${data.conversationId}`).emit('new-message', botReply);

            // Also send notification to the user
            const botUser = getMockUser(data.receiverId);
            io.to(userId).emit('message-notification', {
              conversationId: data.conversationId,
              senderId: data.receiverId,
              senderName: botUser?.displayName || 'Someone',
            });
          }, replyDelay);
          
          return; // Don't save to database
        }
      }

      // Block check (mirrors REST path): refuse if either party blocked the other.
      // Fail-CLOSED: if the check itself errors, refuse the send rather than
      // silently allow a potentially-blocked message through.
      if (data.receiverId) {
        try {
          const blocked = await storage.isBlockedByEither(userId, data.receiverId);
          if (blocked) {
            socket.emit('send-message-error', { error: 'Cannot send message. User is blocked.' });
            return;
          }
        } catch (e) {
          console.error('[SEND] socket block check failed (fail-closed):', e);
          socket.emit('send-message-error', { error: 'Could not verify send permissions. Try again.' });
          return;
        }
      }

      // Enforce AI-imposed chat limits on the socket path too, so a custom
      // client cannot bypass moderation by sending via Socket.IO.
      // Fail-CLOSED: any error here aborts the send.
      try {
        const { checkAndConsumeChatLimit } = await import('./aiModerator');
        const limit = await checkAndConsumeChatLimit(userId);
        if (!limit.allowed) {
          socket.emit('chat-limit-blocked', {
            error: limit.reason || 'Daily message limit reached.',
            perDay: limit.perDay,
            resetAt: limit.resetAt,
          });
          return;
        }
      } catch (e) {
        console.error('[AI-MOD] socket limit check failed (fail-closed):', e);
        socket.emit('send-message-error', { error: 'Could not verify message limits. Try again.' });
        return;
      }

      const message = await storage.createMessage({
        conversationId: data.conversationId,
        senderId: userId,
        receiverId: data.receiverId,
        content: data.content,
        mediaUrl: data.mediaUrl,
        mediaType: data.mediaType,
        isHidden: data.isHidden,
      });

      io.to(`conversation:${data.conversationId}`).emit('new-message', message);

      if (data.receiverId) {
        const receiver = await storage.getUser(data.receiverId);
        const sender = await storage.getUser(userId);
        io.to(data.receiverId).emit('message-notification', {
          conversationId: data.conversationId,
          senderId: userId,
          senderName: sender?.displayName || sender?.phoneNumber || 'Someone',
          senderAvatar: sender?.avatarUrl ?? null,
        });
        const receiverOnline = connectedUsers.has(data.receiverId);

        if (!receiverOnline && receiver?.pushToken && receiver?.notificationsEnabled !== false) {
          const senderName = sender?.displayName || sender?.phoneNumber || 'Someone';

          // Same notification-preview privacy rule as the REST send path —
          // never a content-type hint, always the fixed "Sent a message".
          const previewOff = receiver.showNotificationPreview === false;
          const pushTitle = previewOff ? 'Pryvo' : senderName;
          const pushBody = previewOff ? 'New encrypted message' : 'Sent a message';

          sendMessageNotification(
            receiver.pushToken,
            pushTitle,
            pushBody,
            data.conversationId,
            userId,
          ).catch(err => console.error('Push notification failed:', err));
        }
      }
    });

    // Receiver acknowledges that they received a message → mark delivered
    // and notify the sender so their ticks update in real time.
    socket.on('message-delivered', async (data: { messageId?: string; conversationId?: string }) => {
      try {
        if (!data?.messageId) return;
        const updated = await storage.markMessageDelivered(data.messageId, userId);
        if (!updated) return; // not the receiver, or message doesn't exist
        if (updated.status !== 'delivered') return;
        const payload = {
          conversationId: updated.conversationId,
          messageId: updated.id,
          status: 'delivered' as const,
          deliveredAt: updated.deliveredAt,
        };
        io.to(`conversation:${updated.conversationId}`).emit('message-status', payload);
        io.to(updated.senderId).emit('message-status', payload);
      } catch (err) {
        console.error('message-delivered handler failed:', err);
      }
    });

    // Receiver opened the chat or tapped a message → mark read.
    // Accepts either { conversationId } (mark all unread) or { messageId } (single).
    socket.on('mark-read', async (data: { conversationId?: string; messageId?: string }) => {
      // Honor reader's read-receipt privacy toggle on the realtime path too.
      try {
        const reader = userId ? await storage.getUser(userId) : null;
        if (reader && reader.readReceiptsEnabled === false) {
          return; // reader has read-receipts disabled — silently no-op
        }
      } catch {}
      try {
        if (data?.messageId) {
          const updated = await storage.markMessageRead(data.messageId, userId);
          if (!updated || updated.readBy !== userId) return;
          const payload = {
            conversationId: updated.conversationId,
            messageIds: [updated.id],
            readerId: userId,
            readAt: updated.readAt,
          };
          io.to(`conversation:${updated.conversationId}`).emit('messages-read', payload);
          io.to(updated.senderId).emit('messages-read', payload);
          return;
        }

        if (data?.conversationId) {
          const isParticipant = await storage.isConversationParticipant(data.conversationId, userId);
          if (!isParticipant) return;
          const updated = await storage.markMessagesRead(data.conversationId, userId);
          if (updated.length === 0) return;
          const readAt = updated[0].readAt;
          io.to(`conversation:${data.conversationId}`).emit('messages-read', {
            conversationId: data.conversationId,
            messageIds: updated.map((u) => u.id),
            readerId: userId,
            readAt,
          });
          const uniqueSenders = Array.from(new Set(updated.map((u) => u.senderId)));
          for (const senderId of uniqueSenders) {
            if (senderId === userId) continue;
            io.to(senderId).emit('messages-read', {
              conversationId: data.conversationId,
              messageIds: updated.filter((u) => u.senderId === senderId).map((u) => u.id),
              readerId: userId,
              readAt,
            });
          }
        }
      } catch (err) {
        console.error('mark-read handler failed:', err);
      }
    });

    // Build 63, Phase 3: typing indicator must NOT leak `userId` to the
    // recipient when the conversation is a sealed-sender conversation
    // (numberType='virtual' AND typer has an active virtual number AND
    // typer preferred-number-type is 'app'). In that case we emit the
    // outer virtual-number identity instead. See sealed-sender.md §4.
    // Returns one of three states:
    //   - { kind: 'sealed', payload }       → virtual conversation, sealed-ready
    //   - { kind: 'legacy', payload }       → non-virtual conversation, legacy {userId, conversationId}
    //   - { kind: 'suppress' }              → virtual conversation but sender lacks active VN
    //
    // FAIL-CLOSED rule (audit feedback): in a virtual conversation we
    // must NEVER fall back to emitting `userId`. If the sender's VN was
    // released or the lookup failed, suppress the typing event entirely
    // rather than re-leaking the real userId that sealed-sender is
    // designed to hide. The trade-off — typing indicator briefly missing
    // during a state transition — is correct: a missing indicator is
    // recoverable; a leaked identifier is not.
    const buildTypingPayload = async (conversationId: string): Promise<
      | { kind: 'sealed'; payload: Record<string, unknown> }
      | { kind: 'legacy'; payload: Record<string, unknown> }
      | { kind: 'suppress' }
    > => {
      try {
        const [u, conv] = await Promise.all([
          storage.getUser(userId),
          storage.getConversationById(conversationId),
        ]);
        const isVirtualConv = (conv as any)?.numberType === 'virtual';
        if (isVirtualConv) {
          const senderUsesApp = u?.preferredNumberType === 'app' && !!u?.virtualNumberId;
          if (senderUsesApp && u?.virtualNumberId) {
            const owns = await storage.ownsVirtualNumber(userId, u.virtualNumberId);
            if (owns) {
              const vn = await storage.getVirtualNumber(u.virtualNumberId);
              if (vn) {
                return {
                  kind: 'sealed',
                  payload: {
                    conversationId,
                    viaVirtualNumber: vn.phoneNumber,
                    viaVirtualNumberId: vn.id,
                    senderDisplayName: u.displayName ?? null,
                  },
                };
              }
            }
          }
          // Virtual conversation but we cannot produce a sealed payload —
          // suppress rather than leak `userId`.
          return { kind: 'suppress' };
        }
        return { kind: 'legacy', payload: { userId, conversationId } };
      } catch (err) {
        console.error('typing payload resolve failed:', err);
        // On error, fail closed for ALL conversations. A missing typing
        // indicator is preferable to an accidental userId leak.
        return { kind: 'suppress' };
      }
    };

    socket.on('typing', async (data) => {
      try {
        const u = await storage.getUser(userId);
        if (u && u.typingIndicatorsEnabled === false) return;
      } catch {}
      const result = await buildTypingPayload(data.conversationId);
      if (result.kind === 'suppress') return;
      socket.to(`conversation:${data.conversationId}`).emit('user-typing', result.payload);
    });

    socket.on('stop-typing', async (data) => {
      const result = await buildTypingPayload(data.conversationId);
      if (result.kind === 'suppress') return;
      socket.to(`conversation:${data.conversationId}`).emit('user-stop-typing', result.payload);
    });

    // Write a system "call event" message into the conversation (Missed,
    // Declined, or Ended) and broadcast it so both sides see it in chat
    // immediately. Skipped for sealed calls — those intentionally hide
    // the caller's userId from the recipient, and a senderId-bearing
    // message would leak that. Failures are logged but never thrown:
    // a missing call-event row must not break call signaling.
    const recordCallEvent = async (params: {
      callerId: string;
      receiverId: string;
      callType: 'audio' | 'video';
      action: 'missed' | 'declined' | 'ended';
      durationSec?: number;
      sealed?: boolean;
      // Preferred: pass the conversationId the call was placed from so the
      // event lands in the exact thread the user dialed from (personal vs
      // virtual). Falls back to the default personal conversation only if
      // the caller's client never sent one.
      conversationId?: string;
    }) => {
      try {
        if (params.sealed) return;
        // Validate caller-supplied conversationId: must exist AND have
        // both caller + receiver as participants. Without this check a
        // malicious client could pass any conversation id and inject a
        // call_event row into an unrelated thread. If validation fails
        // we silently fall back to the caller/receiver default
        // conversation — never write into the suspect thread.
        let conversation: Awaited<ReturnType<typeof storage.getConversationById>> | null = null;
        if (params.conversationId) {
          const claimed = await storage.getConversationById(params.conversationId);
          if (claimed) {
            const participants = await storage.getConversationParticipants(claimed.id);
            const participantIds = new Set(participants.map(p => p.userId));
            if (participantIds.has(params.callerId) && participantIds.has(params.receiverId)) {
              conversation = claimed;
            }
          }
        }
        if (!conversation) {
          conversation = await storage.getOrCreateConversation(
            params.callerId,
            params.receiverId,
          );
        }
        const payload: Record<string, unknown> = {
          action: params.action,
          callType: params.callType,
        };
        if (typeof params.durationSec === 'number' && params.durationSec > 0) {
          payload.duration = params.durationSec;
        }
        const eventMessage = await storage.createMessage(
          {
            conversationId: conversation.id,
            senderId: params.callerId,
            receiverId: params.receiverId,
            content: JSON.stringify(payload),
            mediaType: 'call_event',
            mediaUrl: null,
            isHidden: false,
          } as any,
          { isEncrypted: false, encryptionVersion: 'none' },
        );
        io.to(`conversation:${conversation.id}`).emit('new-message', eventMessage);
        // Also direct-emit to each user so they get it even if neither
        // socket is currently joined to the conversation room (e.g. user
        // is on the chat list, not inside the conversation).
        io.to(params.callerId).emit('new-message', eventMessage);
        io.to(params.receiverId).emit('new-message', eventMessage);
      } catch (err) {
        console.error('[call-event] failed to record:', err);
      }
    };

    socket.on('call-user', async (data) => {
      const caller = await storage.getUser(userId);
      const receiver = await storage.getUser(data.receiverId);
      let callerPhoneNumber = caller?.phoneNumber || '';

      // Phase C.1: resolve sealed status from the call row created by
      // POST /api/calls so the signaling decision matches what was
      // persisted. Falls back to false if the row is missing (legacy
      // clients that never POSTed — degrade to non-sealed).
      const callRow = data.callId ? await storage.getCall(data.callId) : undefined;
      const sealed = !!callRow?.sealedCall;

      if (caller?.preferredNumberType === 'app' && caller?.virtualNumberId) {
        const virtualNumber = await storage.getVirtualNumber(caller.virtualNumberId);
        if (virtualNumber) {
          callerPhoneNumber = virtualNumber.phoneNumber;
        }
      }

      // On sealed calls the recipient's payload has NO callerId — they
      // see only the caller's virtual-number string under callerName.
      // Accept/reject/end signaling routes via callId lookup below so
      // the recipient never needs to know the caller's userId.
      const incomingCallPayload: Record<string, unknown> = {
        callerId: sealed ? null : userId,
        callId: data.callId,
        type: data.type,
        callerPhoneNumber,
        sealedCall: sealed,
      };
      incomingCallPayload.callerName = sealed
        ? callerPhoneNumber || 'Unknown number'
        : data.callerName;

      io.to(data.receiverId).emit('incoming-call', incomingCallPayload);

      if (receiver?.pushToken && receiver?.notificationsEnabled !== false) {
        const callerNameForPush = sealed
          ? callerPhoneNumber || 'Unknown number'
          : (caller?.displayName || callerPhoneNumber || 'Someone');
        sendCallNotification(
          receiver.pushToken,
          callerNameForPush,
          data.type || 'audio',
          data.callId,
          sealed ? null : userId,
          data.conversationId,
          { sealed },
        ).catch(err => console.error('Call push notification failed:', err));

        // Real phone-call-style ringing (CallKit, via a PushKit VoIP push)
        // when the recipient's device has registered one — see
        // pushNotifications.ts for why this can't go through Expo's push
        // service and is a safe no-op until APNs VoIP credentials are
        // configured. Sent alongside, not instead of, the regular push
        // above: the regular push still drives the in-app banner/history,
        // this is what actually wakes the app to ring.
        if (receiver.voipPushToken) {
          sendVoipCallPush(receiver.voipPushToken, {
            uuid: data.callId,
            callerName: callerNameForPush,
            handle: callerNameForPush,
            hasVideo: data.type === 'video',
            callId: data.callId,
            callerId: sealed ? null : userId,
            conversationId: data.conversationId,
            sealedCall: sealed,
          }).catch(err => console.error('VoIP push notification failed:', err));
        }
      }

      // Per-call answered flag — shared between the missed-timeout, the
      // accept handler, the reject handler, and the end handler so each
      // can decide whether to record "missed" vs "declined" vs "ended"
      // without re-querying the DB.
      let callWasAnswered = false;
      // Idempotency latch: the timeout, reject, and end paths can all
      // race (e.g. recipient hits Decline at 29.9s while the 30s timer
      // is firing). The first one to record an event wins; subsequent
      // ones short-circuit so we never write two call-event rows for
      // the same call.
      let eventRecorded = false;
      const tryRecordCallEvent = (params: Parameters<typeof recordCallEvent>[0]) => {
        if (eventRecorded) return;
        eventRecorded = true;
        recordCallEvent(params);
      };

      const missedCallTimeout = setTimeout(async () => {
        if (callWasAnswered) return;
        if (receiver?.pushToken && receiver?.notificationsEnabled !== false) {
          const callerNameForPush = sealed
            ? callerPhoneNumber || 'Unknown number'
            : (caller?.displayName || callerPhoneNumber || 'Someone');
          sendMissedCallNotification(
            receiver.pushToken,
            callerNameForPush,
            data.type || 'audio',
            sealed ? null : userId,
            data.conversationId,
            { sealed },
          ).catch(err => console.error('Missed call push notification failed:', err));
        }
        // Drop a "Missed call" row into the conversation so it shows up
        // in chat (Snapchat/WhatsApp parity). Push notification already
        // fired above; this is the in-app record.
        tryRecordCallEvent({
          callerId: userId,
          receiverId: data.receiverId,
          callType: data.type || 'audio',
          action: 'missed',
          sealed,
          conversationId: data.conversationId,
        });
      }, 30000);

      const callAcceptedHandler = (acceptData: any) => {
        if (acceptData.callId === data.callId) {
          callWasAnswered = true;
          clearTimeout(missedCallTimeout);
          socket.off('call-accepted', callAcceptedHandler);
        }
      };
      const callRejectedHandler = (rejectData: any) => {
        if (rejectData.callId === data.callId) {
          clearTimeout(missedCallTimeout);
          socket.off('call-rejected', callRejectedHandler);
          // Recipient hit Decline before answering → record as 'declined'
          // (distinct from 'missed', which is reserved for no-action
          // timeouts and caller-hangups-before-pickup). The renderer
          // surfaces both with their own label.
          if (!callWasAnswered) {
            tryRecordCallEvent({
              callerId: userId,
              receiverId: data.receiverId,
              callType: data.type || 'audio',
              action: 'declined',
              sealed,
              conversationId: data.conversationId,
            });
          }
        }
      };
      const callEndedHandler = (endData: any) => {
        if (endData.callId === data.callId) {
          clearTimeout(missedCallTimeout);
          socket.off('call-ended', callEndedHandler);
          // Call-ended-before-answer = caller hung up while ringing.
          // From the recipient's perspective this is a missed call.
          // For answered calls, an 'ended' row would belong here too,
          // but the duration is only known to the client (which calls
          // PUT /api/calls/:id with `duration` on hangup). We don't
          // double-write — the answered-call timeline lives in call
          // history, not chat.
          if (!callWasAnswered) {
            tryRecordCallEvent({
              callerId: userId,
              receiverId: data.receiverId,
              callType: data.type || 'audio',
              action: 'missed',
              sealed,
              conversationId: data.conversationId,
            });
          }
        }
      };

      socket.on('call-accepted', callAcceptedHandler);
      socket.on('call-rejected', callRejectedHandler);
      socket.on('call-ended', callEndedHandler);

      setTimeout(() => {
        socket.off('call-accepted', callAcceptedHandler);
        socket.off('call-rejected', callRejectedHandler);
        socket.off('call-ended', callEndedHandler);
      }, 35000);
    });

    // Phase C.1: accept/reject/end handlers resolve the peer userId
    // from the call row when the client doesn't (or can't) provide it
    // — sealed-call recipients never learn the caller's userId, so
    // they emit these events with only `callId` and rely on the
    // server's row lookup to route back to the caller. We also
    // authorize the lookup: the emitting socket must be a participant
    // of the call, otherwise the peer could be impersonated.
    const resolvePeer = async (
      data: { callId?: string; callerId?: string; otherUserId?: string },
    ): Promise<string | null> => {
      if (!data.callId) return null;
      const callRow = await storage.getCall(data.callId);
      if (!callRow) return null;
      if (callRow.callerId !== userId && callRow.receiverId !== userId) return null;
      return callRow.callerId === userId ? callRow.receiverId : callRow.callerId;
    };

    socket.on('call-accepted', async (data) => {
      const peer = data.callerId || (await resolvePeer(data));
      if (!peer) return;
      io.to(peer).emit('call-accepted', { callId: data.callId });
    });

    socket.on('call-rejected', async (data) => {
      const peer = data.callerId || (await resolvePeer(data));
      if (!peer) return;
      io.to(peer).emit('call-rejected', { callId: data.callId });
    });

    socket.on('call-ended', async (data) => {
      const peer = data.otherUserId || (await resolvePeer(data));
      if (!peer) return;
      io.to(peer).emit('call-ended', { callId: data.callId });
    });

    socket.on('disconnect', async () => {
      console.log(`User ${userId} disconnected`);
      const sockets = connectedUsers.get(userId);
      let wentFullyOffline = false;
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          connectedUsers.delete(userId);
          wentFullyOffline = true;
        }
      }
      await storage.updateUser(userId, { lastSeen: new Date() });
      // Only the LAST socket disconnecting is a real "went offline" —
      // losing one of several tabs/devices shouldn't flip this.
      if (wentFullyOffline && (socket as any).showActiveStatus) {
        io.to(`presence:${userId}`).emit('user-active-changed', { userId, active: false });
      }
    });
  });

  // Account-deletion sweep job. Runs every 6 hours, picks up users whose
  // 30-day grace window has lapsed, tombstones them. Worst-case lag is
  // <6h; we don't run more often because the query is full-table-scan on
  // pending_deletion_at (indexed, but still) and the cost of one extra
  // tombstone day for an absent user is negligible.
  const ACCOUNT_DELETION_SWEEP_MS = 6 * 60 * 60_000;
  const runAccountDeletionSweep = async () => {
    try {
      const due = await storage.getDueAccountDeletions(50);
      if (due.length === 0) return;
      for (const u of due) {
        try {
          await storage.executeHardDelete(u.id);
          console.log(`[deleteAccountSweep] tombstoned user ${u.id}`);
          // Disconnect any lingering sockets the user might still have.
          const sockets = connectedUsers.get(u.id);
          if (sockets) {
            const ioRef = getIO();
            if (ioRef) {
              for (const sid of sockets) {
                ioRef.to(sid).emit('account-deleted');
                ioRef.to(sid).disconnectSockets(true);
              }
            }
            connectedUsers.delete(u.id);
          }
        } catch (err) {
          console.error(`[deleteAccountSweep] failed for ${u.id}:`, err);
        }
      }
    } catch (err) {
      console.error('[deleteAccountSweep] tick error:', err);
    }
  };
  // First tick after 60s (gives the server a chance to come up cleanly),
  // then every 6h.
  const accountDeletionFirstTick = setTimeout(runAccountDeletionSweep, 60_000);
  const accountDeletionSweepInterval = setInterval(runAccountDeletionSweep, ACCOUNT_DELETION_SWEEP_MS);
  if (typeof (accountDeletionFirstTick as any).unref === 'function') (accountDeletionFirstTick as any).unref();
  if (typeof (accountDeletionSweepInterval as any).unref === 'function') (accountDeletionSweepInterval as any).unref();

  // Disappearing-message sweep job. Runs every 60s, hard-deletes any
  // ciphertext whose expiresAt has passed, and broadcasts so connected
  // clients can drop their local copy. Only ever sees ciphertext.
  const sweepInterval = setInterval(async () => {
    try {
      const expired = await storage.sweepExpiredMessages();
      if (expired.length === 0) return;
      const ioRef = getIO();
      if (!ioRef) return;
      const byConv = new Map<string, string[]>();
      for (const e of expired) {
        const arr = byConv.get(e.conversationId) ?? [];
        arr.push(e.id);
        byConv.set(e.conversationId, arr);
      }
      for (const [conversationId, messageIds] of byConv) {
        ioRef.to(`conversation:${conversationId}`).emit('messages-expired', {
          conversationId, messageIds,
        });
      }
      console.log(`[Sweep] Expired ${expired.length} messages`);
    } catch (err) {
      console.error('[Sweep] Failed:', err);
    }
  }, 60_000);
  // Prevent the interval from keeping the process alive during tests/HMR.
  if (typeof (sweepInterval as any).unref === 'function') (sweepInterval as any).unref();

  return httpServer;
}
