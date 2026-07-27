// Single source of truth for the server's public origin, off of the same
// EXPO_PUBLIC_DOMAIN the client already bakes in at build time (see
// client/config/env.ts and eas.json). Previously several call sites here
// derived this from REPLIT_DOMAINS, which only exists inside a Replit
// container and left CORS/Stripe-redirect/webhook URLs broken on any other
// host.

export function getAppBaseUrl(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN || process.env.REPLIT_DOMAINS?.split(',')[0];
  return domain ? `https://${domain}` : 'http://localhost:5000';
}

export function getAllowedOrigins(): string[] {
  const origins = new Set<string>();
  if (process.env.EXPO_PUBLIC_DOMAIN) {
    origins.add(`https://${process.env.EXPO_PUBLIC_DOMAIN}`);
  }
  if (process.env.REPLIT_DEV_DOMAIN) {
    origins.add(`https://${process.env.REPLIT_DEV_DOMAIN}`);
  }
  if (process.env.REPLIT_DOMAINS) {
    process.env.REPLIT_DOMAINS.split(',').forEach((d) => origins.add(`https://${d.trim()}`));
  }
  return Array.from(origins);
}
