const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getFirestore } = require("firebase-admin/firestore");
const { notifyFollowers } = require("./lib/notify");

const VALID_CHANNELS = ["announcements", "stockChanges", "promotions"];

/**
 * Callable used by the app's announcement composer / "send update" button. Only a team member
 * with canSendNotifications (owner, or manager/staff granted it) can trigger this for their own
 * business -- checked server-side here, not just hidden in the UI.
 */
exports.sendBusinessNotification = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");

  const { businessId, title, body, notifyChannel } = request.data || {};
  if (!businessId || !title || !body) {
    throw new HttpsError("invalid-argument", "businessId, title, and body are required.");
  }
  const channel = VALID_CHANNELS.includes(notifyChannel) ? notifyChannel : "announcements";

  const db = getFirestore();
  const memberSnap = await db.doc(`businesses/${businessId}/team/${uid}`).get();
  const member = memberSnap.data();
  if (!member || member.status !== "active" || !member.permissions?.canSendNotifications) {
    throw new HttpsError("permission-denied", "You don't have permission to send notifications for this business.");
  }

  const bizSnap = await db.doc(`businesses/${businessId}`).get();
  if (!bizSnap.exists) throw new HttpsError("not-found", "Business not found.");
  const business = bizSnap.data();

  const result = await notifyFollowers(
    businessId,
    channel,
    { title: `${business.name}: ${title}`, body },
    { businessId, channel }
  );

  return result;
});
