import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { Alert, InteractionManager } from 'react-native';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import { getSocket, connectSocket } from '@/lib/socket';
import { getApiUrl } from '@/lib/query-client';
import { getStoredToken, getStoredUser, User } from '@/lib/auth';
import { RootStackParamList } from '@/navigation/RootStackNavigator';
import { haptics } from '@/lib/haptics';
import { logCheckpoint, deferToNextFrame } from '@/lib/launchInstrumentation';

interface IncomingCall {
  callId: string;
  // Phase C.1: on sealed calls the recipient is NEVER told the caller's
  // userId — only the virtual-number string (callerName / callerPhoneNumber).
  // Accept/reject/end signaling routes via callId on the server.
  callerId: string | null;
  callerName: string;
  callerPhoneNumber?: string;
  type: 'audio' | 'video';
  sealedCall?: boolean;
}

interface ActiveCall {
  callId: string;
  // Null when this side of the call is a sealed-call recipient. Outbound
  // calls always have peerId because the caller knows who they're dialing.
  peerId: string | null;
  peerName: string;
  peerPhoneNumber?: string;
  type: 'audio' | 'video';
  status: 'connecting' | 'ringing' | 'connected' | 'ended';
  isOutgoing: boolean;
  startTime?: Date;
  conversationId?: string;
  sealedCall?: boolean;
}

interface CallContextType {
  incomingCall: IncomingCall | null;
  activeCall: ActiveCall | null;
  isConnected: boolean;
  initiateCall: (receiverId: string, receiverName: string, type: 'audio' | 'video') => Promise<{ callId: string; receiverPhoneNumber?: string } | null>;
  acceptCall: () => void;
  rejectCall: () => void;
  endCall: () => void;
  setCallConnected: () => void;
}

const CallContext = createContext<CallContextType | null>(null);

export function CallProvider({ children }: { children: React.ReactNode }) {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const socketInitialized = useRef(false);

  useEffect(() => {
    const checkAuthAndConnect = async () => {
      if (socketInitialized.current) return;
      
      logCheckpoint('call_context_socket_start');
      
      try {
        const token = await getStoredToken();
        const user = await getStoredUser();
        
        if (!token || !user) {
          logCheckpoint('call_context_no_auth');
          return;
        }
        
        setCurrentUser(user);
        
        const connectionPromise = connectSocket();
        const timeoutPromise = new Promise<null>((_, reject) => 
          setTimeout(() => reject(new Error('Socket connection timeout')), 5000)
        );
        
        const socket = await Promise.race([connectionPromise, timeoutPromise]).catch((err) => {
          logCheckpoint(`call_context_socket_error: ${err?.message}`);
          return null;
        });
        
        if (!socket) return;
        socketInitialized.current = true;
        setIsConnected(true);
        logCheckpoint('call_context_socket_connected');

        socket.on('incoming-call', async (data: { callId: string; callerId: string | null; type: 'audio' | 'video'; callerName?: string; callerPhoneNumber?: string; sealedCall?: boolean }) => {
          console.log('Incoming call:', { ...data, sealed: !!data.sealedCall });

          setIncomingCall((current) => {
            if (current !== null) {
              console.log('Already have an incoming call, rejecting new call');
              // Sealed calls omit callerId — server routes 'call-rejected'
              // via the call row when callerId is absent.
              socket.emit('call-rejected', {
                callerId: data.callerId ?? undefined,
                callId: data.callId,
                reason: 'busy',
              });
              return current;
            }

            const callerName = data.callerName || 'Unknown';
            haptics.warning();

            return {
              callId: data.callId,
              callerId: data.callerId ?? null,
              callerName,
              callerPhoneNumber: data.callerPhoneNumber,
              type: data.type,
              sealedCall: !!data.sealedCall,
            };
          });

          setActiveCall((current) => {
            if (current !== null) {
              console.log('Already in a call, rejecting incoming call');
              socket.emit('call-rejected', {
                callerId: data.callerId ?? undefined,
                callId: data.callId,
                reason: 'busy',
              });
            }
            return current;
          });
        });

        socket.on('call-accepted', (data: { callId: string }) => {
          console.log('Call accepted:', data);
          setActiveCall((prev) => prev ? { ...prev, status: 'connected', startTime: new Date() } : null);
          haptics.success();
        });

        socket.on('call-rejected', (data: { callId: string; reason?: string }) => {
          console.log('Call rejected:', data);
          setActiveCall(null);
          Alert.alert('Call Declined', data.reason === 'busy' ? 'User is busy on another call.' : 'Call was declined.');
        });

        socket.on('call-ended', (data: { callId: string }) => {
          console.log('Call ended by peer:', data);
          setActiveCall(null);
          setIncomingCall(null);
        });

        socket.on('disconnect', () => {
          console.log('Socket disconnected');
          setIsConnected(false);
        });

        socket.on('connect', () => {
          console.log('Socket reconnected');
          setIsConnected(true);
        });

      } catch (error) {
        console.error('Failed to connect socket:', error);
      }
    };

    InteractionManager.runAfterInteractions(() => {
      deferToNextFrame(() => {
        checkAuthAndConnect();
      });
    });

    const interval = setInterval(async () => {
      if (!socketInitialized.current) {
        const token = await getStoredToken();
        if (token) {
          checkAuthAndConnect();
        }
      }
    }, 5000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  const initiateCall = useCallback(async (receiverId: string, receiverName: string, type: 'audio' | 'video'): Promise<{ callId: string; receiverPhoneNumber?: string } | null> => {
    const socket = getSocket();
    if (!socket?.connected) {
      Alert.alert('Connection Error', 'Not connected to server. Please try again.');
      return null;
    }

    try {
      const token = await getStoredToken();
      const user = await getStoredUser();
      const baseUrl = getApiUrl();
      const response = await fetch(new URL('/api/calls', baseUrl).toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ receiverId, type }),
      });

      if (!response.ok) {
        throw new Error('Failed to create call');
      }

      const data = await response.json();
      const callId = data.id;
      const receiverPhoneNumber = data.receiverPhoneNumber;

      const callerName = user?.displayName || user?.phoneNumber || 'Unknown';
      socket.emit('call-user', {
        receiverId,
        callId,
        type,
        callerName,
      });

      setActiveCall({
        callId,
        peerId: receiverId,
        peerName: receiverName,
        peerPhoneNumber: receiverPhoneNumber,
        type,
        status: 'ringing',
        isOutgoing: true,
      });

      haptics.medium();
      return { callId, receiverPhoneNumber };
    } catch (error) {
      console.error('Error initiating call:', error);
      Alert.alert('Error', 'Could not start call. Please try again.');
      return null;
    }
  }, []);

  const acceptCall = useCallback(() => {
    if (!incomingCall) return;

    const socket = getSocket();
    if (!socket?.connected) return;

    socket.emit('call-accepted', {
      callerId: incomingCall.callerId ?? undefined,
      callId: incomingCall.callId,
    });

    setActiveCall({
      callId: incomingCall.callId,
      peerId: incomingCall.callerId,
      peerName: incomingCall.callerName,
      peerPhoneNumber: incomingCall.callerPhoneNumber,
      type: incomingCall.type,
      status: 'connected',
      isOutgoing: false,
      startTime: new Date(),
      sealedCall: incomingCall.sealedCall,
    });

    const callType = incomingCall.type;
    const callId = incomingCall.callId;
    const callerId = incomingCall.callerId;
    const callerName = incomingCall.callerName;
    const callerPhoneNumber = incomingCall.callerPhoneNumber;

    setIncomingCall(null);
    haptics.success();

    const sealedCall = incomingCall.sealedCall;
    if (callType === 'video') {
      navigation.navigate('VideoCall', {
        callId,
        receiverId: callerId,
        receiverName: callerName,
        receiverPhoneNumber: callerPhoneNumber,
        isIncoming: true,
        sealedCall,
      });
    } else {
      navigation.navigate('AudioCall', {
        callId,
        receiverId: callerId,
        receiverName: callerName,
        receiverPhoneNumber: callerPhoneNumber,
        isIncoming: true,
        sealedCall,
      });
    }
  }, [incomingCall, navigation]);

  const rejectCall = useCallback(() => {
    if (!incomingCall) return;

    const socket = getSocket();
    if (socket?.connected) {
      socket.emit('call-rejected', {
        callerId: incomingCall.callerId ?? undefined,
        callId: incomingCall.callId,
      });
    }

    setIncomingCall(null);
    haptics.heavy();
  }, [incomingCall]);

  const endCall = useCallback(async () => {
    const socket = getSocket();

    if (activeCall && socket?.connected) {
      socket.emit('call-ended', {
        otherUserId: activeCall.peerId ?? undefined,
        callId: activeCall.callId,
      });

      try {
        const token = await getStoredToken();
        const baseUrl = getApiUrl();
        const duration = activeCall.startTime 
          ? Math.floor((Date.now() - activeCall.startTime.getTime()) / 1000)
          : 0;
        
        await fetch(new URL(`/api/calls/${activeCall.callId}`, baseUrl).toString(), {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ 
            status: 'ended',
            duration,
          }),
        });
      } catch (e) {
        console.error('Error updating call record:', e);
      }
    }

    setActiveCall(null);
    haptics.heavy();
  }, [activeCall]);

  const setCallConnected = useCallback(() => {
    setActiveCall((prev) => prev ? { ...prev, status: 'connected', startTime: new Date() } : null);
  }, []);

  return (
    <CallContext.Provider
      value={{
        incomingCall,
        activeCall,
        isConnected,
        initiateCall,
        acceptCall,
        rejectCall,
        endCall,
        setCallConnected,
      }}
    >
      {children}
    </CallContext.Provider>
  );
}

export function useCall() {
  const context = useContext(CallContext);
  if (!context) {
    throw new Error('useCall must be used within a CallProvider');
  }
  return context;
}
