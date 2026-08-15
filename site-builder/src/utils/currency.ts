// Mirrors firebase/functions/src/currency.ts -- see that file's comment for why every price
// field is still named *Usd (historical) while what it's actually denominated/charged in is
// the seller's own SellerAccount.currency.
export const CURRENCY_OPTIONS = ['usd', 'eur', 'gbp', 'cad', 'aud', 'nzd', 'jpy', 'inr', 'mxn', 'chf', 'sek', 'sgd', 'zar', 'brl', 'aed'] as const;

export type CurrencyCode = (typeof CURRENCY_OPTIONS)[number];

export const CURRENCY_LABELS: Record<CurrencyCode, string> = {
  usd: 'USD ($)',
  eur: 'EUR (€)',
  gbp: 'GBP (£)',
  cad: 'CAD (CA$)',
  aud: 'AUD (A$)',
  nzd: 'NZD (NZ$)',
  jpy: 'JPY (¥)',
  inr: 'INR (₹)',
  mxn: 'MXN (MX$)',
  chf: 'CHF',
  sek: 'SEK (kr)',
  sgd: 'SGD (S$)',
  zar: 'ZAR (R)',
  brl: 'BRL (R$)',
  aed: 'AED',
};

const CURRENCY_SYMBOLS: Record<string, string> = {
  usd: '$',
  eur: '€',
  gbp: '£',
  cad: 'CA$',
  aud: 'A$',
  nzd: 'NZ$',
  jpy: '¥',
  inr: '₹',
  mxn: 'MX$',
  chf: 'CHF ',
  sek: 'kr ',
  sgd: 'S$',
  zar: 'R',
  brl: 'R$',
  aed: 'AED ',
};

export function currencySymbol(code: string | undefined | null): string {
  const normalized = (code ?? 'usd').toLowerCase();
  return CURRENCY_SYMBOLS[normalized] ?? `${normalized.toUpperCase()} `;
}
