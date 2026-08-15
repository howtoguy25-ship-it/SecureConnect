import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { requireDb } from '@/services/requireDb';
import { DomainPurchase } from '@/types';

export const domainPurchaseStore = {
  subscribe(uid: string, purchaseId: string, onChange: (purchase: DomainPurchase | null) => void): () => void {
    const ref = doc(requireDb(db), 'users', uid, 'domainPurchases', purchaseId);
    return onSnapshot(ref, (snap) => {
      onChange(snap.exists() ? (snap.data() as DomainPurchase) : null);
    });
  },
};
