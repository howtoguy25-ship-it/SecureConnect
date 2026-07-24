import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, ScrollView, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/navigation/types';
import { useAuth } from '@/context/AuthContext';
import { useAppTheme } from '@/context/AppThemeContext';
import { showAlert } from '@/utils/alert';
import { productsStore } from '@/storage/productsStore';
import { sellerAccountStore } from '@/services/store';
import { currencySymbol } from '@/utils/currency';
import { CatalogProduct } from '@/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Products'>;

export default function ProductsScreen({ navigation }: Props) {
  const { user } = useAuth();
  const uid = user!.uid;
  const { theme } = useAppTheme();

  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [sym, setSym] = useState('$');

  useEffect(() => {
    const unsub = productsStore.subscribe(uid, (list) => {
      setProducts(list);
      setLoading(false);
    });
    return unsub;
  }, [uid]);

  useEffect(() => {
    return sellerAccountStore.subscribe(uid, (account) => setSym(currencySymbol(account?.currency)));
  }, [uid]);

  const handleDelete = (product: CatalogProduct) => {
    showAlert('Delete this product?', `"${product.name || 'Untitled product'}" will be removed from your catalog. Any site already using it will show it as unavailable.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => productsStore.remove(uid, product.id) },
    ]);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="chevron-back" size={26} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>Products</Text>
        <Pressable onPress={() => navigation.navigate('ProductEdit', {})} hitSlop={8}>
          <Ionicons name="add" size={26} color={theme.accent} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {loading ? (
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
            <Pressable style={[styles.emptyBtn, { backgroundColor: theme.accent }]} onPress={() => navigation.navigate('ProductEdit', {})}>
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
                  {sym}{product.priceUsd.toFixed(2)} · {product.saleType === 'product' ? 'Physical' : product.saleType === 'digital' ? 'Digital' : 'Service'}
                  {product.trackInventory ? ` · ${product.initialStock ?? 0} in stock` : ''}
                </Text>
              </View>
              <Pressable style={styles.deleteBtn} onPress={() => handleDelete(product)} hitSlop={8}>
                <Ionicons name="trash-outline" size={18} color="#DC2626" />
              </Pressable>
            </Pressable>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8 },
  title: { fontSize: 17, fontWeight: '700' },
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
});
