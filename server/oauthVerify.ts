import jwt from "jsonwebtoken";
import crypto from "crypto";
import { OAuth2Client } from "google-auth-library";

// ─── Sign in with Apple ─────────────────────────────────────────────────────
// Native flow (expo-apple-authentication / AuthenticationServices), so the
// identityToken's audience is the app's own bundle id — there is no separate
// Service ID to register, unlike the web "Sign in with Apple JS" flow.
const APPLE_BUNDLE_ID = process.env.APPLE_BUNDLE_ID || "com.adham.salameh.secureconnectchat";
const APPLE_ISSUER = "https://appleid.apple.com";
const APPLE_KEYS_URL = "https://appleid.apple.com/auth/keys";

interface AppleJwk {
  kty: string;
  kid: string;
  use: string;
  alg: string;
  n: string;
  e: string;
}

let appleKeysCache: { keys: AppleJwk[]; fetchedAt: number } | null = null;
const APPLE_KEYS_TTL_MS = 60 * 60 * 1000;

async function getApplePublicKey(kid: string): Promise<crypto.KeyObject> {
  if (!appleKeysCache || Date.now() - appleKeysCache.fetchedAt > APPLE_KEYS_TTL_MS) {
    const res = await fetch(APPLE_KEYS_URL);
    if (!res.ok) throw new Error(`Failed to fetch Apple JWKS: ${res.status}`);
    const data = (await res.json()) as { keys: AppleJwk[] };
    appleKeysCache = { keys: data.keys, fetchedAt: Date.now() };
  }
  const jwk = appleKeysCache.keys.find((k) => k.kid === kid);
  if (!jwk) {
    // Key rotated since our cache was populated — refetch once, don't loop.
    const res = await fetch(APPLE_KEYS_URL);
    if (!res.ok) throw new Error(`Failed to fetch Apple JWKS: ${res.status}`);
    const data = (await res.json()) as { keys: AppleJwk[] };
    appleKeysCache = { keys: data.keys, fetchedAt: Date.now() };
    const refetched = appleKeysCache.keys.find((k) => k.kid === kid);
    if (!refetched) throw new Error("Apple signing key not found");
    return crypto.createPublicKey({ key: refetched as unknown as crypto.JsonWebKeyInput["key"], format: "jwk" });
  }
  return crypto.createPublicKey({ key: jwk as unknown as crypto.JsonWebKeyInput["key"], format: "jwk" });
}

export interface OAuthIdentity {
  sub: string;
  email?: string;
  name?: string;
}

export async function verifyAppleIdentityToken(identityToken: string): Promise<OAuthIdentity> {
  const decoded = jwt.decode(identityToken, { complete: true });
  if (!decoded || typeof decoded === "string" || !decoded.header?.kid) {
    throw new Error("Malformed Apple identity token");
  }
  const publicKey = await getApplePublicKey(decoded.header.kid);
  const payload = jwt.verify(identityToken, publicKey, {
    algorithms: ["RS256"],
    issuer: APPLE_ISSUER,
    audience: APPLE_BUNDLE_ID,
  }) as jwt.JwtPayload;

  if (!payload.sub) throw new Error("Apple identity token missing sub");
  return { sub: payload.sub, email: typeof payload.email === "string" ? payload.email : undefined };
}

// ─── Google Sign-In ──────────────────────────────────────────────────────────
// @react-native-google-signin/google-signin is configured client-side with
// `webClientId` (a "Web application" OAuth client, NOT the iOS client) —
// that's what makes the idToken it returns verifiable server-side here,
// since Google issues the idToken with that webClientId as its audience.
const GOOGLE_WEB_CLIENT_ID = process.env.GOOGLE_WEB_CLIENT_ID;
let googleClient: OAuth2Client | null = null;

export function isGoogleSignInConfigured(): boolean {
  return !!GOOGLE_WEB_CLIENT_ID;
}

export async function verifyGoogleIdToken(idToken: string): Promise<OAuthIdentity> {
  if (!GOOGLE_WEB_CLIENT_ID) throw new Error("Google sign-in is not configured");
  if (!googleClient) googleClient = new OAuth2Client(GOOGLE_WEB_CLIENT_ID);

  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: GOOGLE_WEB_CLIENT_ID,
  });
  const payload = ticket.getPayload();
  if (!payload?.sub) throw new Error("Google id token missing sub");
  return { sub: payload.sub, email: payload.email, name: payload.name };
}

// ─── Phone-link tokens ───────────────────────────────────────────────────────
// Bridges "we verified this Apple/Google identity" to "now attach it to
// whichever account comes out of the normal SMS phone-verification flow"
// without trusting a client-supplied provider id directly (which would let
// anyone hijack an arbitrary Apple/Google account id by just POSTing a
// string). Short-lived and signed with the same server secret as auth JWTs,
// but tagged `typ` so it's never accepted anywhere a real session JWT is.
const OAUTH_LINK_TTL = "10m";

export function signOAuthLinkToken(provider: "apple" | "google", identity: OAuthIdentity, secret: string): string {
  return jwt.sign(
    { typ: "oauth_link", provider, sub: identity.sub, email: identity.email },
    secret,
    { expiresIn: OAUTH_LINK_TTL },
  );
}

export interface OAuthLinkClaims {
  provider: "apple" | "google";
  sub: string;
  email?: string;
}

export function verifyOAuthLinkToken(token: string, secret: string): OAuthLinkClaims {
  const payload = jwt.verify(token, secret) as jwt.JwtPayload & { typ?: string; provider?: string; sub?: string; email?: string };
  if (payload.typ !== "oauth_link" || !payload.provider || !payload.sub) {
    throw new Error("Invalid link token");
  }
  return { provider: payload.provider as "apple" | "google", sub: payload.sub, email: payload.email };
}
