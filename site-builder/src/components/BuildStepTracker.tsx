import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const STEPS: { key: string; label: string; match: (msg: string) => boolean }[] = [
  { key: 'reading', label: 'Reading your prompt', match: (m) => m.startsWith('Reading your prompt') },
  {
    key: 'writing',
    label: 'Writing your content',
    match: (m) => m.startsWith("Writing your site") || m.startsWith('Reworking your content'),
  },
  {
    key: 'artwork',
    label: 'Creating original artwork',
    match: (m) => m.startsWith('Creating original artwork') || m.startsWith('Applying your last change'),
  },
  {
    key: 'assembling',
    label: 'Assembling your site',
    match: (m) => m.startsWith('Assembling your site') || m.startsWith('Your site is ready'),
  },
];

interface Props {
  statusMessage: string;
  completed: boolean;
}

// Real, backend-driven progress -- each step only lights up once the generation session's
// own statusMessage (see startGeneration in Cloud Functions) actually reaches it. Never a
// fabricated percentage or timer-based fake progress: if the AI is genuinely still on
// "Creating original artwork", that's exactly what stays highlighted, however long it takes.
// lastIndexRef only moves forward, so an in-between message (e.g. "Paused — add anything
// else...", shown while the pause modal is up) keeps whatever step was last reached lit
// instead of the tracker looking like it reset.
export default function BuildStepTracker({ statusMessage, completed }: Props) {
  const lastIndexRef = useRef(0);
  const matchedIndex = STEPS.findIndex((s) => s.match(statusMessage));
  if (matchedIndex > lastIndexRef.current) lastIndexRef.current = matchedIndex;
  const currentIndex = completed ? STEPS.length : Math.max(lastIndexRef.current, 0);

  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.4] });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] });

  return (
    <View style={styles.container}>
      {STEPS.map((step, index) => {
        const done = index < currentIndex;
        const active = index === currentIndex;
        return (
          <View key={step.key} style={styles.row}>
            <View style={styles.dotColumn}>
              {done ? (
                <View style={styles.dotDone}>
                  <Ionicons name="checkmark" size={12} color="#FFFFFF" />
                </View>
              ) : active ? (
                <View style={styles.dotActiveWrap}>
                  <Animated.View style={[styles.dotActive, { transform: [{ scale }], opacity }]} />
                </View>
              ) : (
                <View style={styles.dotPending} />
              )}
              {index < STEPS.length - 1 && <View style={[styles.connector, done && styles.connectorDone]} />}
            </View>
            <Text style={[styles.label, done && styles.labelDone, active && styles.labelActive]}>{step.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingVertical: 4 },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  dotColumn: { alignItems: 'center', width: 24 },
  dotDone: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#4338CA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotActiveWrap: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  dotActive: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#4338CA' },
  dotPending: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#E2E8F0', marginTop: 3 },
  connector: { width: 2, height: 26, backgroundColor: '#E2E8F0', marginVertical: 2 },
  connectorDone: { backgroundColor: '#4338CA' },
  label: { flex: 1, fontSize: 14, color: '#94A3B8', fontWeight: '600', marginLeft: 12, paddingBottom: 22 },
  labelDone: { color: '#334155' },
  labelActive: { color: '#0F172A', fontWeight: '700' },
});
