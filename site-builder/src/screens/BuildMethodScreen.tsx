import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'BuildMethod'>;

export default function BuildMethodScreen({ navigation, route }: Props) {
  const { pageType, customSize } = route.params;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="chevron-back" size={26} color="#0F172A" />
        </Pressable>
        <Text style={styles.title}>How do you want to build?</Text>
        <View style={{ width: 26 }} />
      </View>

      <View style={styles.options}>
        <Pressable style={styles.aiCard} onPress={() => navigation.navigate('AIPrompt', { pageType })}>
          <LinearGradient colors={['#4338CA', '#7C3AED']} style={StyleSheet.absoluteFill} />
          <Ionicons name="sparkles" size={28} color="#FFFFFF" />
          <Text style={styles.aiTitle}>AI Site Builder</Text>
          <Text style={styles.aiSubtitle}>Describe your dream site in a prompt — a real AI writes the copy, designs the layout, and creates original art for it in minutes.</Text>
          <View style={styles.aiBadge}>
            <Text style={styles.aiBadgeText}>Recommended</Text>
          </View>
        </Pressable>

        <Pressable style={styles.manualCard} onPress={() => navigation.navigate('ThemeGallery', { pageType, customSize })}>
          <View style={styles.manualIconWrap}>
            <Ionicons name="construct-outline" size={26} color="#111827" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.manualTitle}>Manual Build</Text>
            <Text style={styles.manualSubtitle}>Start from a blank page or a pre-made theme and build it yourself, block by block.</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8 },
  title: { fontSize: 17, fontWeight: '700', color: '#0F172A', flex: 1, textAlign: 'center' },
  options: { padding: 20, gap: 16 },
  aiCard: {
    borderRadius: 20,
    padding: 24,
    overflow: 'hidden',
  },
  aiTitle: { fontSize: 20, fontWeight: '800', color: '#FFFFFF', marginTop: 12 },
  aiSubtitle: { fontSize: 13, color: '#E0E7FF', marginTop: 8, lineHeight: 19 },
  aiBadge: {
    marginTop: 16,
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF33',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  aiBadgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  manualCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    gap: 14,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  manualIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  manualTitle: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  manualSubtitle: { fontSize: 12, color: '#64748B', marginTop: 2, lineHeight: 17 },
});
