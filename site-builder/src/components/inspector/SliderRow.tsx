import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import Slider from '@react-native-community/slider';

export default function SliderRow({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  const [text, setText] = useState(String(Math.round(value)));
  const [focused, setFocused] = useState(false);

  // Keep the typed text in sync with external changes (dragging the slider, undo, etc.)
  // without clobbering what the user is actively typing into the numeric field.
  useEffect(() => {
    if (!focused) setText(String(Math.round(value)));
  }, [value, focused]);

  const commitText = () => {
    const parsed = parseFloat(text);
    if (Number.isFinite(parsed)) {
      onChange(Math.min(max, Math.max(min, parsed)));
    } else {
      setText(String(Math.round(value)));
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
