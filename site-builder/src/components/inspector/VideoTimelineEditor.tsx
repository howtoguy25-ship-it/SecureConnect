import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Image, ActivityIndicator, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { showAlert } from '@/utils/alert';
import { Ionicons } from '@expo/vector-icons';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { useVideoPlayer, VideoView } from 'expo-video';
import { VideoSegment } from '@/types';
import SliderRow from '@/components/inspector/SliderRow';
import { generateId } from '@/utils/id';

const PX_PER_SEC = 40;
const MIN_SEG_WIDTH = 56;
const MAX_SEG_WIDTH = 220;
const DEFAULT_FREEZE_MS = 1500;
const SEG_GAP = 4;

function segTimelineMs(seg: VideoSegment): number {
  return seg.kind === 'freeze' ? seg.freezeDurationMs ?? DEFAULT_FREEZE_MS : Math.max(0, seg.endMs - seg.startMs);
}

function segWidth(seg: VideoSegment): number {
  const sec = segTimelineMs(seg) / 1000;
  return Math.max(MIN_SEG_WIDTH, Math.min(MAX_SEG_WIDTH, sec * PX_PER_SEC));
}

// Real pixel<->timeline-ms mapping that accounts for each segment's own (clamped) rendered
// width and the gap between them -- so the playhead line always lines up with wherever the
// segments actually draw, not a naive linear scale.
function totalContentPx(segments: VideoSegment[]): number {
  return segments.reduce((sum, s, i) => sum + segWidth(s) + (i > 0 ? SEG_GAP : 0), 0);
}
function pxForMs(ms: number, segments: VideoSegment[]): number {
  let accMs = 0;
  let accPx = 0;
  for (let i = 0; i < segments.length; i++) {
    if (i > 0) accPx += SEG_GAP;
    const seg = segments[i];
    const segMs = segTimelineMs(seg);
    const segPx = segWidth(seg);
    if (ms <= accMs + segMs || i === segments.length - 1) {
      const frac = segMs > 0 ? Math.min(1, Math.max(0, (ms - accMs) / segMs)) : 0;
      return accPx + frac * segPx;
    }
    accMs += segMs;
    accPx += segPx;
  }
  return accPx;
}
function msForPx(px: number, segments: VideoSegment[]): number {
  let accMs = 0;
  let accPx = 0;
  for (let i = 0; i < segments.length; i++) {
    if (i > 0) accPx += SEG_GAP;
    const seg = segments[i];
    const segMs = segTimelineMs(seg);
    const segPx = segWidth(seg);
    if (px <= accPx + segPx || i === segments.length - 1) {
      const frac = segPx > 0 ? Math.min(1, Math.max(0, (px - accPx) / segPx)) : 0;
      return accMs + frac * segMs;
    }
    accPx += segPx;
    accMs += segMs;
  }
  return accMs;
}
// Reverse of the timeline->source mapping resolvePlayhead does, used while the raw preview is
// actually playing: given the player's real current source time, find which 'clip' segment
// (if any) it still falls inside and what timeline position that corresponds to. Returns null
// once playback has run past the end of the segment it started in -- that raw footage isn't
// part of the edited timeline anymore (it was cut or lives after a freeze/deleted gap), so the
// caller stops playback there instead of silently drifting through footage the edit doesn't use.
function timelineMsForSource(sourceMs: number, segments: VideoSegment[]): number | null {
  let acc = 0;
  for (const seg of segments) {
    if (seg.kind === 'clip' && sourceMs >= seg.startMs && sourceMs <= seg.endMs) {
      return acc + (sourceMs - seg.startMs);
    }
    acc += segTimelineMs(seg);
  }
  return null;
}

// Real, working CapCut/Snapchat-style timeline: a row of segment blocks (each a real
// thumbnail pulled from the actual clip, sized by its own real duration), a FIXED playhead
// line at the center of the viewport with the film-strip scrolling underneath it (the same
// scrub convention CapCut/iMovie use -- dragging the strip IS moving the playhead, no
// separate slider to keep in sync), and three real actions -- Split (cuts the segment under
// the playhead into two), Freeze Here (holds that exact frame for a real, adjustable duration
// before the clip continues), and Delete Segment (a real cut -- that footage is gone from
// playback). Segments are the real edit list VideoElement.segments stores and both the editor
// preview (ElementRenderer.tsx) and the published site (siteHtml.ts) actually play back.
export default function VideoTimelineEditor({
  uri,
  segments,
  trimStartMs,
  trimEndMs,
  onChange,
}: {
  uri: string;
  segments: VideoSegment[];
  trimStartMs: number;
  trimEndMs: number | null;
  onChange: (segments: VideoSegment[]) => void;
}) {
  const previewPlayer = useVideoPlayer(uri, (p) => {
    p.muted = true;
    p.loop = false;
    // Fires 'timeUpdate' every 50ms while playing -- frequent enough for the playhead line
    // and film strip to visibly track real playback instead of jumping in big steps.
    p.timeUpdateEventInterval = 0.05;
  });
  const [isPlaying, setIsPlaying] = useState(false);
  const [durationMs, setDurationMs] = useState<number | null>(trimEndMs);
  useEffect(() => {
    const sub = previewPlayer.addListener('statusChange', (payload) => {
      if (payload.status === 'readyToPlay' && previewPlayer.duration > 0) {
        setDurationMs((d) => d ?? Math.round(previewPlayer.duration * 1000));
      }
    });
    return () => sub.remove();
  }, [previewPlayer]);

  // A brand-new video with no edits yet starts as one plain clip segment spanning the
  // existing trim range -- the very first Split/Freeze from here is what actually creates a
  // real multi-segment edit list.
  const effectiveSegments: VideoSegment[] = useMemo(() => {
    if (segments.length > 0) return segments;
    const endMs = trimEndMs ?? durationMs ?? trimStartMs + 5000;
    return [{ id: generateId('seg'), kind: 'clip', startMs: trimStartMs, endMs }];
  }, [segments, trimStartMs, trimEndMs, durationMs]);

  const [selectedId, setSelectedId] = useState(effectiveSegments[0]?.id ?? null);
  useEffect(() => {
    if (!effectiveSegments.some((s) => s.id === selectedId)) setSelectedId(effectiveSegments[0]?.id ?? null);
  }, [effectiveSegments, selectedId]);

  const totalTimelineMs = effectiveSegments.reduce((sum, s) => sum + segTimelineMs(s), 0);
  const [playheadMs, setPlayheadMs] = useState(0);

  // Maps a timeline position (accounting for every cut/freeze before it) to which segment
  // it's really in and the corresponding real SOURCE-clip time -- what actually gets seeked
  // to for the live preview frame below.
  const resolvePlayhead = (timelineMs: number): { segment: VideoSegment; index: number; sourceMs: number } => {
    let acc = 0;
    for (let i = 0; i < effectiveSegments.length; i++) {
      const seg = effectiveSegments[i];
      const dur = segTimelineMs(seg);
      if (timelineMs <= acc + dur || i === effectiveSegments.length - 1) {
        const sourceMs = seg.kind === 'freeze' ? seg.startMs : seg.startMs + Math.max(0, timelineMs - acc);
        return { segment: seg, index: i, sourceMs };
      }
      acc += dur;
    }
    const first = effectiveSegments[0];
    return { segment: first, index: 0, sourceMs: first?.startMs ?? 0 };
  };

  const seekPreview = (timelineMs: number) => {
    setPlayheadMs(timelineMs);
    const { sourceMs } = resolvePlayhead(timelineMs);
    previewPlayer.pause();
    previewPlayer.currentTime = sourceMs / 1000;
  };

  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const requestedThumbs = useRef(new Set<string>());
  useEffect(() => {
    effectiveSegments.forEach((seg) => {
      const key = `${seg.id}-${Math.round(seg.startMs)}`;
      if (requestedThumbs.current.has(key)) return;
      requestedThumbs.current.add(key);
      VideoThumbnails.getThumbnailAsync(uri, { time: seg.startMs })
        .then(({ uri: thumbUri }) => setThumbnails((t) => ({ ...t, [seg.id]: thumbUri })))
        .catch(() => {
          // A thumbnail is a nice-to-have preview, not something playback depends on -- a
          // codec/format this device can't extract a frame from just falls back to the plain
          // placeholder icon below instead of blocking the rest of the timeline editor.
        });
    });
  }, [effectiveSegments, uri]);

  const [freezeHoldSec, setFreezeHoldSec] = useState(DEFAULT_FREEZE_MS / 1000);

  // The scrollable film-strip is padded by half the viewport on each side (see
  // contentContainerStyle below) so timeline-ms 0 and the very last ms can both scroll all
  // the way to the fixed center playhead line -- scrollX then maps 1:1 onto the same px
  // space pxForMs/msForPx already use, no extra offset math needed.
  const [viewportWidth, setViewportWidth] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const contentPx = totalContentPx(effectiveSegments);
  const suppressScrollSeek = useRef(false);

  // Keeps the strip visually aligned with the current playhead whenever the edit list itself
  // changes shape (a split/freeze/delete can shift every later segment's rendered width) --
  // without this, the strip would silently drift out of sync with playheadMs after an edit.
  useEffect(() => {
    if (viewportWidth === 0) return;
    suppressScrollSeek.current = true;
    scrollRef.current?.scrollTo({ x: pxForMs(playheadMs, effectiveSegments), animated: false });
    // Real native scroll events land a frame later -- release the guard right after so a
    // genuine user-driven scroll (the very next frame) isn't accidentally swallowed too.
    requestAnimationFrame(() => {
      suppressScrollSeek.current = false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveSegments, viewportWidth]);

  const scrollToMs = (ms: number, animated = true) => {
    scrollRef.current?.scrollTo({ x: pxForMs(ms, effectiveSegments), animated });
  };

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (suppressScrollSeek.current) return;
    seekPreview(msForPx(e.nativeEvent.contentOffset.x, effectiveSegments));
  };

  // Real play/pause on the preview itself: tapping Play actually plays the raw clip from the
  // current scrub position, dragging the film strip's fixed playhead line along with it in
  // real time (via 'timeUpdate'), and tapping Pause actually stops it -- instead of the preview
  // only ever showing a single still frame you can scrub between.
  useEffect(() => {
    const playingSub = previewPlayer.addListener('playingChange', (payload) => setIsPlaying(payload.isPlaying));
    const timeSub = previewPlayer.addListener('timeUpdate', (payload) => {
      const sourceMs = payload.currentTime * 1000;
      const timelineMs = timelineMsForSource(sourceMs, effectiveSegments);
      if (timelineMs == null) {
        // Ran past the end of the clip segment it started in -- that footage is a cut or the
        // far side of a freeze/deleted gap, so stop instead of playing through it silently.
        previewPlayer.pause();
        return;
      }
      setPlayheadMs(timelineMs);
      suppressScrollSeek.current = true;
      scrollRef.current?.scrollTo({ x: pxForMs(timelineMs, effectiveSegments), animated: false });
      requestAnimationFrame(() => {
        suppressScrollSeek.current = false;
      });
    });
    return () => {
      playingSub.remove();
      timeSub.remove();
    };
  }, [previewPlayer, effectiveSegments]);

  const togglePlay = () => {
    if (previewPlayer.playing) previewPlayer.pause();
    else previewPlayer.play();
  };

  const splitHere = () => {
    const { segment, index, sourceMs } = resolvePlayhead(playheadMs);
    if (segment.kind !== 'clip') return;
    if (sourceMs <= segment.startMs + 100 || sourceMs >= segment.endMs - 100) {
      showAlert('Move the playhead first', 'Scrub the film strip so the line sits further from the edges of this clip, then try Split again.');
      return;
    }
    const next: VideoSegment[] = [
      ...effectiveSegments.slice(0, index),
      { id: generateId('seg'), kind: 'clip', startMs: segment.startMs, endMs: sourceMs },
      { id: generateId('seg'), kind: 'clip', startMs: sourceMs, endMs: segment.endMs },
      ...effectiveSegments.slice(index + 1),
    ];
    onChange(next);
  };

  const freezeHere = () => {
    const { segment, index, sourceMs } = resolvePlayhead(playheadMs);
    if (segment.kind !== 'clip') return;
    const freezeMs = Math.max(300, Math.round(freezeHoldSec * 1000));
    const before: VideoSegment[] = sourceMs > segment.startMs + 50 ? [{ id: generateId('seg'), kind: 'clip', startMs: segment.startMs, endMs: sourceMs }] : [];
    const after: VideoSegment[] = sourceMs < segment.endMs - 50 ? [{ id: generateId('seg'), kind: 'clip', startMs: sourceMs, endMs: segment.endMs }] : [];
    const freeze: VideoSegment = { id: generateId('seg'), kind: 'freeze', startMs: sourceMs, endMs: sourceMs, freezeDurationMs: freezeMs };
    const next: VideoSegment[] = [...effectiveSegments.slice(0, index), ...before, freeze, ...after, ...effectiveSegments.slice(index + 1)];
    onChange(next);
  };

  const deleteSelected = () => {
    if (effectiveSegments.length <= 1 || !selectedId) {
      showAlert('Nothing to delete', 'A clip needs to keep at least one segment -- split it first if you want to cut out just part of it.');
      return;
    }
    onChange(effectiveSegments.filter((s) => s.id !== selectedId));
  };

  const current = resolvePlayhead(playheadMs);
  const totalSec = totalTimelineMs / 1000;

  return (
    <View>
      <View style={styles.previewWrap}>
        <VideoView player={previewPlayer} style={styles.preview} contentFit="cover" nativeControls={false} />
        <Pressable style={styles.playPauseBtn} onPress={togglePlay} hitSlop={10}>
          <View style={styles.playPauseCircle}>
            <Ionicons name={isPlaying ? 'pause' : 'play'} size={26} color="#FFFFFF" style={isPlaying ? undefined : styles.playIconNudge} />
          </View>
        </Pressable>
        <View style={styles.previewBadge}>
          <Ionicons name="eye-outline" size={12} color="#FFFFFF" />
          <Text style={styles.previewBadgeText}>{(playheadMs / 1000).toFixed(1)}s / {totalSec.toFixed(1)}s</Text>
        </View>
      </View>

      <Text style={styles.scrubHint}>Drag the film strip left/right to scrub -- tap a clip to jump to its middle.</Text>
      <View style={styles.timelineWrap} onLayout={(e) => setViewportWidth(e.nativeEvent.layout.width)}>
        {viewportWidth > 0 && (
          <ScrollView
            ref={scrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[styles.timelineRow, { paddingHorizontal: viewportWidth / 2 }]}
            onScroll={handleScroll}
            scrollEventThrottle={16}
          >
            {effectiveSegments.map((seg) => (
              <Pressable
                key={seg.id}
                style={[styles.segment, { width: segWidth(seg) }, selectedId === seg.id && styles.segmentSelected]}
                onPress={() => {
                  setSelectedId(seg.id);
                  let acc = 0;
                  for (const s of effectiveSegments) {
                    if (s.id === seg.id) break;
                    acc += segTimelineMs(s);
                  }
                  // Lands on the segment's real MIDPOINT (not its very first millisecond) --
                  // always at least 100ms from both edges for any segment longer than 200ms,
                  // so Split/Freeze work immediately on a single tap instead of silently
                  // failing their too-close-to-the-edge guard.
                  scrollToMs(acc + segTimelineMs(seg) / 2);
                }}
              >
                {thumbnails[seg.id] ? (
                  <Image source={{ uri: thumbnails[seg.id] }} style={styles.segmentThumb} resizeMode="cover" />
                ) : (
                  <View style={[styles.segmentThumb, styles.segmentThumbPlaceholder]}>
                    <ActivityIndicator size="small" color="#94A3B8" />
                  </View>
                )}
                {seg.kind === 'freeze' && (
                  <View style={styles.freezeBadge}>
                    <Ionicons name="snow-outline" size={12} color="#FFFFFF" />
                  </View>
                )}
                <Text style={styles.segmentDuration}>{(segTimelineMs(seg) / 1000).toFixed(1)}s</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
        <View pointerEvents="none" style={styles.centerPlayhead}>
          <View style={styles.centerPlayheadTick} />
          <View style={styles.centerPlayheadLine} />
        </View>
      </View>

      <View style={styles.actionsRow}>
        <Pressable style={[styles.actionBtn, current.segment.kind === 'freeze' && styles.actionBtnDisabled]} onPress={splitHere} disabled={current.segment.kind === 'freeze'}>
          <Ionicons name="cut-outline" size={16} color="#FFFFFF" />
          <Text style={styles.actionBtnText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
            Split
          </Text>
        </Pressable>
        <Pressable style={[styles.actionBtn, current.segment.kind === 'freeze' && styles.actionBtnDisabled]} onPress={freezeHere} disabled={current.segment.kind === 'freeze'}>
          <Ionicons name="snow-outline" size={16} color="#FFFFFF" />
          <Text style={styles.actionBtnText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
            Freeze
          </Text>
        </Pressable>
        <Pressable
          style={[styles.actionBtn, styles.deleteBtn, effectiveSegments.length <= 1 && styles.actionBtnDisabled]}
          onPress={deleteSelected}
          disabled={effectiveSegments.length <= 1}
        >
          <Ionicons name="trash-outline" size={16} color="#FFFFFF" />
          <Text style={styles.actionBtnText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
            Delete
          </Text>
        </Pressable>
      </View>

      <SliderRow label="Freeze Hold (s)" value={freezeHoldSec} min={0.3} max={5} step={0.1} decimals={1} onChange={setFreezeHoldSec} />
    </View>
  );
}

const styles = StyleSheet.create({
  previewWrap: { width: '100%', height: 200, borderRadius: 10, overflow: 'hidden', backgroundColor: '#000', marginBottom: 10 },
  preview: { width: '100%', height: '100%' },
  previewBadge: {
    position: 'absolute',
    left: 8,
    top: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(15,23,42,0.7)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  previewBadgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },
  scrubHint: { fontSize: 11, color: '#94A3B8', marginBottom: 4 },
  timelineWrap: { height: 68, justifyContent: 'center' },
  timelineRow: { gap: SEG_GAP, alignItems: 'center' },
  segment: {
    height: 56,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#1E293B',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  segmentSelected: { borderColor: '#2563EB' },
  segmentThumb: { width: '100%', height: '100%' },
  segmentThumbPlaceholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#334155' },
  freezeBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#0EA5E9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentDuration: {
    position: 'absolute',
    bottom: 2,
    left: 4,
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    textShadowColor: '#000000AA',
    textShadowRadius: 2,
  },
  // A fixed vertical line dead-center over the timeline viewport -- the film strip scrolls
  // underneath it (see handleScroll), matching the real scrub convention CapCut/iMovie use
  // instead of a separate abstract slider disconnected from what's visually on screen.
  centerPlayhead: { position: 'absolute', left: '50%', top: 0, bottom: 0, width: 2, marginLeft: -1, alignItems: 'center' },
  centerPlayheadLine: { flex: 1, width: 2, backgroundColor: '#DC2626' },
  centerPlayheadTick: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#DC2626', marginBottom: -2 },
  actionsRow: { flexDirection: 'row', gap: 8, marginTop: 6, marginBottom: 4 },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: '#2563EB',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 4,
    overflow: 'hidden',
  },
  deleteBtn: { backgroundColor: '#DC2626' },
  actionBtnDisabled: { opacity: 0.4 },
  // flexShrink + numberOfLines/adjustsFontSizeToFit (set at the call site) together guarantee
  // the label always fits inside the button's real rendered width instead of spilling past its
  // rounded edge -- the "Delete Segment" label used to render wider than its flex:1 share and
  // visibly cut off at the screen edge since nothing here bounded or shrank it.
  actionBtnText: { flexShrink: 1, color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  // A real play/pause control over the live preview -- previously the preview only ever showed
  // a single still frame at whatever point the film strip was scrubbed to, with no way to
  // actually watch the clip play.
  playPauseBtn: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playPauseCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(15,23,42,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playIconNudge: { marginLeft: 3 },
});
