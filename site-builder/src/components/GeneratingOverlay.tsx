import React, { useEffect, useRef } from 'react';
import { View, Text, Image, StyleSheet, Animated, Easing } from 'react-native';

// Shown in place of the canvas while a project is still the server's placeholder
// ('Generating...', no elements yet) -- see EditorScreen's guard. Without this, there's a
// real gap between AIBuildProgressScreen replacing itself with the Editor (the instant
// Firestore's session doc flips to 'completed') and the Editor's own live subscription
// actually receiving the finished project doc a moment later -- which otherwise reads as
// a blank white screen, not "still working on it." EditorScreen embeds this inside a box
// sized to the project's real canvasSize, so what's on screen already looks like the
// actual page taking shape rather than a generic full-screen message.
export default function GeneratingOverlay() {
  const pulse = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    const spinLoop = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 2600, easing: Easing.linear, useNativeDriver: true })
    );
    pulseLoop.start();
    spinLoop.start();
    return () => {
      pulseLoop.stop();
      spinLoop.stop();
    };
  }, [pulse, spin]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View style={styles.container}>
      <View style={styles.logoWrap}>
        <Animated.View style={[styles.ring, { transform: [{ rotate }] }]}>
          <View style={styles.ringDot} />
        </Animated.View>
        <Animated.Image
          source={require('../../assets/splash-icon.png')}
          style={[styles.logo, { transform: [{ scale }] }]}
          resizeMode="contain"
        />
      </View>
      <Text style={styles.title}>Building your site...</Text>
      <Text style={styles.subtitle}>This usually takes a minute or two.</Text>
    </View>
  );
}

const RING_SIZE = 120;

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  logoWrap: { width: RING_SIZE, height: RING_SIZE, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  ring: {
    position: 'absolute',
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: 2,
    borderColor: '#E0E7FF',
    borderTopColor: '#4338CA',
  },
  ringDot: { position: 'absolute', top: -3, left: RING_SIZE / 2 - 4, width: 8, height: 8, borderRadius: 4, backgroundColor: '#4338CA' },
  logo: { width: 76, height: 76 },
  title: { fontSize: 15, fontWeight: '700', color: '#0F172A', textAlign: 'center' },
  subtitle: { fontSize: 12, color: '#64748B', marginTop: 6, textAlign: 'center' },
});
