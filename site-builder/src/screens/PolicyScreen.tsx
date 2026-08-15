import React from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/navigation/types';
import { PRIVACY_POLICY, PRIVACY_POLICY_UPDATED, RETURN_POLICY, RETURN_POLICY_UPDATED } from '@/data/policies';

type Props = NativeStackScreenProps<RootStackParamList, 'Policy'>;

export default function PolicyScreen({ navigation, route }: Props) {
  const { policyType } = route.params;
  const isPrivacy = policyType === 'privacy';
  const title = isPrivacy ? 'Privacy Policy' : 'Return & Refund Policy';
  const sections = isPrivacy ? PRIVACY_POLICY : RETURN_POLICY;
  const updated = isPrivacy ? PRIVACY_POLICY_UPDATED : RETURN_POLICY_UPDATED;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="chevron-back" size={26} color="#0F172A" />
        </Pressable>
        <Text style={styles.title}>{title}</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.updated}>{updated}</Text>
        {sections.map((section) => (
          <View key={section.heading} style={{ marginBottom: 20 }}>
            <Text style={styles.heading}>{section.heading}</Text>
            <Text style={styles.body}>{section.body}</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8 },
  title: { fontSize: 17, fontWeight: '700', color: '#0F172A' },
  content: { padding: 20 },
  updated: { fontSize: 12, color: '#94A3B8', marginBottom: 20, fontWeight: '600' },
  heading: { fontSize: 15, fontWeight: '700', color: '#0F172A', marginBottom: 8 },
  body: { fontSize: 14, color: '#334155', lineHeight: 21 },
});
