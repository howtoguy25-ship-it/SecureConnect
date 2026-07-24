import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator, Image, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { productsStore } from '@/storage/productsStore';
import { sellerAccountStore } from '@/services/store';
import { currencySymbol } from '@/utils/currency';
import { CatalogProduct } from '@/types';

// Browse the account's real Products catalog and insert one onto the current page, or jump
// into creating a brand new one -- the "insert product" entry point for a manually-built
// website. Tapping a row opens a real preview (photos + description) before committing to
// insert, so a seller can double-check which product they're placing without guessing from
// a thumbnail alone.
export default function ProductCatalogPickerModal({
  visible,
  onClose,
  uid,
  onInsert,
  onCreateNew,
}: {
  visible: boolean;
  onClose: () => void;
  uid: string;
  onInsert: (product: CatalogProduct) => void;
  onCreateNew: () => void;
}) {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [sym, setSym] = useState('$');
  const [previewProduct, setPreviewProduct] = useState<CatalogProduct | null>(null);

  useEffect(() => {
    if (!visible) return;
    const unsub = productsStore.subscribe(uid, (list) => {
      setProducts(list);
      setLoading(false);
    });
    return unsub;
  }, [uid, visible]);

  useEffect(() => {
    if (!visible) return;
    return sellerAccountStore.subscribe(uid, (account) => setSym(currencySymbol(account?.currency)));
  }, [uid, visible]);

  const close = () => {
    setPreviewProduct(null);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close}>
      <View style={styles.container}>
        {previewProduct ? (
          <>
            <View style={styles.header}>
              <Pressable onPress={() => setPreviewProduct(null)} hitSlop={8}>
                <Ionicons name="chevron-back" size={26} color="#0F172A" />
              </Pressable>
              <Text style={styles.title}>View Product</Text>
              <Pressable onPress={close} hitSlop={8}>
                <Ionicons name="close" size={26} color="#0F172A" />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
              {previewProduct.images.length > 0 ? (
                <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={styles.previewGallery}>
                  {previewProduct.images.map((uri, i) => (
                    <Image key={uri + i} source={{ uri }} style={styles.previewImage} />
                  ))}
                </ScrollView>
              ) : (
                <View style={[styles.previewImage, styles.previewImagePlaceholder]}>
                  <Ionicons name="image-outline" size={32} color="#94A3B8" />
                </View>
              )}
              <Text style={styles.previewName}>{previewProduct.name || 'Untitled product'}</Text>
              <Text style={styles.previewPrice}>
                {sym}
                {previewProduct.priceUsd.toFixed(2)}
                {previewProduct.compareAtPriceUsd != null && previewProduct.compareAtPriceUsd > previewProduct.priceUsd
                  ? `  ${sym}${previewProduct.compareAtPriceUsd.toFixed(2)}`
                  : ''}
              </Text>
              {previewProduct.description ? <Text style={styles.previewDescription}>{previewProduct.description}</Text> : null}
              <Pressable
                style={styles.addBigBtn}
                onPress={() => {
                  onInsert(previewProduct);
                  setPreviewProduct(null);
                  onClose();
                }}
              >
                <Ionicons name="add-circle-outline" size={18} color="#FFFFFF" />
                <Text style={styles.addBigBtnText}>Insert This Product</Text>
              </Pressable>
            </ScrollView>
          </>
        ) : (
          <>
            <View style={styles.header}>
              <Text style={styles.title}>Insert a Product</Text>
              <Pressable onPress={close} hitSlop={8}>
                <Ionicons name="close" size={26} color="#0F172A" />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
              <Pressable
                style={styles.addBigBtn}
                onPress={() => {
                  onCreateNew();
                  onClose();
                }}
              >
                <Ionicons name="add-circle-outline" size={18} color="#FFFFFF" />
                <Text style={styles.addBigBtnText}>+ New Product</Text>
              </Pressable>

              {loading ? (
                <View style={styles.loadingBox}>
                  <ActivityIndicator color="#4338CA" />
                </View>
              ) : products.length === 0 ? (
                <Text style={styles.emptyText}>
                  No products in your catalog yet -- tap "+ New Product" above to create your first one.
                </Text>
              ) : (
                products.map((product) => (
                  <Pressable key={product.id} style={styles.itemRow} onPress={() => setPreviewProduct(product)}>
                    {product.images[0] ? (
                      <Image source={{ uri: product.images[0] }} style={styles.thumb} />
                    ) : (
                      <View style={[styles.thumb, styles.thumbPlaceholder]}>
                        <Ionicons name="image-outline" size={20} color="#94A3B8" />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemLabel} numberOfLines={1}>
                        {product.name || 'Untitled product'}
                      </Text>
                      <Text style={styles.itemSub}>
                        {sym}
                        {product.priceUsd.toFixed(2)} · {product.saleType === 'product' ? 'Physical' : product.saleType === 'digital' ? 'Digital' : 'Service'}
                      </Text>
                    </View>
                    <Ionicons name="eye-outline" size={20} color="#94A3B8" />
                  </Pressable>
                ))
              )}
            </ScrollView>
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC', paddingTop: 50 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 14 },
  title: { fontSize: 17, fontWeight: '700', color: '#0F172A' },
  content: { padding: 16, paddingBottom: 40, gap: 10 },
  loadingBox: { paddingVertical: 40, alignItems: 'center' },
  emptyText: { fontSize: 13, color: '#64748B', textAlign: 'center', paddingVertical: 30, lineHeight: 19 },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
  },
  thumb: { width: 52, height: 52, borderRadius: 10 },
  thumbPlaceholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1F5F9' },
  itemLabel: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  itemSub: { fontSize: 12, color: '#64748B', marginTop: 2 },
  addBigBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#111827',
    borderRadius: 12,
    paddingVertical: 14,
  },
  addBigBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  previewGallery: { width: '100%', height: 260, borderRadius: 14 },
  previewImage: { width: 340, height: 260, borderRadius: 14, marginRight: 8 },
  previewImagePlaceholder: { width: '100%', backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  previewName: { fontSize: 20, fontWeight: '800', color: '#0F172A', marginTop: 16 },
  previewPrice: { fontSize: 16, fontWeight: '700', color: '#4338CA', marginTop: 4 },
  previewDescription: { fontSize: 14, color: '#475569', marginTop: 10, lineHeight: 20 },
});
