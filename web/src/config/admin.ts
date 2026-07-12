// Emails/phone numbers allowed to see the admin sign-in-history panel. This is only the UI
// gate -- the real enforcement is in firestore.rules (an admin check on the `users`
// collection), since a client-side check alone wouldn't actually stop anyone reading the
// data. Keep both lists in sync with the `isAdmin()` rule in firebase/firestore.rules.
export const ADMIN_EMAILS = ["howtoguy25@gmail.com"];
export const ADMIN_PHONE_NUMBERS = ["+61474011265"];
