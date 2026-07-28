import React, { useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, Pressable, Modal, ActivityIndicator, Platform } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { useTheme } from '@/hooks/useTheme';
import { Spacing, BorderRadius } from '@/constants/theme';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { apiRequest } from '@/lib/query-client';
import { storeAuth } from '@/lib/auth';
import { getSocket, connectSocket, disconnectSocket } from '@/lib/socket';

interface ConcurrentSessionEvent {
  newDeviceName: string | null;
  newPlatform: string | null;
  ipAddress: string | null;
  at: string;
}

// Global "someone else just logged into your account" alert. The server
// emits `concurrent-session-alert` (see /api/auth/verify-code in
// server/routes.ts) to every socket this user already has connected,
// EXCEPT the brand-new one, whenever a login happens from a different
// deviceId while an existing session is still live. This component owns
// the modal and the "Log them out" action for every platform (the same
// component tree renders on iOS, Android, and web).
export function ConcurrentSessionAlert() {
  const { theme } = useTheme();
  const { user, setToken } = useAuth();
  const [event, setEvent] = useState<ConcurrentSessionEvent | null>(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!user) return;

    let socket = getSocket();
    const handler = (data: ConcurrentSessionEvent) => setEvent(data);

    const attach = async () => {
      if (!socket) {
        try {
          socket = await connectSocket();
        } catch {
          return;
        }
      }
      socket.on('concurrent-session-alert', handler);
    };
    attach();

    return () => {
      socket?.off('concurrent-session-alert', handler);
    };
  }, [user?.id]);

  const dismiss = useCallback(() => setEvent(null), []);

  const handleLogThemOut = useCallback(async () => {
    if (!user) return;
    setWorking(true);
    try {
      const res = await apiRequest('POST', '/api/auth/logout-all-others', {});
      const data = await res.json();
      // Server bumps tokenVersion (invalidating the intruder's JWT and every
      // other session) but issues THIS device a fresh token so it stays
      // logged in — persist it and reconnect the socket on the new token.
      if (data?.token) {
        await storeAuth(data.token, user);
        setToken(data.token);
        try {
          disconnectSocket();
          await connectSocket();
        } catch {}
      }
    } catch {
      // Best-effort: even on failure, dismiss so the user isn't stuck — they
      // can retry from Settings > Login History at any time.
    } finally {
      setWorking(false);
      setEvent(null);
    }
  }, [user, setToken]);

  if (!event) return null;

  const deviceDesc = event.newDeviceName || (event.newPlatform ? `a ${event.newPlatform} device` : 'another device');

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={dismiss}>
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: theme.backgroundDefault, borderColor: theme.border }]}>
          <View style={[styles.iconWrap, { backgroundColor: theme.error + '18' }]}>
            <Feather name="alert-triangle" size={28} color={theme.error} />
          </View>
          <ThemedText type="h4" style={{ textAlign: 'center', marginTop: Spacing.md }}>
            Someone else is actively using your app
          </ThemedText>
          <ThemedText
            type="body"
            style={{ color: theme.textSecondary, textAlign: 'center', marginTop: Spacing.sm }}
          >
            A new sign-in just happened from {deviceDesc}. Someone may be viewing your messages. If this wasn't you, log them out now.
          </ThemedText>

          <Pressable
            onPress={handleLogThemOut}
            disabled={working}
            style={({ pressed }) => [
              styles.primaryBtn,
              { backgroundColor: theme.error, opacity: pressed || working ? 0.8 : 1 },
            ]}
          >
            {working ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <ThemedText type="body" style={{ color: '#fff', fontWeight: '700' }}>
                Log Them Out
              </ThemedText>
            )}
          </Pressable>

          <Pressable
            onPress={dismiss}
            disabled={working}
            style={({ pressed }) => [styles.secondaryBtn, { opacity: pressed ? 0.6 : 1 }]}
          >
            <ThemedText type="body" style={{ color: theme.textSecondary, fontWeight: '600' }}>
              It's Fine
            </ThemedText>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.xl,
    alignItems: 'center',
    ...Platform.select({
      web: { boxShadow: '0 8px 30px rgba(0,0,0,0.35)' } as any,
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 20,
        elevation: 10,
      },
    }),
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtn: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.xl,
  },
  secondaryBtn: {
    width: '100%',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.sm,
  },
});
