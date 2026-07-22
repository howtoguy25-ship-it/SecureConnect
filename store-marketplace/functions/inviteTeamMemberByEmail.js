const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");

const ROLE_DEFAULT_PERMISSIONS = {
  owner: { canEditStock: true, canPostAnnouncements: true, canSendNotifications: true, canManageTeam: true },
  manager: { canEditStock: true, canPostAnnouncements: true, canSendNotifications: true, canManageTeam: false },
  staff: { canEditStock: true, canPostAnnouncements: false, canSendNotifications: false, canManageTeam: false },
};

/**
 * Callable: resolves a real Stockly account by email and adds them to a business's team.
 * The client can't do this lookup itself -- Firebase Auth's getUserByEmail is an Admin SDK-only
 * API, not something a signed-in client can call directly -- so this closes the gap noted in
 * the README/TeamManagementScreen where invites previously required already knowing someone's
 * raw account UID.
 */
exports.inviteTeamMemberByEmail = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");

  const { businessId, email, role } = request.data || {};
  if (!businessId || !email) {
    throw new HttpsError("invalid-argument", "businessId and email are required.");
  }
  // "owner" is intentionally not assignable here -- it's fixed to businesses/{id}.ownerId,
  // set once at creation. Granting it via team management would create a second membership
  // doc with owner-level permissions without an actual ownership transfer.
  const targetRole = ["manager", "staff"].includes(role) ? role : "staff";

  const db = getFirestore();
  const memberSnap = await db.doc(`businesses/${businessId}/team/${uid}`).get();
  const member = memberSnap.data();
  const bizSnap = await db.doc(`businesses/${businessId}`).get();
  if (!bizSnap.exists) throw new HttpsError("not-found", "Business not found.");
  const isOwner = bizSnap.data().ownerId === uid;

  if (!isOwner && (!member || member.status !== "active" || !member.permissions?.canManageTeam)) {
    throw new HttpsError("permission-denied", "You don't have permission to manage this business's team.");
  }

  let targetUser;
  try {
    targetUser = await getAuth().getUserByEmail(email.trim().toLowerCase());
  } catch (err) {
    if (err.code === "auth/user-not-found") {
      throw new HttpsError("not-found", "No Stockly account exists for that email yet -- they need to sign up first.");
    }
    throw new HttpsError("internal", "Couldn't look up that email -- try again.");
  }

  if (targetUser.uid === bizSnap.data().ownerId) {
    throw new HttpsError("failed-precondition", "That person already owns this business.");
  }

  await db.doc(`businesses/${businessId}/team/${targetUser.uid}`).set({
    uid: targetUser.uid,
    businessId,
    role: targetRole,
    permissions: ROLE_DEFAULT_PERMISSIONS[targetRole],
    status: "active",
    displayName: targetUser.displayName || targetUser.email || "Team member",
    invitedBy: uid,
    joinedAt: FieldValue.serverTimestamp(),
  });

  return { uid: targetUser.uid, displayName: targetUser.displayName || targetUser.email, role: targetRole };
});
