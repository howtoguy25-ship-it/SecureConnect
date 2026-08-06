// The owner's own email -- mirrors web/src/config/admin.ts (mobile has no phone sign-in, see
// SignInScreen.tsx's own comment on why, so there's no phone-number counterpart to keep in
// sync here). This is only the UI gate for owner-only screens (e.g. Settings' REV check
// provider-key section) -- the real enforcement is firestore.rules' own isAdmin() check, since
// a client-side check alone can't stop a signed-in user from just reading/writing the
// underlying document directly. Keep this in sync with both isAdmin() in
// firebase/firestore.rules and web/src/config/admin.ts's ADMIN_EMAILS.
export const OWNER_EMAIL = "howtoguy25@gmail.com";

export function isOwnerEmail(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase() === OWNER_EMAIL.toLowerCase();
}
