import { Platform } from 'react-native';
import {
  getApiUrl,
  apiRequest,
  getStoredToken as getToken,
  storeAuth as storeAuthUtil,
  clearAuth as clearAuthUtil,
  getStoredUser as getStoredUserUtil,
  storeUser as storeUserUtil,
  User,
} from './api-utils';

export type { User };

export async function getStoredToken(): Promise<string | null> {
  return getToken();
}

export async function getStoredUser(): Promise<User | null> {
  return getStoredUserUtil();
}

export async function storeAuth(token: string, user: User): Promise<void> {
  return storeAuthUtil(token, user);
}

export async function clearAuth(): Promise<void> {
  // Wipe any pending one-time Safe Code so it can't leak across users.
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    await AsyncStorage.removeItem('pending_safe_code');
  } catch {}
  return clearAuthUtil();
}

export interface SendCodeResult {
  success: boolean;
  error?: string;
}

export async function sendVerificationCode(phoneNumber: string): Promise<SendCodeResult> {
  try {
    await apiRequest('POST', '/api/auth/send-code', { phoneNumber });
    return { success: true };
  } catch (error: any) {
    console.error('Failed to send code:', error);

    // Try to surface the server's specific error message first (e.g. Twilio
    // "unverified caller", invalid number, rate limit).
    if (error?.message) {
      const match = error.message.match(/^\d+:\s*(.+)$/);
      if (match) {
        try {
          const parsed = JSON.parse(match[1]);
          if (parsed?.error && typeof parsed.error === 'string') {
            return { success: false, error: parsed.error };
          }
        } catch {
          // fall through to network-level diagnostics
        }
      }

      // Network-level diagnostics: differentiate offline / timeout / server
      // unreachable instead of showing a single generic line. This is what
      // App Store reviewers and real users see when something genuinely
      // breaks at the transport layer.
      const msg = String(error.message).toLowerCase();
      if (msg.includes('network request failed') || msg.includes('failed to fetch') || msg.includes('typeerror')) {
        return {
          success: false,
          error: "Can't reach Pryvo right now. Check your internet connection and try again.",
        };
      }
      if (msg.includes('timeout') || msg.includes('aborted')) {
        return {
          success: false,
          error: 'The request took too long. Please try again on a stronger connection.',
        };
      }
    }

    return {
      success: false,
      error: "We couldn't send a verification code right now. Please check your number and try again, or use Apple Reviewer Login if you're testing.",
    };
  }
}

export async function verifyCode(phoneNumber: string, code: string): Promise<{ success: boolean; token?: string; user?: User; isNewUser?: boolean; isNewDevice?: boolean }> {
  try {
    // Best-effort: send device fingerprint so the server can detect new-device logins.
    let deviceId: string | undefined;
    let deviceName: string | undefined;
    let platform: string | undefined;
    try {
      // IMPORTANT: never `await import('react-native')` here. Metro's async
      // namespace import walks EVERY getter on the react-native export object,
      // including the deprecated PushNotificationIOS getter, which constructs
      // `new NativeEventEmitter(null)` on device and throws a FATAL
      // "Invariant Violation: `new NativeEventEmitter()` requires a non-null
      // argument" — this was the TestFlight crash right after OTP verify
      // (Builds 66–71). Platform is statically imported at the top instead.
      const Device = await import('expo-device');
      const Application = await import('expo-application');
      platform = Platform.OS;
      deviceName = Device.deviceName || `${Device.brand ?? ''} ${Device.modelName ?? ''}`.trim() || undefined;
      if (Platform.OS === 'ios') {
        deviceId = (await Application.getIosIdForVendorAsync()) ?? undefined;
      } else if (Platform.OS === 'android') {
        deviceId = Application.getAndroidId() ?? undefined;
      }
    } catch {
      // ignore — server still records login event without device info
    }

    const response = await apiRequest('POST', '/api/auth/verify-code', {
      phoneNumber, code, deviceId, deviceName, platform,
    });
    const data = await response.json();

    if (data.success && data.token && data.user) {
      await storeAuth(data.token, data.user);
      // The server returns the freshly-generated Safe Code exactly once,
      // for brand-new signups. Persist it locally so the SafeCodeScreen
      // can display it; it's wiped after the user acknowledges saving it.
      if (data.pendingSafeCode) {
        try {
          const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
          await AsyncStorage.setItem('pending_safe_code', data.pendingSafeCode);
        } catch (e) {
          console.warn('Failed to persist pending safe code:', e);
        }
      }
      return {
        success: true,
        token: data.token,
        user: data.user,
        isNewUser: data.isNewUser,
        isNewDevice: data.isNewDevice,
      };
    }

    return { success: false };
  } catch (error) {
    console.error('Failed to verify code:', error);
    return { success: false };
  }
}

export async function updateProfile(displayName: string, avatarIndex: number): Promise<User | null> {
  try {
    const token = await getStoredToken();
    if (!token) return null;

    const baseUrl = getApiUrl();
    const response = await fetch(new URL('/api/auth/profile', baseUrl), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ displayName, avatarIndex }),
    });

    if (!response.ok) return null;
    
    const user = await response.json();
    await storeUserUtil(user);
    return user;
  } catch (error) {
    console.error('Failed to update profile:', error);
    return null;
  }
}

export async function fetchCurrentUser(): Promise<User | null> {
  try {
    const token = await getStoredToken();
    if (!token) return null;

    const baseUrl = getApiUrl();
    const response = await fetch(new URL('/api/auth/me', baseUrl), {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (response.status === 401 || response.status === 403) {
      await clearAuth();
      return null;
    }

    if (response.status === 304) {
      return await getStoredUser();
    }

    if (!response.ok) {
      return await getStoredUser();
    }
    
    const user = await response.json();
    await storeUserUtil(user);
    return user;
  } catch (error) {
    const cachedUser = await getStoredUser();
    if (cachedUser) return cachedUser;
    return null;
  }
}
