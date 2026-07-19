import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { requireDb } from '@/services/requireDb';

// Real OS push notifications via Expo's push service -- Expo/EAS manages the actual APNs
// credentials for this project (set up automatically the first time a build requests a
// push token), so this never needs its own .p8 APNs key the way the App Store Server API
// integrations do. A token is just an opaque routing address (like a phone number for
// push, not a password), so it's safe for the client to own directly in Firestore -- no
// Cloud Function wrapper needed to register one, same reasoning as assistantMessages being
// client-owned instead of server-write-only.

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

// Call once after sign-in (see AuthContext) -- requests permission (a no-op if already
// granted/denied from a previous launch), and if granted, saves this device's real Expo
// push token so Cloud Functions can actually deliver to it later.
export async function registerForPushNotifications(uid: string): Promise<void> {
  if (!Device.isDevice) return; // simulators/web can't receive real push

  const existing = await Notifications.getPermissionsAsync();
  let finalStatus = existing.status;
  if (finalStatus !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    finalStatus = requested.status;
  }
  if (finalStatus !== 'granted') return;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  if (!projectId) return;

  const { data: expoPushToken } = await Notifications.getExpoPushTokenAsync({ projectId });
  const [usersSeg, , tokensSeg] = tokensCollectionPath(uid);
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
  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  if (!projectId) return;
  try {
    const { data: expoPushToken } = await Notifications.getExpoPushTokenAsync({ projectId });
    const [usersSeg, , tokensSeg] = tokensCollectionPath(uid);
    await deleteDoc(doc(requireDb(db), usersSeg, uid, tokensSeg, expoPushToken));
  } catch {
    // Best-effort -- not worth blocking sign-out over.
  }
}
