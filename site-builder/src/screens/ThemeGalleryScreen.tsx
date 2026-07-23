import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Modal,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { showAlert } from '@/utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/navigation/types';
import { THEMES } from '@/data/themes';
import ThemeMiniPreview from '@/components/ThemeMiniPreview';
import { Theme, ThemeTier, ThemeCategory } from '@/types';
import { unlockedThemesStore } from '@/storage/unlockedThemesStore';
import { projectsStore } from '@/storage/projectsStore';
import { createProject } from '@/utils/createProject';
import { PAGE_TYPE_INFO } from '@/data/canvasSizes';
import { useAuth } from '@/context/AuthContext';
import { THEME_TIER_PRODUCT_IDS } from '@/data/iapProducts';
import { buyProduct, attachPurchaseListeners, loadIapCatalog } from '@/services/iap';

type Props = NativeStackScreenProps<RootStackParamList, 'ThemeGallery'>;

const TIER_LABEL: Record<ThemeTier, string> = {
  blank: 'Blank',
  free: 'Free',
  luxury: 'Luxury',
  'luxury-crazy': 'Luxury Crazy',
};

// Every category actually used by a real theme, in a fixed, sensible order -- 'All' is
// prepended separately so it always leads the filter row.
const ALL_CATEGORIES: ThemeCategory[] = ['Business', 'Portfolio', 'Retail', 'Restaurant', 'Fitness', 'Real Estate', 'Fashion', 'Tech', 'Media', 'Other'];

export default function ThemeGalleryScreen({ navigation, route }: Props) {
  const { pageType, customSize } = route.params;
  const { user } = useAuth();
  const uid = user!.uid;
  const [unlocked, setUnlocked] = useState<string[]>([]);
  const [purchaseTheme, setPurchaseTheme] = useState<Theme | null>(null);
  const [purchasing, setPurchasing] = useState(false);
  const [nameModal, setNameModal] = useState<Theme | null>(null);
  const [nameValue, setNameValue] = useState('');
  const [creating, setCreating] = useState(false);
  // Real, localized prices from Apple, keyed by product id -- see the same fix on
  // SubscriptionScreen for why theme.price (a hardcoded number) isn't trustworthy to show
  // directly. Falls back to `$${theme.price}` below if the catalog hasn't loaded yet.
  const [livePrices, setLivePrices] = useState<Record<string, string>>({});

  useEffect(() => {
    loadIapCatalog()
      .then(({ products }) => {
        const prices: Record<string, string> = {};
        products.forEach((p) => {
          prices[p.id] = p.displayPrice;
        });
        setLivePrices(prices);
      })
      .catch(() => {
        // Leave livePrices empty -- the `$${theme.price}` fallback below covers this.
      });
  }, []);

  const tierPriceLabel = (tier: 'luxury' | 'luxury-crazy', fallback: number): string => {
    const productId = THEME_TIER_PRODUCT_IDS[tier];
    return livePrices[productId] ?? `$${fallback}`;
  };

  useFocusEffect(
    useCallback(() => {
      unlockedThemesStore.list(uid).then(setUnlocked);
    }, [uid])
  );

  useEffect(() => {
    const detach = attachPurchaseListeners(
      async (productId) => {
        const tier = (Object.keys(THEME_TIER_PRODUCT_IDS) as ThemeTier[]).find(
          (t) => THEME_TIER_PRODUCT_IDS[t as 'luxury' | 'luxury-crazy'] === productId
        );
        setPurchasing(false);
        if (!tier) return;
        const freshlyUnlocked = await unlockedThemesStore.list(uid);
        setUnlocked(freshlyUnlocked);
        const theme = purchaseTheme;
        setPurchaseTheme(null);
        if (theme) {
          setNameValue(`My ${PAGE_TYPE_INFO[pageType].title}`);
          setNameModal(theme);
        }
      },
      (message) => {
        setPurchasing(false);
        showAlert('Purchase failed', message);
      }
    );
    return detach;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, purchaseTheme, pageType]);

  const [swatchWidth, setSwatchWidth] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState<ThemeCategory | 'All'>('All');
  const [search, setSearch] = useState('');

  const isLocked = (theme: Theme) => theme.price > 0 && !unlocked.includes(theme.id);

  const filteredThemes = THEMES.filter((theme) => {
    if (selectedCategory !== 'All' && theme.category !== selectedCategory) return false;
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return theme.name.toLowerCase().includes(query) || theme.description.toLowerCase().includes(query) || theme.category.toLowerCase().includes(query);
  });

  const openTheme = (theme: Theme) => {
    if (isLocked(theme)) {
      setPurchaseTheme(theme);
      return;
    }
    setNameValue(`My ${PAGE_TYPE_INFO[pageType].title}`);
    setNameModal(theme);
  };

  const confirmPurchase = async () => {
    if (!purchaseTheme) return;
    const productId = THEME_TIER_PRODUCT_IDS[purchaseTheme.tier as 'luxury' | 'luxury-crazy'];
    if (!productId) return;
    setPurchasing(true);
    try {
      await buyProduct(productId);
    } catch (err: any) {
      setPurchasing(false);
      showAlert('Could not start purchase', err?.message ?? 'Try again in a moment.');
    }
  };

  const createAndOpen = async () => {
    if (!nameModal || creating) return;
    setCreating(true);
    try {
      const project = createProject(nameValue.trim() || nameModal.name, pageType, nameModal.id, customSize);
      await projectsStore.save(uid, project);
      setNameModal(null);
      navigation.reset({
        index: 1,
        routes: [{ name: 'Projects' }, { name: 'Editor', params: { projectId: project.id } }],
      });
    } catch (err: any) {
      showAlert('Could not create project', err?.message ?? 'Try again in a moment.');
    } finally {
      setCreating(false);
    }
  };

  const renderGroup = (tier: ThemeTier) => {
    const items = filteredThemes.filter((t) => t.tier === tier);
    if (items.length === 0) return null;
    return (
      <View style={styles.group} key={tier}>
        <Text style={styles.groupTitle}>
          {TIER_LABEL[tier]}
          {tier === 'luxury' && `  ·  ${tierPriceLabel('luxury', 189)}`}
          {tier === 'luxury-crazy' && `  ·  ${tierPriceLabel('luxury-crazy', 399)}`}
        </Text>
        <View style={styles.grid}>
          {items.map((theme) => (
            <Pressable key={theme.id} style={styles.themeCard} onPress={() => openTheme(theme)}>
              <View style={styles.swatch} onLayout={(e) => setSwatchWidth(e.nativeEvent.layout.width)}>
                {swatchWidth > 0 && (
                  <ThemeMiniPreview theme={theme} width={swatchWidth} height={styles.swatch.height} />
                )}
                {isLocked(theme) && (
                  <View style={styles.lockOverlay}>
                    <Ionicons name="lock-closed" size={18} color="#FFFFFF" />
                  </View>
                )}
              </View>
              <Text style={styles.themeName}>{theme.name}</Text>
              <Text style={styles.themeCategory}>{theme.category}</Text>
              <Text style={styles.themeDesc} numberOfLines={2}>
                {theme.description}
              </Text>
              {theme.price > 0 && (
                <Text style={styles.themePrice}>{tierPriceLabel(theme.tier as 'luxury' | 'luxury-crazy', theme.price)}</Text>
              )}
            </Pressable>
          ))}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="chevron-back" size={26} color="#0F172A" />
        </Pressable>
        <Text style={styles.title}>Choose a Theme</Text>
        <View style={{ width: 26 }} />
      </View>

      <View style={styles.searchRow}>
        <Ionicons name="search" size={16} color="#94A3B8" style={{ marginRight: 6 }} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search themes"
          placeholderTextColor="#94A3B8"
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
        {(['All', ...ALL_CATEGORIES] as const).map((cat) => (
          <Pressable
            key={cat}
            style={[styles.categoryChip, selectedCategory === cat && styles.categoryChipActive]}
            onPress={() => setSelectedCategory(cat)}
          >
            <Text style={[styles.categoryChipText, selectedCategory === cat && styles.categoryChipTextActive]}>{cat}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {filteredThemes.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="color-palette-outline" size={36} color="#CBD5E1" />
            <Text style={styles.emptyText}>No themes match "{search}" — try a different search or category.</Text>
          </View>
        ) : (
          <>
            {renderGroup('blank')}
            {renderGroup('free')}
            {renderGroup('luxury')}
            {renderGroup('luxury-crazy')}
          </>
        )}
      </ScrollView>

      <Modal visible={!!purchaseTheme} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Unlock "{purchaseTheme?.name}"</Text>
            <Text style={styles.modalBody}>
              A one-time Apple In-App Purchase of{' '}
              {purchaseTheme && tierPriceLabel(purchaseTheme.tier as 'luxury' | 'luxury-crazy', purchaseTheme.price)}{' '}
              unlocks every theme in this tier, not just this one. Payment is handled entirely by Apple.
            </Text>
            <View style={styles.modalActions}>
              <Pressable style={styles.modalCancel} onPress={() => setPurchaseTheme(null)} disabled={purchasing}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.modalConfirm} onPress={confirmPurchase} disabled={purchasing}>
                {purchasing ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalConfirmText}>
                    Buy {purchaseTheme && tierPriceLabel(purchaseTheme.tier as 'luxury' | 'luxury-crazy', purchaseTheme.price)}
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!nameModal} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Name your project</Text>
            <TextInput
              style={styles.nameInput}
              value={nameValue}
              onChangeText={setNameValue}
              autoFocus
              placeholder="Project name"
              editable={!creating}
            />
            <View style={styles.modalActions}>
              <Pressable style={styles.modalCancel} onPress={() => setNameModal(null)} disabled={creating}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.modalConfirm} onPress={createAndOpen} disabled={creating}>
                {creating ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.modalConfirmText}>Create</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
    paddingBottom: 4,
  },
  title: { fontSize: 18, fontWeight: '700', color: '#0F172A' },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 10,
  },
  searchInput: { flex: 1, paddingVertical: 8, fontSize: 14, color: '#0F172A' },
  categoryRow: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  categoryChip: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  categoryChipActive: { backgroundColor: '#111827', borderColor: '#111827' },
  categoryChipText: { fontSize: 12, fontWeight: '600', color: '#64748B' },
  categoryChipTextActive: { color: '#FFFFFF' },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, paddingHorizontal: 40, gap: 12 },
  emptyText: { color: '#94A3B8', fontSize: 13, textAlign: 'center', lineHeight: 19 },
  group: { paddingHorizontal: 16, marginTop: 18 },
  groupTitle: { fontSize: 15, fontWeight: '700', color: '#334155', marginBottom: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  themeCard: {
    width: '47%',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 10,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  swatch: {
    height: 190,
    borderRadius: 10,
    overflow: 'hidden',
    position: 'relative',
  },
  lockOverlay: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: '#00000066',
    borderRadius: 12,
    padding: 4,
  },
  themeName: { fontSize: 14, fontWeight: '700', color: '#0F172A', marginTop: 8 },
  themeCategory: { fontSize: 10, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.3, marginTop: 1 },
  themeDesc: { fontSize: 11, color: '#64748B', marginTop: 2, height: 28 },
  themePrice: { fontSize: 13, fontWeight: '700', color: '#B45309', marginTop: 4 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: '#00000088',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: { width: '100%', backgroundColor: '#FFFFFF', borderRadius: 16, padding: 20 },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#0F172A' },
  modalBody: { fontSize: 13, color: '#475569', marginTop: 10, lineHeight: 19 },
  nameInput: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  modalCancel: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
  },
  modalCancelText: { color: '#334155', fontWeight: '600' },
  modalConfirm: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#111827',
  },
  modalConfirmText: { color: '#FFFFFF', fontWeight: '600' },
});
