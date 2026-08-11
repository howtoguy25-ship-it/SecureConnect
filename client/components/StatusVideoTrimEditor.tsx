import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, StyleSheet, Pressable, Modal, PanResponder, Image, ActivityIndicator, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { Feather } from '@expo/vector-icons';
import { ThemedText } from '@/components/ThemedText';
import { Spacing, BorderRadius } from '@/constants/theme';

// Matches the common "story clip" cap (WhatsApp/Instagram-style) rather than
// letting someone post an arbitrarily long status video.
const MAX_TRIM_SECONDS = 30;
const MIN_TRIM_SECONDS = 1;
const THUMBNAIL_COUNT = 10;
const HANDLE_WIDTH = 20;
const TRACK_HEIGHT = 56;

function formatTime(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

interface StatusVideoTrimEditorProps {
  visible: boolean;
  uri: string;
  theme: any;
  initialTrimStartMs?: number | null;
  initialTrimEndMs?: number | null;
  onCancel: () => void;
  onConfirm: (trim: { trimStartMs: number; trimEndMs: number } | null) => void;
}

// A real WhatsApp-style trim UI: a filmstrip of thumbnails spanning the
// whole clip, two draggable handles marking the selected window (capped at
// MAX_TRIM_SECONDS), and a preview player that loops just the selection so
// you can check it before posting. The uploaded file itself is never
// re-encoded — trimStartMs/trimEndMs travel to the server as playback
// boundaries that every viewer's player seeks to and stops at (see
// StatusScreen's StatusVideoPlayer), the same approach as marking chapter
// points rather than physically cutting the video.
export function StatusVideoTrimEditor({
  visible,
  uri,
  theme,
  initialTrimStartMs,
  initialTrimEndMs,
  onCancel,
  onConfirm,
}: StatusVideoTrimEditorProps) {
  const insets = useSafeAreaInsets();
  const [duration, setDuration] = useState(0);
  const [ready, setReady] = useState(false);
  const [startSec, setStartSec] = useState(0);
  const [endSec, setEndSec] = useState(0);
  const [activeHandle, setActiveHandle] = useState<'start' | 'end' | null>(null);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [thumbnails, setThumbnails] = useState<(string | null)[]>([]);
  const [trackWidth, setTrackWidth] = useState(0);

  const durationRef = useRef(0);
  const startSecRef = useRef(0);
  const endSecRef = useRef(0);
  const trackWidthRef = useRef(0);
  const dragOriginPxRef = useRef(0);

  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
    p.muted = false;
  });

  useEffect(() => {
    const sub = player.addListener('sourceLoad', (payload: { duration: number }) => {
      const d = payload.duration || 0;
      durationRef.current = d;
      setDuration(d);
      const initialStart = Math.max(0, (initialTrimStartMs ?? 0) / 1000);
      const initialEnd = initialTrimEndMs != null
        ? Math.min(d, initialTrimEndMs / 1000)
        : Math.min(d, MAX_TRIM_SECONDS);
      const s = Math.min(initialStart, Math.max(0, initialEnd - MIN_TRIM_SECONDS));
      startSecRef.current = s;
      endSecRef.current = Math.max(initialEnd, s + MIN_TRIM_SECONDS);
      setStartSec(startSecRef.current);
      setEndSec(endSecRef.current);
      setReady(true);
      player.currentTime = s;
    });
    return () => sub.remove();
  }, [player, initialTrimStartMs, initialTrimEndMs]);

  useEffect(() => {
    const sub = player.addListener('timeUpdate', (payload: { currentTime: number }) => {
      if (isPreviewPlaying && payload.currentTime >= endSecRef.current) {
        player.currentTime = startSecRef.current;
      }
    });
    return () => sub.remove();
  }, [player, isPreviewPlaying]);

  // Generate an evenly-spaced filmstrip once we know how long the clip is.
  useEffect(() => {
    if (!ready || duration <= 0 || Platform.OS === 'web') return;
    let cancelled = false;
    setThumbnails(new Array(THUMBNAIL_COUNT).fill(null));
    (async () => {
      for (let i = 0; i < THUMBNAIL_COUNT; i++) {
        if (cancelled) return;
        try {
          const timeMs = (i / (THUMBNAIL_COUNT - 1)) * duration * 1000;
          const result = await VideoThumbnails.getThumbnailAsync(uri, { time: timeMs });
          if (cancelled) return;
          setThumbnails((prev) => {
            const next = [...prev];
            next[i] = result.uri;
            return next;
          });
        } catch {
          // Leave that tile blank — a missing thumbnail isn't worth failing over.
        }
      }
    })();
    return () => { cancelled = true; };
  }, [ready, duration, uri]);

  const seekPreview = useCallback((sec: number) => {
    try {
      player.pause();
      setIsPreviewPlaying(false);
      player.currentTime = sec;
    } catch {}
  }, [player]);

  const clampWindow = (nextStart: number, nextEnd: number): [number, number] => {
    let s = Math.max(0, nextStart);
    let e = Math.min(durationRef.current, nextEnd);
    if (e - s < MIN_TRIM_SECONDS) {
      // Keep whichever edge the user is actively moving in place and push
      // the other one just enough to preserve the minimum window.
      if (s === startSecRef.current) e = Math.min(durationRef.current, s + MIN_TRIM_SECONDS);
      else s = Math.max(0, e - MIN_TRIM_SECONDS);
    }
    if (e - s > MAX_TRIM_SECONDS) {
      if (s !== startSecRef.current) s = e - MAX_TRIM_SECONDS;
      else e = s + MAX_TRIM_SECONDS;
    }
    return [s, e];
  };

  const startPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        dragOriginPxRef.current = trackWidthRef.current > 0
          ? (startSecRef.current / durationRef.current) * trackWidthRef.current
          : 0;
        setActiveHandle('start');
      },
      onPanResponderMove: (_evt, gesture) => {
        if (trackWidthRef.current <= 0 || durationRef.current <= 0) return;
        const px = Math.max(0, Math.min(trackWidthRef.current, dragOriginPxRef.current + gesture.dx));
        const rawSec = (px / trackWidthRef.current) * durationRef.current;
        const [s, e] = clampWindow(rawSec, endSecRef.current);
        startSecRef.current = s;
        endSecRef.current = e;
        setStartSec(s);
        setEndSec(e);
        seekPreview(s);
      },
      onPanResponderRelease: () => setActiveHandle(null),
      onPanResponderTerminate: () => setActiveHandle(null),
    }),
  ).current;

  const endPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        dragOriginPxRef.current = trackWidthRef.current > 0
          ? (endSecRef.current / durationRef.current) * trackWidthRef.current
          : 0;
        setActiveHandle('end');
      },
      onPanResponderMove: (_evt, gesture) => {
        if (trackWidthRef.current <= 0 || durationRef.current <= 0) return;
        const px = Math.max(0, Math.min(trackWidthRef.current, dragOriginPxRef.current + gesture.dx));
        const rawSec = (px / trackWidthRef.current) * durationRef.current;
        const [s, e] = clampWindow(startSecRef.current, rawSec);
        startSecRef.current = s;
        endSecRef.current = e;
        setStartSec(s);
        setEndSec(e);
        seekPreview(e);
      },
      onPanResponderRelease: () => setActiveHandle(null),
      onPanResponderTerminate: () => setActiveHandle(null),
    }),
  ).current;

  const togglePreviewPlay = () => {
    if (isPreviewPlaying) {
      player.pause();
      setIsPreviewPlaying(false);
    } else {
      player.currentTime = startSecRef.current;
      player.play();
      setIsPreviewPlaying(true);
    }
  };

  const handleConfirm = () => {
    player.pause();
    const fullClip = startSec <= 0.05 && endSec >= duration - 0.05;
    if (fullClip) {
      onConfirm(null);
    } else {
      onConfirm({ trimStartMs: Math.round(startSec * 1000), trimEndMs: Math.round(endSec * 1000) });
    }
  };

  const handleCancel = () => {
    player.pause();
    onCancel();
  };

  const startPx = duration > 0 ? (startSec / duration) * trackWidth : 0;
  const endPx = duration > 0 ? (endSec / duration) * trackWidth : 0;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={handleCancel}>
      <View style={[styles.container, { backgroundColor: '#000', paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={handleCancel} hitSlop={12}>
            <ThemedText type="body" style={{ color: '#fff' }}>Cancel</ThemedText>
          </Pressable>
          <ThemedText type="body" style={{ color: '#fff', fontWeight: '700' }}>Trim Video</ThemedText>
          <Pressable onPress={handleConfirm} hitSlop={12} disabled={!ready}>
            <ThemedText type="body" style={{ color: ready ? theme.primary : 'rgba(255,255,255,0.3)', fontWeight: '700' }}>
              Done
            </ThemedText>
          </Pressable>
        </View>

        <Pressable style={styles.previewWrap} onPress={togglePreviewPlay}>
          <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} />
          {!isPreviewPlaying ? (
            <View style={styles.playOverlay}>
              <Feather name="play" size={40} color="#fff" />
            </View>
          ) : null}
          {!ready ? (
            <View style={styles.playOverlay}>
              <ActivityIndicator size="large" color="#fff" />
            </View>
          ) : null}
        </Pressable>

        <View style={styles.timeRow}>
          <ThemedText type="small" style={{ color: 'rgba(255,255,255,0.7)' }}>
            {formatTime(startSec)} – {formatTime(endSec)}
          </ThemedText>
          <ThemedText type="small" style={{ color: 'rgba(255,255,255,0.7)' }}>
            {formatTime(endSec - startSec)} selected · max {formatTime(MAX_TRIM_SECONDS)}
          </ThemedText>
        </View>

        <View
          style={styles.trackContainer}
          onLayout={(e) => {
            const w = e.nativeEvent.layout.width - HANDLE_WIDTH * 2;
            trackWidthRef.current = Math.max(0, w);
            setTrackWidth(Math.max(0, w));
          }}
        >
          <View style={[styles.filmstrip, { marginHorizontal: HANDLE_WIDTH }]}>
            {(thumbnails.length ? thumbnails : new Array(THUMBNAIL_COUNT).fill(null)).map((thumb, i) => (
              <View key={i} style={styles.filmstripTile}>
                {thumb ? (
                  <Image source={{ uri: thumb }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                ) : (
                  <View style={[StyleSheet.absoluteFill, { backgroundColor: '#222' }]} />
                )}
              </View>
            ))}
          </View>

          {trackWidth > 0 ? (
            <>
              {/* Dim the discarded portions outside the selected window. */}
              <View pointerEvents="none" style={[styles.dimRegion, { left: HANDLE_WIDTH, width: Math.max(0, startPx) }]} />
              <View pointerEvents="none" style={[styles.dimRegion, { left: HANDLE_WIDTH + endPx, width: Math.max(0, trackWidth - endPx) }]} />
              <View
                pointerEvents="none"
                style={[
                  styles.selectionBorder,
                  { left: HANDLE_WIDTH + startPx, width: Math.max(0, endPx - startPx), borderColor: theme.primary },
                ]}
              />
              <View
                {...startPanResponder.panHandlers}
                style={[styles.handle, { left: startPx, backgroundColor: theme.primary }]}
              >
                <View style={styles.handleGrip} />
              </View>
              <View
                {...endPanResponder.panHandlers}
                style={[styles.handle, { left: HANDLE_WIDTH * 2 + endPx - HANDLE_WIDTH, backgroundColor: theme.primary }]}
              >
                <View style={styles.handleGrip} />
              </View>
            </>
          ) : null}
        </View>

        {activeHandle ? (
          <ThemedText type="small" style={{ color: 'rgba(255,255,255,0.5)', textAlign: 'center', marginTop: Spacing.xs }}>
            Dragging {activeHandle} — release to preview
          </ThemedText>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  previewWrap: {
    flex: 1,
    backgroundColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  trackContainer: {
    height: TRACK_HEIGHT,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xl,
    justifyContent: 'center',
  },
  filmstrip: {
    flexDirection: 'row',
    height: TRACK_HEIGHT,
    borderRadius: BorderRadius.sm,
    overflow: 'hidden',
  },
  filmstripTile: {
    flex: 1,
    height: TRACK_HEIGHT,
  },
  dimRegion: {
    position: 'absolute',
    top: 0,
    height: TRACK_HEIGHT,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  selectionBorder: {
    position: 'absolute',
    top: 0,
    height: TRACK_HEIGHT,
    borderWidth: 2,
    borderRadius: BorderRadius.sm,
  },
  handle: {
    position: 'absolute',
    top: 0,
    width: HANDLE_WIDTH,
    height: TRACK_HEIGHT,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handleGrip: {
    width: 3,
    height: 20,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
});
