import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  limit as fsLimit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";
import { encodeGeohash, geohashQueryBounds, distanceKm } from "@/utils/geo";
import { toMillis } from "@/utils/firestoreTime";
import { ROLE_DEFAULT_PERMISSIONS, type Business, type GeoPoint, type Membership } from "@/types";

const businessesCol = collection(db, "businesses");

function docToBusiness(id: string, data: Record<string, unknown>): Business {
  return {
    ...(data as Omit<Business, "id">),
    id,
    chatEnabled: data.chatEnabled === true,
    createdAt: toMillis(data.createdAt),
    updatedAt: toMillis(data.updatedAt),
    publishedAt: data.publishedAt ? toMillis(data.publishedAt) : undefined,
  };
}

export interface CreateBusinessInput {
  ownerId: string;
  ownerDisplayName: string;
  name: string;
  categoryId: string;
  description: string;
  address: string;
  location: GeoPoint;
  openedDate?: string;
}

/**
 * Creates the business doc (unpublished, unverified draft) and seeds the owner's own
 * membership record in one batch so ownership is never in a half-written state.
 */
export async function createBusiness(input: CreateBusinessInput): Promise<string> {
  const businessRef = doc(businessesCol);
  const geohash = encodeGeohash(input.location.lat, input.location.lng);

  const business: Omit<Business, "id"> = {
    ownerId: input.ownerId,
    name: input.name,
    categoryId: input.categoryId,
    description: input.description,
    address: input.address,
    location: input.location,
    geohash,
    openedDate: input.openedDate,
    visibility: "private",
    isPublished: false,
    verificationStatus: "unverified",
    followerCount: 0,
    chatEnabled: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  } as Omit<Business, "id">;

  const batch = writeBatch(db);
  batch.set(businessRef, {
    ...business,
    nameLower: input.name.trim().toLowerCase(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const membership: Membership = {
    uid: input.ownerId,
    businessId: businessRef.id,
    role: "owner",
    permissions: ROLE_DEFAULT_PERMISSIONS.owner,
    status: "active",
    displayName: input.ownerDisplayName,
    joinedAt: Date.now(),
  };
  batch.set(doc(db, "businesses", businessRef.id, "team", input.ownerId), {
    ...membership,
    joinedAt: serverTimestamp(),
  });

  await batch.commit();
  return businessRef.id;
}

export async function getBusiness(businessId: string): Promise<Business | null> {
  const snap = await getDoc(doc(db, "businesses", businessId));
  if (!snap.exists()) return null;
  return docToBusiness(snap.id, snap.data());
}

export function watchBusiness(businessId: string, onChange: (business: Business | null) => void): Unsubscribe {
  return onSnapshot(doc(db, "businesses", businessId), (snap) => {
    onChange(snap.exists() ? docToBusiness(snap.id, snap.data()) : null);
  });
}

export async function updateBusinessDraft(
  businessId: string,
  patch: Partial<Pick<Business, "name" | "description" | "categoryId" | "address" | "location" | "openedDate" | "logoUrl" | "coverImageUrl">>
): Promise<void> {
  const data: Record<string, unknown> = { ...patch, updatedAt: serverTimestamp() };
  if (patch.name) data.nameLower = patch.name.trim().toLowerCase();
  if (patch.location) data.geohash = encodeGeohash(patch.location.lat, patch.location.lng);
  await updateDoc(doc(db, "businesses", businessId), data);
}

/** Sets visibility ("public" listed on the homepage, "private" hidden, "team" members-only) and toggles isPublished. */
export async function publishBusiness(
  businessId: string,
  visibility: "public" | "private" | "team"
): Promise<void> {
  await updateDoc(doc(db, "businesses", businessId), {
    visibility,
    isPublished: visibility !== "private",
    publishedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function unpublishBusiness(businessId: string): Promise<void> {
  await updateDoc(doc(db, "businesses", businessId), {
    visibility: "private",
    isPublished: false,
    updatedAt: serverTimestamp(),
  });
}

/** Owner/manager-only switch (enforced in firestore.rules) for the store's group chat. */
export async function setChatEnabled(businessId: string, enabled: boolean): Promise<void> {
  await updateDoc(doc(db, "businesses", businessId), {
    chatEnabled: enabled,
    updatedAt: serverTimestamp(),
  });
}

/** Prefix search over the lowercased name. Firestore has no native full-text search;
 * this covers "starts with" search which is what a store-name search box needs in practice. */
export async function searchBusinessesByName(term: string, max = 20): Promise<Business[]> {
  const t = term.trim().toLowerCase();
  if (!t) return [];
  const q = query(
    businessesCol,
    where("isPublished", "==", true),
    orderBy("nameLower"),
    where("nameLower", ">=", t),
    where("nameLower", "<=", t + ""),
    fsLimit(max)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => docToBusiness(d.id, d.data()));
}

/** Geohash-bounded nearby query + exact haversine filter, same pattern as TrackLine's alerts.ts. */
export async function searchBusinessesNearby(
  center: GeoPoint,
  radiusKm: number,
  categoryId?: string
): Promise<Array<Business & { distanceKm: number }>> {
  const bounds = geohashQueryBounds(center.lat, center.lng, radiusKm);
  const results = new Map<string, Business>();

  await Promise.all(
    bounds.map(async ([start, end]) => {
      const clauses = [
        where("isPublished", "==", true),
        orderBy("geohash"),
        where("geohash", ">=", start),
        where("geohash", "<", end),
      ];
      const q = categoryId
        ? query(businessesCol, where("isPublished", "==", true), where("categoryId", "==", categoryId), orderBy("geohash"), where("geohash", ">=", start), where("geohash", "<", end))
        : query(businessesCol, ...clauses);
      const snap = await getDocs(q);
      snap.docs.forEach((d) => results.set(d.id, docToBusiness(d.id, d.data())));
    })
  );

  return Array.from(results.values())
    .map((b) => ({ ...b, distanceKm: distanceKm(center.lat, center.lng, b.location.lat, b.location.lng) }))
    .filter((b) => b.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

export async function incrementFollowerCount(businessId: string, delta: 1 | -1): Promise<void> {
  await updateDoc(doc(db, "businesses", businessId), { followerCount: increment(delta) });
}
