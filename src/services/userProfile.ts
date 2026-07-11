import { doc, setDoc } from "firebase/firestore";
import { db } from "@/services/firebase";

export async function syncAlertRadiusToProfile(uid: string, alertRadiusKm: number): Promise<void> {
  await setDoc(
    doc(db, "users", uid),
    { alertRadiusKm, updatedAt: Date.now() },
    { merge: true }
  );
}
