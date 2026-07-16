import { doc, getDoc, setDoc, arrayUnion } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { requireDb } from '@/services/requireDb';

function unlockedThemesDoc(uid: string) {
  return doc(requireDb(db), 'users', uid, 'meta', 'unlockedThemes');
}

export const unlockedThemesStore = {
  async list(uid: string): Promise<string[]> {
    const snapshot = await getDoc(unlockedThemesDoc(uid));
    if (!snapshot.exists()) return [];
    return (snapshot.data().themeIds as string[]) ?? [];
  },

  async unlock(uid: string, themeId: string): Promise<void> {
    await setDoc(unlockedThemesDoc(uid), { themeIds: arrayUnion(themeId) }, { merge: true });
  },

  async isUnlocked(uid: string, themeId: string): Promise<boolean> {
    const ids = await this.list(uid);
    return ids.includes(themeId);
  },
};
