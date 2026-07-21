import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/services/firebase';
import { requireDb } from '@/services/requireDb';
import { requireFunctions } from '@/services/requireFunctions';

// Real OS push notifications. Native (iOS/Android) goes through Expo's own push service --
// Expo/EAS manages the actual APNs credentials for this project (set up automatically the
// first time a build requests a push token), so this never needs its own .p8 APNs key the
// way the App Store Server API integrations do.
//
// Web does NOT go through Expo's relay: Expo retired developer-uploaded VAPID keys for
// their web push relay (the old `expo push:web:upload` CLI command no longer exists in any
// current Expo tooling), so a browser's raw push subscription is stored instead of an Expo
// token, and the backend sends to it directly via the real Web Push protocol (see
// sendPushNotification in firebase/functions/src/pushApi.ts) using the same VAPID keypair
// this browser already used to subscribe (app.config.js's notification.vapidPublicKey).

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function tokensCollectionPath(uid: string) {
  return ['users', uid, 'pushTokens'] as const;
}

interface WebPushSubscriptionData {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

// A web push subscription has no natural short id the way a native token string does --
// derive a stable, Firestore-doc-id-safe one from the tail of its endpoint URL (the part
// that's actually unique per browser/device).
function webSubscriptionDocId(endpoint: string): string {
  return `web-${endpoint.replace(/[^a-zA-Z0-9]/g, '').slice(-300)}`;
}

// Call once after sign-in (see AuthContext) -- requests permission (a no-op if already
// granted/denied from a previous launch), and if granted, saves this device's real push
// token/subscription so Cloud Functions can actually deliver to it later.
export async function registerForPushNotifications(uid: string): Promise<void> {
  if (!Device.isDevice) return; // simulators can't receive real push (web is always "a device")

  const existing = await Notifications.getPermissionsAsync();
  let finalStatus = existing.status;
  if (finalStatus !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    finalStatus = requested.status;
  }
  if (finalStatus !== 'granted') return;

  const [usersSeg, , tokensSeg] = tokensCollectionPath(uid);

  if (Platform.OS === 'web') {
    const { data } = await Notifications.getDevicePushTokenAsync();
    const subscription = data as WebPushSubscriptionData;
    await setDoc(doc(requireDb(db), usersSeg, uid, tokensSeg, webSubscriptionDocId(subscription.endpoint)), {
      subscription,
      platform: Platform.OS,
      updatedAt: Date.now(),
    });
    return;
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  if (!projectId) return;

  const { data: expoPushToken } = await Notifications.getExpoPushTokenAsync({ projectId });
  await setDoc(doc(requireDb(db), usersSeg, uid, tokensSeg, expoPushToken), {
    token: expoPushToken,
    platform: Platform.OS,
    updatedAt: Date.now(),
  });
}

// Called on sign-out so a shared/reset device doesn't keep receiving another account's
// notifications after someone signs out of it.
export async function unregisterCurrentDeviceToken(uid: string): Promise<void> {
  if (!Device.isDevice) return;
  const [usersSeg, , tokensSeg] = tokensCollectionPath(uid);
  try {
    if (Platform.OS === 'web') {
      const { data } = await Notifications.getDevicePushTokenAsync();
      const subscription = data as WebPushSubscriptionData;
      await deleteDoc(doc(requireDb(db), usersSeg, uid, tokensSeg, webSubscriptionDocId(subscription.endpoint)));
      return;
    }
    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    if (!projectId) return;
    const { data: expoPushToken } = await Notifications.getExpoPushTokenAsync({ projectId });
    await deleteDoc(doc(requireDb(db), usersSeg, uid, tokensSeg, expoPushToken));
  } catch {
    // Best-effort -- not worth blocking sign-out over.
  }
}

// Verifies the whole real pipeline (permission grant -> registered token/subscription ->
// real delivery -> this device/browser) without waiting for a real order/booking/billing
// event to trigger one -- see AccountScreen's "Send Test Notification" row.
export async function sendTestPushNotification(): Promise<number> {
  const call = httpsCallable<Record<string, never>, { tokenCount: number }>(requireFunctions(functions), 'sendTestPushNotification');
  const { data } = await call({});
  return data.tokenCount;
}
