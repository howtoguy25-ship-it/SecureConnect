import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "./firebase";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Registers this device's native push token (FCM on Android, APNs-backed FCM token on iOS
 * once Firebase Cloud Messaging is wired into a real dev/prod build) so the
 * sendBusinessNotification Cloud Function can deliver via firebase-admin's messaging API.
 *
 * NOTE: remote push does not work in Expo Go on current SDKs -- this requires an
 * `expo-dev-client` build (`eas build --profile development`) with GoogleService-Info.plist /
 * google-services.json in place. In Expo Go this resolves to null and registration is skipped;
 * every other feature (stock, announcements, in-app notification feed) works regardless.
 */
export async function registerDeviceForPush(uid: string): Promise<string | null> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  let status = existing;
  if (status !== "granted") {
    const req = await Notifications.requestPermissionsAsync();
    status = req.status;
  }
  if (status !== "granted") return null;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  let token: string | null = null;
  try {
    const devicePushToken = await Notifications.getDevicePushTokenAsync();
    token = devicePushToken.data;
  } catch (err) {
    console.warn("[notifications] Native push token unavailable (likely running in Expo Go):", err);
    return null;
  }
  if (!token) return null;

  await setDoc(doc(db, "users", uid, "devices", token), {
    token,
    platform: Platform.OS,
    updatedAt: serverTimestamp(),
  });

  return token;
}
