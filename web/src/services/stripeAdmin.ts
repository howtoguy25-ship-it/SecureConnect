import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/services/firebase";

// Owner-only management of the real Stripe secret key that gates web REV check payments --
// firestore.rules restricts config/stripeKeys to the admin email, so calling these as anyone
// else fails with a real Firestore permission-denied error. Only the secret key is stored;
// there's no publishable key/Stripe.js on this client at all -- createRevCheckCheckout
// (firebase/functions/index.js) creates the Checkout session entirely server-side and hands
// back a plain URL to redirect to.

export async function getStripeSecretKey(): Promise<string> {
  const snap = await getDoc(doc(db, "config", "stripeKeys"));
  const data = snap.data();
  return typeof data?.secretKey === "string" ? data.secretKey : "";
}

export async function saveStripeSecretKey(secretKey: string): Promise<void> {
  await setDoc(doc(db, "config", "stripeKeys"), { secretKey: secretKey.trim(), updatedAt: serverTimestamp() });
}
