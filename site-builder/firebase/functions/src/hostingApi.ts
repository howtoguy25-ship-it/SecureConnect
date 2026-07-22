import { getApp } from 'firebase-admin/app';

// Thin wrapper around the real Firebase Hosting REST API (v1beta1) for attaching a
// user's own domain to this project's default Hosting site, so `servePublishedSite` can
// answer requests for it. Uses the Cloud Function's own service account credential
// (already available via firebase-admin) to authenticate rather than pulling in a
// separate googleapis/google-auth-library dependency.
//
// Requires the Cloud Functions runtime service account to have the "Firebase Hosting
// Admin" IAM role -- grant it once in Google Cloud Console > IAM (see ROADMAP.md).
//
// NOTE: this talks to a real, external Google API this project's automated setup has
// never exercised end-to-end (unlike the rest of this app's Firebase calls, which the
// user has already run for real) -- treat the first live "Connect a domain" attempt as
// something to debug together if the exact response shape differs from what's coded here.

const HOSTING_API_BASE = 'https://firebasehosting.googleapis.com/v1beta1';

async function getAccessToken(): Promise<string> {
  const credential = getApp().options.credential;
  if (!credential) throw new Error('No Admin SDK credential available to call the Hosting API.');
  const token = await credential.getAccessToken();
  return token.access_token;
}

function siteId(): string {
  const projectId = process.env.GCLOUD_PROJECT;
  if (!projectId) throw new Error('GCLOUD_PROJECT is not set — cannot resolve the default Hosting site.');
  return projectId;
}

export interface HostingDnsRecord {
  domainName: string;
  type: string;
  requiredValue: string;
}

export interface HostingDomainStatus {
  domainName: string;
  status: string; // e.g. DOMAIN_CHANGE_PENDING, DOMAIN_ACTIVE, DOMAIN_VERIFICATION_REQUIRED
  certStatus?: string;
  dnsRecords: HostingDnsRecord[];
}

function parseDomainResponse(data: any): HostingDomainStatus {
  const dnsRecords: HostingDnsRecord[] = (data?.provisioning?.dnsRecords ?? []).map((r: any) => ({
    domainName: r.domainName,
    type: r.type,
    requiredValue: r.requiredValue,
  }));
  return {
    domainName: data?.domainName,
    status: data?.status ?? 'UNKNOWN',
    certStatus: data?.provisioning?.certStatus,
    dnsRecords,
  };
}

export async function createHostingDomain(domainName: string): Promise<HostingDomainStatus> {
  const token = await getAccessToken();
  // The Domain resource requires BOTH `domainName` and `site` in the request body -- `site`
  // isn't inferred from the `parent` path parameter alone. The API compares it against
  // `parent`'s site segment as a BARE id, not the `sites/<id>` resource path -- confirmed
  // live: sending the prefixed form produced "Mismatched sites in request: `parent` has
  // `sitespark-a5817`, `domain` has `sites/sitespark-a5817`", i.e. the two must match
  // exactly as plain ids.
  const res = await fetch(`${HOSTING_API_BASE}/sites/${siteId()}/domains`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ domainName, site: siteId() }),
  });
  const data = (await res.json()) as any;
  if (!res.ok) throw new Error(data?.error?.message ?? `Hosting API error (${res.status}) creating domain.`);
  return parseDomainResponse(data);
}

export async function getHostingDomain(domainName: string): Promise<HostingDomainStatus | null> {
  const token = await getAccessToken();
  const res = await fetch(`${HOSTING_API_BASE}/sites/${siteId()}/domains/${encodeURIComponent(domainName)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) return null;
  const data = (await res.json()) as any;
  if (!res.ok) throw new Error(data?.error?.message ?? `Hosting API error (${res.status}) reading domain.`);
  return parseDomainResponse(data);
}

export async function deleteHostingDomain(domainName: string): Promise<void> {
  const token = await getAccessToken();
  const res = await fetch(`${HOSTING_API_BASE}/sites/${siteId()}/domains/${encodeURIComponent(domainName)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok && res.status !== 404) {
    const data = (await res.json().catch(() => null)) as any;
    throw new Error(data?.error?.message ?? `Hosting API error (${res.status}) deleting domain.`);
  }
}
