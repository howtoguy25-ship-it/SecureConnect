import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, ScrollView, Image, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/navigation/types';
import { useAuth } from '@/context/AuthContext';
import { useAppTheme } from '@/context/AppThemeContext';
import { showAlert } from '@/utils/alert';
import { productsStore } from '@/storage/productsStore';
import { collectionsStore } from '@/storage/collectionsStore';
import { sellerAccountStore } from '@/services/store';
import { currencySymbol } from '@/utils/currency';
import { CatalogProduct, CatalogCollection } from '@/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Products'>;
type Tab = 'products' | 'collections';

export default function ProductsScreen({ navigation }: Props) {
  const { user } = useAuth();
  const uid = user!.uid;
  const { theme } = useAppTheme();

  const [tab, setTab] = useState<Tab>('products');
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [collections, setCollections] = useState<CatalogCollection[]>([]);
  const [loading, setLoading] = useState(true);
  const [collectionsLoading, setCollectionsLoading] = useState(true);
  const [sym, setSym] = useState('$');
  const [addMenuOpen, setAddMenuOpen] = useState(false);

  useEffect(() => {
    const unsub = productsStore.subscribe(uid, (list) => {
      setProducts(list);
      setLoading(false);
    });
    return unsub;
  }, [uid]);

  useEffect(() => {
    const unsub = collectionsStore.subscribe(uid, (list) => {
      setCollections(list);
      setCollectionsLoading(false);
    });
    return unsub;
  }, [uid]);

  useEffect(() => sellerAccountStore.subscribe(uid, (account) => setSym(currencySymbol(account?.currency))), [uid]);

  const productNameFor = (productId: string) => products.find((p) => p.id === productId)?.name || null;

  const handleDeleteProduct = (product: CatalogProduct) => {
    showAlert('Delete this product?', `"${product.name || 'Untitled product'}" will be removed from your catalog. Any site already using it will show it as unavailable.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => productsStore.remove(uid, product.id) },
    ]);
  };

  const handleDeleteCollection = (item: CatalogCollection) => {
    showAlert('Delete this collection?', `"${item.name || 'Untitled collection'}" will be removed. The products inside it are not affected.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => collectionsStore.remove(uid, item.id) },
    ]);
  };

  const startCreate = (kind: 'product' | 'custom' | 'collection') => {
    setAddMenuOpen(false);
    if (kind === 'collection') {
      navigation.navigate('CollectionEdit', {});
    } else {
      navigation.navigate('ProductEdit', kind === 'custom' ? { initialSaleType: 'custom' } : {});
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="chevron-back" size={26} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>Products</Text>
        <Pressable onPress={() => setAddMenuOpen(true)} hitSlop={8}>
          <Ionicons name="add" size={26} color={theme.accent} />
        </Pressable>
      </View>

      <View style={[styles.segmentRow, { borderColor: theme.border }]}>
        <Pressable style={[styles.segment, tab === 'products' && { backgroundColor: theme.accent }]} onPress={() => setTab('products')}>
          <Text style={[styles.segmentText, { color: theme.textMuted }, tab === 'products' && { color: theme.accentText }]}>Products</Text>
        </Pressable>
        <Pressable style={[styles.segment, tab === 'collections' && { backgroundColor: theme.accent }]} onPress={() => setTab('collections')}>
          <Text style={[styles.segmentText, { color: theme.textMuted }, tab === 'collections' && { color: theme.accentText }]}>Collections</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {tab === 'products' ? (
          loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={theme.accent} />
            </View>
          ) : products.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="pricetag-outline" size={40} color={theme.textMuted} />
              <Text style={[styles.emptyTitle, { color: theme.text }]}>No products yet</Text>
              <Text style={[styles.emptyBody, { color: theme.textMuted }]}>
                Create a product once here, then insert it into any of your websites -- edit it in one place and every site using it
                updates automatically.
              </Text>
              <Pressable style={[styles.emptyBtn, { backgroundColor: theme.accent }]} onPress={() => setAddMenuOpen(true)}>
                <Text style={[styles.emptyBtnText, { color: theme.accentText }]}>+ New Product</Text>
              </Pressable>
            </View>
          ) : (
            products.map((product) => (
              <Pressable
                key={product.id}
                style={[styles.card, { backgroundColor: theme.surface }]}
                onPress={() => navigation.navigate('ProductEdit', { productId: product.id })}
              >
                {product.images[0] ? (
                  <Image source={{ uri: product.images[0] }} style={styles.thumb} />
                ) : (
                  <View style={[styles.thumb, styles.thumbPlaceholder, { backgroundColor: theme.background }]}>
                    <Ionicons name="image-outline" size={20} color={theme.textMuted} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={[styles.productName, { color: theme.text }]} numberOfLines={1}>
                    {product.name || 'Untitled product'}
                  </Text>
                  <Text style={[styles.productSub, { color: theme.textMuted }]}>
                    {sym}{product.priceUsd.toFixed(2)} ·{' '}
                    {product.saleType === 'product' ? 'Physical' : product.saleType === 'digital' ? 'Digital' : product.saleType === 'service' ? 'Service' : 'Custom'}
                    {product.trackInventory ? ` · ${product.initialStock ?? 0} in stock` : ''}
                  </Text>
                </View>
                <Pressable style={styles.deleteBtn} onPress={() => handleDeleteProduct(product)} hitSlop={8}>
                  <Ionicons name="trash-outline" size={18} color="#DC2626" />
                </Pressable>
              </Pressable>
            ))
          )
        ) : collectionsLoading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={theme.accent} />
          </View>
        ) : collections.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="albums-outline" size={40} color={theme.textMuted} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>No collections yet</Text>
            <Text style={[styles.emptyBody, { color: theme.textMuted }]}>
              Group existing products under one named collection -- e.g. "Summer Collection" -- and insert the whole group into any
              site at once.
            </Text>
            <Pressable style={[styles.emptyBtn, { backgroundColor: theme.accent }]} onPress={() => navigation.navigate('CollectionEdit', {})}>
              <Text style={[styles.emptyBtnText, { color: theme.accentText }]}>+ New Collection</Text>
            </Pressable>
          </View>
        ) : (
          collections.map((item) => (
            <Pressable
              key={item.id}
              style={[styles.card, { backgroundColor: theme.surface }]}
              onPress={() => navigation.navigate('CollectionEdit', { collectionId: item.id })}
            >
              {item.coverImage ? (
                <Image source={{ uri: item.coverImage }} style={styles.thumb} />
              ) : (
                <View style={[styles.thumb, styles.thumbPlaceholder, { backgroundColor: theme.background }]}>
                  <Ionicons name="albums-outline" size={20} color={theme.textMuted} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={[styles.productName, { color: theme.text }]} numberOfLines={1}>
                  {item.name || 'Untitled collection'}
                </Text>
                <Text style={[styles.productSub, { color: theme.textMuted }]} numberOfLines={1}>
                  {item.productIds.length} product{item.productIds.length === 1 ? '' : 's'}
                  {item.productIds[0] ? ` · ${productNameFor(item.productIds[0]) ?? ''}` : ''}
                </Text>
              </View>
              <Pressable style={styles.deleteBtn} onPress={() => handleDeleteCollection(item)} hitSlop={8}>
                <Ionicons name="trash-outline" size={18} color="#DC2626" />
              </Pressable>
            </Pressable>
          ))
        )}
      </ScrollView>

      <Modal visible={addMenuOpen} transparent animationType="fade" onRequestClose={() => setAddMenuOpen(false)}>
        <Pressable style={styles.addMenuBackdrop} onPress={() => setAddMenuOpen(false)}>
          <View style={[styles.addMenuCard, { backgroundColor: theme.surface }]}>
            <Text style={[styles.addMenuTitle, { color: theme.text }]}>Add to catalog</Text>
            <Pressable style={styles.addMenuRow} onPress={() => startCreate('product')}>
              <Ionicons name="pricetag-outline" size={20} color={theme.accent} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.addMenuRowTitle, { color: theme.text }]}>New Product</Text>
                <Text style={[styles.addMenuRowSub, { color: theme.textMuted }]}>Physical, digital, or a booked service</Text>
              </View>
            </Pressable>
            <Pressable style={styles.addMenuRow} onPress={() => startCreate('custom')}>
              <Ionicons name="sparkles-outline" size={20} color={theme.accent} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.addMenuRowTitle, { color: theme.text }]}>New Custom Item</Text>
                <Text style={[styles.addMenuRowSub, { color: theme.textMuted }]}>Your own name, images, price, cost, and stock -- no fulfillment rules</Text>
              </View>
            </Pressable>
            <Pressable style={styles.addMenuRow} onPress={() => startCreate('collection')}>
              <Ionicons name="albums-outline" size={20} color={theme.accent} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.addMenuRowTitle, { color: theme.text }]}>New Collection</Text>
                <Text style={[styles.addMenuRowSub, { color: theme.textMuted }]}>Group existing products under one named, browsable card</Text>
              </View>
            </Pressable>
            <Pressable style={[styles.addMenuCancel, { borderColor: theme.border }]} onPress={() => setAddMenuOpen(false)}>
              <Text style={[styles.addMenuCancelText, { color: theme.text }]}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8 },
  title: { fontSize: 17, fontWeight: '700' },
  segmentRow: { flexDirection: 'row', marginHorizontal: 16, marginTop: 12, borderWidth: 1, borderRadius: 10, overflow: 'hidden' },
  segment: { flex: 1, paddingVertical: 9, alignItems: 'center' },
  segmentText: { fontSize: 13, fontWeight: '700' },
  content: { padding: 16, paddingBottom: 40, gap: 10 },
  loadingBox: { paddingVertical: 60, alignItems: 'center' },
  emptyBox: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 30, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '700', marginTop: 8 },
  emptyBody: { fontSize: 13, textAlign: 'center', lineHeight: 19 },
  emptyBtn: { marginTop: 16, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 12 },
  emptyBtnText: { fontSize: 14, fontWeight: '700' },
  card: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, padding: 12, gap: 12 },
  thumb: { width: 52, height: 52, borderRadius: 10 },
  thumbPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  productName: { fontSize: 15, fontWeight: '700' },
  productSub: { fontSize: 12, marginTop: 2 },
  deleteBtn: { padding: 6 },
  addMenuBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  addMenuCard: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, paddingBottom: 32, gap: 4 },
  addMenuTitle: { fontSize: 15, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  addMenuRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  addMenuRowTitle: { fontSize: 15, fontWeight: '700' },
  addMenuRowSub: { fontSize: 12, marginTop: 2 },
  addMenuCancel: { marginTop: 10, borderWidth: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  addMenuCancelText: { fontSize: 14, fontWeight: '700' },
});
