import React, { useRef } from "react";
import { View, StyleSheet, PanResponder, LayoutChangeEvent } from "react-native";

/**
 * Draggable seek control for voice message bubbles. Previously the waveform
 * bars only ever showed playback position passively (filled vs. unfilled) —
 * there was no way to seek within a voice memo at all, tap or drag.
 *
 * Renders the same waveform bars the caller already had, but wraps them in a
 * PanResponder so both a tap and a drag anywhere across the row compute a
 * fraction of the total width and report it via onSeek — the caller is
 * responsible for actually calling the player's seekTo() with
 * fraction * duration, since this component has no notion of playback
 * itself (kept dumb/presentational, consistent with it just being a
 * fancier version of the waveform View it replaces).
 */
export function VoiceScrubber({
  bars,
  progress,
  isPlaying,
  filledColor,
  unfilledColor,
  onSeek,
}: {
  bars: number[];
  progress: number;
  isPlaying: boolean;
  filledColor: string;
  unfilledColor: string;
  onSeek: (fraction: number) => void;
}) {
  const widthRef = useRef(0);

  const handleTouch = (locationX: number) => {
    if (widthRef.current <= 0) return;
    const fraction = Math.max(0, Math.min(1, locationX / widthRef.current));
    onSeek(fraction);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => handleTouch(evt.nativeEvent.locationX),
      onPanResponderMove: (evt) => handleTouch(evt.nativeEvent.locationX),
    }),
  ).current;

  const handleLayout = (e: LayoutChangeEvent) => {
    widthRef.current = e.nativeEvent.layout.width;
  };

  return (
    <View
      style={styles.waveformPlaceholder}
      onLayout={handleLayout}
      hitSlop={{ top: 12, bottom: 12 }}
      {...panResponder.panHandlers}
    >
      {bars.map((level, i, arr) => {
        const played = isPlaying && i / arr.length <= progress;
        return (
          <View
            key={i}
            style={[
              styles.waveformBar,
              {
                height: 8 + level * 16,
                backgroundColor: played ? filledColor : unfilledColor,
                opacity: isPlaying ? (played ? 1 : 0.4) : 0.6,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  // Matches ConversationScreen.tsx's original waveformPlaceholder/
  // waveformBar exactly — this replaces that inline View but must not
  // change its layout, just add touch handling.
  waveformPlaceholder: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    flex: 1,
  },
  waveformBar: {
    width: 3,
    borderRadius: 1.5,
  },
});
