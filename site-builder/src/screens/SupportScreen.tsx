import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/navigation/types';
import { env } from '@/config/env';
import { FAQ_ITEMS } from '@/data/policies';

type Props = NativeStackScreenProps<RootStackParamList, 'Support'>;

export default function SupportScreen({ navigation }: Props) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="chevron-back" size={26} color="#0F172A" />
        </Pressable>
        <Text style={styles.title}>Support</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Pressable style={styles.contactRow} onPress={() => Linking.openURL(`mailto:${env.supportEmail}`)}>
            <Ionicons name="mail-outline" size={20} color="#4338CA" />
            <Text style={styles.contactText}>{env.supportEmail}</Text>
          </Pressable>
          <Pressable
            style={[styles.contactRow, { borderBottomWidth: 0 }]}
            onPress={() => Linking.openURL(`tel:${env.supportPhone.replace(/\s/g, '')}`)}
          >
            <Ionicons name="call-outline" size={20} color="#4338CA" />
            <Text style={styles.contactText}>{env.supportPhone}</Text>
          </Pressable>
        </View>

        <Text style={styles.sectionTitle}>Frequently asked questions</Text>
        <View style={styles.card}>
          {FAQ_ITEMS.map((item, i) => (
            <View key={item.question} style={[styles.faqItem, i === FAQ_ITEMS.length - 1 && { borderBottomWidth: 0 }]}>
              <Pressable style={styles.faqQuestionRow} onPress={() => setOpenIndex(openIndex === i ? null : i)}>
                <Text style={styles.faqQuestion}>{item.question}</Text>
                <Ionicons name={openIndex === i ? 'chevron-up' : 'chevron-down'} size={18} color="#94A3B8" />
              </Pressable>
              {openIndex === i && <Text style={styles.faqAnswer}>{item.answer}</Text>}
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8 },
  title: { fontSize: 17, fontWeight: '700', color: '#0F172A' },
  content: { padding: 20 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    marginBottom: 24,
    overflow: 'hidden',
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F1F5F9',
  },
  contactText: { fontSize: 14, fontWeight: '600', color: '#0F172A' },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#64748B', marginBottom: 10, textTransform: 'uppercase' },
  faqItem: { paddingHorizontal: 16, paddingVertical: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F1F5F9' },
  faqQuestionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14 },
  faqQuestion: { fontSize: 14, fontWeight: '600', color: '#0F172A', flex: 1, marginRight: 10 },
  faqAnswer: { fontSize: 13, color: '#64748B', lineHeight: 19, paddingBottom: 14 },
});
