import {
  collection,
  collectionGroup,
  doc,
  deleteDoc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";
import { toMillis } from "@/utils/firestoreTime";
import {
  ROLE_DEFAULT_PERMISSIONS,
  type Membership,
  type MembershipRole,
  type MembershipStatus,
} from "@/types";

function teamCol(businessId: string) {
  return collection(db, "businesses", businessId, "team");
}

function docToMembership(data: Record<string, unknown>): Membership {
  return { ...(data as Omit<Membership, "joinedAt">), joinedAt: toMillis(data.joinedAt) };
}

export async function getMembership(businessId: string, uid: string): Promise<Membership | null> {
  const snap = await getDoc(doc(db, "businesses", businessId, "team", uid));
  return snap.exists() ? docToMembership(snap.data()) : null;
}

export function watchTeam(businessId: string, onChange: (members: Membership[]) => void): Unsubscribe {
  return onSnapshot(teamCol(businessId), (snap) => {
    onChange(snap.docs.map((d) => docToMembership(d.data())));
  });
}

/**
 * Every business a uid is on the team of, across the whole app. Powers the "my businesses"
 * switcher on the owner/staff side without needing a denormalized per-user list to stay in
 * sync -- Firestore's collection-group query does that lookup directly.
 */
export async function listMyMemberships(uid: string): Promise<Membership[]> {
  const q = query(collectionGroup(db, "team"), where("uid", "==", uid));
  const snap = await getDocs(q);
  return snap.docs.map((d) => docToMembership(d.data()));
}

/** Invites (or re-adds) a team member by uid. Only callers with canManageTeam should reach this --
 * enforced for real in firestore.rules, this is the client-side entry point. */
export async function addTeamMember(
  businessId: string,
  uid: string,
  displayName: string,
  role: MembershipRole
): Promise<void> {
  const membership: Omit<Membership, "joinedAt"> = {
    uid,
    businessId,
    role,
    permissions: ROLE_DEFAULT_PERMISSIONS[role],
    status: "active",
    displayName,
  };
  await setDoc(doc(db, "businesses", businessId, "team", uid), {
    ...membership,
    joinedAt: serverTimestamp(),
  });
}

export async function changeRole(businessId: string, uid: string, role: MembershipRole): Promise<void> {
  await updateDoc(doc(db, "businesses", businessId, "team", uid), {
    role,
    permissions: ROLE_DEFAULT_PERMISSIONS[role],
  });
}

export async function setMemberStatus(
  businessId: string,
  uid: string,
  status: MembershipStatus
): Promise<void> {
  await updateDoc(doc(db, "businesses", businessId, "team", uid), { status });
}

export async function removeTeamMember(businessId: string, uid: string): Promise<void> {
  await deleteDoc(doc(db, "businesses", businessId, "team", uid));
}

/** Blocks a customer (not staff) from viewing/following this business -- distinct from team
 * moderation above, which governs staff who post on the business's behalf. */
export async function blockCustomer(businessId: string, targetUid: string, blockedBy: string, reason?: string): Promise<void> {
  await setDoc(doc(db, "businesses", businessId, "blockedUsers", targetUid), {
    uid: targetUid,
    blockedBy,
    reason: reason ?? "",
    blockedAt: serverTimestamp(),
  });
}

export async function unblockCustomer(businessId: string, targetUid: string): Promise<void> {
  await deleteDoc(doc(db, "businesses", businessId, "blockedUsers", targetUid));
}

export async function isCustomerBlocked(businessId: string, uid: string): Promise<boolean> {
  const snap = await getDoc(doc(db, "businesses", businessId, "blockedUsers", uid));
  return snap.exists();
}
