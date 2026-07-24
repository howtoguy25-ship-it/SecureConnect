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
import { CatalogProduct } from '@/types';
import { requireDb } from '@/services/requireDb';

function productsCollection(uid: string) {
  return collection(requireDb(db), 'users', uid, 'products');
}

export const productsStore = {
  async list(uid: string): Promise<CatalogProduct[]> {
    const snapshot = await getDocs(query(productsCollection(uid), orderBy('updatedAt', 'desc')));
    return snapshot.docs.map((d) => d.data() as CatalogProduct);
  },

  async get(uid: string, id: string): Promise<CatalogProduct | null> {
    const snapshot = await getDoc(doc(productsCollection(uid), id));
    return snapshot.exists() ? (snapshot.data() as CatalogProduct) : null;
  },

  subscribe(uid: string, onChange: (products: CatalogProduct[]) => void): () => void {
    return onSnapshot(query(productsCollection(uid), orderBy('updatedAt', 'desc')), (snap) => {
      onChange(snap.docs.map((d) => d.data() as CatalogProduct));
    });
  },

  async save(uid: string, product: CatalogProduct): Promise<void> {
    const updated: CatalogProduct = { ...product, updatedAt: Date.now() };
    await setDoc(doc(productsCollection(uid), product.id), updated);
  },

  async remove(uid: string, id: string): Promise<void> {
    await deleteDoc(doc(productsCollection(uid), id));
  },
};
