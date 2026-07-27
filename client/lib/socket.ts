import { Alert } from 'react-native';
import { io, Socket } from 'socket.io-client';
import { getApiUrl } from './query-client';
import { getStoredToken } from './auth';

let socket: Socket | null = null;

// Optional listener that AuthContext registers so the socket layer can
// trigger a global force-logout flow without importing from contexts (which
// would create a circular dep).
type SuspensionHandler = (reason: string) => void;
let suspensionHandler: SuspensionHandler | null = null;
export function setSocketSuspensionListener(fn: SuspensionHandler | null) {
  suspensionHandler = fn;
}

let chatLimitAlertShown = false;
function showChatLimitAlert(perDay?: number, reason?: string) {
  if (chatLimitAlertShown) return;
  chatLimitAlertShown = true;
  Alert.alert(
    'Daily limit reached',
    reason ||
      `Your account has been temporarily limited by our Trust & Safety system. You can send up to ${perDay ?? 5} messages per day. This limit resets each day.`,
    [{ text: 'OK', onPress: () => { chatLimitAlertShown = false; } }],
  );
}

export function getSocket(): Socket | null {
  return socket;
}

export async function connectSocket(): Promise<Socket> {
  if (socket?.connected) {
    return socket;
  }

  const token = await getStoredToken();
  if (!token) {
    throw new Error('No authentication token');
  }

  const baseUrl = getApiUrl();
  
  socket = io(baseUrl, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  });

  return new Promise((resolve, reject) => {
    if (!socket) {
      reject(new Error('Failed to create socket'));
      return;
    }

    const timeoutId = setTimeout(() => {
      reject(new Error('Socket connection timeout'));
    }, 10000);

    socket.on('connect', () => {
      clearTimeout(timeoutId);
      console.log('Socket connected');
      resolve(socket!);
    });

    socket.on('connect_error', (error) => {
      clearTimeout(timeoutId);
      console.error('Socket connection error:', error.message);
      reject(error);
    });

    // Trust & Safety: server pushes these when AI moderation suspends the
    // account or applies a daily message limit. Wire them globally so every
    // screen reacts immediately without each one re-subscribing.
    socket.on('account-suspended', (data: { reason?: string }) => {
      try {
        suspensionHandler?.(data?.reason || 'Your account has been suspended.');
      } catch (e) {
        console.error('account-suspended handler error:', e);
      }
    });
    socket.on('chat-limit-applied', (data: { perDay?: number }) => {
      showChatLimitAlert(data?.perDay);
    });
    socket.on('chat-limit-blocked', (data: { perDay?: number; error?: string }) => {
      showChatLimitAlert(data?.perDay, data?.error);
    });
  });
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
