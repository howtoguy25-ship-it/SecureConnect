import { SignedDataVerifier, Environment, NotificationTypeV2, Subtype } from '@apple/app-store-server-library';
import { APPLE_ROOT_CERTIFICATES } from './appleRootCert';
import { APPLE_BUNDLE_ID } from './iapProducts';

// Real verification of Apple's App Store Server Notifications V2 -- the inbound webhook
// Apple calls on subscription lifecycle events (renewal, renewal failure, cancellation).
// Unlike appStoreApi.ts's outbound calls (where trusting the HTTPS channel to Apple is
// enough), this is a public URL anyone can POST to, so every payload's JWS signature chain
// is verified against Apple's own root CA before any of its contents are trusted -- otherwise
// anyone could forge a "payment failed"/"payment succeeded" event to take down or revive any
// user's live site. `enableOnlineChecks: true` also has the verifier check each certificate's
// OCSP revocation status with Apple, not just its expiry.
const productionVerifier = new SignedDataVerifier(APPLE_ROOT_CERTIFICATES, true, Environment.PRODUCTION, APPLE_BUNDLE_ID);
const sandboxVerifier = new SignedDataVerifier(APPLE_ROOT_CERTIFICATES, true, Environment.SANDBOX, APPLE_BUNDLE_ID);

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
    decoded = await productionVerifier.verifyAndDecodeNotification(signedPayload);
  } catch {
    decoded = await sandboxVerifier.verifyAndDecodeNotification(signedPayload);
  }

  const notificationType = String(decoded.notificationType ?? '');
  const subtype = decoded.subtype ? String(decoded.subtype) : null;

  let originalTransactionId: string | null = null;
  if (decoded.data?.signedTransactionInfo) {
    const verifier = decoded.data.environment === Environment.SANDBOX ? sandboxVerifier : productionVerifier;
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
