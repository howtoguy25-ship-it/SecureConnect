import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  View,
  StyleSheet,
  Platform,
  useWindowDimensions,
  ActivityIndicator,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
  cancelAnimation,
  Easing,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/ThemedText';
import { Image } from 'expo-image';
import { useTheme } from '@/hooks/useTheme';
import { haptics } from '@/lib/haptics';

export type BubbleLayout = { x: number; y: number; width: number; height: number };

export type HoldAction = {
  key: string;
  label: string;
  icon: keyof typeof Feather.glyphMap;
  color?: string;
  destructive?: boolean;
  onPress: () => void;
};

export type HoldMessage = {
  id: string;
  isOwn: boolean;
  text: string | null;
  mediaUrl: string | null;
  mediaType: string | null;
  timeText: string;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  message: HoldMessage | null;
  layout: BubbleLayout | null;
  reactions: Record<string, string[]>;
  currentUserId: string | null;
  onReact: (emoji: string) => void;
  onOpenEmojiPicker: () => void;
  actions: HoldAction[];
};

const REACTIONS = ['👍', '❤️', '😂', '😮', '😢'];

const REACTION_TRAY_HEIGHT = 56;
const REACTION_TRAY_GAP = 10;
const MENU_GAP = 10;
const MENU_ROW_HEIGHT = 48;
const MENU_VPAD = 12;

export const MessageHoldOverlay: React.FC<Props> = ({
  visible,
  onClose,
  message,
  layout,
  reactions,
  currentUserId,
  onReact,
  onOpenEmojiPicker,
  actions,
}) => {
  const { theme, isDark } = useTheme();
  const isDarkMode = isDark;
  const { width: winW, height: winH } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  // Reanimated values
  const overlayOpacity = useSharedValue(0);
  const trayScale = useSharedValue(0.85);
  const trayOpacity = useSharedValue(0);
  const menuTranslate = useSharedValue(8);
  const menuOpacity = useSharedValue(0);
  const bubbleScale = useSharedValue(1);

  // Track current emoji owned by this user (for highlight + remove behaviour)
  const myReaction = useMemo(() => {
    if (!currentUserId) return null;
    for (const [emoji, users] of Object.entries(reactions)) {
      if (users.includes(currentUserId)) return emoji;
    }
    return null;
  }, [reactions, currentUserId]);

  // Cache message/layout so we can keep rendering through the exit animation
  // even after the parent has already cleared its hold state.
  const [cachedMessage, setCachedMessage] = useState<HoldMessage | null>(message);
  const [cachedLayout, setCachedLayout] = useState<typeof layout>(layout);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const EXIT_DURATION = 160;

  useEffect(() => {
    if (visible && message && layout) {
      setCachedMessage(message);
      setCachedLayout(layout);
    }
  }, [visible, message, layout]);

  useEffect(() => {
    // Always cancel any pending/in-flight animations before retargeting to avoid
    // delayed callbacks racing across rapid open/close cycles.
    cancelAnimation(overlayOpacity);
    cancelAnimation(trayOpacity);
    cancelAnimation(trayScale);
    cancelAnimation(menuOpacity);
    cancelAnimation(menuTranslate);
    cancelAnimation(bubbleScale);
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    if (visible) {
      overlayOpacity.value = withTiming(1, { duration: 180, easing: Easing.out(Easing.quad) });
      trayOpacity.value = withDelay(60, withTiming(1, { duration: 180 }));
      trayScale.value = withDelay(60, withSpring(1, { damping: 14, stiffness: 220 }));
      bubbleScale.value = withSpring(1.02, { damping: 16, stiffness: 220 });
      menuOpacity.value = withDelay(120, withTiming(1, { duration: 200 }));
      menuTranslate.value = withDelay(120, withSpring(0, { damping: 18, stiffness: 200 }));
    } else if (cachedMessage) {
      overlayOpacity.value = withTiming(0, { duration: EXIT_DURATION });
      trayOpacity.value = withTiming(0, { duration: EXIT_DURATION });
      trayScale.value = withTiming(0.9, { duration: EXIT_DURATION });
      bubbleScale.value = withTiming(1, { duration: EXIT_DURATION });
      menuOpacity.value = withTiming(0, { duration: EXIT_DURATION });
      menuTranslate.value = withTiming(8, { duration: EXIT_DURATION });
      closeTimerRef.current = setTimeout(() => {
        setCachedMessage(null);
        setCachedLayout(null);
        closeTimerRef.current = null;
      }, EXIT_DURATION + 20);
    }
    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    };
  }, [visible, cachedMessage]);

  // ---- Smart positioning ----
  // We compute final on-screen positions for: reaction tray, lifted bubble, action menu.
  // Strategy: keep bubble close to its original position; if menu would clip the bottom,
  // shift everything upward; if reactions would clip the top, shift everything downward.
  const placement = useMemo(() => {
    const lay = cachedLayout ?? layout;
    if (!lay) return null;
    const safeTop = insets.top + 12;
    const safeBottom = winH - insets.bottom - 12;
    const menuHeight = actions.length * MENU_ROW_HEIGHT + MENU_VPAD * 2;

    let bubbleY = lay.y;
    const bubbleH = lay.height;

    // Required vertical span: tray + gap + bubble + gap + menu
    const totalSpan = REACTION_TRAY_HEIGHT + REACTION_TRAY_GAP + bubbleH + MENU_GAP + menuHeight;
    const available = safeBottom - safeTop;
    if (totalSpan > available) {
      // Not enough room for all three — bias bubble to top so menu is visible.
      bubbleY = safeTop + REACTION_TRAY_HEIGHT + REACTION_TRAY_GAP;
    } else {
      // Try to keep bubble where it is. Push down if tray clips top, push up if menu clips bottom.
      const trayTop = bubbleY - REACTION_TRAY_GAP - REACTION_TRAY_HEIGHT;
      const menuBottom = bubbleY + bubbleH + MENU_GAP + menuHeight;
      if (trayTop < safeTop) bubbleY += safeTop - trayTop;
      const menuBottomNew = bubbleY + bubbleH + MENU_GAP + menuHeight;
      if (menuBottomNew > safeBottom) bubbleY -= menuBottomNew - safeBottom;
      // Final clamp
      bubbleY = Math.max(safeTop + REACTION_TRAY_HEIGHT + REACTION_TRAY_GAP, bubbleY);
    }

    return {
      bubbleX: lay.x,
      bubbleY,
      bubbleW: lay.width,
      bubbleH,
      trayY: bubbleY - REACTION_TRAY_GAP - REACTION_TRAY_HEIGHT,
      menuY: bubbleY + bubbleH + MENU_GAP,
      menuHeight,
    };
  }, [layout, cachedLayout, winH, insets, actions.length]);

  const overlayAnimStyle = useAnimatedStyle(() => ({ opacity: overlayOpacity.value }));
  const trayAnimStyle = useAnimatedStyle(() => ({
    opacity: trayOpacity.value,
    transform: [{ scale: trayScale.value }],
  }));
  const bubbleAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: bubbleScale.value }],
  }));
  const menuAnimStyle = useAnimatedStyle(() => ({
    opacity: menuOpacity.value,
    transform: [{ translateY: menuTranslate.value }],
  }));

  const renderMessage = message ?? cachedMessage;
  if (!renderMessage || !placement) return null;
  const showModal = visible || !!cachedMessage;

  // Choose menu horizontal alignment to match bubble side (own = right, other = left).
  const menuMaxWidth = Math.min(280, winW - 32);
  const menuLeft = renderMessage.isOwn
    ? Math.max(16, placement.bubbleX + placement.bubbleW - menuMaxWidth)
    : Math.min(winW - 16 - menuMaxWidth, placement.bubbleX);

  const trayMaxWidth = Math.min(330, winW - 32);
  const trayLeft = renderMessage.isOwn
    ? Math.max(16, placement.bubbleX + placement.bubbleW - trayMaxWidth)
    : Math.min(winW - 16 - trayMaxWidth, placement.bubbleX);

  const handleReactPress = (emoji: string) => {
    haptics.light();
    onReact(emoji);
  };

  const blurTint = isDarkMode ? 'dark' : 'light';
  const bubbleBg = renderMessage.isOwn ? theme.primary : theme.backgroundSecondary;
  const bubbleTextColor = renderMessage.isOwn ? '#fff' : theme.text;
  const bubbleTimeColor = renderMessage.isOwn ? 'rgba(255,255,255,0.75)' : theme.textSecondary;

  return (
    <Modal visible={showModal} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[StyleSheet.absoluteFill, overlayAnimStyle]}>
        {Platform.OS === 'web' ? (
          <View
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundColor: isDarkMode ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.35)',
                ...(Platform.OS === 'web'
                  ? ({ backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' } as any)
                  : {}),
              },
            ]}
          />
        ) : (
          <BlurView intensity={32} tint={blurTint} style={StyleSheet.absoluteFill}>
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.18)' }]} />
          </BlurView>
        )}

        {/* Background tap to dismiss */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        {/* Reaction tray */}
        <Animated.View
          pointerEvents="box-none"
          style={[
            styles.trayWrapper,
            { top: placement.trayY, left: trayLeft, maxWidth: trayMaxWidth },
            trayAnimStyle,
          ]}
        >
          <BlurView
            intensity={Platform.OS === 'ios' ? 60 : 40}
            tint={blurTint}
            style={[
              styles.trayInner,
              {
                backgroundColor:
                  Platform.OS === 'android' || Platform.OS === 'web'
                    ? isDarkMode
                      ? 'rgba(40,40,45,0.94)'
                      : 'rgba(255,255,255,0.95)'
                    : 'transparent',
              },
            ]}
          >
            {REACTIONS.map((emoji) => {
              const mine = myReaction === emoji;
              void onOpenEmojiPicker;
              return (
                <Pressable
                  key={emoji}
                  onPress={() => handleReactPress(emoji)}
                  style={({ pressed }) => [
                    styles.reactionBtn,
                    mine && {
                      backgroundColor: isDarkMode ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.08)',
                    },
                    pressed && { transform: [{ scale: 0.9 }] },
                  ]}
                >
                  <ThemedText style={styles.reactionEmoji}>{emoji}</ThemedText>
                </Pressable>
              );
            })}
          </BlurView>
        </Animated.View>

        {/* Lifted bubble snapshot */}
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              top: placement.bubbleY,
              left: placement.bubbleX,
              width: placement.bubbleW,
            },
            bubbleAnimStyle,
          ]}
        >
          <View
            style={[
              styles.bubbleCard,
              {
                backgroundColor: bubbleBg,
                borderTopLeftRadius: 18,
                borderTopRightRadius: 18,
                borderBottomLeftRadius: renderMessage.isOwn ? 18 : 4,
                borderBottomRightRadius: renderMessage.isOwn ? 4 : 18,
                shadowColor: '#000',
              },
            ]}
          >
            {renderMessage.mediaType === 'image' && renderMessage.mediaUrl ? (
              <Image
                source={{ uri: renderMessage.mediaUrl }}
                style={styles.bubbleMedia}
                contentFit="cover"
              />
            ) : null}
            {renderMessage.mediaType === 'video' && renderMessage.mediaUrl ? (
              <View style={[styles.bubbleMedia, { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)' }]}>
                <Feather name="play-circle" size={36} color="#fff" />
              </View>
            ) : null}
            {renderMessage.mediaType === 'audio' ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Feather name="mic" size={18} color={bubbleTextColor} />
                <ThemedText style={{ color: bubbleTextColor, fontWeight: '600' }}>Voice message</ThemedText>
              </View>
            ) : null}
            {renderMessage.text ? (
              <ThemedText style={[styles.bubbleText, { color: bubbleTextColor }]}>
                {renderMessage.text}
              </ThemedText>
            ) : null}
            <View style={{ flexDirection: 'row', alignSelf: 'flex-end', alignItems: 'center', gap: 4, marginTop: 4 }}>
              <ThemedText style={{ fontSize: 11, color: bubbleTimeColor }}>
                {renderMessage.timeText}
              </ThemedText>
            </View>
          </View>
        </Animated.View>

        {/* Compact action menu */}
        <Animated.View
          pointerEvents="box-none"
          style={[
            styles.menuWrapper,
            {
              top: placement.menuY,
              left: menuLeft,
              maxWidth: menuMaxWidth,
              width: menuMaxWidth,
            },
            menuAnimStyle,
          ]}
        >
          <BlurView
            intensity={Platform.OS === 'ios' ? 60 : 40}
            tint={blurTint}
            style={[
              styles.menuInner,
              {
                backgroundColor:
                  Platform.OS === 'android' || Platform.OS === 'web'
                    ? isDarkMode
                      ? 'rgba(40,40,45,0.96)'
                      : 'rgba(255,255,255,0.97)'
                    : 'transparent',
              },
            ]}
          >
            {actions.map((action, idx) => (
              <Pressable
                key={action.key}
                onPress={() => {
                  haptics.light();
                  action.onPress();
                }}
                style={({ pressed }) => [
                  styles.menuRow,
                  idx !== actions.length - 1 && {
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderBottomColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
                  },
                  pressed && { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' },
                ]}
              >
                <ThemedText
                  style={[
                    styles.menuLabel,
                    { color: action.destructive ? '#FF3B30' : theme.text },
                  ]}
                >
                  {action.label}
                </ThemedText>
                <Feather
                  name={action.icon}
                  size={18}
                  color={action.destructive ? '#FF3B30' : action.color ?? theme.text}
                />
              </Pressable>
            ))}
          </BlurView>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  trayWrapper: {
    position: 'absolute',
    height: REACTION_TRAY_HEIGHT,
    borderRadius: REACTION_TRAY_HEIGHT / 2,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  trayInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 6,
    paddingVertical: 4,
    gap: 2,
  },
  reactionBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactionPlus: {
    width: 40,
    height: 40,
  },
  reactionEmoji: {
    fontSize: 26,
    lineHeight: 30,
  },
  bubbleCard: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  bubbleText: {
    fontSize: 16,
    lineHeight: 21,
  },
  bubbleMedia: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 12,
    marginBottom: 6,
  },
  menuWrapper: {
    position: 'absolute',
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 9,
  },
  menuInner: {
    paddingVertical: MENU_VPAD,
  },
  menuRow: {
    height: MENU_ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
  },
  menuLabel: {
    fontSize: 16,
    fontWeight: '500',
  },
});
