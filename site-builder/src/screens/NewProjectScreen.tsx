import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/navigation/types';
import { PAGE_TYPE_INFO } from '@/data/canvasSizes';
import { PageType } from '@/types';

type Props = NativeStackScreenProps<RootStackParamList, 'NewProject'>;

const ORDER: PageType[] = ['website', 'video', 'social', 'logo'];

export default function NewProjectScreen({ navigation }: Props) {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="chevron-back" size={26} color="#0F172A" />
        </Pressable>
        <Text style={styles.title}>New Project</Text>
        <View style={{ width: 26 }} />
      </View>
      <Text style={styles.subtitle}>What do you want to build?</Text>

      <ScrollView contentContainerStyle={styles.list}>
        {ORDER.map((pageType) => {
          const info = PAGE_TYPE_INFO[pageType];
          return (
            <Pressable
              key={pageType}
              style={styles.card}
              onPress={() => navigation.navigate('BuildMethod', { pageType })}
            >
              <View style={styles.iconWrap}>
                <Ionicons name={info.icon as any} size={28} color="#111827" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{info.title}</Text>
                <Text style={styles.cardSubtitle}>{info.subtitle}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
            </Pressable>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  title: { fontSize: 18, fontWeight: '700', color: '#0F172A' },
  subtitle: { fontSize: 14, color: '#64748B', paddingHorizontal: 20, marginTop: 12 },
  list: { padding: 16, gap: 12 },
  card: {
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
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  cardSubtitle: { fontSize: 13, color: '#64748B', marginTop: 2 },
});
