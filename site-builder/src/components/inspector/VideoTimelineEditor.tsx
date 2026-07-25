import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Image, ActivityIndicator } from 'react-native';
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

function segTimelineMs(seg: VideoSegment): number {
  return seg.kind === 'freeze' ? seg.freezeDurationMs ?? DEFAULT_FREEZE_MS : Math.max(0, seg.endMs - seg.startMs);
}

function segWidth(seg: VideoSegment): number {
  const sec = segTimelineMs(seg) / 1000;
  return Math.max(MIN_SEG_WIDTH, Math.min(MAX_SEG_WIDTH, sec * PX_PER_SEC));
}

// Real, working CapCut/Snapchat-style timeline: a row of segment blocks (each a real
// thumbnail pulled from the actual clip, sized by its own real duration), a playhead you can
// scrub with a live preview frame, and three real actions -- Split (cuts the segment under
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
  });
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

  const splitHere = () => {
    const { segment, index, sourceMs } = resolvePlayhead(playheadMs);
    if (segment.kind !== 'clip') return;
    if (sourceMs <= segment.startMs + 100 || sourceMs >= segment.endMs - 100) return;
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
    if (effectiveSegments.length <= 1 || !selectedId) return;
    onChange(effectiveSegments.filter((s) => s.id !== selectedId));
  };

  const current = resolvePlayhead(playheadMs);
  const totalSec = totalTimelineMs / 1000;

  return (
    <View>
      <View style={styles.previewWrap}>
        <VideoView player={previewPlayer} style={styles.preview} contentFit="cover" nativeControls={false} />
        <View style={styles.previewBadge}>
          <Ionicons name="eye-outline" size={12} color="#FFFFFF" />
          <Text style={styles.previewBadgeText}>Editing here</Text>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.timelineRow}>
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
              seekPreview(acc + 1);
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

      <SliderRow
        label="Playhead (s)"
        value={playheadMs / 1000}
        min={0}
        max={Math.max(0.1, totalSec)}
        step={0.1}
        decimals={1}
        onChange={(v) => seekPreview(Math.round(v * 1000))}
      />

      <View style={styles.actionsRow}>
        <Pressable style={[styles.actionBtn, current.segment.kind === 'freeze' && styles.actionBtnDisabled]} onPress={splitHere} disabled={current.segment.kind === 'freeze'}>
          <Ionicons name="cut-outline" size={16} color="#FFFFFF" />
          <Text style={styles.actionBtnText}>Split</Text>
        </Pressable>
        <Pressable style={[styles.actionBtn, current.segment.kind === 'freeze' && styles.actionBtnDisabled]} onPress={freezeHere} disabled={current.segment.kind === 'freeze'}>
          <Ionicons name="snow-outline" size={16} color="#FFFFFF" />
          <Text style={styles.actionBtnText}>Freeze Here</Text>
        </Pressable>
        <Pressable
          style={[styles.actionBtn, styles.deleteBtn, effectiveSegments.length <= 1 && styles.actionBtnDisabled]}
          onPress={deleteSelected}
          disabled={effectiveSegments.length <= 1}
        >
          <Ionicons name="trash-outline" size={16} color="#FFFFFF" />
          <Text style={styles.actionBtnText}>Delete Segment</Text>
        </Pressable>
      </View>

      <SliderRow label="Freeze Hold (s)" value={freezeHoldSec} min={0.3} max={5} step={0.1} decimals={1} onChange={setFreezeHoldSec} />
    </View>
  );
}

const styles = StyleSheet.create({
  previewWrap: { width: '100%', height: 160, borderRadius: 10, overflow: 'hidden', backgroundColor: '#000', marginBottom: 10 },
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
  timelineRow: { gap: 4, paddingVertical: 6 },
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
  },
  deleteBtn: { backgroundColor: '#DC2626' },
  actionBtnDisabled: { opacity: 0.4 },
  actionBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
});
