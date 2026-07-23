import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { GradientFill } from '@/types';
import ColorSwatchRow from './ColorSwatchRow';

const ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];

// A Solid/Gradient toggle plus (when Gradient is picked) two color swatches and a row of
// direction presets -- used for any backgroundColor/backgroundGradient pair (buttons, page
// backgrounds). Solid stays the default so nothing changes for existing projects until a
// user opts in.
export default function GradientPickerRow({
  label,
  solidColor,
  onSolidColorChange,
  gradient,
  onGradientChange,
}: {
  label: string;
  solidColor: string;
  onSolidColorChange: (color: string) => void;
  gradient: GradientFill | null | undefined;
  onGradientChange: (gradient: GradientFill | null) => void;
}) {
  const isGradient = !!gradient;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.label}>{label}</Text>
        <View style={styles.modeToggle}>
          <Pressable style={[styles.modeBtn, !isGradient && styles.modeBtnActive]} onPress={() => onGradientChange(null)}>
            <Text style={[styles.modeBtnText, !isGradient && styles.modeBtnTextActive]}>Solid</Text>
          </Pressable>
          <Pressable
            style={[styles.modeBtn, isGradient && styles.modeBtnActive]}
            onPress={() => onGradientChange(gradient ?? { colors: [solidColor, '#8B5CF6'], angle: 135 })}
          >
            <Text style={[styles.modeBtnText, isGradient && styles.modeBtnTextActive]}>Gradient</Text>
          </Pressable>
        </View>
      </View>

      {!isGradient && <ColorSwatchRow label="Color" value={solidColor} onChange={onSolidColorChange} />}

      {isGradient && gradient && (
        <>
          <ColorSwatchRow
            label="From"
            value={gradient.colors[0]}
            onChange={(color) => onGradientChange({ ...gradient, colors: [color, gradient.colors[1]] })}
          />
          <ColorSwatchRow
            label="To"
            value={gradient.colors[1]}
            onChange={(color) => onGradientChange({ ...gradient, colors: [gradient.colors[0], color] })}
          />
          <Text style={styles.subLabel}>Direction</Text>
          <View style={styles.angleRow}>
            {ANGLES.map((angle) => (
              <Pressable
                key={angle}
                style={[styles.angleChip, gradient.angle === angle && styles.angleChipActive]}
                onPress={() => onGradientChange({ ...gradient, angle })}
              >
                <Text style={[styles.angleChipText, gradient.angle === angle && styles.angleChipTextActive]}>{angle}°</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  label: { fontSize: 12, fontWeight: '600', color: '#64748B' },
  modeToggle: { flexDirection: 'row', backgroundColor: '#F1F5F9', borderRadius: 8, padding: 2 },
  modeBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 },
  modeBtnActive: { backgroundColor: '#FFFFFF', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 2, elevation: 1 },
  modeBtnText: { fontSize: 12, fontWeight: '600', color: '#94A3B8' },
  modeBtnTextActive: { color: '#0F172A' },
  subLabel: { fontSize: 12, fontWeight: '600', color: '#64748B', marginBottom: 6 },
  angleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  angleChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  angleChipActive: { borderColor: '#2563EB', backgroundColor: '#EFF6FF' },
  angleChipText: { fontSize: 12, fontWeight: '600', color: '#334155' },
  angleChipTextActive: { color: '#1D4ED8' },
});
