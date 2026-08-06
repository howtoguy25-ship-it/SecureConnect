import { addDoc, collection, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "@/services/firebase";

const LIVE_SHARES_COLLECTION = "liveShares";

/**
 * Creates a new live-share document and returns its id -- the caller (MapScreen's shareEta)
 * builds the recipient-facing link from this id (tracklinemaps.com/live/<id>). Kept open for
 * the whole trip: updateLiveShare refreshes position on the same doc, endLiveShare marks it
 * inactive once navigation ends, per the explicit "Until navigation ends" answer -- there's no
 * separate TTL/expiresAt field here like alerts.ts's alerts, since this doc's lifetime is tied
 * to the trip itself, not a fixed clock duration.
 */
export async function createLiveShare(
  uid: string,
  initial: { lat: number; lng: number; heading: number | null; etaText: string; arrivalClockText: string }
): Promise<string> {
  const ref = await addDoc(collection(db, LIVE_SHARES_COLLECTION), {
    createdBy: uid,
    lat: initial.lat,
    lng: initial.lng,
    heading: initial.heading,
    etaText: initial.etaText,
    arrivalClockText: initial.arrivalClockText,
    active: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateLiveShare(
  shareId: string,
  update: { lat: number; lng: number; heading: number | null; etaText: string; arrivalClockText: string }
): Promise<void> {
  await updateDoc(doc(db, LIVE_SHARES_COLLECTION, shareId), {
    lat: update.lat,
    lng: update.lng,
    heading: update.heading,
    etaText: update.etaText,
    arrivalClockText: update.arrivalClockText,
    updatedAt: serverTimestamp(),
  });
}

export async function endLiveShare(shareId: string): Promise<void> {
  await updateDoc(doc(db, LIVE_SHARES_COLLECTION, shareId), {
    active: false,
    updatedAt: serverTimestamp(),
  });
}
