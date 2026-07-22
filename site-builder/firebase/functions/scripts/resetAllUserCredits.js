// One-time admin migration: sets every existing user's credit balance to a fixed number.
// Not a deployed Cloud Function on purpose -- a callable that resets every account's
// credits would be far too dangerous to leave reachable in production, even gated behind
// auth. Run this once, by hand, from an already-authenticated environment (Cloud Shell
// with this project selected, or a local machine logged in via
// `gcloud auth application-default login` for this project).
//
// Usage:
//   node resetAllUserCredits.js <targetCredits>
//   node resetAllUserCredits.js 38
//
// Safe to re-run -- it's idempotent (just sets the same field to the same value again).

const admin = require('firebase-admin');

const targetCredits = Number(process.argv[2]);
if (!Number.isFinite(targetCredits) || targetCredits < 0) {
  console.error('Usage: node resetAllUserCredits.js <targetCredits>  (e.g. node resetAllUserCredits.js 38)');
  process.exit(1);
}

admin.initializeApp();
const db = admin.firestore();

async function main() {
  const usersSnap = await db.collection('users').get();
  console.log(`Found ${usersSnap.size} user account(s). Setting credits to ${targetCredits}...`);

  const BATCH_SIZE = 400; // stay comfortably under Firestore's 500-write batch limit
  const docs = usersSnap.docs;
  let updated = 0;

  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const chunk = docs.slice(i, i + BATCH_SIZE);
    for (const doc of chunk) {
      batch.set(doc.ref, { credits: targetCredits }, { merge: true });
    }
    await batch.commit();
    updated += chunk.length;
    console.log(`  ...${updated}/${docs.length}`);
  }

  console.log(`Done. Updated ${updated} user account(s) to ${targetCredits} credits.`);
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
