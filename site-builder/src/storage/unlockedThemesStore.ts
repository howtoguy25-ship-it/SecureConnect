import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { requireDb } from '@/services/requireDb';

function unlockedThemesDoc(uid: string) {
  return doc(requireDb(db), 'users', uid, 'meta', 'unlockedThemes');
}

// Unlocking a theme is a real paid purchase now (verifyApplePurchase, Admin SDK only) --
// this store is read-only from the client; see Firestore rules for the enforcement.
export const unlockedThemesStore = {
  async list(uid: string): Promise<string[]> {
    const snapshot = await getDoc(unlockedThemesDoc(uid));
    if (!snapshot.exists()) return [];
    return (snapshot.data().themeIds as string[]) ?? [];
  },

  async isUnlocked(uid: string, themeId: string): Promise<boolean> {
    const ids = await this.list(uid);
    return ids.includes(themeId);
  },
};
