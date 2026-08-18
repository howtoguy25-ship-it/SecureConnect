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

    // Surface the server's specific error message first (e.g. Twilio
    // "unverified caller", invalid number, rate limit). apiRequest's
    // throwIfResNotOk already throws `new Error(json.error)` directly —
    // no "<status>: " prefix and no re-wrapped JSON to parse — so
    // error.message IS the server's message as-is. (A previous version of
    // this function tried to strip a numeric status-code prefix that the
    // API layer never actually produces, which meant the real reason was
    // silently discarded on every failure.)
    if (error?.message) {
      const msg = String(error.message);
      const isNetworkOrGenericError =
        msg.toLowerCase().includes('network request failed') ||
        msg.toLowerCase().includes('failed to fetch') ||
        msg.toLowerCase().includes('typeerror') ||
        msg.toLowerCase().includes('timeout') ||
        msg.toLowerCase().includes('aborted') ||
        /^request failed with status \d+$/i.test(msg);
      if (!isNetworkOrGenericError) {
        return { success: false, error: msg };
      }

      // Network-level diagnostics: differentiate offline / timeout / server
      // unreachable instead of showing a single generic line. This is what
      // App Store reviewers and real users see when something genuinely
      // breaks at the transport layer.
      const lowerMsg = msg.toLowerCase();
      if (lowerMsg.includes('network request failed') || lowerMsg.includes('failed to fetch') || lowerMsg.includes('typeerror')) {
        return {
          success: false,
          error: "Can't reach Pryvo right now. Check your internet connection and try again.",
        };
      }
      if (lowerMsg.includes('timeout') || lowerMsg.includes('aborted')) {
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

export async function verifyCode(
  phoneNumber: string,
  code: string,
  oauthLinkToken?: string,
): Promise<{ success: boolean; token?: string; user?: User; isNewUser?: boolean; isNewDevice?: boolean; error?: string }> {
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
      phoneNumber, code, deviceId, deviceName, platform, oauthLinkToken,
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

    return { success: false, error: data.error };
  } catch (error: any) {
    console.error('Failed to verify code:', error);
    return { success: false, error: error?.message };
  }
}

export interface OAuthConfig {
  appleEnabled: boolean;
  googleEnabled: boolean;
}

export async function fetchOAuthConfig(): Promise<OAuthConfig> {
  try {
    const baseUrl = getApiUrl();
    const response = await fetch(new URL('/api/auth/oauth-config', baseUrl).toString());
    if (!response.ok) return { appleEnabled: false, googleEnabled: false };
    return await response.json();
  } catch {
    return { appleEnabled: false, googleEnabled: false };
  }
}

export interface OAuthSignInResult {
  // Existing account already linked to this Apple/Google identity — logged
  // straight in, no phone step needed.
  linked: true;
  success: boolean;
  token?: string;
  user?: User;
}

export interface OAuthNeedsPhoneLinkResult {
  // First time seeing this identity — client must run the normal phone/SMS
  // flow and pass linkToken through to verifyCode() to attach it.
  linked: false;
  needsPhoneLink: true;
  linkToken: string;
  email: string | null;
}

async function postOAuthIdentity(path: string, body: Record<string, string>): Promise<OAuthSignInResult | OAuthNeedsPhoneLinkResult> {
  const response = await apiRequest('POST', path, body);
  const data = await response.json();
  if (data.linked) {
    if (data.success && data.token && data.user) {
      await storeAuth(data.token, data.user);
    }
    return data as OAuthSignInResult;
  }
  return data as OAuthNeedsPhoneLinkResult;
}

export async function signInWithApple(): Promise<OAuthSignInResult | OAuthNeedsPhoneLinkResult> {
  const AppleAuthentication = await import('expo-apple-authentication');
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });
  if (!credential.identityToken) {
    throw new Error("Apple didn't return an identity token. Please try again.");
  }
  return postOAuthIdentity('/api/auth/oauth/apple', { identityToken: credential.identityToken });
}

export async function signInWithGoogle(webClientId: string): Promise<OAuthSignInResult | OAuthNeedsPhoneLinkResult> {
  const { GoogleSignin } = await import('@react-native-google-signin/google-signin');
  GoogleSignin.configure({ webClientId });
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: false });
  const response = await GoogleSignin.signIn();
  if (response.type === 'cancelled') {
    throw new Error('__CANCELLED__');
  }
  const idToken = response.data?.idToken;
  if (!idToken) {
    throw new Error("Google didn't return an ID token. Please try again.");
  }
  return postOAuthIdentity('/api/auth/oauth/google', { idToken });
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
