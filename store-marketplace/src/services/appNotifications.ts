import { collection, doc, onSnapshot, orderBy, query, updateDoc, type Unsubscribe } from "firebase/firestore";
import { db } from "./firebase";
import { toMillis } from "@/utils/firestoreTime";
import type { AppNotification } from "@/types";

export function watchMyNotifications(uid: string, onChange: (items: AppNotification[]) => void): Unsubscribe {
  const q = query(collection(db, "users", uid, "notifications"), orderBy("createdAt", "desc"));
  return onSnapshot(q, (snap) => {
    onChange(
      snap.docs.map((d) => {
        const data = d.data();
        return { ...(data as Omit<AppNotification, "id">), id: d.id, createdAt: toMillis(data.createdAt) };
      })
    );
  });
}

export async function markNotificationRead(uid: string, notificationId: string): Promise<void> {
  await updateDoc(doc(db, "users", uid, "notifications", notificationId), { read: true });
}
