import { Firestore } from 'firebase-admin/firestore';

export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'site';
}

// Appends a short random suffix and retries until an unused slug is found -- collisions
// are rare (site names are rarely identical) but this keeps published URLs stable and
// human-readable instead of falling back to a raw ID every time.
export async function uniqueSlug(db: Firestore, base: string): Promise<string> {
  let candidate = base;
  let attempt = 0;
  while (attempt < 20) {
    const existing = await db.collection('publishedSites').doc(candidate).get();
    if (!existing.exists) return candidate;
    attempt += 1;
    candidate = `${base}-${Math.random().toString(36).slice(2, 6)}`;
  }
  return `${base}-${Date.now().toString(36)}`;
}
