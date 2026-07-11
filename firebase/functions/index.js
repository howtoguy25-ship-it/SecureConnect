const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");

initializeApp();

const BATCH_SIZE = 400;

/**
 * Runs every 15 minutes and deletes any alert whose expiresAt has passed. Alerts are
 * short-lived by design (45min-24hr depending on type) so this keeps the collection
 * small, which keeps the client's per-cell geohash range queries fast.
 */
exports.cleanupExpiredAlerts = onSchedule("every 15 minutes", async () => {
  const db = getFirestore();
  const now = Timestamp.now();

  let deletedTotal = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const snapshot = await db
      .collection("alerts")
      .where("expiresAt", "<=", now)
      .limit(BATCH_SIZE)
      .get();

    if (snapshot.empty) break;

    const batch = db.batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();

    deletedTotal += snapshot.size;
    if (snapshot.size < BATCH_SIZE) break;
  }

  console.log(`cleanupExpiredAlerts: removed ${deletedTotal} expired alert(s)`);
});

/**
 * Basic write-time validation as defense in depth alongside firestore.rules — rejects
 * (deletes) any alert doc that slipped through with a nonsensical geohash/coordinate pair,
 * so a buggy or malicious client can't poison nearby-alert queries for other users.
 */
exports.validateAlertOnCreate = onDocumentCreated("alerts/{alertId}", async (event) => {
  const data = event.data?.data();
  if (!data) return;

  const validLat = typeof data.lat === "number" && data.lat >= -90 && data.lat <= 90;
  const validLng = typeof data.lng === "number" && data.lng >= -180 && data.lng <= 180;
  const validGeohash = typeof data.geohash === "string" && data.geohash.length > 0;

  if (!validLat || !validLng || !validGeohash) {
    console.warn(`validateAlertOnCreate: removing malformed alert ${event.params.alertId}`);
    await event.data.ref.delete();
  }
});
