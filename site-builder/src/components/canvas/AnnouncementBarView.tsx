import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { AnnouncementSettings } from '@/types';

export default function AnnouncementBarView({ settings }: { settings: AnnouncementSettings }) {
  const [index, setIndex] = useState(0);
  const translateX = useRef(new Animated.Value(0)).current;
  const bars = settings.bars;

  useEffect(() => {
    if (!settings.enabled || !settings.autoSlide || bars.length <= 1) return;
    const timer = setInterval(() => {
      Animated.timing(translateX, { toValue: -20, duration: 200, useNativeDriver: true }).start(() => {
        setIndex((i) => (i + 1) % bars.length);
        translateX.setValue(20);
        Animated.timing(translateX, { toValue: 0, duration: 200, useNativeDriver: true }).start();
      });
    }, settings.intervalMs);
    return () => clearInterval(timer);
  }, [settings.enabled, settings.autoSlide, settings.intervalMs, bars.length, translateX]);

  if (!settings.enabled || bars.length === 0) return null;
  const bar = bars[index % bars.length];

  return (
    <View style={[styles.bar, { backgroundColor: bar.backgroundColor }]}>
      <Animated.Text
        style={[styles.text, { color: bar.textColor, transform: [{ translateX }] }]}
        numberOfLines={1}
      >
        {bar.text}
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { height: 32, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  text: { fontSize: 12, fontWeight: '700' },
});
