import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";
import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";
import { toMillis } from "@/utils/firestoreTime";
import type { Announcement, AnnouncementType } from "@/types";

function announcementsCol(businessId: string) {
  return collection(db, "businesses", businessId, "announcements");
}

export interface PostAnnouncementInput {
  authorId: string;
  authorName: string;
  type: AnnouncementType;
  title: string;
  body: string;
  imageUrl?: string;
  pinned?: boolean;
  /** Also push a real notification to every follower who opted into this announcement type. */
  notifyFollowers: boolean;
}

/**
 * Writes the announcement doc, then (if requested) invokes the sendBusinessNotification
 * callable so followers get a real push -- Firestore writes alone don't reach a phone that
 * isn't in the app, this is what actually rings/badges their device.
 */
export async function postAnnouncement(businessId: string, input: PostAnnouncementInput): Promise<string> {
  const ref = await addDoc(announcementsCol(businessId), {
    businessId,
    authorId: input.authorId,
    authorName: input.authorName,
    type: input.type,
    title: input.title,
    body: input.body,
    imageUrl: input.imageUrl ?? null,
    pinned: input.pinned ?? false,
    createdAt: serverTimestamp(),
  });

  if (input.notifyFollowers) {
    const send = httpsCallable(functions, "sendBusinessNotification");
    await send({
      businessId,
      title: input.title,
      body: input.body,
      notifyChannel: input.type === "promotion" ? "promotions" : input.type === "stock_update" ? "stockChanges" : "announcements",
    });
  }

  return ref.id;
}

export async function deleteAnnouncement(businessId: string, announcementId: string): Promise<void> {
  await deleteDoc(doc(db, "businesses", businessId, "announcements", announcementId));
}

export function watchAnnouncements(businessId: string, onChange: (items: Announcement[]) => void): Unsubscribe {
  const q = query(announcementsCol(businessId), orderBy("createdAt", "desc"));
  return onSnapshot(q, (snap) => {
    onChange(
      snap.docs.map((d) => {
        const data = d.data();
        return {
          ...(data as Omit<Announcement, "id">),
          id: d.id,
          createdAt: toMillis(data.createdAt),
          expiresAt: data.expiresAt ? toMillis(data.expiresAt) : undefined,
        };
      })
    );
  });
}
