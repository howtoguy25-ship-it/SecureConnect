import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";
import { incrementFollowerCount } from "./businesses";
import type { Follow, FollowNotifyPrefs } from "@/types";

const DEFAULT_NOTIFY: FollowNotifyPrefs = {
  announcements: true,
  stockChanges: false,
  promotions: true,
};

function followRef(uid: string, businessId: string) {
  return doc(db, "users", uid, "follows", businessId);
}

export async function followBusiness(uid: string, businessId: string): Promise<void> {
  const existing = await getDoc(followRef(uid, businessId));
  if (existing.exists()) return;
  await setDoc(followRef(uid, businessId), {
    uid,
    businessId,
    notify: DEFAULT_NOTIFY,
    muted: false,
    followedAt: Date.now(),
  } as Follow);
  await incrementFollowerCount(businessId, 1);
}

export async function unfollowBusiness(uid: string, businessId: string): Promise<void> {
  const existing = await getDoc(followRef(uid, businessId));
  if (!existing.exists()) return;
  await deleteDoc(followRef(uid, businessId));
  await incrementFollowerCount(businessId, -1);
}

export async function setFollowNotifyPrefs(
  uid: string,
  businessId: string,
  notify: Partial<FollowNotifyPrefs>
): Promise<void> {
  await updateDoc(followRef(uid, businessId), { notify });
}

export async function setFollowMuted(uid: string, businessId: string, muted: boolean): Promise<void> {
  await updateDoc(followRef(uid, businessId), { muted });
}

export function watchMyFollows(uid: string, onChange: (follows: Follow[]) => void): Unsubscribe {
  const q = query(collection(db, "users", uid, "follows"), orderBy("followedAt", "desc"));
  return onSnapshot(q, (snap) => {
    onChange(snap.docs.map((d) => d.data() as Follow));
  });
}

export function watchFollow(
  uid: string,
  businessId: string,
  onChange: (follow: Follow | null) => void
): Unsubscribe {
  return onSnapshot(followRef(uid, businessId), (snap) => {
    onChange(snap.exists() ? (snap.data() as Follow) : null);
  });
}
