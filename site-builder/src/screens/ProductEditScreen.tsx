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
import { productsStore } from '@/storage/productsStore';
import { uploadLocalImage } from '@/services/uploads';
import { sellerAccountStore } from '@/services/store';
import { currencySymbol } from '@/utils/currency';
import { generateId } from '@/utils/id';
import { CatalogProduct, ProductSaleType } from '@/types';
import SliderRow from '@/components/inspector/SliderRow';

type Props = NativeStackScreenProps<RootStackParamList, 'ProductEdit'>;

const MAX_PRODUCT_IMAGES = 7;

function blankProduct(): CatalogProduct {
  const now = Date.now();
  return {
    id: generateId('prod'),
    name: '',
    description: '',
    priceUsd: 10,
    compareAtPriceUsd: null,
    costUsd: null,
    images: [],
    trackInventory: false,
    initialStock: null,
    inStock: true,
    saleType: 'product',
    fulfillment: 'pickup',
    serviceDurationMinutes: null,
    variantOptions: [],
    variants: [],
    createdAt: now,
    updatedAt: now,
  };
}

async function pickImage(): Promise<string | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return null;
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });
  if (result.canceled || result.assets.length === 0) return null;
  return result.assets[0].uri;
}

export default function ProductEditScreen({ navigation, route }: Props) {
  const { user } = useAuth();
  const uid = user!.uid;
  const { theme } = useAppTheme();
  const productId = route.params?.productId;

  const [product, setProduct] = useState<CatalogProduct | null>(productId ? null : blankProduct());
  const [loading, setLoading] = useState(!!productId);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [sym, setSym] = useState('$');

  useEffect(() => {
    if (!productId) return;
    productsStore.get(uid, productId).then((p) => {
      setProduct(p ?? blankProduct());
      setLoading(false);
    });
  }, [uid, productId]);

  useEffect(() => {
    return sellerAccountStore.subscribe(uid, (account) => setSym(currencySymbol(account?.currency)));
  }, [uid]);

  const patch = (fields: Partial<CatalogProduct>) => setProduct((prev) => (prev ? { ...prev, ...fields } : prev));

  const handleSave = async () => {
    if (!product) return;
    if (!product.name.trim()) {
      showAlert('Give it a name', 'Products need a real name before they can be saved.');
      return;
    }
    setSaving(true);
    try {
      await productsStore.save(uid, product);
      navigation.goBack();
    } catch (err: any) {
      showAlert('Could not save', err?.message ?? 'Try again in a moment.');
    } finally {
      setSaving(false);
    }
  };

  const handleAddPhoto = async () => {
    const uri = await pickImage();
    if (!uri || !product) return;
    setUploadingImage(true);
    try {
      const url = await uploadLocalImage(uri);
      patch({ images: [...product.images, url] });
    } catch (err: any) {
      showAlert('Could not upload photo', err?.message ?? 'Try again in a moment.');
    } finally {
      setUploadingImage(false);
    }
  };

  if (loading || !product) {
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
        <Text style={[styles.title, { color: theme.text }]}>{productId ? 'Edit Product' : 'New Product'}</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>What is this?</Text>
        <View style={styles.rowButtons}>
          {(
            [
              ['product', '🛍️ Physical product'],
              ['digital', '💾 Digital product'],
              ['service', '📅 Real-life service'],
            ] as [ProductSaleType, string][]
          ).map(([kind, label]) => (
            <Pressable
              key={kind}
              style={[styles.toggleBtn, { borderColor: theme.border }, product.saleType === kind && { backgroundColor: theme.accent, borderColor: theme.accent }]}
              onPress={() => patch({ saleType: kind })}
            >
              <Text style={[styles.toggleBtnText, { color: theme.text }, product.saleType === kind && { color: theme.accentText }]}>{label}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Name</Text>
        <TextInput
          style={[styles.textInput, { color: theme.text, borderColor: theme.border }]}
          value={product.name}
          onChangeText={(name) => patch({ name })}
          placeholder="e.g. Camellia Bouquet"
          placeholderTextColor={theme.textMuted}
        />

        <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Description</Text>
        <TextInput
          style={[styles.textInput, styles.textArea, { color: theme.text, borderColor: theme.border }]}
          value={product.description}
          onChangeText={(description) => patch({ description })}
          multiline
          placeholder="What makes it worth buying?"
          placeholderTextColor={theme.textMuted}
        />

        <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Price ({sym.trim()})</Text>
        <TextInput
          style={[styles.textInput, { color: theme.text, borderColor: theme.border }]}
          value={String(product.priceUsd)}
          keyboardType="decimal-pad"
          onChangeText={(text) => {
            const value = parseFloat(text);
            patch({ priceUsd: Number.isFinite(value) ? Math.max(0, value) : 0 });
          }}
        />

        <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Compare-at price (optional)</Text>
        <TextInput
          style={[styles.textInput, { color: theme.text, borderColor: theme.border }]}
          value={product.compareAtPriceUsd != null ? String(product.compareAtPriceUsd) : ''}
          placeholder="e.g. 79.00"
          placeholderTextColor={theme.textMuted}
          keyboardType="decimal-pad"
          onChangeText={(text) => {
            if (!text.trim()) return patch({ compareAtPriceUsd: null });
            const value = parseFloat(text);
            patch({ compareAtPriceUsd: Number.isFinite(value) ? Math.max(0, value) : null });
          }}
        />

        <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Your cost (optional, private)</Text>
        <TextInput
          style={[styles.textInput, { color: theme.text, borderColor: theme.border }]}
          value={product.costUsd != null ? String(product.costUsd) : ''}
          placeholder="e.g. 22.00"
          placeholderTextColor={theme.textMuted}
          keyboardType="decimal-pad"
          onChangeText={(text) => {
            if (!text.trim()) return patch({ costUsd: null });
            const value = parseFloat(text);
            patch({ costUsd: Number.isFinite(value) ? Math.max(0, value) : null });
          }}
        />

        <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>
          Photos {product.images.length > 0 ? `(${product.images.length}/${MAX_PRODUCT_IMAGES})` : ''}
        </Text>
        <View style={styles.photoRow}>
          {product.images.map((uri, idx) => (
            <View key={uri + idx} style={styles.photoThumbWrap}>
              <Image source={{ uri }} style={styles.photoThumb} />
              <Pressable style={styles.photoRemoveBtn} onPress={() => patch({ images: product.images.filter((_, i) => i !== idx) })}>
                <Ionicons name="close" size={12} color="#FFFFFF" />
              </Pressable>
            </View>
          ))}
          {product.images.length < MAX_PRODUCT_IMAGES && (
            <Pressable style={[styles.photoAddBtn, { borderColor: theme.border }]} onPress={handleAddPhoto} disabled={uploadingImage}>
              {uploadingImage ? <ActivityIndicator color={theme.accent} /> : <Ionicons name="add" size={22} color={theme.textMuted} />}
            </Pressable>
          )}
        </View>

        {product.saleType === 'product' && (
          <>
            <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>How do buyers get it?</Text>
            <View style={styles.rowButtons}>
              {(['pickup', 'delivery', 'both'] as const).map((option) => (
                <Pressable
                  key={option}
                  style={[styles.toggleBtn, { borderColor: theme.border }, product.fulfillment === option && { backgroundColor: theme.accent, borderColor: theme.accent }]}
                  onPress={() => patch({ fulfillment: option })}
                >
                  <Text style={[styles.toggleBtnText, { color: theme.text }, product.fulfillment === option && { color: theme.accentText }]}>
                    {option === 'pickup' ? 'Pickup' : option === 'delivery' ? 'Delivery' : 'Both'}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        )}
        {product.saleType === 'service' && (
          <SliderRow
            label="Service duration (minutes)"
            value={product.serviceDurationMinutes ?? 30}
            min={5}
            max={480}
            step={5}
            onChange={(v) => patch({ serviceDurationMinutes: v })}
          />
        )}

        <Pressable
          style={[styles.toggleBtn, { borderColor: theme.border, marginTop: 4, alignSelf: 'flex-start' }, product.trackInventory && { backgroundColor: theme.accent, borderColor: theme.accent }]}
          onPress={() => patch({ trackInventory: !product.trackInventory, initialStock: !product.trackInventory ? product.initialStock ?? 10 : null })}
        >
          <Text style={[styles.toggleBtnText, { color: theme.text }, product.trackInventory && { color: theme.accentText }]}>
            {product.saleType === 'service' ? 'Limit bookings' : product.saleType === 'digital' ? 'Limit copies for sale' : 'Track stock quantity'}{' '}
            {product.trackInventory ? 'On' : 'Off'}
          </Text>
        </Pressable>
        {product.trackInventory && (
          <SliderRow
            label={product.saleType === 'service' ? 'Bookings available' : product.saleType === 'digital' ? 'Copies for sale' : 'Starting stock'}
            value={product.initialStock ?? 0}
            min={0}
            max={1000}
            onChange={(v) => patch({ initialStock: v })}
          />
        )}

        <Pressable
          style={[styles.toggleBtn, { borderColor: theme.border, marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' }, product.inStock && { backgroundColor: theme.accent, borderColor: theme.accent }]}
          onPress={() => patch({ inStock: !product.inStock })}
        >
          <Ionicons name={product.inStock ? 'checkmark-circle' : 'close-circle'} size={16} color={product.inStock ? theme.accentText : '#DC2626'} />
          <Text style={[styles.toggleBtnText, { color: theme.text }, product.inStock && { color: theme.accentText }]}>In Stock {product.inStock ? 'On' : 'Off'}</Text>
        </Pressable>

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
  textInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  rowButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  toggleBtn: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  toggleBtnText: { fontSize: 13, fontWeight: '600' },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  photoThumbWrap: { width: 72, height: 72, position: 'relative' },
  photoThumb: { width: 72, height: 72, borderRadius: 10 },
  photoRemoveBtn: { position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 10, backgroundColor: '#DC2626', alignItems: 'center', justifyContent: 'center' },
  photoAddBtn: { width: 72, height: 72, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  saveBtn: { marginTop: 28, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  saveBtnText: { fontSize: 16, fontWeight: '700' },
});
