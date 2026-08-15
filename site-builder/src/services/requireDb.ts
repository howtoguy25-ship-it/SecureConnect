import { Firestore } from 'firebase/firestore';

// Only reachable once a user is signed in, which itself requires Firebase to be
// configured (see RootNavigator's FirebaseSetupScreen gate) — this narrows the
// `Firestore | null` type at each call site rather than sprinkling `!` assertions.
export function requireDb(db: Firestore | null): Firestore {
  if (!db) {
    throw new Error('Firebase is not configured yet — see ROADMAP.md "Setup" to add your project config to .env.');
  }
  return db;
}
