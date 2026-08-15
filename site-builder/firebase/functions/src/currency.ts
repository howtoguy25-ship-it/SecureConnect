// Every price in this codebase is stored as a plain decimal number (fields still named
// *Usd for historical reasons, from before sellers could pick a currency) -- what actually
// changes per seller is which real-world currency that number is denominated in and charged
// through Stripe as. This is the single source of truth for the symbol/code shown next to it
// and the list of currencies a seller can actually pick.
export const CURRENCY_OPTIONS = ['usd', 'eur', 'gbp', 'cad', 'aud', 'nzd', 'jpy', 'inr', 'mxn', 'chf', 'sek', 'sgd', 'zar', 'brl', 'aed'] as const;

export type CurrencyCode = (typeof CURRENCY_OPTIONS)[number];

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

export function isValidCurrency(code: string): code is CurrencyCode {
  return (CURRENCY_OPTIONS as readonly string[]).includes(code.toLowerCase());
}

// Defaults to USD's $ for any seller who set up their store before currency selection
// existed (undefined) or somehow has an unrecognized code.
export function currencySymbol(code: string | undefined | null): string {
  const normalized = (code ?? 'usd').toLowerCase();
  return CURRENCY_SYMBOLS[normalized] ?? `${normalized.toUpperCase()} `;
}
