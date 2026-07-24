import { httpsCallable } from 'firebase/functions';
import { collection, getDocs, onSnapshot, orderBy, query } from 'firebase/firestore';
import { functions, db } from '@/services/firebase';
import { requireFunctions } from '@/services/requireFunctions';
import { requireDb } from '@/services/requireDb';
import { RegistrantContact, DomainTransfer, DomainPurchase } from '@/types';

// Real domains this account owns -- every completed purchase (via createDomainCheckout +
// the Stripe webhook) and every inbound transfer, for a persistent "Domains" tab rather
// than only ever seeing DNS setup once, during the one-shot buy/transfer flow.
export async function listDomainPurchases(uid: string): Promise<DomainPurchase[]> {
  const snapshot = await getDocs(query(collection(requireDb(db), 'users', uid, 'domainPurchases'), orderBy('createdAt', 'desc')));
  return snapshot.docs.map((d) => d.data() as DomainPurchase);
}

export function subscribeDomainPurchases(uid: string, onChange: (purchases: DomainPurchase[]) => void): () => void {
  return onSnapshot(query(collection(requireDb(db), 'users', uid, 'domainPurchases'), orderBy('createdAt', 'desc')), (snap) => {
    onChange(snap.docs.map((d) => d.data() as DomainPurchase));
  });
}

export async function listDomainTransfers(uid: string): Promise<DomainTransfer[]> {
  const snapshot = await getDocs(query(collection(requireDb(db), 'users', uid, 'domainTransfers'), orderBy('createdAt', 'desc')));
  return snapshot.docs.map((d) => d.data() as DomainTransfer);
}

export function subscribeDomainTransfers(uid: string, onChange: (transfers: DomainTransfer[]) => void): () => void {
  return onSnapshot(query(collection(requireDb(db), 'users', uid, 'domainTransfers'), orderBy('createdAt', 'desc')), (snap) => {
    onChange(snap.docs.map((d) => d.data() as DomainTransfer));
  });
}

export interface DomainSearchResult {
  domain: string;
  available: boolean;
  priceUsd: number | null;
}

export async function searchDomains(query: string): Promise<DomainSearchResult[]> {
  const call = httpsCallable<{ query: string }, { results: DomainSearchResult[] }>(
    requireFunctions(functions),
    'checkDomainAvailability'
  );
  const result = await call({ query });
  return result.data.results;
}

export interface DomainCheckoutResult {
  purchaseId: string;
  checkoutUrl: string;
}

export async function createDomainCheckout(
  domain: string,
  years: number,
  registrant: RegistrantContact,
  projectId?: string
): Promise<DomainCheckoutResult> {
  const call = httpsCallable<
    { domain: string; years: number; registrant: RegistrantContact; projectId?: string },
    DomainCheckoutResult
  >(requireFunctions(functions), 'createDomainCheckout');
  const result = await call({ domain, years, registrant, projectId });
  return result.data;
}

export async function startDomainTransfer(
  domain: string,
  eppCode: string,
  registrant: RegistrantContact
): Promise<DomainTransfer> {
  const call = httpsCallable<{ domain: string; eppCode: string; registrant: RegistrantContact }, DomainTransfer>(
    requireFunctions(functions),
    'startDomainTransfer'
  );
  const result = await call({ domain, eppCode, registrant });
  return result.data;
}

export async function getDomainTransferStatus(transferDocId: string): Promise<DomainTransfer> {
  const call = httpsCallable<{ transferDocId: string }, DomainTransfer>(
    requireFunctions(functions),
    'getDomainTransferStatus'
  );
  const result = await call({ transferDocId });
  return result.data;
}

// Registrar-lock status/control for a domain SiteSpark registered for the user -- the
// real, working half of moving it to a different registrar later (getting the actual
// EPP/auth code has no self-serve Namecheap API, so that step is a support request instead
// of a button here).
export async function getDomainLockStatus(domain: string): Promise<{ locked: boolean }> {
  const call = httpsCallable<{ domain: string }, { locked: boolean }>(requireFunctions(functions), 'getDomainLockStatus');
  const result = await call({ domain });
  return result.data;
}

export async function setDomainLockStatus(domain: string, locked: boolean): Promise<{ locked: boolean }> {
  const call = httpsCallable<{ domain: string; locked: boolean }, { locked: boolean }>(
    requireFunctions(functions),
    'setDomainLockStatus'
  );
  const result = await call({ domain, locked });
  return result.data;
}
