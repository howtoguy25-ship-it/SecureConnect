import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

// Shown instead of crashing when .env has no real Firebase project config yet (see
// ROADMAP.md "Setup"). Auth genuinely cannot work without it, so this screen tells the
// developer exactly what's missing instead of a blank white screen.
export default function FirebaseSetupScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.iconWrap}>
          <Ionicons name="construct-outline" size={32} color="#F59E0B" />
        </View>
        <Text style={styles.title}>Connect Firebase to continue</Text>
        <Text style={styles.body}>
          Sign-in, sign-up, and saved projects all run on a real Firebase project — this app
          isn't configured with one yet.
        </Text>

        <View style={styles.steps}>
          <Step n={1} text="Create a Firebase project at console.firebase.google.com" />
          <Step n={2} text="Add an iOS app with bundle ID com.siteforge.app, copy its config" />
          <Step n={3} text="Copy .env.example to .env and paste the config in" />
          <Step n={4} text="Enable Email/Password, Phone, Google, and Apple sign-in providers" />
          <Step n={5} text="Restart the app" />
        </View>

        <Text style={styles.footnote}>Full step-by-step instructions are in ROADMAP.md → "Setup".</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Step({ n, text }: { n: number; text: string }) {
  return (
    <View style={styles.step}>
      <View style={styles.stepNumber}>
        <Text style={styles.stepNumberText}>{n}</Text>
      </View>
      <Text style={styles.stepText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B1220' },
  content: { padding: 28, alignItems: 'center', flexGrow: 1, justifyContent: 'center' },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: { fontSize: 20, fontWeight: '800', color: '#FFFFFF', textAlign: 'center' },
  body: { fontSize: 14, color: '#94A3B8', textAlign: 'center', marginTop: 10, lineHeight: 20 },
  steps: { width: '100%', marginTop: 28, gap: 14 },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  stepText: { flex: 1, color: '#E2E8F0', fontSize: 14, lineHeight: 20 },
  footnote: { fontSize: 12, color: '#64748B', marginTop: 28, textAlign: 'center' },
});
