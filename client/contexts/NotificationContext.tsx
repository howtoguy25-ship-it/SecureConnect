import React, { createContext, useContext, useEffect, useRef, ReactNode, useState, useCallback } from 'react';
import { Platform, AppState, AppStateStatus, Alert } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { useAuth } from './AuthContext';
import { getStoredToken } from '@/lib/auth';
import { getApiUrl } from '@/lib/query-client';
import { useNavigation, useNavigationState } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { getSocket, connectSocket } from '@/lib/socket';
import type { InAppNotification } from '@/components/NotificationBanner';

try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
} catch (error) {
  console.log('[Notifications] Failed to set notification handler:', error);
}

interface NotificationContextType {
  expoPushToken: string | null;
  notificationsEnabled: boolean;
  requestPermissions: () => Promise<boolean>;
  disableNotifications: () => Promise<void>;
  registerForPushNotifications: () => Promise<string | null>;
  inAppNotification: InAppNotification | null;
  dismissInAppNotification: () => void;
  activeConversationId: string | null;
  setActiveConversationId: (id: string | null) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

async function registerForPushNotificationsAsync(): Promise<string | null> {
  let token: string | null = null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('calls', {
      name: 'Calls',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 500, 250, 500],
      lightColor: '#7C5CFC',
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      bypassDnd: true,
    });
    
    await Notifications.setNotificationChannelAsync('messages', {
      name: 'Messages',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#7C5CFC',
    });
    
    await Notifications.setNotificationChannelAsync('activity', {
      name: 'Activity',
      importance: Notifications.AndroidImportance.LOW,
      vibrationPattern: [0, 100],
      lightColor: '#7C5CFC',
    });
  }

  if (!Device.isDevice) {
    console.log('Push notifications require a physical device');
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('Failed to get push token - permission not granted');
    return null;
  }

  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) {
      console.log('No project ID found for push notifications');
      return null;
    }

    const pushTokenResponse = await Notifications.getExpoPushTokenAsync({
      projectId,
    });
    token = pushTokenResponse.data;
    console.log('Expo Push Token:', token);
  } catch (error) {
    console.error('Error getting push token:', error);
  }

  return token;
}

async function sendPushTokenToServer(pushToken: string | null): Promise<void> {
  try {
    const token = await getStoredToken();
    if (!token) return;

    const baseUrl = getApiUrl();
    const response = await fetch(new URL('/api/push-token', baseUrl).toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ pushToken }),
    });

    if (!response.ok) {
      console.error('Failed to register push token with server');
    }
  } catch (error) {
    console.error('Error sending push token to server:', error);
  }
}

async function updateNotificationSettingsOnServer(enabled: boolean): Promise<void> {
  try {
    const token = await getStoredToken();
    if (!token) return;

    const baseUrl = getApiUrl();
    await fetch(new URL('/api/notifications/settings', baseUrl).toString(), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ enabled }),
    });
  } catch (error) {
    console.error('Error updating notification settings:', error);
  }
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated, setUser } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [inAppNotification, setInAppNotification] = useState<InAppNotification | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const notificationListener = useRef<Notifications.Subscription | null>(null);
  const responseListener = useRef<Notifications.Subscription | null>(null);
  const appState = useRef(AppState.currentState);
  const hasInitialized = useRef(false);
  const activeConversationRef = useRef<string | null>(null);

  useEffect(() => {
    activeConversationRef.current = activeConversationId;
  }, [activeConversationId]);

  const dismissInAppNotification = useCallback(() => {
    setInAppNotification(null);
  }, []);

  const registerForPushNotifications = useCallback(async (updatePreference: boolean = true): Promise<string | null> => {
    const token = await registerForPushNotificationsAsync();
    if (token) {
      setExpoPushToken(token);
      await sendPushTokenToServer(token);
      if (updatePreference) {
        setNotificationsEnabled(true);
        await updateNotificationSettingsOnServer(true);
        if (user) {
          setUser({ ...user, notificationsEnabled: true });
        }
      }
    }
    return token;
  }, [user, setUser]);

  const disableNotifications = useCallback(async (): Promise<void> => {
    setNotificationsEnabled(false);
    setExpoPushToken(null);
    await sendPushTokenToServer(null);
    await updateNotificationSettingsOnServer(false);
    if (user) {
      setUser({ ...user, notificationsEnabled: false });
    }
  }, [user, setUser]);

  const requestPermissions = useCallback(async (): Promise<boolean> => {
    // Re-check first so we don't trigger a no-op prompt when permission is
    // already granted (some platforms silently no-op the second request).
    const existing = await Notifications.getPermissionsAsync();
    let finalStatus = existing.status;
    if (existing.status !== 'granted' && existing.canAskAgain !== false) {
      const r = await Notifications.requestPermissionsAsync();
      finalStatus = r.status;
    }
    const granted = finalStatus === 'granted';

    if (granted) {
      // Flip the user-facing toggle on permission grant regardless of whether
      // the push-token round trip succeeds (it can fail silently in Expo Go
      // when there's no projectId / not a physical device, which previously
      // left the switch stuck in the off position).
      setNotificationsEnabled(true);
      await updateNotificationSettingsOnServer(true);
      if (user) {
        setUser({ ...user, notificationsEnabled: true });
      }
      // Best-effort token registration — don't block the UI on it.
      registerForPushNotifications(false).catch((err) => {
        console.log('[Notifications] Token registration failed:', err);
      });
    } else {
      setNotificationsEnabled(false);
    }

    return granted;
  }, [registerForPushNotifications, user, setUser]);

  useEffect(() => {
    if (!isAuthenticated || !user) return;

    let socket = getSocket();
    let messageNotificationHandler: ((data: any) => void) | null = null;

    const setupSocketNotifications = async () => {
      if (!socket) {
        try {
          socket = await connectSocket();
        } catch (error) {
          console.log('Failed to connect socket for notifications:', error);
          return;
        }
      }

      // Server payload is { conversationId, senderId?, senderName?,
      // senderAvatar?, message: {...full message row} } — note there is
      // deliberately no top-level `content`/`mediaType` read here. The
      // banner never renders message content or a content-type hint (no
      // "Sent a photo"), only "<Name> sent a message" — same rule as the
      // OS push notifications. Full content is only ever shown once the
      // conversation is actually opened.
      messageNotificationHandler = (data: {
        conversationId?: string;
        senderId?: string;
        senderName?: string;
        senderAvatar?: string | null;
      }) => {
        if (data.conversationId === activeConversationRef.current) {
          return;
        }

        if (data.senderId && data.senderId === user?.id) {
          return;
        }

        const notification: InAppNotification = {
          id: `${Date.now()}-${data.senderId ?? 'unknown'}`,
          title: data.senderName || 'New Message',
          body: 'Sent a message',
          conversationId: data.conversationId,
          senderId: data.senderId,
          senderName: data.senderName,
          senderAvatar: data.senderAvatar,
          type: 'message',
        };

        setInAppNotification(notification);
      };

      socket.on('message-notification', messageNotificationHandler);
    };

    setupSocketNotifications();

    return () => {
      if (socket && messageNotificationHandler) {
        socket.off('message-notification', messageNotificationHandler);
      }
    };
  }, [isAuthenticated, user?.id]);

  useEffect(() => {
    if (!isAuthenticated || !user || hasInitialized.current) return;
    hasInitialized.current = true;

    const initializeNotifications = async () => {
      const userPreference = user.notificationsEnabled ?? false;
      setNotificationsEnabled(userPreference);

      if (!userPreference) {
        console.log('User has notifications disabled - skipping registration');
        return;
      }

      const { status } = await Notifications.getPermissionsAsync();
      if (status === 'granted') {
        await registerForPushNotifications(false);
      } else {
        // The user previously turned notifications ON but the OS permission
        // has since been revoked (e.g. from iOS Settings). Sync the local
        // state and the server so the toggle reflects reality and the
        // backend stops trying to deliver pushes that will never arrive.
        console.log('[Notifications] OS permission no longer granted - syncing OFF');
        setNotificationsEnabled(false);
        setExpoPushToken(null);
        try {
          await sendPushTokenToServer(null);
          await updateNotificationSettingsOnServer(false);
          if (user) setUser({ ...user, notificationsEnabled: false });
        } catch (err) {
          console.log('[Notifications] Failed to sync revoked permission:', err);
        }
      }
    };

    initializeNotifications();

    notificationListener.current = Notifications.addNotificationReceivedListener((notification: Notifications.Notification) => {
      console.log('Notification received:', notification);
      // Suspicious-login warning while app is in foreground.
      const data = notification.request?.content?.data;
      if (data?.type === 'security-alert' && data?.subtype === 'new-login') {
        const body = (notification.request?.content?.body as string) ||
          'A new device just signed in to your account. If this wasn\'t you, secure your account.';
        if (Platform.OS === 'web') {
          try { window.alert(`Security Alert\n\n${body}`); } catch {}
        } else {
          Alert.alert(
            'New Login Detected',
            body,
            [
              { text: 'Dismiss', style: 'cancel' },
              { text: 'Review', onPress: () => navigation.navigate('LoginHistory' as never) },
            ]
          );
        }
      }
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener((response: Notifications.NotificationResponse) => {
      const data = response.notification.request.content.data;
      console.log('Notification tapped:', data);

      const notificationType = data?.type as string;

      if (notificationType === 'security-alert') {
        navigation.navigate('LoginHistory' as never);
        return;
      }

      if (notificationType === 'missed_call' || notificationType === 'incoming_call') {
        if (data?.callerId) {
          navigation.navigate('Conversation', {
            conversationId: data.conversationId as string,
            otherUserId: data.callerId as string,
            otherUserName: data.callerName as string || 'Unknown',
          });
        }
      } else if (data?.conversationId && data?.otherUserId) {
        navigation.navigate('Conversation', {
          conversationId: data.conversationId as string,
          otherUserId: data.otherUserId as string,
          otherUserName: data.senderName as string || 'Chat',
        });
      }
    });

    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        await Notifications.setBadgeCountAsync(0);
      }
      appState.current = nextAppState;
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
      subscription.remove();
    };
  }, [isAuthenticated, user, navigation, registerForPushNotifications]);

  useEffect(() => {
    if (!isAuthenticated) {
      hasInitialized.current = false;
    }
  }, [isAuthenticated]);

  return (
    <NotificationContext.Provider
      value={{
        expoPushToken,
        notificationsEnabled,
        requestPermissions,
        disableNotifications,
        registerForPushNotifications,
        inAppNotification,
        dismissInAppNotification,
        activeConversationId,
        setActiveConversationId,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
}
