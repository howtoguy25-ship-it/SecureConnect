import React from 'react';
import { View, Pressable, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const PALETTE = [
  '#0F172A', '#FFFFFF', '#EF4444', '#F97316', '#F59E0B', '#EAB308',
  '#84CC16', '#22C55E', '#10B981', '#14B8A6', '#06B6D4', '#0EA5E9',
  '#3B82F6', '#6366F1', '#8B5CF6', '#A855F7', '#D946EF', '#EC4899',
  '#F43F5E', '#64748B', '#D4AF37', 'transparent',
];

export default function ColorSwatchRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        {PALETTE.map((color) => (
          <Pressable
            key={color}
            onPress={() => onChange(color)}
            style={[
              styles.swatch,
              { backgroundColor: color === 'transparent' ? '#FFFFFF' : color },
              value === color && styles.swatchSelected,
            ]}
          >
            {color === 'transparent' && <Ionicons name="close" size={14} color="#94A3B8" />}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 12 },
  label: { fontSize: 12, fontWeight: '600', color: '#64748B', marginBottom: 6 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  swatch: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchSelected: { borderWidth: 2, borderColor: '#2563EB' },
});
