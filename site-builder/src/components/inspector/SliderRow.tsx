import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import Slider from '@react-native-community/slider';

export default function SliderRow({
  label,
  value,
  min,
  max,
  step = 1,
  // Digits of precision for the number field/slider readout -- 0 (the default, matching every
  // existing whole-number use of this row) rounds to an integer; a time control in real
  // seconds (step < 1) passes 1 so "2.3" doesn't get flattened to "2" the instant you stop
  // dragging.
  decimals = 0,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  decimals?: number;
  onChange: (value: number) => void;
}) {
  const format = (v: number) => v.toFixed(decimals);
  const [text, setText] = useState(format(value));
  const [focused, setFocused] = useState(false);

  // Keep the typed text in sync with external changes (dragging the slider, undo, etc.)
  // without clobbering what the user is actively typing into the numeric field.
  useEffect(() => {
    if (!focused) setText(format(value));
  }, [value, focused]);

  const commitText = () => {
    const parsed = parseFloat(text);
    if (Number.isFinite(parsed)) {
      onChange(Math.min(max, Math.max(min, parsed)));
    } else {
      setText(format(value));
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.label}>{label}</Text>
        <TextInput
          style={styles.valueInput}
          value={text}
          keyboardType="numeric"
          onFocus={() => setFocused(true)}
          onChangeText={setText}
          onBlur={() => {
            setFocused(false);
            commitText();
          }}
          onSubmitEditing={commitText}
        />
      </View>
      <Slider
        minimumValue={min}
        maximumValue={max}
        step={step}
        value={value}
        onValueChange={onChange}
        minimumTrackTintColor="#2563EB"
        maximumTrackTintColor="#E2E8F0"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 8 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontSize: 12, fontWeight: '600', color: '#64748B' },
  valueInput: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0F172A',
    minWidth: 44,
    textAlign: 'right',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
    backgroundColor: '#F1F5F9',
  },
});
