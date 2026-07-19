import { Expo, ExpoPushMessage } from 'expo-server-sdk';
import { getFirestore } from 'firebase-admin/firestore';

// Real OS push notifications via Expo's own push relay -- Expo/EAS manages the actual APNs
// credentials for this project, so unlike the App Store Server API integrations, there's no
// separate .p8 key to manage here; a valid Expo push token is all `sendPushNotification`
// needs, and Expo forwards it to APNs (or FCM on Android) on our behalf.
const expo = new Expo();

// Looks up every device token this account has registered (registerForPushNotifications in
// the app writes one doc per device to users/{uid}/pushTokens) and sends to all of them --
// a user can be signed in on more than one device.
export async function sendPushNotification(uid: string, title: string, body: string, data?: Record<string, unknown>): Promise<void> {
  const db = getFirestore();
  const tokensSnap = await db.collection('users').doc(uid).collection('pushTokens').get();
  if (tokensSnap.empty) return;

  const messages: ExpoPushMessage[] = [];
  tokensSnap.forEach((doc) => {
    const token = doc.data().token as string;
    if (Expo.isExpoPushToken(token)) {
      messages.push({ to: token, sound: 'default', title, body, data });
    }
  });
  if (messages.length === 0) return;

  const chunks = expo.chunkPushNotifications(messages);
  for (const chunk of chunks) {
    try {
      await expo.sendPushNotificationsAsync(chunk);
    } catch (err) {
      // Never fails the caller's real work (an order/billing event already succeeded)
      // over a push-delivery hiccup.
      console.error('sendPushNotificationsAsync failed', err);
    }
  }
}
