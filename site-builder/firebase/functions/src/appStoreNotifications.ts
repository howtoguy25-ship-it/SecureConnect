import { SignedDataVerifier, Environment, NotificationTypeV2, Subtype } from '@apple/app-store-server-library';
import { APPLE_ROOT_CERTIFICATES } from './appleRootCert';
import { APPLE_BUNDLE_ID } from './iapProducts';

// The app's numeric App Store ID (NOT the bundle ID) -- App Store Connect -> your app ->
// App Information -> General Information -> "Apple ID" (also the number in the app's public
// apps.apple.com/.../id<this> URL once listed). Not a secret, just not known until the app
// exists in App Store Connect -- fill it in once it does. Apple's library requires it to
// construct a Production-environment verifier (it throws otherwise), so until it's set here,
// production notification verification fails at call time -- see getProductionVerifier below --
// rather than crashing the whole functions deploy the way a module-level throw would.
const APPLE_APP_STORE_ID: number | undefined = undefined;

// Real verification of Apple's App Store Server Notifications V2 -- the inbound webhook
// Apple calls on subscription lifecycle events (renewal, renewal failure, cancellation).
// Unlike appStoreApi.ts's outbound calls (where trusting the HTTPS channel to Apple is
// enough), this is a public URL anyone can POST to, so every payload's JWS signature chain
// is verified against Apple's own root CA before any of its contents are trusted -- otherwise
// anyone could forge a "payment failed"/"payment succeeded" event to take down or revive any
// user's live site. `enableOnlineChecks: true` also has the verifier check each certificate's
// OCSP revocation status with Apple, not just its expiry.
//
// Built lazily (constructed on first use, not at module load) so a missing/wrong
// APPLE_APP_STORE_ID only breaks actual production-notification verification at call time --
// it must NOT throw during `firebase deploy`, which loads this whole file just to read its
// exports and would otherwise take down every other function's deploy along with it.
let _productionVerifier: SignedDataVerifier | null = null;
function getProductionVerifier(): SignedDataVerifier {
  if (!_productionVerifier) {
    if (!APPLE_APP_STORE_ID) {
      throw new Error(
        'APPLE_APP_STORE_ID is not set in appStoreNotifications.ts -- fill it in from App Store Connect (App Information -> Apple ID) before production notifications can be verified.'
      );
    }
    _productionVerifier = new SignedDataVerifier(APPLE_ROOT_CERTIFICATES, true, Environment.PRODUCTION, APPLE_BUNDLE_ID, APPLE_APP_STORE_ID);
  }
  return _productionVerifier;
}

let _sandboxVerifier: SignedDataVerifier | null = null;
function getSandboxVerifier(): SignedDataVerifier {
  if (!_sandboxVerifier) {
    _sandboxVerifier = new SignedDataVerifier(APPLE_ROOT_CERTIFICATES, true, Environment.SANDBOX, APPLE_BUNDLE_ID);
  }
  return _sandboxVerifier;
}

export type BillingEventKind = 'payment_failed' | 'payment_resolved' | 'ignored';

export interface BillingEvent {
  kind: BillingEventKind;
  originalTransactionId: string | null;
  notificationType: string;
  subtype: string | null;
}

// A renewal failure that has fully exhausted Apple's own retry/grace window is treated the
// same as the first failure notification for our purposes -- either way, the account moves
// to (or stays in) "past_due" and our own grace-period timer (see BILLING_GRACE_PERIOD_MS in
// index.ts) governs when the site actually comes down, independent of Apple's timeline.
const FAILURE_TYPES = new Set<string>([NotificationTypeV2.DID_FAIL_TO_RENEW, NotificationTypeV2.GRACE_PERIOD_EXPIRED]);
const RESOLVED_TYPES = new Set<string>([NotificationTypeV2.DID_RENEW, NotificationTypeV2.SUBSCRIBED]);

// Verifies the payload came from Apple (trying production then sandbox, same pattern as
// appStoreApi.ts's getTransactionInfo -- there's no way to know which environment a given
// notification is from ahead of time), decodes it, and classifies it as a real payment
// failure/recovery or something we don't act on (refunds, offer redemptions, etc. are left
// alone; a voluntary cancellation is not a "payment failure" and does not trigger suspension).
export async function verifyAndClassifyNotification(signedPayload: string): Promise<BillingEvent> {
  let decoded;
  try {
    decoded = await getProductionVerifier().verifyAndDecodeNotification(signedPayload);
  } catch {
    decoded = await getSandboxVerifier().verifyAndDecodeNotification(signedPayload);
  }

  const notificationType = String(decoded.notificationType ?? '');
  const subtype = decoded.subtype ? String(decoded.subtype) : null;

  let originalTransactionId: string | null = null;
  if (decoded.data?.signedTransactionInfo) {
    const verifier = decoded.data.environment === Environment.SANDBOX ? getSandboxVerifier() : getProductionVerifier();
    const tx = await verifier.verifyAndDecodeTransaction(decoded.data.signedTransactionInfo);
    originalTransactionId = tx.originalTransactionId ?? null;
  }

  if (!originalTransactionId) {
    return { kind: 'ignored', originalTransactionId: null, notificationType, subtype };
  }

  const isExpiredFromBillingRetry = notificationType === NotificationTypeV2.EXPIRED && subtype === Subtype.BILLING_RETRY;
  if (FAILURE_TYPES.has(notificationType) || isExpiredFromBillingRetry) {
    return { kind: 'payment_failed', originalTransactionId, notificationType, subtype };
  }
  if (RESOLVED_TYPES.has(notificationType)) {
    return { kind: 'payment_resolved', originalTransactionId, notificationType, subtype };
  }
  return { kind: 'ignored', originalTransactionId, notificationType, subtype };
}
