import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/navigation/types';
import { useAuth } from '@/context/AuthContext';
import { useAppTheme } from '@/context/AppThemeContext';
import { showAlert } from '@/utils/alert';
import { collectionsStore } from '@/storage/collectionsStore';
import { productsStore } from '@/storage/productsStore';
import { uploadLocalImage } from '@/services/uploads';
import { sellerAccountStore } from '@/services/store';
import { currencySymbol } from '@/utils/currency';
import { generateId } from '@/utils/id';
import { CatalogCollection, CatalogProduct } from '@/types';

type Props = NativeStackScreenProps<RootStackParamList, 'CollectionEdit'>;

function blankCollection(): CatalogCollection {
  const now = Date.now();
  return { id: generateId('coll'), name: '', description: '', coverImage: null, productIds: [], createdAt: now, updatedAt: now };
}

async function pickImage(): Promise<string | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return null;
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });
  if (result.canceled || result.assets.length === 0) return null;
  return result.assets[0].uri;
}

export default function CollectionEditScreen({ navigation, route }: Props) {
  const { user } = useAuth();
  const uid = user!.uid;
  const { theme } = useAppTheme();
  const collectionId = route.params?.collectionId;

  const [item, setItem] = useState<CatalogCollection | null>(collectionId ? null : blankCollection());
  const [loading, setLoading] = useState(!!collectionId);
  const [saving, setSaving] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [sym, setSym] = useState('$');

  useEffect(() => {
    if (!collectionId) return;
    collectionsStore.get(uid, collectionId).then((c) => {
      setItem(c ?? blankCollection());
      setLoading(false);
    });
  }, [uid, collectionId]);

  useEffect(() => productsStore.subscribe(uid, setProducts), [uid]);
  useEffect(() => sellerAccountStore.subscribe(uid, (account) => setSym(currencySymbol(account?.currency))), [uid]);

  const patch = (fields: Partial<CatalogCollection>) => setItem((prev) => (prev ? { ...prev, ...fields } : prev));

  const toggleProduct = (productId: string) => {
    if (!item) return;
    patch({
      productIds: item.productIds.includes(productId) ? item.productIds.filter((id) => id !== productId) : [...item.productIds, productId],
    });
  };

  const handleSave = async () => {
    if (!item) return;
    if (!item.name.trim()) {
      showAlert('Give it a name', 'Collections need a real name before they can be saved.');
      return;
    }
    setSaving(true);
    try {
      await collectionsStore.save(uid, item);
      navigation.goBack();
    } catch (err: any) {
      showAlert('Could not save', err?.message ?? 'Try again in a moment.');
    } finally {
      setSaving(false);
    }
  };

  const handlePickCover = async () => {
    const uri = await pickImage();
    if (!uri) return;
    setUploadingCover(true);
    try {
      const url = await uploadLocalImage(uri);
      patch({ coverImage: url });
    } catch (err: any) {
      showAlert('Could not upload photo', err?.message ?? 'Try again in a moment.');
    } finally {
      setUploadingCover(false);
    }
  };

  if (loading || !item) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
        <View style={styles.loadingBox}>
          <ActivityIndicator color={theme.accent} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="chevron-back" size={26} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>{collectionId ? 'Edit Collection' : 'New Collection'}</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Name</Text>
        <TextInput
          style={[styles.textInput, { color: theme.text, borderColor: theme.border }]}
          value={item.name}
          onChangeText={(name) => patch({ name })}
          placeholder="e.g. Summer Collection"
          placeholderTextColor={theme.textMuted}
        />

        <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Description (optional)</Text>
        <TextInput
          style={[styles.textInput, styles.textArea, { color: theme.text, borderColor: theme.border }]}
          value={item.description}
          onChangeText={(description) => patch({ description })}
          multiline
          placeholder="What ties these products together?"
          placeholderTextColor={theme.textMuted}
        />

        <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Cover image (optional)</Text>
        {item.coverImage ? (
          <View style={styles.coverWrap}>
            <Image source={{ uri: item.coverImage }} style={styles.cover} />
            <Pressable style={styles.coverRemoveBtn} onPress={() => patch({ coverImage: null })}>
              <Ionicons name="close" size={12} color="#FFFFFF" />
            </Pressable>
          </View>
        ) : (
          <Pressable style={[styles.coverAddBtn, { borderColor: theme.border }]} onPress={handlePickCover} disabled={uploadingCover}>
            {uploadingCover ? <ActivityIndicator color={theme.accent} /> : <Ionicons name="add" size={22} color={theme.textMuted} />}
          </Pressable>
        )}

        <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>
          Products in this collection ({item.productIds.length})
        </Text>
        {products.length === 0 ? (
          <Text style={[styles.helperText, { color: theme.textMuted }]}>
            You haven't created any products yet — create one first, then come back to add it here.
          </Text>
        ) : (
          products.map((product) => {
            const checked = item.productIds.includes(product.id);
            return (
              <Pressable
                key={product.id}
                style={[styles.productRow, { borderColor: theme.border }, checked && { borderColor: theme.accent, backgroundColor: theme.accent + '14' }]}
                onPress={() => toggleProduct(product.id)}
              >
                {product.images[0] ? (
                  <Image source={{ uri: product.images[0] }} style={styles.productThumb} />
                ) : (
                  <View style={[styles.productThumb, styles.productThumbPlaceholder, { backgroundColor: theme.background }]}>
                    <Ionicons name="image-outline" size={16} color={theme.textMuted} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={[styles.productName, { color: theme.text }]} numberOfLines={1}>
                    {product.name || 'Untitled product'}
                  </Text>
                  <Text style={[styles.productSub, { color: theme.textMuted }]}>{sym}{product.priceUsd.toFixed(2)}</Text>
                </View>
                <Ionicons name={checked ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={checked ? theme.accent : theme.textMuted} />
              </Pressable>
            );
          })
        )}

        <Pressable style={[styles.saveBtn, { backgroundColor: theme.accent }, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color={theme.accentText} /> : <Text style={[styles.saveBtnText, { color: theme.accentText }]}>Save</Text>}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8 },
  title: { fontSize: 17, fontWeight: '700' },
  loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, paddingBottom: 60 },
  fieldLabel: { fontSize: 13, fontWeight: '600', marginTop: 16, marginBottom: 6 },
  helperText: { fontSize: 12, lineHeight: 17 },
  textInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  textArea: { minHeight: 70, textAlignVertical: 'top' },
  coverWrap: { width: 100, height: 100, position: 'relative' },
  cover: { width: 100, height: 100, borderRadius: 12 },
  coverRemoveBtn: { position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 10, backgroundColor: '#DC2626', alignItems: 'center', justifyContent: 'center' },
  coverAddBtn: { width: 100, height: 100, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  productRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, padding: 10, gap: 10, marginBottom: 8 },
  productThumb: { width: 40, height: 40, borderRadius: 8 },
  productThumbPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  productName: { fontSize: 14, fontWeight: '600' },
  productSub: { fontSize: 12, marginTop: 2 },
  saveBtn: { marginTop: 24, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  saveBtnText: { fontSize: 16, fontWeight: '700' },
});
