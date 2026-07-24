import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
} from 'firebase/firestore';
import { db } from '@/services/firebase';
import { CatalogCollection } from '@/types';
import { requireDb } from '@/services/requireDb';

function collectionsCollection(uid: string) {
  return collection(requireDb(db), 'users', uid, 'collections');
}

export const collectionsStore = {
  async list(uid: string): Promise<CatalogCollection[]> {
    const snapshot = await getDocs(query(collectionsCollection(uid), orderBy('updatedAt', 'desc')));
    return snapshot.docs.map((d) => d.data() as CatalogCollection);
  },

  async get(uid: string, id: string): Promise<CatalogCollection | null> {
    const snapshot = await getDoc(doc(collectionsCollection(uid), id));
    return snapshot.exists() ? (snapshot.data() as CatalogCollection) : null;
  },

  subscribe(uid: string, onChange: (collections: CatalogCollection[]) => void): () => void {
    return onSnapshot(query(collectionsCollection(uid), orderBy('updatedAt', 'desc')), (snap) => {
      onChange(snap.docs.map((d) => d.data() as CatalogCollection));
    });
  },

  async save(uid: string, item: CatalogCollection): Promise<void> {
    const updated: CatalogCollection = { ...item, updatedAt: Date.now() };
    await setDoc(doc(collectionsCollection(uid), item.id), updated);
  },

  async remove(uid: string, id: string): Promise<void> {
    await deleteDoc(doc(collectionsCollection(uid), id));
  },
};
