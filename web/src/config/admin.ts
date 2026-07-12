// Emails allowed to see the admin sign-in-history panel. This is only the UI gate -- the
// real enforcement is in firestore.rules (an admin-email check on the `users` collection),
// since a client-side check alone wouldn't actually stop anyone from reading the data.
export const ADMIN_EMAILS = ["howtoguy25@gmail.com"];
