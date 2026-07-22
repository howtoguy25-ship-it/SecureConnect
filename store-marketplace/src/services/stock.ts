import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";
import { toMillis } from "@/utils/firestoreTime";
import type { StockItem, StockStatus } from "@/types";

function stockCol(businessId: string) {
  return collection(db, "businesses", businessId, "stockItems");
}

export interface UpsertStockItemInput {
  categoryId: string;
  name: string;
  price: number | null;
  currency: string;
  stockStatus: StockStatus;
  imageUrl?: string;
  fields: Record<string, string>;
  updatedBy: string;
}

export async function createStockItem(businessId: string, input: UpsertStockItemInput): Promise<string> {
  const ref = await addDoc(stockCol(businessId), {
    businessId,
    ...input,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateStockItem(
  businessId: string,
  itemId: string,
  patch: Partial<UpsertStockItemInput>
): Promise<void> {
  await updateDoc(doc(db, "businesses", businessId, "stockItems", itemId), {
    ...patch,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteStockItem(businessId: string, itemId: string): Promise<void> {
  await deleteDoc(doc(db, "businesses", businessId, "stockItems", itemId));
}

export async function getStockItem(businessId: string, itemId: string): Promise<StockItem | null> {
  const snap = await getDoc(doc(db, "businesses", businessId, "stockItems", itemId));
  if (!snap.exists()) return null;
  const data = snap.data();
  return {
    ...(data as Omit<StockItem, "id">),
    id: snap.id,
    createdAt: toMillis(data.createdAt),
    updatedAt: toMillis(data.updatedAt),
    featuredUntil: data.featuredUntil ? toMillis(data.featuredUntil) : undefined,
  };
}

export function watchStock(businessId: string, onChange: (items: StockItem[]) => void): Unsubscribe {
  const q = query(stockCol(businessId), orderBy("updatedAt", "desc"));
  return onSnapshot(q, (snap) => {
    onChange(
      snap.docs.map((d) => {
        const data = d.data();
        return {
          ...(data as Omit<StockItem, "id">),
          id: d.id,
          createdAt: toMillis(data.createdAt),
          updatedAt: toMillis(data.updatedAt),
          featuredUntil: data.featuredUntil ? toMillis(data.featuredUntil) : undefined,
        };
      })
    );
  });
}
