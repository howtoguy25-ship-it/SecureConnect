const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { getFirestore } = require("firebase-admin/firestore");
const { notifyFollowers } = require("./lib/notify");

/**
 * Auto-notifies followers who opted into "stock changes" when a stock item is newly created,
 * or flips from out_of_stock/coming_soon back to in_stock -- the two events a customer who
 * follows a store actually wants pinged for ("it's back!"), without spamming every minor edit
 * (price tweaks, description typo fixes) as a push notification.
 */
exports.onStockChange = onDocumentWritten("businesses/{businessId}/stockItems/{itemId}", async (event) => {
  const before = event.data.before.exists ? event.data.before.data() : null;
  const after = event.data.after.exists ? event.data.after.data() : null;
  if (!after) return; // deletion -- nothing to notify

  const { businessId } = event.params;
  const becameAvailable =
    after.stockStatus === "in_stock" && before && ["out_of_stock", "coming_soon"].includes(before.stockStatus);
  const isNewItem = !before;

  if (!becameAvailable && !isNewItem) return;

  const db = getFirestore();
  const bizSnap = await db.doc(`businesses/${businessId}`).get();
  if (!bizSnap.exists) return;
  const business = bizSnap.data();

  const title = isNewItem ? `New item: ${after.name}` : `Back in stock: ${after.name}`;
  const body = isNewItem ? `${business.name} just added ${after.name}.` : `${after.name} is back at ${business.name}.`;

  await notifyFollowers(businessId, "stockChanges", { title, body }, { businessId, channel: "stockChanges" });
});
