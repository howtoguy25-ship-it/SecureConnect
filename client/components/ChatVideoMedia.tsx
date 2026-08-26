import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, Platform, Modal } from "react-native";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import { useVideoPlayer, VideoView } from "expo-video";
import * as VideoThumbnails from "expo-video-thumbnails";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Spacing } from "@/constants/theme";

/**
 * Chat video bubbles previously rendered a static play-icon placeholder with
 * no real thumbnail, no duration, and no tap handler at all — a video
 * message could not actually be opened or played from the chat. Mirrors the
 * same real thumbnail-extraction + full-screen-player pattern already
 * proven working for Status video tiles (StatusScreen.tsx's VideoThumb /
 * StatusVideoPlayer), rather than inventing a second approach.
 */
const videoThumbCache = new Map<string, string>();
const videoDurationCache = new Map<string, number>();

function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function ChatVideoThumb({
  uri,
  style,
  onPress,
}: {
  uri: string;
  style: any;
  onPress: () => void;
}) {
  const [thumb, setThumb] = useState<string | null>(videoThumbCache.get(uri) ?? null);
  const [duration, setDuration] = useState<number | null>(videoDurationCache.get(uri) ?? null);

  useEffect(() => {
    if (!uri || Platform.OS === "web" || videoThumbCache.has(uri)) return;
    let alive = true;
    VideoThumbnails.getThumbnailAsync(uri, { time: 500 })
      .then((result) => {
        videoThumbCache.set(uri, result.uri);
        if (alive) setThumb(result.uri);
      })
      .catch(() => {
        // Leave the dark fallback tile — the play badge still communicates
        // that this is a video.
      });
    return () => {
      alive = false;
    };
  }, [uri]);

  // A muted, non-visible player instance purely to read the asset's real
  // duration once metadata loads — there is no other source of truth for
  // this (the E2EE envelope doesn't carry it), and a hardcoded/omitted
  // duration is exactly the kind of "looks real but isn't" UI this app is
  // supposed to avoid.
  const durationProbe = useVideoPlayer(duration === null ? { uri } : null, (p) => {
    p.muted = true;
  });
  useEffect(() => {
    if (duration !== null || !durationProbe) return;
    const sub = durationProbe.addListener("statusChange", (status: any) => {
      if (status?.status === "readyToPlay" && durationProbe.duration > 0) {
        videoDurationCache.set(uri, durationProbe.duration);
        setDuration(durationProbe.duration);
      }
    });
    return () => sub.remove();
  }, [durationProbe, duration, uri]);

  return (
    <Pressable onPress={onPress} style={style}>
      {thumb ? (
        <Image source={{ uri: thumb }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "#1a1a1a" }]} />
      )}
      <View style={styles.overlay}>
        <View style={styles.playBadge}>
          <Feather name="play" size={22} color="#fff" />
        </View>
      </View>
      {duration !== null ? (
        <View style={styles.durationBadge}>
          <Text style={styles.durationText}>{formatDuration(duration)}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export function ChatFullscreenVideoPlayer({
  uri,
  onClose,
}: {
  uri: string | null;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const player = useVideoPlayer(uri ? { uri } : null, (p) => {
    p.loop = false;
    p.play();
  });

  return (
    <Modal visible={!!uri} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.fullscreenBackdrop}>
        <Pressable
          style={[styles.fullscreenClose, { top: insets.top + Spacing.md }]}
          onPress={onClose}
          hitSlop={12}
        >
          <Feather name="x" size={22} color="#fff" />
        </Pressable>
        {uri ? (
          <VideoView
            player={player}
            style={styles.fullscreenVideo}
            contentFit="contain"
            nativeControls
          />
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  playBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
  },
  durationBadge: {
    position: "absolute",
    bottom: 6,
    right: 6,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  durationText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "600",
  },
  fullscreenBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.95)",
    justifyContent: "center",
    alignItems: "center",
  },
  fullscreenClose: {
    position: "absolute",
    right: Spacing.lg,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  fullscreenVideo: {
    width: "100%",
    height: "80%",
  },
});
