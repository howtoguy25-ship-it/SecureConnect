export type NotificationType = 'message' | 'incoming_call' | 'missed_call' | 'activity';

interface ExpoPushMessage {
  to: string;
  sound?: 'default' | null;
  title?: string;
  body: string;
  data?: Record<string, unknown>;
  badge?: number;
  channelId?: string;
  priority?: 'default' | 'normal' | 'high';
  categoryId?: string;
}

interface ExpoPushTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: Record<string, unknown>;
}

const EXPO_PUSH_API = 'https://exp.host/--/api/v2/push/send';

function getChannelAndPriority(type: NotificationType): { channelId: string; priority: 'default' | 'normal' | 'high'; sound: 'default' | null } {
  switch (type) {
    case 'incoming_call':
    case 'missed_call':
      return { channelId: 'calls', priority: 'high', sound: 'default' };
    case 'message':
      return { channelId: 'messages', priority: 'high', sound: 'default' };
    case 'activity':
      return { channelId: 'activity', priority: 'normal', sound: null };
    default:
      return { channelId: 'messages', priority: 'default', sound: 'default' };
  }
}

export async function sendPushNotification(
  pushToken: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
  type: NotificationType = 'message'
): Promise<ExpoPushTicket | null> {
  if (!pushToken || !pushToken.startsWith('ExponentPushToken')) {
    console.log('Invalid push token format:', pushToken?.substring(0, 20));
    return null;
  }

  const { channelId, priority, sound } = getChannelAndPriority(type);

  const message: ExpoPushMessage = {
    to: pushToken,
    sound,
    title,
    body,
    data: { ...data, type },
    channelId,
    priority,
  };

  try {
    const response = await fetch(EXPO_PUSH_API, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });

    const result = await response.json();
    
    if (result.data && result.data.length > 0) {
      const ticket = result.data[0] as ExpoPushTicket;
      if (ticket.status === 'error') {
        console.error('Push notification error:', ticket.message, ticket.details);
      } else {
        console.log(`Push notification sent successfully (${type}):`, ticket.id);
      }
      return ticket;
    }
    
    return null;
  } catch (error) {
    console.error('Error sending push notification:', error);
    return null;
  }
}

export async function sendCallNotification(
  pushToken: string,
  callerName: string,
  callType: 'audio' | 'video',
  callId: string,
  callerId: string | null,
  conversationId?: string,
  opts?: { sealed?: boolean }
): Promise<ExpoPushTicket | null> {
  const title = `Incoming ${callType === 'video' ? 'Video' : 'Audio'} Call`;
  const body = `${callerName} is calling you`;

  // Phase C.1: on sealed calls we redact callerId from the push data
  // payload — the recipient sees only the virtual-number display name
  // carried by callerName. The client's call screen handles the absent
  // callerId by skipping any profile-link / contact-action affordances.
  const data: Record<string, unknown> = {
    callId,
    callerName,
    callType,
    conversationId,
    sealedCall: !!opts?.sealed,
  };
  if (!opts?.sealed && callerId) data.callerId = callerId;

  return sendPushNotification(pushToken, title, body, data, 'incoming_call');
}

export async function sendMissedCallNotification(
  pushToken: string,
  callerName: string,
  callType: 'audio' | 'video',
  callerId: string | null,
  conversationId?: string,
  opts?: { sealed?: boolean }
): Promise<ExpoPushTicket | null> {
  const title = 'Missed Call';
  const body = `You missed a ${callType === 'video' ? 'video' : ''} call from ${callerName}`;

  const data: Record<string, unknown> = {
    callerName,
    callType,
    conversationId,
    sealedCall: !!opts?.sealed,
  };
  if (!opts?.sealed && callerId) data.callerId = callerId;

  return sendPushNotification(pushToken, title, body, data, 'missed_call');
}

export async function sendMessageNotification(
  pushToken: string,
  senderName: string,
  messagePreview: string,
  conversationId: string,
  senderId: string
): Promise<ExpoPushTicket | null> {
  return sendPushNotification(
    pushToken,
    senderName,
    messagePreview,
    {
      conversationId,
      otherUserId: senderId,
      senderName,
    },
    'message'
  );
}

export async function sendBatchPushNotifications(
  messages: Array<{
    pushToken: string;
    title: string;
    body: string;
    data?: Record<string, unknown>;
    type?: NotificationType;
  }>
): Promise<ExpoPushTicket[]> {
  const validMessages: ExpoPushMessage[] = messages
    .filter(m => m.pushToken && m.pushToken.startsWith('ExponentPushToken'))
    .map(m => {
      const type = m.type || 'message';
      const { channelId, priority, sound } = getChannelAndPriority(type);
      return {
        to: m.pushToken,
        sound,
        title: m.title,
        body: m.body,
        data: { ...m.data, type },
        channelId,
        priority,
      };
    });

  if (validMessages.length === 0) {
    return [];
  }

  try {
    const response = await fetch(EXPO_PUSH_API, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(validMessages),
    });

    const result = await response.json();
    return result.data || [];
  } catch (error) {
    console.error('Error sending batch push notifications:', error);
    return [];
  }
}
