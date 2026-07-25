import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator, Image, Modal } from 'react-native';
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
import { CatalogProduct, ProductSaleType, ProductVariantOption, ProductVariant, BuyButtonMode } from '@/types';
import SliderRow from '@/components/inspector/SliderRow';
import { regenerateVariants, variantLabelFor } from '@/utils/productVariants';
import { syncProductStock, stockSignature } from '@/services/productStock';
import { AppTheme } from '@/theme/appThemes';

type Props = NativeStackScreenProps<RootStackParamList, 'ProductEdit'>;

const MAX_PRODUCT_IMAGES = 7;

function blankProduct(initialSaleType?: ProductSaleType): CatalogProduct {
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
    saleType: initialSaleType ?? 'product',
    fulfillment: 'pickup',
    serviceDurationMinutes: null,
    variantOptions: [],
    variants: [],
    buyButtonMode: 'cart',
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
  const initialSaleType = route.params?.initialSaleType;

  const [product, setProduct] = useState<CatalogProduct | null>(productId ? null : blankProduct(initialSaleType));
  const [loading, setLoading] = useState(!!productId);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [sym, setSym] = useState('$');
  const [viewingPhotoIndex, setViewingPhotoIndex] = useState<number | null>(null);
  // A snapshot of just the stock-relevant fields as they were when this screen loaded --
  // compared against the same fields at save time so a plain description/price edit never
  // triggers a live-store stock push (see syncProductStock's own comment for why that
  // distinction matters), while an actual stock change always does.
  const loadedStockSignature = useRef<string | null>(null);

  useEffect(() => {
    if (!productId) return;
    productsStore.get(uid, productId).then((p) => {
      const loaded = p ?? blankProduct();
      setProduct(loaded);
      loadedStockSignature.current = stockSignature(loaded);
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
    if (uploadingImage) {
      showAlert('Still uploading', 'Wait for the photo to finish uploading before saving.');
      return;
    }
    setSaving(true);
    try {
      await productsStore.save(uid, product);
      // Only an actual stock change needs pushing to already-published sites -- everything
      // else (name/price/photos/description) already reaches checkout on the next
      // auto-republish, and stockQuantity is deliberately never touched by a republish (see
      // syncStoreInventory's own comment), so an unrelated save must never trigger this.
      if (productId && loadedStockSignature.current != null && stockSignature(product) !== loadedStockSignature.current) {
        try {
          await syncProductStock(productId);
        } catch {
          // Best-effort -- the catalog save above already succeeded, so don't block on this.
        }
      }
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
        <Text style={[styles.title, { color: theme.text }]}>
          {productId ? 'Edit Product' : initialSaleType === 'custom' ? 'New Custom Item' : 'New Product'}
        </Text>
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
              ['custom', '✨ Custom item'],
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
              <Pressable onPress={() => setViewingPhotoIndex(idx)}>
                <Image source={{ uri }} style={styles.photoThumb} />
              </Pressable>
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

        <ProductVariantsEditor
          options={product.variantOptions}
          variants={product.variants}
          trackInventory={product.trackInventory}
          baseFallbackPriceLabel={`Same as ${sym}${product.priceUsd.toFixed(2)}`}
          onChange={(fields) => patch(fields)}
          theme={theme}
        />

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
        {product.trackInventory && product.variantOptions.length === 0 && (
          <SliderRow
            label={product.saleType === 'service' ? 'Bookings available' : product.saleType === 'digital' ? 'Copies for sale' : 'Starting stock'}
            value={product.initialStock ?? 0}
            min={0}
            max={1000}
            onChange={(v) => patch({ initialStock: v })}
          />
        )}
        {product.trackInventory && product.variantOptions.length > 0 && (
          <Text style={[styles.helperText, { color: theme.textMuted }]}>Stock is tracked per combination above — set each one's starting stock there.</Text>
        )}

        <Pressable
          style={[styles.toggleBtn, { borderColor: theme.border, marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' }, product.inStock && { backgroundColor: theme.accent, borderColor: theme.accent }]}
          onPress={() => patch({ inStock: !product.inStock })}
        >
          <Ionicons name={product.inStock ? 'checkmark-circle' : 'close-circle'} size={16} color={product.inStock ? theme.accentText : '#DC2626'} />
          <Text style={[styles.toggleBtnText, { color: theme.text }, product.inStock && { color: theme.accentText }]}>In Stock {product.inStock ? 'On' : 'Off'}</Text>
        </Pressable>

        <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Buy button</Text>
        <View style={styles.rowButtons}>
          {(
            [
              ['cart', 'Add to Cart'],
              ['buyNow', 'Buy Now'],
              ['both', 'Both'],
            ] as [BuyButtonMode, string][]
          ).map(([mode, label]) => (
            <Pressable
              key={mode}
              style={[styles.toggleBtn, { borderColor: theme.border }, (product.buyButtonMode ?? 'cart') === mode && { backgroundColor: theme.accent, borderColor: theme.accent }]}
              onPress={() => patch({ buyButtonMode: mode })}
            >
              <Text style={[styles.toggleBtnText, { color: theme.text }, (product.buyButtonMode ?? 'cart') === mode && { color: theme.accentText }]}>{label}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={[styles.helperText, { color: theme.textMuted }]}>
          "Buy Now" skips the cart and takes a shopper straight to checkout for just this item. "Both" shows both buttons side by
          side.
        </Text>

        <Pressable
          style={[styles.saveBtn, { backgroundColor: theme.accent }, (saving || uploadingImage) && { opacity: 0.6 }]}
          onPress={handleSave}
          disabled={saving || uploadingImage}
        >
          {saving ? (
            <ActivityIndicator color={theme.accentText} />
          ) : (
            <Text style={[styles.saveBtnText, { color: theme.accentText }]}>{uploadingImage ? 'Uploading photo…' : 'Save'}</Text>
          )}
        </Pressable>
      </ScrollView>

      <Modal visible={viewingPhotoIndex != null} transparent animationType="fade" onRequestClose={() => setViewingPhotoIndex(null)}>
        <View style={styles.photoLightboxBackdrop}>
          <Pressable style={styles.photoLightboxClose} onPress={() => setViewingPhotoIndex(null)} hitSlop={12}>
            <Ionicons name="close" size={28} color="#FFFFFF" />
          </Pressable>
          {viewingPhotoIndex != null && (
            <Image source={{ uri: product.images[viewingPhotoIndex] }} style={styles.photoLightboxImage} resizeMode="contain" />
          )}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// Add/rename/remove option groups (Size, Color, ...) and their values, regenerating the full
// combination list on every change -- see regenerateVariants for why existing combinations'
// price/stock overrides survive edits to unrelated options/values.
function ProductVariantsEditor({
  options,
  variants,
  trackInventory,
  baseFallbackPriceLabel,
  onChange,
  theme,
}: {
  options: ProductVariantOption[];
  variants: ProductVariant[];
  trackInventory: boolean;
  baseFallbackPriceLabel: string;
  onChange: (patch: { variantOptions: ProductVariantOption[]; variants: ProductVariant[] }) => void;
  theme: AppTheme;
}) {
  const [newOptionName, setNewOptionName] = useState('');

  const setOptions = (nextOptions: ProductVariantOption[]) => {
    onChange({ variantOptions: nextOptions, variants: regenerateVariants(nextOptions, variants) });
  };

  const addOption = () => {
    const name = newOptionName.trim();
    if (!name) return;
    setOptions([...options, { name, values: [] }]);
    setNewOptionName('');
  };

  const updateVariant = (key: string, patch: Partial<ProductVariant>) => {
    onChange({ variantOptions: options, variants: variants.map((v) => (v.key === key ? { ...v, ...patch } : v)) });
  };

  return (
    <View>
      <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Variants (optional)</Text>
      <Text style={[styles.helperText, { color: theme.textMuted }]}>
        Add option groups like Size or Color — buyers pick one value from each before checking out. Leave empty for a simple product
        with no choices.
      </Text>

      {options.map((option, index) => (
        <View key={index} style={[styles.variantOptionCard, { borderColor: theme.border }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TextInput
              style={[styles.textInput, { flex: 1, color: theme.text, borderColor: theme.border }]}
              value={option.name}
              onChangeText={(name) => setOptions(options.map((o, i) => (i === index ? { ...o, name } : o)))}
              placeholder="e.g. Size"
              placeholderTextColor={theme.textMuted}
            />
            <Pressable onPress={() => setOptions(options.filter((_, i) => i !== index))} hitSlop={8}>
              <Ionicons name="trash-outline" size={18} color="#DC2626" />
            </Pressable>
          </View>
          <View style={[styles.rowButtons, { marginTop: 8 }]}>
            {option.values.map((value) => (
              <Pressable
                key={value}
                style={styles.removeChip}
                onPress={() => setOptions(options.map((o, i) => (i === index ? { ...o, values: o.values.filter((v) => v !== value) } : o)))}
              >
                <Text style={styles.removeChipText}>{value} ✕</Text>
              </Pressable>
            ))}
          </View>
          <VariantValueAdder
            theme={theme}
            onAdd={(value) =>
              setOptions(options.map((o, i) => (i === index && !o.values.includes(value) ? { ...o, values: [...o.values, value] } : o)))
            }
          />
        </View>
      ))}

      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
        <TextInput
          style={[styles.textInput, { flex: 1, color: theme.text, borderColor: theme.border }]}
          value={newOptionName}
          onChangeText={setNewOptionName}
          placeholder="New option name, e.g. Color"
          placeholderTextColor={theme.textMuted}
        />
        <Pressable style={[styles.smallAddBtn, { backgroundColor: theme.accent }]} onPress={addOption}>
          <Text style={[styles.smallAddBtnText, { color: theme.accentText }]}>Add Option</Text>
        </Pressable>
      </View>

      {variants.length > 0 && (
        <>
          <Text style={[styles.fieldLabel, { color: theme.textMuted, marginTop: 6 }]}>Combinations ({variants.length})</Text>
          {variants.map((variant) => (
            <View key={variant.key} style={[styles.variantRow, { borderColor: theme.border }]}>
              <Text style={[styles.variantRowLabel, { color: theme.text }]}>{variantLabelFor(options, variant.optionValues)}</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                <TextInput
                  style={[styles.textInput, { flex: 1, color: theme.text, borderColor: theme.border }]}
                  value={variant.priceUsd != null ? String(variant.priceUsd) : ''}
                  placeholder={baseFallbackPriceLabel}
                  placeholderTextColor={theme.textMuted}
                  keyboardType="decimal-pad"
                  onChangeText={(text) => {
                    if (!text.trim()) {
                      updateVariant(variant.key, { priceUsd: null });
                      return;
                    }
                    const value = parseFloat(text);
                    updateVariant(variant.key, { priceUsd: Number.isFinite(value) ? Math.max(0, value) : null });
                  }}
                />
                {trackInventory && (
                  <TextInput
                    style={[styles.textInput, { width: 80, color: theme.text, borderColor: theme.border }]}
                    value={String(variant.initialStock ?? 0)}
                    placeholder="Stock"
                    placeholderTextColor={theme.textMuted}
                    keyboardType="number-pad"
                    onChangeText={(text) => {
                      const value = parseInt(text, 10);
                      updateVariant(variant.key, { initialStock: Number.isFinite(value) ? Math.max(0, value) : 0 });
                    }}
                  />
                )}
              </View>
            </View>
          ))}
        </>
      )}
    </View>
  );
}

function VariantValueAdder({ onAdd, theme }: { onAdd: (value: string) => void; theme: AppTheme }) {
  const [value, setValue] = useState('');
  return (
    <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
      <TextInput
        style={[styles.textInput, { flex: 1, color: theme.text, borderColor: theme.border }]}
        value={value}
        onChangeText={setValue}
        placeholder="e.g. Medium"
        placeholderTextColor={theme.textMuted}
      />
      <Pressable
        style={[styles.smallAddBtn, { backgroundColor: theme.accent }]}
        onPress={() => {
          if (!value.trim()) return;
          onAdd(value.trim());
          setValue('');
        }}
      >
        <Text style={[styles.smallAddBtnText, { color: theme.accentText }]}>Add</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8 },
  title: { fontSize: 17, fontWeight: '700' },
  loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, paddingBottom: 60 },
  fieldLabel: { fontSize: 13, fontWeight: '600', marginTop: 16, marginBottom: 6 },
  helperText: { fontSize: 12, marginBottom: 10, lineHeight: 17 },
  textInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, marginBottom: 0 },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  rowButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  toggleBtn: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  toggleBtnText: { fontSize: 13, fontWeight: '600' },
  removeChip: { backgroundColor: '#FEE2E2', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  removeChipText: { color: '#B91C1C', fontSize: 12, fontWeight: '600' },
  variantOptionCard: { borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 10 },
  variantRow: { borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 8 },
  variantRowLabel: { fontSize: 13, fontWeight: '700' },
  smallAddBtn: { borderRadius: 8, paddingHorizontal: 12, justifyContent: 'center' },
  smallAddBtnText: { fontSize: 13, fontWeight: '700' },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  photoThumbWrap: { width: 72, height: 72, position: 'relative' },
  photoThumb: { width: 72, height: 72, borderRadius: 10 },
  photoRemoveBtn: { position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 10, backgroundColor: '#DC2626', alignItems: 'center', justifyContent: 'center' },
  photoAddBtn: { width: 72, height: 72, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  saveBtn: { marginTop: 28, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  saveBtnText: { fontSize: 16, fontWeight: '700' },
  photoLightboxBackdrop: { flex: 1, backgroundColor: '#000000EE', alignItems: 'center', justifyContent: 'center' },
  photoLightboxClose: { position: 'absolute', top: 50, right: 20, zIndex: 1 },
  photoLightboxImage: { width: '100%', height: '80%' },
});
