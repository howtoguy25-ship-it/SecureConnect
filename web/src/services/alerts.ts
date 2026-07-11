import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  arrayUnion,
  increment,
  addDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/services/firebase";
import { encodeGeohash, geohashQueryBounds, distanceKm } from "@/utils/geo";
import { ALERT_TTL_MS, type AlertDoc, type AlertType } from "@/types/alert";

const ALERTS_COLLECTION = "alerts";

function toAlertDoc(id: string, data: any): AlertDoc {
  return {
    id,
    type: data.type,
    lat: data.lat,
    lng: data.lng,
    geohash: data.geohash,
    createdBy: data.createdBy,
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : data.createdAt,
    expiresAt: data.expiresAt instanceof Timestamp ? data.expiresAt.toMillis() : data.expiresAt,
    confirmCount: data.confirmCount ?? 0,
    hiddenBy: data.hiddenBy ?? [],
  };
}

export async function reportAlert(
  type: AlertType,
  location: { lat: number; lng: number },
  uid: string
): Promise<string> {
  const now = Date.now();
  const geohash = encodeGeohash(location.lat, location.lng, 9);

  const ref = await addDoc(collection(db, ALERTS_COLLECTION), {
    type,
    lat: location.lat,
    lng: location.lng,
    geohash,
    createdBy: uid,
    createdAt: serverTimestamp(),
    expiresAt: Timestamp.fromMillis(now + ALERT_TTL_MS[type]),
    confirmCount: 0,
    hiddenBy: [],
  });

  return ref.id;
}

/**
 * Live subscription to alerts within radiusKm of (userLat, userLng). Subscribes to each of
 * the 9 geohash cells separately (Firestore range queries can't span multiple prefixes in
 * one listener) and re-merges + re-filters on every change.
 */
export function subscribeNearbyAlerts(
  userLat: number,
  userLng: number,
  radiusKm: number,
  currentUid: string,
  onChange: (alerts: AlertDoc[]) => void
): Unsubscribe {
  const bounds = geohashQueryBounds(userLat, userLng, radiusKm);
  const cellResults = new Map<string, AlertDoc[]>();

  function emit() {
    const now = Date.now();
    const merged = new Map<string, AlertDoc>();
    for (const alerts of cellResults.values()) {
      for (const alert of alerts) merged.set(alert.id, alert);
    }
    const filtered = Array.from(merged.values()).filter(
      (alert) =>
        alert.expiresAt > now &&
        !alert.hiddenBy.includes(currentUid) &&
        distanceKm(userLat, userLng, alert.lat, alert.lng) <= radiusKm
    );
    onChange(filtered);
  }

  const unsubscribes = bounds.map(([start, end]) => {
    const cellKey = start;
    return onSnapshot(
      query(
        collection(db, ALERTS_COLLECTION),
        where("geohash", ">=", start),
        where("geohash", "<", end)
      ),
      (snap) => {
        cellResults.set(
          cellKey,
          snap.docs.map((d) => toAlertDoc(d.id, d.data()))
        );
        emit();
      }
    );
  });

  return () => unsubscribes.forEach((unsub) => unsub());
}

export async function deleteAlert(alertId: string): Promise<void> {
  await deleteDoc(doc(db, ALERTS_COLLECTION, alertId));
}

export async function hideAlertForUser(alertId: string, uid: string): Promise<void> {
  await updateDoc(doc(db, ALERTS_COLLECTION, alertId), {
    hiddenBy: arrayUnion(uid),
  });
}

export async function confirmAlert(alertId: string): Promise<void> {
  await updateDoc(doc(db, ALERTS_COLLECTION, alertId), {
    confirmCount: increment(1),
  });
}
