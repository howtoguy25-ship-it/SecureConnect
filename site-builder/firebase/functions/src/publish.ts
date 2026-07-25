import { Firestore } from 'firebase-admin/firestore';

export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'site';
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 6);
}

// Always appends a short random suffix -- even on the very first try, not only after a
// collision. Two different projects can never literally end up sharing a slug either way
// (this checks Firestore before assigning one), but a bare name-derived slug (e.g. a project
// called "SiteSpark" publishing as exactly sitespark.buildsitespark.com) is guessable and
// looks identical for every user who happens to name their project the same thing, which is
// exactly the "same link for every user" bug this is meant to avoid -- the random suffix is
// the real, unique "credential" at the end of every published link, not just a collision
// fallback. Retries with a fresh suffix until an unused slug is found.
export async function uniqueSlug(db: Firestore, base: string): Promise<string> {
  let attempt = 0;
  while (attempt < 20) {
    const candidate = `${base}-${randomSuffix()}`;
    const existing = await db.collection('publishedSites').doc(candidate).get();
    if (!existing.exists) return candidate;
    attempt += 1;
  }
  return `${base}-${Date.now().toString(36)}`;
}
