export type NotificationType = 'message' | 'incoming_call' | 'missed_call' | 'activity';

// ─── Real VoIP ringing (PushKit) ───────────────────────────────────────
//
// Expo's push service (used everywhere else in this file) cannot send
// PushKit VoIP pushes — those have to go directly to Apple's APNs with a
// dedicated VoIP credential. Two forms of credential are supported here,
// matching whichever one Apple's developer portal hands out for the
// project's VoIP Services Certificate:
//   - Token-based: APNS_VOIP_KEY_P8 (the .p8 file contents), APNS_VOIP_KEY_ID,
//     APNS_TEAM_ID
//   - Certificate-based: APNS_VOIP_CERT_P12_BASE64 (the .p12 file,
//     base64-encoded so it can live in a plain env var), APNS_VOIP_CERT_PASSPHRASE
// APNS_BUNDLE_ID defaults to the app's known bundle id but can be
// overridden. Until one of these credential sets is actually configured,
// sendVoipCallPush() is a safe no-op — callers already treat a null
// return as "VoIP ringing unavailable, regular push already sent" rather
// than a hard failure.
let apnProvider: import('@parse/node-apn').Provider | null = null;
let apnProviderInitialized = false;

function getApnProvider(): import('@parse/node-apn').Provider | null {
  if (apnProviderInitialized) return apnProvider;
  apnProviderInitialized = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const apn = require('@parse/node-apn');
    const bundleId = process.env.APNS_BUNDLE_ID || 'com.adham.salameh.secureconnectchat';

    if (process.env.APNS_VOIP_KEY_P8 && process.env.APNS_VOIP_KEY_ID && process.env.APNS_TEAM_ID) {
      apnProvider = new apn.Provider({
        token: {
          key: process.env.APNS_VOIP_KEY_P8,
          keyId: process.env.APNS_VOIP_KEY_ID,
          teamId: process.env.APNS_TEAM_ID,
        },
        production: process.env.NODE_ENV === 'production',
      });
      console.log(`[VoIP push] APNs provider configured (token auth), bundle=${bundleId}`);
    } else if (process.env.APNS_VOIP_CERT_P12_BASE64) {
      apnProvider = new apn.Provider({
        pfx: Buffer.from(process.env.APNS_VOIP_CERT_P12_BASE64, 'base64'),
        passphrase: process.env.APNS_VOIP_CERT_PASSPHRASE || undefined,
        production: process.env.NODE_ENV === 'production',
      });
      console.log(`[VoIP push] APNs provider configured (cert auth), bundle=${bundleId}`);
    } else {
      apnProvider = null;
      console.log('[VoIP push] No APNs VoIP credentials configured — VoIP ringing disabled, regular push notifications still work.');
    }
  } catch (e) {
    console.error('[VoIP push] Failed to initialize APNs provider:', e);
    apnProvider = null;
  }
  return apnProvider;
}

export interface VoipCallPayload {
  uuid: string;
  callerName: string;
  handle: string;
  hasVideo: boolean;
  callId: string;
  callerId: string | null;
  conversationId?: string;
  sealedCall?: boolean;
}

// Returns true if a VoIP push was actually sent, false if VoIP isn't
// configured/available for this recipient (caller should already have a
// regular push notification going out in parallel as the fallback).
export async function sendVoipCallPush(
  voipPushToken: string,
  payload: VoipCallPayload,
): Promise<boolean> {
  const provider = getApnProvider();
  if (!provider) return false;

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const apn = require('@parse/node-apn');
    const bundleId = process.env.APNS_BUNDLE_ID || 'com.adham.salameh.secureconnectchat';
    const note = new apn.Notification();
    note.topic = `${bundleId}.voip`;
    note.pushType = 'voip';
    // VoIP pushes carry no alert/sound/badge of their own — CallKit (via
    // reportNewIncomingCall, invoked natively on receipt) is what actually
    // presents the incoming-call UI. Per Apple's docs, a short expiry is
    // appropriate since a stale "incoming call" push is meaningless once
    // the ring window has passed server-side (see the 30s missed-call
    // timeout in the call-user socket handler).
    note.expiry = Math.floor(Date.now() / 1000) + 30;
    note.payload = {
      uuid: payload.uuid,
      callerName: payload.callerName,
      handle: payload.handle,
      hasVideo: payload.hasVideo,
      callId: payload.callId,
      callerId: payload.callerId,
      conversationId: payload.conversationId,
      sealedCall: !!payload.sealedCall,
    };

    const result = await provider.send(note, voipPushToken);
    if (result.failed.length > 0) {
      console.warn('[VoIP push] Send failed:', JSON.stringify(result.failed));
      return false;
    }
    return true;
  } catch (e) {
    console.error('[VoIP push] Error sending:', e);
    return false;
  }
}

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
