import jwt from 'jsonwebtoken';

// Real integration with Apple's App Store Server API to authoritatively verify a
// StoreKit purchase server-side -- never trust a client-reported "I paid" on its own.
// Requires an App Store Connect "In-App Purchase" key (Users and Access ->
// Integrations -> In-App Purchase -> generate one): its Key ID, your Issuer ID, and the
// downloaded .p8 private key contents, all stored as Firebase secrets (never pasted in
// chat -- see ROADMAP.md Phase 4 setup steps).
//
// NOTE: like hostingApi.ts/namecheapApi.ts's transfer functions, this hasn't been
// exercised against a real Apple transaction from this sandbox -- treat the first real
// purchase verification as something to debug together if the response shape differs.

const PRODUCTION_BASE = 'https://api.storekit.itunes.apple.com';
const SANDBOX_BASE = 'https://api.storekit-sandbox.itunes.apple.com';

export interface AppStoreCredentials {
  keyId: string;
  issuerId: string;
  privateKey: string; // .p8 file contents (PEM)
  bundleId: string;
}

function createSignedJwt(creds: AppStoreCredentials): string {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      iss: creds.issuerId,
      iat: now,
      exp: now + 60 * 30, // 30 minutes -- well under Apple's 1 hour max
      aud: 'appstoreconnect-v1',
      bid: creds.bundleId,
    },
    creds.privateKey,
    { algorithm: 'ES256', keyid: creds.keyId }
  );
}

function decodeJwsPayload(jws: string): any {
  const payload = jws.split('.')[1];
  const json = Buffer.from(payload, 'base64url').toString('utf8');
  return JSON.parse(json);
}

export interface AppleTransactionInfo {
  transactionId: string;
  originalTransactionId: string;
  bundleId: string;
  productId: string;
  purchaseDate: number;
  expiresDate: number | null;
  type: string; // 'Auto-Renewable Subscription' | 'Non-Consumable' | 'Consumable' | 'Non-Renewing Subscription'
  environment: string; // 'Production' | 'Sandbox'
}

async function fetchTransaction(base: string, transactionId: string, token: string): Promise<AppleTransactionInfo | null> {
  const res = await fetch(`${base}/inApps/v1/transactions/${transactionId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`App Store Server API error (${res.status}): ${text}`);
  }
  const data = (await res.json()) as { signedTransactionInfo: string };
  return decodeJwsPayload(data.signedTransactionInfo) as AppleTransactionInfo;
}

// Tries production first, then sandbox -- a transaction ID from a TestFlight/sandbox
// purchase only exists in the sandbox environment, and there's no way to know which one
// a given ID came from ahead of time (this is Apple's own documented approach).
export async function getTransactionInfo(creds: AppStoreCredentials, transactionId: string): Promise<AppleTransactionInfo> {
  const token = createSignedJwt(creds);
  const fromProduction = await fetchTransaction(PRODUCTION_BASE, transactionId, token);
  if (fromProduction) return fromProduction;
  const fromSandbox = await fetchTransaction(SANDBOX_BASE, transactionId, token);
  if (fromSandbox) return fromSandbox;
  throw new Error('Transaction not found in production or sandbox.');
}
