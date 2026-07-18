import { httpsCallable } from 'firebase/functions';
import { functions } from '@/services/firebase';
import { requireFunctions } from '@/services/requireFunctions';
import { RegistrantContact, DomainTransfer } from '@/types';

export interface DomainSearchResult {
  domain: string;
  priceUsd: number;
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
