const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Resolves the real recipient list for a business notification -- followers who opted into
 * this channel, aren't muted, and aren't blocked by the business -- then sends via
 * firebase-admin's messaging API to each of their registered device tokens. Shared by the
 * owner-triggered sendBusinessNotification callable and the automatic onStockChange trigger
 * so both paths enforce the exact same opt-in/mute/block rules.
 */
async function notifyFollowers(businessId, channel, notification, data = {}) {
  const db = getFirestore();

  const followsSnap = await db
    .collectionGroup("follows")
    .where("businessId", "==", businessId)
    .where("muted", "==", false)
    .where(`notify.${channel}`, "==", true)
    .get();

  const followerUids = followsSnap.docs.map((d) => d.data().uid);
  if (followerUids.length === 0) return { sent: 0, followers: 0 };

  const blockedSnap = await db.collection(`businesses/${businessId}/blockedUsers`).get();
  const blockedUids = new Set(blockedSnap.docs.map((d) => d.id));
  const recipients = followerUids.filter((u) => !blockedUids.has(u));
  if (recipients.length === 0) return { sent: 0, followers: 0 };

  const bizSnap = await db.doc(`businesses/${businessId}`).get();
  const businessName = bizSnap.exists ? bizSnap.data().name : "";

  // Fan-out write: one notification doc per recipient, so the in-app Notifications tab has a
  // real history to show (a push alert alone disappears from the tray and leaves nothing to
  // display once the user opens the app later or was offline when it was sent).
  for (const batch of chunk(recipients, 400)) {
    const writeBatch = db.batch();
    batch.forEach((recipientUid) => {
      const ref = db.collection(`users/${recipientUid}/notifications`).doc();
      writeBatch.set(ref, {
        businessId,
        businessName,
        title: notification.title,
        body: notification.body,
        channel,
        read: false,
        createdAt: new Date(),
      });
    });
    await writeBatch.commit();
  }

  const tokens = [];
  for (const batch of chunk(recipients, 10)) {
    await Promise.all(
      batch.map(async (recipientUid) => {
        const devicesSnap = await db.collection(`users/${recipientUid}/devices`).get();
        devicesSnap.docs.forEach((d) => tokens.push(d.data().token));
      })
    );
  }
  if (tokens.length === 0) return { sent: 0, followers: recipients.length };

  const messaging = getMessaging();
  let sentCount = 0;
  for (const tokenBatch of chunk(tokens, 500)) {
    const response = await messaging.sendEachForMulticast({
      tokens: tokenBatch,
      notification,
      data,
    });
    sentCount += response.successCount;
  }

  return { sent: sentCount, followers: recipients.length };
}

module.exports = { notifyFollowers, chunk };
