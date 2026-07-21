import React, { useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, Switch, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AnnouncementSettings, PopupAnnouncementConfig } from '@/types';
import ColorSwatchRow from '@/components/inspector/ColorSwatchRow';
import SliderRow from '@/components/inspector/SliderRow';
import { generateId } from '@/utils/id';

const MAX_BARS = 2;
const MAX_POPUPS = 2;
const SPEED_PRESETS: { label: string; seconds: number | null }[] = [
  { label: '3s', seconds: 3 },
  { label: '5s', seconds: 5 },
  { label: '10s', seconds: 10 },
  { label: 'Never', seconds: null },
];

function newPopup(): PopupAnnouncementConfig {
  return {
    id: generateId('popup'),
    text: 'Free shipping this week!',
    buttonLabel: '',
    buttonUrl: '',
    backgroundColor: '#111827',
    textColor: '#FFFFFF',
    opacity: 0.92,
    delaySeconds: 3,
    durationSeconds: 8,
  };
}

// Real, on-demand animated preview of a popup's actual fade/slide + timing -- lets someone
// see exactly what a visitor will see (and confirm it isn't obnoxious) without publishing
// first. Replays the real delay/duration whenever "Preview" is tapped rather than looping
// automatically, since a long configured delay would otherwise make the panel itself feel
// slow to use.
function PopupPreview({ popup }: { popup: PopupAnnouncementConfig }) {
  const [playing, setPlaying] = useState(false);
  const anim = useRef(new Animated.Value(0)).current;
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const play = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    anim.setValue(0);
    setPlaying(true);
    const showTimer = setTimeout(() => {
      Animated.spring(anim, { toValue: 1, useNativeDriver: true, friction: 8 }).start();
    }, Math.min(popup.delaySeconds, 3) * 1000);
    timers.current.push(showTimer);
    if (popup.durationSeconds > 0) {
      const hideTimer = setTimeout(
        () => {
          Animated.timing(anim, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => setPlaying(false));
        },
        (Math.min(popup.delaySeconds, 3) + Math.min(popup.durationSeconds, 6)) * 1000
      );
      timers.current.push(hideTimer);
    }
  };

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] });

  return (
    <View style={styles.previewWrap}>
      <Pressable style={styles.previewBtn} onPress={play}>
        <Ionicons name="play" size={14} color="#4338CA" />
        <Text style={styles.previewBtnText}>Preview animation</Text>
      </Pressable>
      {playing && (
        <Animated.View
          style={[
            styles.previewCard,
            {
              backgroundColor: hexToRgba(popup.backgroundColor, popup.opacity),
              opacity: anim,
              transform: [{ translateY }],
            },
          ]}
        >
          <Text style={[styles.previewText, { color: popup.textColor }]} numberOfLines={2}>
            {popup.text || 'Your announcement text'}
          </Text>
          {!!popup.buttonLabel.trim() && (
            <View style={[styles.previewButton, { backgroundColor: popup.textColor }]}>
              <Text style={[styles.previewButtonText, { color: popup.backgroundColor }]}>{popup.buttonLabel}</Text>
            </View>
          )}
        </Animated.View>
      )}
    </View>
  );
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const bigint = parseInt(full, 16);
  if (Number.isNaN(bigint)) return hex;
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha))})`;
}

export default function AnnouncementPanel({
  settings,
  onChange,
}: {
  settings: AnnouncementSettings;
  onChange: (patch: Partial<AnnouncementSettings>) => void;
}) {
  const addBar = () => {
    if (settings.bars.length >= MAX_BARS) return;
    onChange({
      bars: [
        ...settings.bars,
        { id: generateId('bar'), text: 'New announcement', backgroundColor: '#111827', textColor: '#FFFFFF' },
      ],
      enabled: true,
    });
  };

  const removeBar = (id: string) => {
    onChange({ bars: settings.bars.filter((b) => b.id !== id) });
  };

  const updateBar = (id: string, patch: Partial<AnnouncementSettings['bars'][number]>) => {
    onChange({ bars: settings.bars.map((b) => (b.id === id ? { ...b, ...patch } : b)) });
  };

  const popups = settings.popups ?? [];

  const addPopup = () => {
    if (popups.length >= MAX_POPUPS) return;
    onChange({ popups: [...popups, newPopup()], enabled: true });
  };

  const removePopup = (id: string) => {
    onChange({ popups: popups.filter((p) => p.id !== id) });
  };

  const updatePopup = (id: string, patch: Partial<PopupAnnouncementConfig>) => {
    onChange({ popups: popups.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>Announcements</Text>
        <Switch value={settings.enabled} onValueChange={(enabled) => onChange({ enabled })} />
      </View>

      <Text style={styles.sectionTitle}>Top Bar</Text>
      <Text style={styles.sectionHint}>Sits pinned to the top of your published page while visitors scroll.</Text>

      {settings.bars.length > 1 && (
        <>
          <Text style={styles.fieldLabel}>Rotate every</Text>
          <View style={styles.rowButtons}>
            {SPEED_PRESETS.map((preset) => {
              const active =
                preset.seconds == null ? !settings.autoSlide : settings.autoSlide && settings.intervalMs === preset.seconds * 1000;
              return (
                <Pressable
                  key={preset.label}
                  style={[styles.presetBtn, active && styles.presetBtnActive]}
                  onPress={() =>
                    preset.seconds == null
                      ? onChange({ autoSlide: false })
                      : onChange({ autoSlide: true, intervalMs: preset.seconds * 1000 })
                  }
                >
                  <Text style={[styles.presetBtnText, active && styles.presetBtnTextActive]}>{preset.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </>
      )}

      {settings.bars.map((bar, idx) => (
        <View key={bar.id} style={styles.barCard}>
          <View style={styles.barHeader}>
            <Text style={styles.barTitle}>Bar {idx + 1}</Text>
            <Pressable onPress={() => removeBar(bar.id)} hitSlop={8}>
              <Ionicons name="trash-outline" size={18} color="#DC2626" />
            </Pressable>
          </View>
          <TextInput
            style={styles.input}
            value={bar.text}
            onChangeText={(text) => updateBar(bar.id, { text })}
            placeholder="Announcement text"
          />
          <ColorSwatchRow label="Background" value={bar.backgroundColor} onChange={(backgroundColor) => updateBar(bar.id, { backgroundColor })} />
          <ColorSwatchRow label="Text Color" value={bar.textColor} onChange={(textColor) => updateBar(bar.id, { textColor })} />
        </View>
      ))}

      {settings.bars.length < MAX_BARS ? (
        <Pressable style={styles.addBtn} onPress={addBar}>
          <Ionicons name="add" size={18} color="#FFFFFF" />
          <Text style={styles.addBtnText}>Add Announcement Bar ({settings.bars.length}/{MAX_BARS})</Text>
        </Pressable>
      ) : (
        <Text style={styles.limitText}>Maximum of {MAX_BARS} announcement bars reached.</Text>
      )}

      <View style={styles.divider} />

      <Text style={styles.sectionTitle}>Popup Announcements</Text>
      <Text style={styles.sectionHint}>
        A small card that appears on screen a few seconds after a visitor arrives, with an optional button — separate from the
        top bar, and dismissible any time.
      </Text>

      {popups.map((popup, idx) => (
        <View key={popup.id} style={styles.barCard}>
          <View style={styles.barHeader}>
            <Text style={styles.barTitle}>Popup {idx + 1}</Text>
            <Pressable onPress={() => removePopup(popup.id)} hitSlop={8}>
              <Ionicons name="trash-outline" size={18} color="#DC2626" />
            </Pressable>
          </View>
          <TextInput
            style={styles.input}
            value={popup.text}
            onChangeText={(text) => updatePopup(popup.id, { text })}
            placeholder="Announcement text"
            multiline
          />
          <Text style={styles.fieldLabel}>Button (optional)</Text>
          <TextInput
            style={styles.input}
            value={popup.buttonLabel}
            onChangeText={(buttonLabel) => updatePopup(popup.id, { buttonLabel })}
            placeholder="Button label, e.g. Shop Now"
          />
          {!!popup.buttonLabel.trim() && (
            <TextInput
              style={styles.input}
              value={popup.buttonUrl}
              onChangeText={(buttonUrl) => updatePopup(popup.id, { buttonUrl })}
              placeholder="https://... where the button goes"
              autoCapitalize="none"
              keyboardType="url"
            />
          )}

          <ColorSwatchRow label="Background" value={popup.backgroundColor} onChange={(backgroundColor) => updatePopup(popup.id, { backgroundColor })} />
          <ColorSwatchRow label="Text Color" value={popup.textColor} onChange={(textColor) => updatePopup(popup.id, { textColor })} />

          <SliderRow
            label="Background transparency"
            value={Math.round(popup.opacity * 100)}
            min={20}
            max={100}
            onChange={(v) => updatePopup(popup.id, { opacity: v / 100 })}
          />
          <SliderRow
            label="Show after (seconds)"
            value={popup.delaySeconds}
            min={0}
            max={30}
            onChange={(v) => updatePopup(popup.id, { delaySeconds: v })}
          />
          <SliderRow
            label="Stays visible for (seconds, 0 = until dismissed)"
            value={popup.durationSeconds}
            min={0}
            max={60}
            onChange={(v) => updatePopup(popup.id, { durationSeconds: v })}
          />

          <PopupPreview popup={popup} />
        </View>
      ))}

      {popups.length < MAX_POPUPS ? (
        <Pressable style={styles.addBtn} onPress={addPopup}>
          <Ionicons name="add" size={18} color="#FFFFFF" />
          <Text style={styles.addBtnText}>Add Popup Announcement ({popups.length}/{MAX_POPUPS})</Text>
        </Pressable>
      ) : (
        <Text style={styles.limitText}>Maximum of {MAX_POPUPS} popup announcements reached.</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  rowLabel: { fontSize: 14, fontWeight: '600', color: '#0F172A' },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: '#334155', marginTop: 4, marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.3 },
  sectionHint: { fontSize: 12, color: '#94A3B8', marginBottom: 10, lineHeight: 16 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: '#64748B', marginBottom: 6, marginTop: 4 },
  rowButtons: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  presetBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: '#F1F5F9', alignItems: 'center' },
  presetBtnActive: { backgroundColor: '#DBEAFE' },
  presetBtnText: { fontSize: 12, fontWeight: '700', color: '#334155' },
  presetBtnTextActive: { color: '#2563EB' },
  barCard: { backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12, marginBottom: 12 },
  barHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  barTitle: { fontSize: 13, fontWeight: '700', color: '#334155' },
  input: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    marginBottom: 10,
    backgroundColor: '#FFFFFF',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#111827',
    borderRadius: 10,
    paddingVertical: 12,
    marginBottom: 20,
  },
  addBtnText: { color: '#FFFFFF', fontWeight: '600', fontSize: 13 },
  limitText: { fontSize: 12, color: '#94A3B8', textAlign: 'center', marginBottom: 20 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#E2E8F0', marginVertical: 8 },
  previewWrap: { marginTop: 6, alignItems: 'center' },
  previewBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 },
  previewBtnText: { fontSize: 12, fontWeight: '700', color: '#4338CA' },
  previewCard: {
    marginTop: 8,
    width: '100%',
    borderRadius: 16,
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  previewText: { fontSize: 13, fontWeight: '600' },
  previewButton: { alignSelf: 'flex-start', marginTop: 8, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  previewButtonText: { fontSize: 12, fontWeight: '700' },
});
