import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Pressable, Modal, Animated, Easing } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import { ThemedText } from '@/components/ThemedText';
import { useTheme } from '@/hooks/useTheme';
import { Spacing, BorderRadius } from '@/constants/theme';
import { Feather } from '@expo/vector-icons';
import { useCall } from '@/contexts/CallContext';
import { RootStackParamList } from '@/navigation/RootStackNavigator';
import { playIncomingCallRingtone, stopIncomingCallRingtone } from '@/utils/ringtone';

const AVATAR_COLORS = [
  "#FF6B6B",
  "#4ECDC4",
  "#45B7D1",
  "#96CEB4",
  "#FFEAA7",
  "#DDA0DD",
];

export default function IncomingCallModal() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { incomingCall, acceptCall, rejectCall } = useCall();
  
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (incomingCall) {
      playIncomingCallRingtone();
      
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.1,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      
      return () => {
        pulse.stop();
        stopIncomingCallRingtone();
      };
    }
  }, [incomingCall, pulseAnim]);

  if (!incomingCall) return null;

  const handleAccept = () => {
    stopIncomingCallRingtone();
    acceptCall();
  };

  const handleReject = () => {
    stopIncomingCallRingtone();
    rejectCall();
  };

  // Sealed (private) calls arrive with callerId === null — never assume it exists.
  const avatarSeed = incomingCall.callerId || incomingCall.callerName || "?";
  const avatarColor = AVATAR_COLORS[Math.abs(avatarSeed.charCodeAt(0)) % AVATAR_COLORS.length];

  return (
    <Modal
      visible={!!incomingCall}
      transparent
      animationType="fade"
      statusBarTranslucent
    >
      <View style={[styles.overlay, { backgroundColor: 'rgba(0,0,0,0.85)' }]}>
        <View style={[styles.container, { paddingTop: insets.top + Spacing["4xl"] }]}>
          <View style={styles.callerInfo}>
            <Animated.View
              style={[
                styles.avatarContainer,
                { transform: [{ scale: pulseAnim }] },
              ]}
            >
              <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
                <Feather name="user" size={64} color="#fff" />
              </View>
            </Animated.View>
            
            <ThemedText type="h2" style={styles.callerName}>
              {incomingCall.callerName}
            </ThemedText>
            
            {incomingCall.callerPhoneNumber ? (
              <ThemedText type="small" style={styles.phoneNumber}>
                {incomingCall.callerPhoneNumber}
              </ThemedText>
            ) : null}
            
            <View style={styles.callTypeContainer}>
              <Feather
                name={incomingCall.type === 'video' ? 'video' : 'phone'}
                size={18}
                color="rgba(255,255,255,0.7)"
              />
              <ThemedText type="body" style={styles.callType}>
                Incoming {incomingCall.type === 'video' ? 'Video' : 'Audio'} Call
              </ThemedText>
            </View>
            
            <View style={styles.encryptedBadge}>
              <Feather name="lock" size={12} color="#4CD964" />
              <ThemedText type="small" style={styles.encryptedText}>
                End-to-end encrypted
              </ThemedText>
            </View>
          </View>

          <View style={[styles.actions, { paddingBottom: insets.bottom + Spacing["4xl"] }]}>
            <Pressable
              style={[styles.rejectButton, { backgroundColor: '#FF3B30' }]}
              onPress={handleReject}
            >
              <Feather name="phone-off" size={32} color="#fff" />
              <ThemedText type="small" style={styles.buttonLabel}>Decline</ThemedText>
            </Pressable>

            <Pressable
              style={[styles.acceptButton, { backgroundColor: '#4CD964' }]}
              onPress={handleAccept}
            >
              <Feather
                name={incomingCall.type === 'video' ? 'video' : 'phone'}
                size={32}
                color="#fff"
              />
              <ThemedText type="small" style={styles.buttonLabel}>Accept</ThemedText>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
  },
  container: {
    flex: 1,
    justifyContent: 'space-between',
  },
  callerInfo: {
    alignItems: 'center',
    paddingHorizontal: Spacing["2xl"],
  },
  avatarContainer: {
    marginBottom: Spacing.xl,
  },
  avatar: {
    width: 140,
    height: 140,
    borderRadius: BorderRadius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  callerName: {
    color: '#fff',
    marginBottom: Spacing.xs,
    textAlign: 'center',
  },
  phoneNumber: {
    color: 'rgba(255,255,255,0.6)',
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  callTypeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  callType: {
    color: 'rgba(255,255,255,0.7)',
  },
  encryptedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: 'rgba(76, 217, 100, 0.15)',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  encryptedText: {
    color: '#4CD964',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing["5xl"],
    paddingHorizontal: Spacing["2xl"],
  },
  rejectButton: {
    width: 80,
    height: 80,
    borderRadius: BorderRadius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  acceptButton: {
    width: 80,
    height: 80,
    borderRadius: BorderRadius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonLabel: {
    color: '#fff',
    marginTop: Spacing.xs,
    fontSize: 12,
  },
});
