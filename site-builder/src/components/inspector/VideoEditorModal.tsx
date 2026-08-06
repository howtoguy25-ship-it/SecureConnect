import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { VideoElement, VideoCaption } from '@/types';
import SliderRow from '@/components/inspector/SliderRow';
import VideoTimelineEditor from '@/components/inspector/VideoTimelineEditor';
import { generateId } from '@/utils/id';

const MAX_TRIM_MS = 5 * 60 * 1000;

async function pickVideoClip(): Promise<string | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return null;
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'] });
  if (result.canceled || result.assets.length === 0) return null;
  return result.assets[0].uri;
}

// A labeled section with a divider -- the one repeated layout primitive every part of this
// screen uses, so "Timeline", "Basic Trim", "Playback", etc. all read as real, distinct
// sections of a professional editor instead of one long unbroken scroll of controls.
function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {!!subtitle && <Text style={styles.sectionSubtitle}>{subtitle}</Text>}
      {children}
    </View>
  );
}

// Real, working caption list editor -- add/edit/remove timed subtitle lines, each with its
// own start/end time (clip-relative, same clock as trimStartMs/trimEndMs) via the same
// SliderRow every other time control here uses.
function VideoCaptionsEditor({
  captions,
  trimStartMs,
  trimEndMs,
  onChange,
}: {
  captions: VideoCaption[];
  trimStartMs: number;
  trimEndMs: number | null;
  onChange: (captions: VideoCaption[]) => void;
}) {
  const maxMs = trimEndMs ?? MAX_TRIM_MS;
  const addCaption = () => {
    const lastEnd = captions.length > 0 ? captions[captions.length - 1].endMs : trimStartMs;
    const start = Math.min(lastEnd, Math.max(trimStartMs, maxMs - 3000));
    onChange([...captions, { id: generateId('caption'), text: '', startMs: start, endMs: Math.min(maxMs, start + 3000) }]);
  };
  const updateCaption = (id: string, patch: Partial<VideoCaption>) =>
    onChange(captions.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const removeCaption = (id: string) => onChange(captions.filter((c) => c.id !== id));

  return (
    <View>
      {captions.map((caption, idx) => (
        <View key={caption.id} style={styles.captionCard}>
          <View style={styles.captionCardHeader}>
            <Text style={styles.captionCardTitle}>Caption {idx + 1}</Text>
            <Pressable onPress={() => removeCaption(caption.id)} hitSlop={8}>
              <Ionicons name="trash-outline" size={16} color="#DC2626" />
            </Pressable>
          </View>
          <TextInput
            style={styles.textInput}
            placeholder="Caption text"
            placeholderTextColor="#94A3B8"
            value={caption.text}
            onChangeText={(text) => updateCaption(caption.id, { text })}
            multiline
          />
          <SliderRow
            label="Starts at (s)"
            value={caption.startMs / 1000}
            min={trimStartMs / 1000}
            max={Math.max(trimStartMs, caption.endMs - 200) / 1000}
            step={0.1}
            decimals={1}
            onChange={(v) => updateCaption(caption.id, { startMs: Math.round(v * 1000) })}
          />
          <SliderRow
            label="Ends at (s)"
            value={caption.endMs / 1000}
            min={(caption.startMs + 200) / 1000}
            max={maxMs / 1000}
            step={0.1}
            decimals={1}
            onChange={(v) => updateCaption(caption.id, { endMs: Math.round(v * 1000) })}
          />
        </View>
      ))}
      <Pressable style={styles.uploadBtn} onPress={addCaption}>
        <Ionicons name="add-circle-outline" size={18} color="#FFFFFF" />
        <Text style={styles.uploadBtnText}>Add Caption</Text>
      </Pressable>
    </View>
  );
}

// A real, dedicated full-screen editor for a Video element -- everything that used to be
// crammed into the bottom-sheet inspector (timeline, trim, sound/loop/autoplay, preview
// length, sound source, captions) gets real room here instead: a bigger live preview, clear
// section headers/dividers, and no fighting a small scrollable sheet to reach a control.
// `element` is nullable (mount once, flip between a real element and null) matching every
// other full-screen modal in this app (ProductDetailModal, CollectionDetailModal).
export default function VideoEditorModal({
  element,
  onChange,
  onClose,
}: {
  element: VideoElement | null;
  onChange: (patch: Partial<VideoElement>) => void;
  onClose: () => void;
}) {
  const [audioBusy, setAudioBusy] = useState(false);

  return (
    <Modal visible={!!element} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={8}>
            <Ionicons name="chevron-back" size={26} color="#0F172A" />
          </Pressable>
          <Text style={styles.headerTitle}>Edit Video</Text>
          <View style={{ width: 26 }} />
        </View>

        {element && !!element.uri && (
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <Section title="Timeline" subtitle="Real cut/split, freeze-frame, and a live scrub preview -- see exactly where you're editing.">
              <VideoTimelineEditor
                uri={element.uri}
                segments={element.segments ?? []}
                trimStartMs={element.trimStartMs}
                trimEndMs={element.trimEndMs}
                onChange={(segments) => onChange({ segments })}
              />
            </Section>

            <Section title="Basic Trim" subtitle="Where the clip starts/ends before any cuts -- ignored once you've split or frozen the timeline above.">
              <SliderRow
                label="Trim Start (s)"
                value={element.trimStartMs / 1000}
                min={0}
                max={MAX_TRIM_MS / 1000}
                step={0.5}
                decimals={1}
                onChange={(v) => onChange({ trimStartMs: Math.round(v * 1000) })}
              />
              <Pressable
                style={[styles.toggleBtn, element.trimEndMs == null && styles.toggleBtnActive]}
                onPress={() => onChange({ trimEndMs: element.trimEndMs == null ? element.trimStartMs + 5000 : null })}
              >
                <Text style={[styles.toggleBtnText, element.trimEndMs == null && styles.toggleBtnTextActive]}>
                  {element.trimEndMs == null ? 'Playing to natural end' : 'Trimmed end — tap for full clip'}
                </Text>
              </Pressable>
              {element.trimEndMs != null && (
                <SliderRow
                  label="Trim End (s)"
                  value={element.trimEndMs / 1000}
                  min={(element.trimStartMs + 500) / 1000}
                  max={MAX_TRIM_MS / 1000}
                  step={0.5}
                  decimals={1}
                  onChange={(v) => onChange({ trimEndMs: Math.round(v * 1000) })}
                />
              )}
            </Section>

            <Section title="Playback">
              <View style={styles.toggleGrid}>
                <Pressable style={[styles.toggleTile, element.muted && styles.toggleTileActive]} onPress={() => onChange({ muted: !element.muted })}>
                  <Ionicons name={element.muted ? 'volume-mute-outline' : 'volume-high-outline'} size={18} color={element.muted ? '#FFFFFF' : '#0F172A'} />
                  <Text style={[styles.toggleTileText, element.muted && styles.toggleTileTextActive]}>{element.muted ? 'Muted' : 'Sound On'}</Text>
                </Pressable>
                <Pressable style={[styles.toggleTile, element.loop && styles.toggleTileActive]} onPress={() => onChange({ loop: !element.loop })}>
                  <Ionicons name="repeat-outline" size={18} color={element.loop ? '#FFFFFF' : '#0F172A'} />
                  <Text style={[styles.toggleTileText, element.loop && styles.toggleTileTextActive]}>Loop {element.loop ? 'On' : 'Off'}</Text>
                </Pressable>
                <Pressable
                  style={[styles.toggleTile, element.autoPlay && styles.toggleTileActive]}
                  // Browsers/native players only allow autoplay when muted -- turning this on
                  // forces mute too, rather than silently failing to autoplay later.
                  onPress={() => onChange({ autoPlay: !element.autoPlay, ...(!element.autoPlay ? { muted: true } : null) })}
                >
                  <Ionicons name="play-circle-outline" size={18} color={element.autoPlay ? '#FFFFFF' : '#0F172A'} />
                  <Text style={[styles.toggleTileText, element.autoPlay && styles.toggleTileTextActive]}>Autoplay {element.autoPlay ? 'On' : 'Off'}</Text>
                </Pressable>
              </View>
            </Section>

            <Section title="Preview Length" subtitle="Loop just the first few seconds instead of the whole clip -- a short preview instead of the full video.">
              <View style={styles.rowButtons}>
                {([null, 3, 5, 10] as const).map((seconds) => (
                  <Pressable
                    key={String(seconds)}
                    style={[styles.toggleBtn, element.previewSeconds === seconds && styles.toggleBtnActive]}
                    onPress={() => onChange({ previewSeconds: seconds })}
                  >
                    <Text style={[styles.toggleBtnText, element.previewSeconds === seconds && styles.toggleBtnTextActive]}>
                      {seconds == null ? 'Full clip' : `${seconds}s`}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </Section>

            <Section title="Sound Source (optional)" subtitle="Replace this clip's own audio with a different one entirely.">
              <Pressable
                style={styles.uploadBtn}
                disabled={audioBusy}
                onPress={async () => {
                  setAudioBusy(true);
                  const uri = await pickVideoClip().finally(() => setAudioBusy(false));
                  if (uri) onChange({ audioUri: uri });
                }}
              >
                <Ionicons name="musical-notes-outline" size={18} color="#FFFFFF" />
                <Text style={styles.uploadBtnText}>{element.audioUri ? 'Replace Sound Source' : 'Pick a Clip for Its Audio'}</Text>
              </Pressable>
              {!!element.audioUri && (
                <>
                  <Pressable style={styles.removeChip} onPress={() => onChange({ audioUri: null })}>
                    <Text style={styles.removeChipText}>Remove sound source ✕</Text>
                  </Pressable>
                  <SliderRow
                    label="Sound Source Volume"
                    value={element.audioVolume}
                    min={0}
                    max={1}
                    step={0.05}
                    onChange={(v) => onChange({ audioVolume: v })}
                  />
                </>
              )}
            </Section>

            <Section title="Captions" subtitle="Real, timed subtitles -- each one shows while playback is between its start and end time, then hides.">
              <VideoCaptionsEditor
                captions={element.captions ?? []}
                trimStartMs={element.trimStartMs}
                trimEndMs={element.trimEndMs}
                onChange={(captions) => onChange({ captions })}
              />
            </Section>
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#0F172A' },
  content: { padding: 20, paddingBottom: 60 },
  section: { marginBottom: 26 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#0F172A' },
  sectionSubtitle: { fontSize: 12, color: '#64748B', marginTop: 3, marginBottom: 10, lineHeight: 17 },
  rowButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  toggleBtn: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: '#F8FAFC',
  },
  toggleBtnActive: { backgroundColor: '#0F172A', borderColor: '#0F172A' },
  toggleBtnText: { fontSize: 13, fontWeight: '700', color: '#334155' },
  toggleBtnTextActive: { color: '#FFFFFF' },
  toggleGrid: { flexDirection: 'row', gap: 8, marginTop: 6 },
  toggleTile: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingVertical: 12,
    backgroundColor: '#F8FAFC',
  },
  toggleTileActive: { backgroundColor: '#0F172A', borderColor: '#0F172A' },
  toggleTileText: { fontSize: 11, fontWeight: '700', color: '#334155' },
  toggleTileTextActive: { color: '#FFFFFF' },
  uploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#4338CA',
    borderRadius: 10,
    paddingVertical: 12,
    marginTop: 4,
  },
  uploadBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  removeChip: { marginTop: 8, alignSelf: 'flex-start' },
  removeChipText: { color: '#DC2626', fontSize: 12, fontWeight: '600' },
  captionCard: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, padding: 12, marginBottom: 10, backgroundColor: '#F8FAFC' },
  captionCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  captionCardTitle: { fontSize: 12, fontWeight: '700', color: '#0F172A' },
  textInput: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    padding: 10,
    fontSize: 13,
    color: '#0F172A',
    backgroundColor: '#FFFFFF',
    minHeight: 40,
    marginBottom: 6,
  },
});
