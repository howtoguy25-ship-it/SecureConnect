// Real In-App Purchase product for a single REV check -- a Consumable (one use, then re-
// buyable), NOT a subscription: each check is its own discrete purchase. This exact string must
// match a Consumable product created by hand in App Store Connect (Apps -> TrackLine -> Features
// -> In-App Purchases -> "+") before a purchase can ever succeed -- react-native-iap can't create
// the product itself, only buy an existing one. See RevCheckScreen.tsx for the purchase flow.
export const REV_CHECK_PRODUCT_ID = "com.trackline.navigate.revcheck";

// Shown before the real store price has loaded (or if the store product hasn't been created/
// approved yet) -- an honest best-guess label, never presented as the final charged amount once
// a real product.displayPrice is available.
export const REV_CHECK_FALLBACK_PRICE_LABEL = "$14.99";
