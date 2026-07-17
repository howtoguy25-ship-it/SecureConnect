import { XMLParser } from 'fast-xml-parser';

// Real Namecheap XML API integration for domain search + registration. Namecheap only
// accepts calls from IP addresses whitelisted on the account, so this must run through
// the Cloud Functions VPC connector + Cloud NAT static IP set up for this project (see
// ROADMAP.md "Phase 7" for the exact gcloud commands) -- callers of these functions need
// `vpcConnector`/`vpcConnectorEgressSettings` set (see index.ts).

const NAMECHEAP_API_BASE = 'https://api.namecheap.com/xml.response';

// Must match the reserved static IP whitelisted on the Namecheap account -- if the NAT IP
// is ever recreated, update this and re-whitelist the new address on Namecheap.
const NAMECHEAP_CLIENT_IP = '35.223.117.40';

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });

export interface NamecheapCredentials {
  apiUser: string;
  apiKey: string;
  userName: string;
}

function buildUrl(creds: NamecheapCredentials, command: string, params: Record<string, string>): string {
  const url = new URL(NAMECHEAP_API_BASE);
  url.searchParams.set('ApiUser', creds.apiUser);
  url.searchParams.set('ApiKey', creds.apiKey);
  url.searchParams.set('UserName', creds.userName);
  url.searchParams.set('ClientIp', NAMECHEAP_CLIENT_IP);
  url.searchParams.set('Command', command);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

async function callNamecheap(creds: NamecheapCredentials, command: string, params: Record<string, string>): Promise<any> {
  const res = await fetch(buildUrl(creds, command, params));
  const text = await res.text();
  const parsed = parser.parse(text);
  const apiResponse = parsed?.ApiResponse;
  if (!apiResponse) throw new Error('Unexpected response from Namecheap.');

  if (apiResponse.Status !== 'OK') {
    const errors = apiResponse.Errors?.Error;
    const list = Array.isArray(errors) ? errors : errors ? [errors] : [];
    const message = list.map((e: any) => (typeof e === 'string' ? e : e['#text'])).join('; ');
    throw new Error(message || 'Namecheap API request failed.');
  }

  return apiResponse.CommandResponse;
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

export interface DomainAvailability {
  domain: string;
  available: boolean;
  isPremium: boolean;
  premiumPriceUsd: number | null;
}

export async function checkAvailability(creds: NamecheapCredentials, domains: string[]): Promise<DomainAvailability[]> {
  const commandResponse = await callNamecheap(creds, 'namecheap.domains.check', { DomainList: domains.join(',') });
  const results = asArray<any>(commandResponse?.DomainCheckResult);
  return results.map((r) => ({
    domain: r.Domain,
    available: r.Available === 'true',
    isPremium: r.IsPremiumName === 'true',
    premiumPriceUsd: r.IsPremiumName === 'true' ? parseFloat(r.PremiumRegistrationPrice) : null,
  }));
}

// namecheap.domains.check doesn't return standard (non-premium) pricing -- that's a
// separate call that happens to return the whole TLD price list at once, so this is
// fetched once per Cloud Function invocation and reused across domains in the same request.
let pricingCache: Map<string, number> | null = null;

export async function getRegistrationPriceUsd(creds: NamecheapCredentials, domain: string): Promise<number | null> {
  if (!pricingCache) {
    const commandResponse = await callNamecheap(creds, 'namecheap.users.getPricing', {
      ProductType: 'DOMAIN',
      ProductCategory: 'REGISTER',
    });
    pricingCache = new Map();
    const productTypes = asArray<any>(commandResponse?.UserGetPricingResult?.ProductType);
    for (const type of productTypes) {
      const categories = asArray<any>(type.ProductCategory);
      for (const category of categories) {
        if (String(category.Name).toLowerCase() !== 'register') continue;
        const products = asArray<any>(category.Product);
        for (const product of products) {
          const prices = asArray<any>(product.Price);
          const oneYear = prices.find((p) => String(p.Duration) === '1');
          if (oneYear) pricingCache.set(String(product.Name).toLowerCase(), parseFloat(oneYear.Price));
        }
      }
    }
  }

  const tld = domain.split('.').slice(1).join('.').toLowerCase();
  return pricingCache.get(tld) ?? null;
}

export interface RegistrantContact {
  firstName: string;
  lastName: string;
  address1: string;
  city: string;
  stateProvince: string;
  postalCode: string;
  country: string; // 2-letter ISO country code, e.g. "AU"
  phone: string; // format: +NNN.NNNNNNNNNN
  emailAddress: string;
}

export interface RegisterDomainResult {
  domain: string;
  registered: boolean;
  chargedAmountUsd: number;
  domainId: string;
}

export async function registerDomain(
  creds: NamecheapCredentials,
  domain: string,
  years: number,
  contact: RegistrantContact
): Promise<RegisterDomainResult> {
  const contactParams: Record<string, string> = {};
  (['Registrant', 'Tech', 'Admin', 'AuxBilling'] as const).forEach((role) => {
    contactParams[`${role}FirstName`] = contact.firstName;
    contactParams[`${role}LastName`] = contact.lastName;
    contactParams[`${role}Address1`] = contact.address1;
    contactParams[`${role}City`] = contact.city;
    contactParams[`${role}StateProvince`] = contact.stateProvince;
    contactParams[`${role}PostalCode`] = contact.postalCode;
    contactParams[`${role}Country`] = contact.country;
    contactParams[`${role}Phone`] = contact.phone;
    contactParams[`${role}EmailAddress`] = contact.emailAddress;
  });

  const commandResponse = await callNamecheap(creds, 'namecheap.domains.create', {
    DomainName: domain,
    Years: String(years),
    // Free WHOIS privacy on eligible TLDs, so the registrant's real contact info (required
    // by ICANN for every registration) isn't publicly exposed in WHOIS lookups.
    AddFreeWhoisguard: 'yes',
    WGEnabled: 'yes',
    ...contactParams,
  });

  const result = commandResponse?.DomainCreateResult;
  return {
    domain: result?.Domain ?? domain,
    registered: result?.Registered === 'true',
    chargedAmountUsd: parseFloat(result?.ChargedAmount ?? '0'),
    domainId: String(result?.DomainID ?? ''),
  };
}
