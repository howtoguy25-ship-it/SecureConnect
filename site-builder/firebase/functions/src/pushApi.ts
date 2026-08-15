import { Expo, ExpoPushMessage } from 'expo-server-sdk';
import webpush from 'web-push';
import { getFirestore } from 'firebase-admin/firestore';

const expo = new Expo();

// Public half of the same VAPID keypair baked into app.config.js's notification.vapidPublicKey
// (used client-side to subscribe a browser) -- not a secret, safe to hardcode; only the
// private half (passed into sendPushNotification below, sourced from the VAPID_PRIVATE_KEY
// secret) needs to stay out of source control.
const VAPID_PUBLIC_KEY = 'BOwPw-VSAiYdMqqeSwegRwrMjkP_AUSLbB3mWvnjq9URcS1UHyzq4uOcbsE3fPUYDEqyKQj9JcR5ze2YaXTCa2k';
const VAPID_SUBJECT = 'mailto:support@buildsitespark.com';

interface WebPushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

// Real OS push notifications. Native (iOS/Android) tokens go through Expo's own hosted
// relay (expo-server-sdk) exactly as before -- Expo/EAS manages the actual APNs credentials
// for this project automatically, no separate .p8 key to manage here.
//
// Web tokens do NOT go through Expo's relay: Expo retired developer-uploaded VAPID keys for
// their web push relay some time ago (the old `expo push:web:upload` CLI command no longer
// exists in any current Expo tooling, and their docs no longer mention web push at all), so
// a browser's push subscription is sent to directly via the real Web Push protocol (the
// `web-push` library) instead, using the same VAPID keypair the browser already used to
// subscribe (see registerForPushNotifications in the app).
//
// Looks up every device this account has registered (one doc per device under
// users/{uid}/pushTokens -- a native doc has a `token` string field, a web doc has a
// `subscription` object field instead) and sends to all of them, since a user can be signed
// in on more than one device/browser.
export async function sendPushNotification(
  uid: string,
  title: string,
  body: string,
  data: Record<string, unknown> | undefined,
  vapidPrivateKey: string
): Promise<void> {
  const db = getFirestore();
  const tokensSnap = await db.collection('users').doc(uid).collection('pushTokens').get();
  if (tokensSnap.empty) return;

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, vapidPrivateKey);

  const expoMessages: ExpoPushMessage[] = [];
  const webSends: Promise<unknown>[] = [];

  tokensSnap.forEach((docSnap) => {
    const docData = docSnap.data();
    const subscription = docData.subscription as WebPushSubscription | undefined;
    if (subscription?.endpoint) {
      const payload = JSON.stringify({ title, body, data: data ?? {} });
      webSends.push(
        webpush.sendNotification(subscription, payload).catch((err: any) => {
          console.error('web-push send failed', err);
          // A 404/410 means the browser unsubscribed (cleared site data, uninstalled the
          // PWA, etc) -- clean up so future sends stop retrying a dead subscription.
          if (err?.statusCode === 404 || err?.statusCode === 410) {
            return docSnap.ref.delete().catch(() => {});
          }
          return undefined;
        })
      );
      return;
    }
    const token = docData.token as string | undefined;
    if (token && Expo.isExpoPushToken(token)) {
      expoMessages.push({ to: token, sound: 'default', title, body, data });
    }
  });

  if (expoMessages.length > 0) {
    const chunks = expo.chunkPushNotifications(expoMessages);
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

  if (webSends.length > 0) {
    await Promise.all(webSends);
  }
}
