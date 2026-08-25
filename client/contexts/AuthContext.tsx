import React, { createContext, useContext, useState, useEffect, ReactNode, useRef } from 'react';
import { User, getStoredUser, getStoredToken, clearAuth, fetchCurrentUser } from '@/lib/auth';
import { getApiUrl, queryClient } from "@/lib/query-client";
import { disconnectSocket, setSocketSuspensionListener } from "@/lib/socket";
import { logCheckpoint, withTimeout, deferToNextFrame } from "@/lib/launchInstrumentation";
import { registerDeviceAndUploadPrekeys, replenishOneTimePreKeysIfNeeded } from "../utils/crypto/prekeyManager";
import * as Application from "expo-application";
import { Platform, Alert } from "react-native";
import { setSuspensionListener, setSessionInvalidatedListener } from "@/lib/api-utils";
import { clearAppLockPin } from "@/utils/appLock";

const API_BASE = getApiUrl();

function getDeviceId(): string {
  if (Platform.OS === "android") return Application.getAndroidId?.() ?? `android-${Date.now()}`;
  if (Platform.OS === "web") return `web-${typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 20) : Date.now()}`;
  return `ios-${Date.now()}`;
}

// Retry-with-backoff: previously a single failed attempt here (a transient
// network blip, not just the registration-order race the parallelization
// fix addressed) was silently swallowed with no retry until the NEXT full
// app cold-start -- meaning anyone messaging that user stayed blocked with
// "hasn't set up encryption keys yet" for the rest of that session even
// though the failure was recoverable. Retrying inside the same call means
// a transient failure self-heals in seconds instead of requiring a restart.
const E2EE_RETRY_DELAYS_MS = [2000, 5000, 10000];

export async function ensureE2EEKeys(token: string) {
  logCheckpoint('e2ee_keys_start');
  const deviceId = getDeviceId();
  for (let attempt = 0; ; attempt++) {
    try {
      await registerDeviceAndUploadPrekeys(token, API_BASE, deviceId);
      logCheckpoint('e2ee_device_registered');

      await replenishOneTimePreKeysIfNeeded(token, API_BASE, 10);
      logCheckpoint('e2ee_prekeys_replenished');
      return;
    } catch (error) {
      logCheckpoint(`e2ee_error (attempt ${attempt + 1}): ${error}`);
      if (attempt >= E2EE_RETRY_DELAYS_MS.length) {
        // Out of retries for this call -- the next app cold-start (which
        // calls ensureE2EEKeys unconditionally) is the final fallback.
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, E2EE_RETRY_DELAYS_MS[attempt]));
    }
  }
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  setUser: (user: User | null) => void;
  setToken: (token: string | null) => void;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  numberMode: 'personal' | 'virtual';
  setNumberMode: (mode: 'personal' | 'virtual') => void;
  // True right after a FRESH sign-in (phone + SMS code, or account
  // recovery) for a user who already has security questions set — gates
  // RootStackNavigator to SecurityQuestionsVerifyScreen until answered.
  // Deliberately NOT set when resuming a persisted session from storage on
  // cold app start, so "log in like normal" (staying logged in) never
  // re-prompts — only an explicit logout + fresh login does.
  securityQuestionsPending: boolean;
  setSecurityQuestionsPending: (pending: boolean) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [numberMode, setNumberMode] = useState<'personal' | 'virtual'>('personal');
  const [securityQuestionsPending, setSecurityQuestionsPending] = useState(false);
  const loadingComplete = useRef(false);
  const loggedOut = useRef(false);

  useEffect(() => {
    logCheckpoint('auth_provider_mounted');
    loadStoredAuth();
  }, []);

  async function loadStoredAuth() {
    if (loadingComplete.current) return;
    
    logCheckpoint('auth_load_start');

    const hardTimeout = setTimeout(() => {
      if (!loadingComplete.current) {
        loadingComplete.current = true;
        logCheckpoint('AUTH_HARD_TIMEOUT_1500ms');
        setIsLoading(false);
      }
    }, 1500);

    try {
      logCheckpoint('auth_getting_token');
      const storedToken = await withTimeout(
        getStoredToken(),
        800,
        null,
        'getStoredToken'
      );
      logCheckpoint(`auth_token_result: ${storedToken ? 'found' : 'null'}`);

      if (!storedToken) {
        logCheckpoint('auth_no_token_finishing');
        loadingComplete.current = true;
        clearTimeout(hardTimeout);
        setIsLoading(false);
        return;
      }

      logCheckpoint('auth_getting_user');
      const storedUser = await withTimeout(
        getStoredUser(),
        800,
        null,
        'getStoredUser'
      );
      logCheckpoint(`auth_user_result: ${storedUser ? 'found' : 'null'}`);

      if (storedToken && storedUser && !loggedOut.current) {
        setToken(storedToken);
        setUser(storedUser);
        logCheckpoint('auth_state_set');

        deferToNextFrame(() => {
          if (!loggedOut.current) ensureE2EEKeys(storedToken).catch(() => {});
        });

        deferToNextFrame(() => {
          if (loggedOut.current) return;
          fetchCurrentUser()
            .then((freshUser) => {
              if (freshUser && !loggedOut.current) {
                setUser(freshUser);
                logCheckpoint('auth_user_refreshed');
              }
            })
            .catch(() => logCheckpoint('auth_refresh_failed'));
        });
      }
    } catch (error) {
      logCheckpoint(`auth_error: ${error}`);
    } finally {
      if (!loadingComplete.current) {
        loadingComplete.current = true;
        clearTimeout(hardTimeout);
        logCheckpoint('auth_load_complete');
        setIsLoading(false);
      }
    }
  }

  async function logout() {
    // Order matters: stop in-flight queries and disconnect the socket BEFORE
    // we null-out the auth state. Otherwise the navigator switches to the
    // unauthenticated stack while a /api/admin/check-owner (or similar)
    // request that was started with a valid token gets cancelled mid-flight
    // and surfaces as a "request failed" error in TanStack Query, which the
    // ErrorBoundary turns into the "Error — please reload" screen the user
    // had to manually reload past.
    loggedOut.current = true;
    // Best-effort server-side logout: clears push token so this device stops
    // receiving notifications, bumps tokenVersion so the JWT we're about to
    // discard is dead. Fire-and-forget with a short timeout — never block
    // the local wipe on a network round trip.
    try {
      const storedToken = await getStoredToken();
      if (storedToken) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 3000);
        try {
          await fetch(new URL("/api/auth/logout", getApiUrl()).toString(), {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${storedToken}`,
            },
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timer);
        }
      }
    } catch {
      // Offline / timeout / server error — proceed with local cleanup anyway.
    }
    try { queryClient.cancelQueries(); } catch {}
    try { queryClient.clear(); } catch {}
    try { disconnectSocket(); } catch {}
    try { await clearAuth(); } catch {}
    // A device-only PIN from a previous account shouldn't carry over to
    // whoever signs in next on this device.
    try { await clearAppLockPin(); } catch {}
    // State change LAST so the navigator only swaps once the cleanup is done.
    setUser(null);
    setToken(null);
    setSecurityQuestionsPending(false);
  }

  // Apple Guideline 1.2 — react to server-side account suspension by force
  // logging out and showing the user why. Only one alert at a time.
  const suspendedAlertShown = useRef(false);
  useEffect(() => {
    const handler = (reason: string) => {
      if (suspendedAlertShown.current) return;
      suspendedAlertShown.current = true;
      logout().catch(() => {});
      Alert.alert(
        "Account suspended",
        `${reason}\n\nIf you believe this is a mistake, please contact support.`,
        [{ text: "OK", onPress: () => { suspendedAlertShown.current = false; } }],
      );
    };
    // Wire BOTH triggers: HTTP 403 (existing) and socket push (new — fires the
    // instant the AI moderator suspends an active session).
    setSuspensionListener(handler);
    setSocketSuspensionListener(handler);
    return () => {
      setSuspensionListener(null);
      setSocketSuspensionListener(null);
    };
  }, []);

  // A 401/403 on the startup /me refresh means the server considers this
  // token dead (expired, revoked, tokenVersion bumped elsewhere). Route it
  // through the same real logout() the suspension handler above uses —
  // full server notify + query cache clear + socket disconnect + local
  // wipe + React state reset — instead of letting the low-level module
  // that noticed it wipe local storage on its own while this component's
  // state still says "logged in". See notifySessionInvalidated's doc
  // comment in api-utils.ts for the bug this replaced.
  const sessionInvalidatedHandled = useRef(false);
  useEffect(() => {
    const handler = () => {
      if (sessionInvalidatedHandled.current) return;
      if (loggedOut.current) return;
      sessionInvalidatedHandled.current = true;
      logout()
        .catch(() => {})
        .finally(() => { sessionInvalidatedHandled.current = false; });
    };
    setSessionInvalidatedListener(handler);
    return () => setSessionInvalidatedListener(null);
  }, []);

  async function refreshUser() {
    const freshUser = await fetchCurrentUser();
    if (freshUser) {
      setUser(freshUser);
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isAuthenticated: !!user && !!token,
        setUser,
        setToken,
        logout,
        refreshUser,
        numberMode,
        setNumberMode,
        securityQuestionsPending,
        setSecurityQuestionsPending,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
