import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Image, ActivityIndicator, Pressable, ScrollView, StyleSheet, Modal, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { showAlert } from '@/utils/alert';
import { generateId } from '@/utils/id';
import { templateForPolicy, POLICY_KIND_LABELS } from '@/utils/richText';
import { uploadLocalImage } from '@/services/uploads';
import { productsStore } from '@/storage/productsStore';
import RichTextEditor from '@/components/policy/RichTextEditor';
import SliderRow from '@/components/inspector/SliderRow';
import { CatalogProduct, CollectionElement, MenuItem, MenuItemTarget, PolicyDoc, PolicyKind, Project, SitePage } from '@/types';

const STANDARD_KINDS: PolicyKind[] = ['privacy', 'terms', 'shipping', 'refund', 'contact'];
const DIVIDER_SWATCHES = ['#E2E8F0', '#CBD5E1', '#0F172A', '#4338CA', '#EA580C', '#D4AF37'];

type Tab = 'menu' | 'header' | 'policies';

export default function MenuPoliciesModal({
  visible,
  onClose,
  project,
  pages,
  updateProject,
  uid,
}: {
  visible: boolean;
  onClose: () => void;
  project: Project;
  pages: SitePage[] | null;
  updateProject: (patch: Partial<Project>) => void;
  uid: string;
}) {
  const [tab, setTab] = useState<Tab>('menu');
  const [editingPolicyId, setEditingPolicyId] = useState<string | null>(null);
  const [addingMenuItem, setAddingMenuItem] = useState(false);
  const [editingMenuItemId, setEditingMenuItemId] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [products, setProducts] = useState<CatalogProduct[]>([]);

  useEffect(() => {
    return productsStore.subscribe(uid, setProducts);
  }, [uid]);

  // Every real CollectionElement already placed somewhere on the site -- a menu item can only
  // link to a collection that actually exists on a page, same as it can only link to a real
  // page/policy (see MenuItemTarget's comment).
  const collectionElements: CollectionElement[] = (pages ? pages.flatMap((p) => p.elements) : project.elements).filter(
    (el): el is CollectionElement => el.type === 'collection'
  );

  const handlePickLogo = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
    if (result.canceled || result.assets.length === 0) return;
    setUploadingLogo(true);
    try {
      const url = await uploadLocalImage(result.assets[0].uri);
      updateProject({ logoUrl: url });
    } catch (err: any) {
      showAlert('Could not upload logo', err?.message ?? 'Try again in a moment.');
    } finally {
      setUploadingLogo(false);
    }
  };

  const policies = project.policies ?? [];
  const menu = project.menu ?? { enabled: true, items: [] };
  const contactPolicy = policies.find((p) => p.kind === 'contact') ?? null;
  const editingPolicy = policies.find((p) => p.id === editingPolicyId) ?? null;

  const savePolicies = (next: PolicyDoc[]) => updateProject({ policies: next });
  const saveMenu = (next: { enabled: boolean; items: MenuItem[] }) => updateProject({ menu: next });

  const createPolicy = (kind: PolicyKind) => {
    const doc: PolicyDoc = {
      id: generateId('policy'),
      kind,
      title: POLICY_KIND_LABELS[kind],
      paragraphs: templateForPolicy(kind, project.name),
      updatedAt: Date.now(),
    };
    savePolicies([...policies, doc]);
    setEditingPolicyId(doc.id);
  };

  const createCustomPolicy = () => {
    const doc: PolicyDoc = {
      id: generateId('policy'),
      kind: 'custom',
      title: 'New Page',
      paragraphs: templateForPolicy('custom', project.name),
      updatedAt: Date.now(),
    };
    savePolicies([...policies, doc]);
    setEditingPolicyId(doc.id);
  };

  const updatePolicy = (id: string, patch: Partial<PolicyDoc>) => {
    savePolicies(policies.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: Date.now() } : p)));
  };

  const deletePolicy = (id: string) => {
    showAlert('Delete this page?', 'Any menu items or buttons linking to it will stop working.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          savePolicies(policies.filter((p) => p.id !== id));
          if (editingPolicyId === id) setEditingPolicyId(null);
        },
      },
    ]);
  };

  const addOrUpdateMenuItem = (item: MenuItem) => {
    const exists = menu.items.some((i) => i.id === item.id);
    saveMenu({ ...menu, items: exists ? menu.items.map((i) => (i.id === item.id ? item : i)) : [...menu.items, item] });
    setAddingMenuItem(false);
    setEditingMenuItemId(null);
  };

  const deleteMenuItem = (id: string) => {
    saveMenu({ ...menu, items: menu.items.filter((i) => i.id !== id) });
  };

  const quickAdd = (label: string, target: MenuItemTarget) => {
    saveMenu({ ...menu, items: [...menu.items, { id: generateId('menu'), label, target }] });
  };

  const describeTarget = (target: MenuItemTarget): string => {
    if (target.type === 'page') return pages?.find((p) => p.id === target.pageId)?.name ?? 'Unknown page';
    if (target.type === 'policy') return policies.find((p) => p.id === target.policyId)?.title ?? 'Unknown page';
    if (target.type === 'product') return products.find((p) => p.id === target.productId)?.name || 'Untitled product';
    if (target.type === 'collection') return collectionElements.find((el) => el.id === target.elementId)?.name || 'Untitled collection';
    return target.url;
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Menu & Policies</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <Ionicons name="close" size={26} color="#0F172A" />
          </Pressable>
        </View>

        <View style={styles.tabBar}>
          <Pressable style={[styles.tabBtn, tab === 'menu' && styles.tabBtnActive]} onPress={() => setTab('menu')}>
            <Text style={[styles.tabBtnText, tab === 'menu' && styles.tabBtnTextActive]}>Menu</Text>
          </Pressable>
          <Pressable style={[styles.tabBtn, tab === 'header' && styles.tabBtnActive]} onPress={() => setTab('header')}>
            <Text style={[styles.tabBtnText, tab === 'header' && styles.tabBtnTextActive]}>Header</Text>
          </Pressable>
          <Pressable style={[styles.tabBtn, tab === 'policies' && styles.tabBtnActive]} onPress={() => setTab('policies')}>
            <Text style={[styles.tabBtnText, tab === 'policies' && styles.tabBtnTextActive]}>Policies</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {tab === 'menu' && (
            <>
              <View style={styles.rowBetween}>
                <View style={styles.rowBetweenText}>
                  <Text style={styles.sectionTitle}>Show menu on published site</Text>
                  <Text style={styles.helperText}>The three-line menu button visitors tap to navigate your site.</Text>
                </View>
                <Switch value={menu.enabled} onValueChange={(enabled) => saveMenu({ ...menu, enabled })} />
              </View>

              <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Quick add</Text>
              <View style={styles.chipRow}>
                <Pressable
                  style={[styles.chip, !pages && styles.chipDisabled]}
                  disabled={!pages}
                  onPress={() => pages && quickAdd('Home', { type: 'page', pageId: pages[0].id })}
                >
                  <Text style={styles.chipText}>+ Home</Text>
                </Pressable>
                <Pressable
                  style={[styles.chip, !pages && styles.chipDisabled]}
                  disabled={!pages}
                  onPress={() => pages && quickAdd('Catalog', { type: 'page', pageId: pages[0].id })}
                >
                  <Text style={styles.chipText}>+ Catalog</Text>
                </Pressable>
                <Pressable
                  style={[styles.chip, !contactPolicy && styles.chipDisabled]}
                  disabled={!contactPolicy}
                  onPress={() => contactPolicy && quickAdd('Contact Info', { type: 'policy', policyId: contactPolicy.id })}
                >
                  <Text style={styles.chipText}>+ Contact Info</Text>
                </Pressable>
              </View>
              {!pages && <Text style={styles.helperText}>Home/Catalog point at a page, only available on multi-page websites.</Text>}
              {!contactPolicy && <Text style={styles.helperText}>Create a Contact Information policy (Policies tab) to add it here.</Text>}

              <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Menu items</Text>
              {menu.items.length === 0 && <Text style={styles.helperText}>No menu items yet.</Text>}
              {menu.items.map((item) => (
                <View key={item.id} style={styles.itemRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemLabel}>{item.label}</Text>
                    <Text style={styles.itemSub}>{describeTarget(item.target)}</Text>
                  </View>
                  <Pressable hitSlop={8} onPress={() => setEditingMenuItemId(item.id)}>
                    <Ionicons name="pencil" size={18} color="#2563EB" />
                  </Pressable>
                  <Pressable hitSlop={8} onPress={() => deleteMenuItem(item.id)} style={{ marginLeft: 14 }}>
                    <Ionicons name="trash-outline" size={18} color="#DC2626" />
                  </Pressable>
                </View>
              ))}

              <Pressable style={styles.addBigBtn} onPress={() => setAddingMenuItem(true)}>
                <Ionicons name="add-circle-outline" size={18} color="#FFFFFF" />
                <Text style={styles.addBigBtnText}>Add menu item</Text>
              </Pressable>
            </>
          )}

          {tab === 'header' && (
            <>
              <Text style={styles.sectionTitle}>Site logo</Text>
              <Text style={styles.helperText}>
                Shown at the top of every page in place of your site name. A transparent PNG blends into the header
                naturally; a logo with its own background renders exactly as designed -- neither needs any special setup.
              </Text>
              {project.logoUrl ? (
                <View style={styles.logoPreviewRow}>
                  <View style={styles.logoPreviewBox}>
                    <Image
                      source={{ uri: project.logoUrl }}
                      resizeMode={project.logoFit === 'cover' ? 'cover' : 'contain'}
                      style={{ height: 36, width: 110 }}
                    />
                  </View>
                  <Pressable style={styles.smallBtn} onPress={handlePickLogo} disabled={uploadingLogo}>
                    {uploadingLogo ? <ActivityIndicator size="small" /> : <Text style={styles.smallBtnText}>Replace</Text>}
                  </Pressable>
                  <Pressable hitSlop={8} onPress={() => updateProject({ logoUrl: null })} style={{ marginLeft: 12 }}>
                    <Ionicons name="trash-outline" size={18} color="#DC2626" />
                  </Pressable>
                </View>
              ) : (
                <Pressable style={styles.addBigBtn} onPress={handlePickLogo} disabled={uploadingLogo}>
                  {uploadingLogo ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <>
                      <Ionicons name="image-outline" size={18} color="#FFFFFF" />
                      <Text style={styles.addBigBtnText}>Upload logo</Text>
                    </>
                  )}
                </Pressable>
              )}

              {!!project.logoUrl && (
                <>
                  <View style={{ marginTop: 18 }}>
                    <SliderRow
                      label="Logo height"
                      value={project.logoHeightPx ?? 32}
                      min={20}
                      max={80}
                      step={1}
                      onChange={(logoHeightPx) => updateProject({ logoHeightPx })}
                    />
                  </View>
                  <Text style={[styles.sectionTitle, { marginTop: 14 }]}>Fit</Text>
                  <View style={styles.chipRow}>
                    <Pressable
                      style={[styles.chip, (project.logoFit ?? 'contain') === 'contain' && styles.chipActive]}
                      onPress={() => updateProject({ logoFit: 'contain' })}
                    >
                      <Text style={styles.chipText}>Contain (show whole logo)</Text>
                    </Pressable>
                    <Pressable style={[styles.chip, project.logoFit === 'cover' && styles.chipActive]} onPress={() => updateProject({ logoFit: 'cover' })}>
                      <Text style={styles.chipText}>Cover (crop to fill)</Text>
                    </Pressable>
                  </View>
                </>
              )}

              <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Divider line colour</Text>
              <Text style={styles.helperText}>The real line under your site's header, on every published page.</Text>
              <View style={styles.chipRow}>
                {DIVIDER_SWATCHES.map((hex) => (
                  <Pressable
                    key={hex}
                    onPress={() => updateProject({ headerDividerColor: hex })}
                    style={[
                      styles.colorSwatch,
                      { backgroundColor: hex },
                      (project.headerDividerColor ?? '#E2E8F0').toUpperCase() === hex && styles.colorSwatchSelected,
                    ]}
                  />
                ))}
              </View>
            </>
          )}

          {tab === 'policies' && !editingPolicy && (
            <>
              <Text style={styles.sectionTitle}>Standard policies</Text>
              {STANDARD_KINDS.map((kind) => {
                const doc = policies.find((p) => p.kind === kind);
                return (
                  <View key={kind} style={styles.itemRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemLabel}>{doc?.title ?? POLICY_KIND_LABELS[kind]}</Text>
                      {!doc && <Text style={styles.itemSub}>Not created yet</Text>}
                    </View>
                    {doc ? (
                      <Pressable style={styles.smallBtn} onPress={() => setEditingPolicyId(doc.id)}>
                        <Text style={styles.smallBtnText}>Edit</Text>
                      </Pressable>
                    ) : (
                      <Pressable style={[styles.smallBtn, styles.smallBtnPrimary]} onPress={() => createPolicy(kind)}>
                        <Text style={[styles.smallBtnText, styles.smallBtnTextPrimary]}>+ Create</Text>
                      </Pressable>
                    )}
                  </View>
                );
              })}

              <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Custom pages</Text>
              {policies
                .filter((p) => p.kind === 'custom')
                .map((doc) => (
                  <View key={doc.id} style={styles.itemRow}>
                    <Text style={[styles.itemLabel, { flex: 1 }]}>{doc.title}</Text>
                    <Pressable style={styles.smallBtn} onPress={() => setEditingPolicyId(doc.id)}>
                      <Text style={styles.smallBtnText}>Edit</Text>
                    </Pressable>
                    <Pressable hitSlop={8} onPress={() => deletePolicy(doc.id)} style={{ marginLeft: 10 }}>
                      <Ionicons name="trash-outline" size={18} color="#DC2626" />
                    </Pressable>
                  </View>
                ))}
              <Pressable style={styles.addBigBtn} onPress={createCustomPolicy}>
                <Ionicons name="add-circle-outline" size={18} color="#FFFFFF" />
                <Text style={styles.addBigBtnText}>Add custom page</Text>
              </Pressable>

              {policies.length > 0 && (
                <Text style={[styles.helperText, { marginTop: 16 }]}>
                  Every policy you create automatically gets a real button in the footer of your published pages, and a "View
                  all policies" page listing them all.
                </Text>
              )}
            </>
          )}

          {tab === 'policies' && editingPolicy && (
            <>
              <Pressable style={styles.backRow} onPress={() => setEditingPolicyId(null)}>
                <Ionicons name="chevron-back" size={18} color="#2563EB" />
                <Text style={styles.backRowText}>All policies</Text>
              </Pressable>

              <Text style={styles.sectionTitle}>Page name</Text>
              <TextInput
                style={styles.textInput}
                value={editingPolicy.title}
                onChangeText={(title) => updatePolicy(editingPolicy.id, { title })}
              />

              <View style={styles.rowBetween}>
                <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Content</Text>
                {editingPolicy.kind !== 'custom' && (
                  <Pressable
                    style={[styles.smallBtn, { marginTop: 16 }]}
                    onPress={() =>
                      showAlert('Replace content with the standard template?', 'This overwrites what you have now.', [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Replace',
                          style: 'destructive',
                          onPress: () => updatePolicy(editingPolicy.id, { paragraphs: templateForPolicy(editingPolicy.kind, project.name) }),
                        },
                      ])
                    }
                  >
                    <Text style={styles.smallBtnText}>Auto-fill template</Text>
                  </Pressable>
                )}
              </View>
              <RichTextEditor
                paragraphs={editingPolicy.paragraphs}
                onChange={(paragraphs) => updatePolicy(editingPolicy.id, { paragraphs })}
              />

              <Pressable style={styles.addBigBtn} onPress={() => setEditingPolicyId(null)}>
                <Ionicons name="checkmark-circle-outline" size={18} color="#FFFFFF" />
                <Text style={styles.addBigBtnText}>Save & Close</Text>
              </Pressable>
            </>
          )}
        </ScrollView>

        <MenuItemFormModal
          visible={addingMenuItem || !!editingMenuItemId}
          initial={editingMenuItemId ? menu.items.find((i) => i.id === editingMenuItemId) ?? null : null}
          pages={pages}
          policies={policies}
          products={products}
          collectionElements={collectionElements}
          onCancel={() => {
            setAddingMenuItem(false);
            setEditingMenuItemId(null);
          }}
          onSave={addOrUpdateMenuItem}
        />
      </View>
    </Modal>
  );
}

function MenuItemFormModal({
  visible,
  initial,
  pages,
  policies,
  products,
  collectionElements,
  onCancel,
  onSave,
}: {
  visible: boolean;
  initial: MenuItem | null;
  pages: SitePage[] | null;
  policies: PolicyDoc[];
  products: CatalogProduct[];
  collectionElements: CollectionElement[];
  onCancel: () => void;
  onSave: (item: MenuItem) => void;
}) {
  const [label, setLabel] = useState(initial?.label ?? '');
  const [targetType, setTargetType] = useState<MenuItemTarget['type']>(initial?.target.type ?? (pages ? 'page' : 'url'));
  const [pageId, setPageId] = useState(initial?.target.type === 'page' ? initial.target.pageId : pages?.[0]?.id ?? '');
  const [policyId, setPolicyId] = useState(initial?.target.type === 'policy' ? initial.target.policyId : policies[0]?.id ?? '');
  const [url, setUrl] = useState(initial?.target.type === 'url' ? initial.target.url : '');
  const [productId, setProductId] = useState(initial?.target.type === 'product' ? initial.target.productId : products[0]?.id ?? '');
  const [collectionElementId, setCollectionElementId] = useState(
    initial?.target.type === 'collection' ? initial.target.elementId : collectionElements[0]?.id ?? ''
  );

  React.useEffect(() => {
    if (!visible) return;
    setLabel(initial?.label ?? '');
    setTargetType(initial?.target.type ?? (pages ? 'page' : 'url'));
    setPageId(initial?.target.type === 'page' ? initial.target.pageId : pages?.[0]?.id ?? '');
    setPolicyId(initial?.target.type === 'policy' ? initial.target.policyId : policies[0]?.id ?? '');
    setUrl(initial?.target.type === 'url' ? initial.target.url : '');
    setProductId(initial?.target.type === 'product' ? initial.target.productId : products[0]?.id ?? '');
    setCollectionElementId(initial?.target.type === 'collection' ? initial.target.elementId : collectionElements[0]?.id ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, initial?.id]);

  const confirm = () => {
    if (!label.trim()) return;
    let target: MenuItemTarget;
    if (targetType === 'page') {
      if (!pageId) return;
      target = { type: 'page', pageId };
    } else if (targetType === 'policy') {
      if (!policyId) return;
      target = { type: 'policy', policyId };
    } else if (targetType === 'product') {
      if (!productId) return;
      target = { type: 'product', productId };
    } else if (targetType === 'collection') {
      if (!collectionElementId) return;
      target = { type: 'collection', elementId: collectionElementId };
    } else {
      if (!url.trim()) return;
      target = { type: 'url', url: url.trim() };
    }
    onSave({ id: initial?.id ?? generateId('menu'), label: label.trim(), target });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.formBackdrop}>
        <View style={styles.formCard}>
          <Text style={styles.headerTitle}>{initial ? 'Edit menu item' : 'Add menu item'}</Text>
          <Text style={[styles.sectionTitle, { marginTop: 14 }]}>Label</Text>
          <TextInput style={styles.textInput} value={label} onChangeText={setLabel} placeholder="e.g. Shop" />

          <Text style={[styles.sectionTitle, { marginTop: 14 }]}>Links to</Text>
          <View style={styles.chipRow}>
            <Pressable style={[styles.chip, targetType === 'page' && styles.chipActive]} onPress={() => setTargetType('page')}>
              <Text style={styles.chipText}>Page</Text>
            </Pressable>
            <Pressable style={[styles.chip, targetType === 'policy' && styles.chipActive]} onPress={() => setTargetType('policy')}>
              <Text style={styles.chipText}>Policy</Text>
            </Pressable>
            <Pressable style={[styles.chip, targetType === 'product' && styles.chipActive]} onPress={() => setTargetType('product')}>
              <Text style={styles.chipText}>Product</Text>
            </Pressable>
            <Pressable style={[styles.chip, targetType === 'collection' && styles.chipActive]} onPress={() => setTargetType('collection')}>
              <Text style={styles.chipText}>Collection</Text>
            </Pressable>
            <Pressable style={[styles.chip, targetType === 'url' && styles.chipActive]} onPress={() => setTargetType('url')}>
              <Text style={styles.chipText}>URL</Text>
            </Pressable>
          </View>

          {targetType === 'page' && (
            <View style={styles.chipRow}>
              {(pages ?? []).map((p) => (
                <Pressable key={p.id} style={[styles.chip, pageId === p.id && styles.chipActive]} onPress={() => setPageId(p.id)}>
                  <Text style={styles.chipText}>{p.name}</Text>
                </Pressable>
              ))}
              {(!pages || pages.length === 0) && <Text style={styles.helperText}>No pages available.</Text>}
            </View>
          )}
          {targetType === 'policy' && (
            <View style={styles.chipRow}>
              {policies.map((p) => (
                <Pressable key={p.id} style={[styles.chip, policyId === p.id && styles.chipActive]} onPress={() => setPolicyId(p.id)}>
                  <Text style={styles.chipText}>{p.title}</Text>
                </Pressable>
              ))}
              {policies.length === 0 && <Text style={styles.helperText}>No policies created yet.</Text>}
            </View>
          )}
          {targetType === 'product' && (
            <View style={styles.chipRow}>
              {products.map((p) => (
                <Pressable key={p.id} style={[styles.chip, productId === p.id && styles.chipActive]} onPress={() => setProductId(p.id)}>
                  <Text style={styles.chipText}>{p.name || 'Untitled product'}</Text>
                </Pressable>
              ))}
              {products.length === 0 && <Text style={styles.helperText}>No products in your catalog yet -- create one in Products first.</Text>}
            </View>
          )}
          {targetType === 'collection' && (
            <View style={styles.chipRow}>
              {collectionElements.map((el) => (
                <Pressable
                  key={el.id}
                  style={[styles.chip, collectionElementId === el.id && styles.chipActive]}
                  onPress={() => setCollectionElementId(el.id)}
                >
                  <Text style={styles.chipText}>{el.name || 'Untitled collection'}</Text>
                </Pressable>
              ))}
              {collectionElements.length === 0 && (
                <Text style={styles.helperText}>No collections placed on your site yet -- add a Collection element to a page first.</Text>
              )}
            </View>
          )}
          {targetType === 'url' && (
            <TextInput
              style={styles.textInput}
              value={url}
              onChangeText={setUrl}
              placeholder="https://example.com"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
          )}

          <View style={styles.formActions}>
            <Pressable style={styles.modalCancelBtn} onPress={onCancel}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </Pressable>
            <Pressable style={styles.modalConfirmBtn} onPress={confirm}>
              <Text style={styles.modalConfirmText}>Save</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC', paddingTop: 50 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 14 },
  headerTitle: { fontSize: 19, fontWeight: '800', color: '#0F172A' },
  tabBar: { flexDirection: 'row', marginHorizontal: 20, backgroundColor: '#E2E8F0', borderRadius: 10, padding: 3, marginBottom: 8 },
  tabBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  tabBtnActive: { backgroundColor: '#FFFFFF', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 3, elevation: 2 },
  tabBtnText: { fontWeight: '700', color: '#64748B' },
  tabBtnTextActive: { color: '#0F172A' },
  body: { padding: 20, paddingBottom: 60 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#0F172A', marginBottom: 6 },
  helperText: { fontSize: 12, color: '#64748B', marginTop: 2, marginBottom: 8 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowBetweenText: { flex: 1, marginRight: 14 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0' },
  chipActive: { borderColor: '#2563EB', backgroundColor: '#EFF6FF' },
  chipDisabled: { opacity: 0.4 },
  chipText: { fontSize: 12, fontWeight: '600', color: '#334155' },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    marginBottom: 8,
  },
  itemLabel: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  itemSub: { fontSize: 12, color: '#64748B', marginTop: 2 },
  logoPreviewRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  logoPreviewBox: {
    flex: 1,
    height: 56,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  colorSwatch: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: '#E2E8F0' },
  colorSwatchSelected: { borderWidth: 3, borderColor: '#2563EB' },
  smallBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, backgroundColor: '#F1F5F9' },
  smallBtnPrimary: { backgroundColor: '#111827' },
  smallBtnText: { fontSize: 12, fontWeight: '700', color: '#334155' },
  smallBtnTextPrimary: { color: '#FFFFFF' },
  addBigBtn: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563EB',
    borderRadius: 10,
    paddingVertical: 13,
    marginTop: 10,
  },
  addBigBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 14 },
  backRowText: { color: '#2563EB', fontWeight: '700', fontSize: 14 },
  textInput: { borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  formBackdrop: { flex: 1, backgroundColor: '#00000088', alignItems: 'center', justifyContent: 'center', padding: 24 },
  formCard: { width: '100%', maxWidth: 400, maxHeight: '85%', backgroundColor: '#FFFFFF', borderRadius: 16, padding: 20 },
  formActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  modalCancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center', backgroundColor: '#F1F5F9' },
  modalCancelText: { color: '#334155', fontWeight: '600' },
  modalConfirmBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center', backgroundColor: '#111827' },
  modalConfirmText: { color: '#FFFFFF', fontWeight: '600' },
});
