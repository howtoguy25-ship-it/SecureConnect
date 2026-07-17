import { httpsCallable } from 'firebase/functions';
import { functions } from '@/services/firebase';
import { requireFunctions } from '@/services/requireFunctions';
import { RegistrantContact } from '@/types';

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
