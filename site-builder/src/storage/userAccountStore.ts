import { doc, onSnapshot, getDoc } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { requireDb } from '@/services/requireDb';
import { UserAccount } from '@/types';

function accountDoc(uid: string) {
  return doc(requireDb(db), 'users', uid);
}

export const userAccountStore = {
  async get(uid: string): Promise<UserAccount | null> {
    const snap = await getDoc(accountDoc(uid));
    return snap.exists() ? (snap.data() as UserAccount) : null;
  },

  subscribe(uid: string, onChange: (account: UserAccount | null) => void): () => void {
    return onSnapshot(accountDoc(uid), (snap) => {
      onChange(snap.exists() ? (snap.data() as UserAccount) : null);
    });
  },
};
