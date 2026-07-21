import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, Alert, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/navigation/types';
import { useAuth } from '@/context/AuthContext';
import { userAccountStore } from '@/storage/userAccountStore';
import { computeBuildCost } from '@/data/pricing';
import { COMPLEXITY_INFO, BuildComplexity } from '@/data/pricing';
import { PAGE_TYPE_INFO } from '@/data/canvasSizes';
import { UserAccount } from '@/types';

type Props = NativeStackScreenProps<RootStackParamList, 'AIPrompt'>;

const MAX_WORDS = 4000;
const MAX_REFERENCE_IMAGES = 3;
const COMPLEXITIES: BuildComplexity[] = ['simple', 'standard', 'crazy'];

function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

export default function AIPromptScreen({ navigation, route }: Props) {
  const { pageType, initialPrompt } = route.params;
  const { user } = useAuth();
  const uid = user!.uid;
  const [prompt, setPrompt] = useState(initialPrompt ?? '');
  const [complexity, setComplexity] = useState<BuildComplexity>('standard');
  const [account, setAccount] = useState<UserAccount | null>(null);
  const [referenceImages, setReferenceImages] = useState<string[]>([]);

  useEffect(() => {
    userAccountStore.get(uid).then(setAccount);
  }, [uid]);

  const pickReferenceImage = async () => {
    if (referenceImages.length >= MAX_REFERENCE_IMAGES) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    // Compressed and modestly sized -- these are only ever shown to the model as visual
    // inspiration (color/style/mood), never inserted into the site itself, so full
    // resolution/quality would just waste bandwidth and callable-function payload budget.
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.5,
      base64: true,
    });
    if (result.canceled || result.assets.length === 0) return;
    const asset = result.assets[0];
    if (!asset.base64) return;
    const mime = asset.mimeType ?? 'image/jpeg';
    setReferenceImages((prev) => [...prev, `data:${mime};base64,${asset.base64}`]);
  };

  const removeReferenceImage = (index: number) => {
    setReferenceImages((prev) => prev.filter((_, i) => i !== index));
  };

  const words = wordCount(prompt);
  const overLimit = words > MAX_WORDS;
  const estimatedCost = account ? computeBuildCost(account.plan, complexity) : null;
  const insufficientCredits = account != null && estimatedCost != null && account.credits < estimatedCost;

  const handleStart = () => {
    if (!prompt.trim()) {
      Alert.alert('Add a prompt', 'Describe the site you want built first.');
      return;
    }
    if (overLimit) {
      Alert.alert('Prompt too long', `Keep it under ${MAX_WORDS} words.`);
      return;
    }
    if (insufficientCredits) {
      navigation.navigate('Subscription');
      return;
    }

    // The real (paid) build itself starts from AIClarifyScreen, after a free round of
    // AI-generated questions specific to this prompt -- see suggestClarifyingQuestions.
    navigation.navigate('AIClarify', {
      pageType,
      prompt: prompt.trim(),
      complexity,
      referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="chevron-back" size={26} color="#0F172A" />
        </Pressable>
        <Text style={styles.title}>AI Site Builder</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.label}>Describe your dream {PAGE_TYPE_INFO[pageType].title.toLowerCase()}</Text>
        <TextInput
          style={styles.textarea}
          value={prompt}
          onChangeText={setPrompt}
          multiline
          placeholder="e.g. A warm, modern site for my coffee roasting business — earthy tones, a hero section with our story, a menu of our beans, and a contact section..."
          placeholderTextColor="#94A3B8"
          textAlignVertical="top"
        />
        <Text style={[styles.wordCount, overLimit && styles.wordCountOver]}>
          {words} / {MAX_WORDS} words
        </Text>

        <Text style={styles.label}>Reference images (optional)</Text>
        <Text style={styles.helperText}>
          Add up to {MAX_REFERENCE_IMAGES} photos to show the AI the style, colors, or mood you want — they're used
          as inspiration only, not added to the site itself.
        </Text>
        <View style={styles.referenceRow}>
          {referenceImages.map((uri, index) => (
            <View key={index} style={styles.referenceThumbWrap}>
              <Image source={{ uri }} style={styles.referenceThumb} />
              <Pressable style={styles.referenceRemove} onPress={() => removeReferenceImage(index)} hitSlop={8}>
                <Ionicons name="close" size={14} color="#FFFFFF" />
              </Pressable>
            </View>
          ))}
          {referenceImages.length < MAX_REFERENCE_IMAGES && (
            <Pressable style={styles.referenceAdd} onPress={pickReferenceImage}>
              <Ionicons name="add" size={22} color="#4338CA" />
            </Pressable>
          )}
        </View>

        <Text style={styles.label}>How much detail?</Text>
        <View style={styles.complexityRow}>
          {COMPLEXITIES.map((c) => (
            <Pressable
              key={c}
              style={[styles.complexityCard, complexity === c && styles.complexityCardActive]}
              onPress={() => setComplexity(c)}
            >
              <Text style={[styles.complexityLabel, complexity === c && styles.complexityLabelActive]}>
                {COMPLEXITY_INFO[c].label}
              </Text>
              <Text style={styles.complexityDesc}>{COMPLEXITY_INFO[c].description}</Text>
            </Pressable>
          ))}
        </View>

        {estimatedCost != null && (
          <View style={styles.costRow}>
            <Ionicons name="flash-outline" size={16} color="#B45309" />
            <Text style={styles.costText}>
              Estimated cost: {estimatedCost} credits {account && `(you have ${account.credits})`}
            </Text>
          </View>
        )}

        <Pressable style={styles.generateButton} onPress={handleStart}>
          <Ionicons name="sparkles" size={18} color="#FFFFFF" />
          <Text style={styles.generateButtonText}>Continue</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8 },
  title: { fontSize: 17, fontWeight: '700', color: '#0F172A' },
  content: { padding: 20 },
  label: { fontSize: 14, fontWeight: '700', color: '#0F172A', marginTop: 16, marginBottom: 8 },
  textarea: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    lineHeight: 21,
    minHeight: 160,
    color: '#0F172A',
    backgroundColor: '#FFFFFF',
  },
  wordCount: { fontSize: 12, color: '#94A3B8', marginTop: 6, textAlign: 'right' },
  wordCountOver: { color: '#DC2626', fontWeight: '700' },
  helperText: { fontSize: 12, color: '#64748B', marginTop: -4, marginBottom: 10, lineHeight: 17 },
  referenceRow: { flexDirection: 'row', gap: 10 },
  referenceThumbWrap: { position: 'relative' },
  referenceThumb: { width: 72, height: 72, borderRadius: 10, backgroundColor: '#F1F5F9' },
  referenceRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  referenceAdd: {
    width: 72,
    height: 72,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#C7D2FE',
    borderStyle: 'dashed',
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  complexityRow: { gap: 10 },
  complexityCard: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 14,
  },
  complexityCardActive: { borderColor: '#4338CA', backgroundColor: '#EEF2FF' },
  complexityLabel: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  complexityLabelActive: { color: '#4338CA' },
  complexityDesc: { fontSize: 12, color: '#64748B', marginTop: 4 },
  costRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 18 },
  costText: { fontSize: 13, color: '#B45309', fontWeight: '600' },
  generateButton: {
    marginTop: 24,
    backgroundColor: '#4338CA',
    borderRadius: 12,
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  generateButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
});
