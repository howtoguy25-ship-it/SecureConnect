import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator, Linking, Image } from 'react-native';
import { showAlert } from '@/utils/alert';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { CanvasElement, ImageElement, ProductElement, VideoCaption, WidgetKind, WidgetTimezone } from '@/types';
import { generateId } from '@/utils/id';
import { useCatalogProduct } from '@/hooks/useCatalogProduct';
import { resolveProductView } from '@/utils/resolveProduct';
import { AnalogClockFace, DigitalClockFace, WIDGET_THEME } from '@/components/canvas/WidgetView';
import ColorSwatchRow from '@/components/inspector/ColorSwatchRow';
import GradientPickerRow from '@/components/inspector/GradientPickerRow';
import SliderRow from '@/components/inspector/SliderRow';
import { labelForElement } from '@/utils/elementLabel';
import { FONT_OPTIONS, FontOption } from '@/data/fonts';
import { useGoogleFont } from '@/utils/useGoogleFont';
import { editImageBackground } from '@/services/uploads';
import { generateCustomWidget } from '@/services/customWidget';
import { BACKGROUND_EDIT_CREDIT_COST, CUSTOM_WIDGET_CREDIT_COST } from '@/data/pricing';
import { updateProductStock } from '@/services/productStock';
import { useAuth } from '@/context/AuthContext';
import { sellerAccountStore } from '@/services/store';
import { currencySymbol } from '@/utils/currency';
import { navigateTo } from '@/navigation/navigationRef';

interface Props {
  element: CanvasElement;
  // Every sibling element on the same page -- only the 'collection' case reads this, to
  // list real Product elements the user can pick to add to the collection.
  allElements: CanvasElement[];
  onChange: (patch: Partial<CanvasElement>) => void;
  onDelete: () => void;
  onBringToFront: () => void;
  onClose: () => void;
  // Only needed for the product element's "Save to Live Store" action -- every other
  // element type ignores these.
  projectId?: string;
  publishSlug?: string | null;
  // Only read by the 'customWidget' case, so the AI has real site context (rather than a
  // generic default) to design the widget's look around.
  siteName?: string;
  // Opens a full account-catalog picker for a Button's link target -- lets a seller link
  // straight to any product they've ever created, not just one already placed on this page
  // (see EditorScreen's insertProductAndLinkButton). Only the 'button' case uses this.
  onPickProductForLink?: () => void;
  // Only the 'section' case uses these -- adding a text child and bulk-applying a font/size
  // to every existing text child both need to create/update OTHER elements, not just patch
  // the section itself, which is all onChange above can do.
  onAddSectionText?: () => void;
  onApplySectionTextStyle?: (patch: { fontFamily?: string; fontSize?: number }) => void;
  // Opens the column/row layout picker scoped to insert into this specific section (e.g.
  // "Add columns" under an existing "Shop Now" band) -- only the 'section' case uses this.
  onAddSectionColumns?: () => void;
}

// Pushes a product's in-stock switch + current quantity straight to the live storeInventory
// doc (if the site's already published), so a seller's change takes effect immediately
// instead of waiting for a full republish. Local to this file since nothing else needs it.
function ProductLiveStockSave({
  projectId,
  productId,
  inStock,
  stockQuantity,
  published,
}: {
  projectId: string;
  productId: string;
  inStock: boolean;
  stockQuantity: number | null;
  published: boolean;
}) {
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await updateProductStock(projectId, productId, inStock, stockQuantity);
      showAlert(
        published ? 'Saved to live store' : 'Saved',
        published
          ? 'Buyers on your published site will see this update right away.'
          : "Saved -- this will go live the first time you publish this site."
      );
    } catch (err: any) {
      showAlert('Could not save', err?.message ?? 'Try again in a moment.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Pressable style={styles.saveStockBtn} onPress={save} disabled={saving}>
      {saving ? (
        <ActivityIndicator color="#FFFFFF" />
      ) : (
        <>
          <Ionicons name="save-outline" size={16} color="#FFFFFF" />
          <Text style={styles.saveStockBtnText}>{published ? 'Save to Live Store' : 'Save'}</Text>
        </>
      )}
    </Pressable>
  );
}

// A Button element's "link to a product/collection on this page" chip -- a product's real
// name lives in the catalog now (see ProductElement's comment), so this resolves it via
// useCatalogProduct instead of reading a field that no longer exists on the element. Its own
// component (not inline in a .map()) because hooks can't be called inside a loop.
function LinkTargetChip({
  target,
  selected,
  onToggle,
}: {
  target: Extract<CanvasElement, { type: 'product' | 'collection' }>;
  selected: boolean;
  onToggle: (selected: boolean) => void;
}) {
  const catalogProduct = useCatalogProduct(target.type === 'product' ? target.productId : '');
  const label =
    target.type === 'product'
      ? resolveProductView(target, catalogProduct ?? null).name || 'Untitled product'
      : target.name || 'Untitled collection';
  return (
    <Pressable style={[styles.toggleBtn, selected && styles.toggleBtnActive]} onPress={() => onToggle(selected)}>
      <Text style={styles.toggleBtnText}>
        {target.type === 'product' ? '🛍️ ' : '📦 '}
        {label}
      </Text>
    </Pressable>
  );
}

// A Collection element's product picker row -- same live-name-resolution need as
// LinkTargetChip above, its own component for the same hooks-in-a-loop reason.
function CollectionProductPickerRow({
  productElement,
  selected,
  onToggle,
}: {
  productElement: ProductElement;
  selected: boolean;
  onToggle: (selected: boolean) => void;
}) {
  const catalogProduct = useCatalogProduct(productElement.productId);
  const product = resolveProductView(productElement, catalogProduct ?? null);
  return (
    <Pressable
      style={[styles.collectionProductRow, selected && styles.collectionProductRowActive]}
      onPress={() => onToggle(selected)}
    >
      <Ionicons name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={26} color={selected ? '#2563EB' : '#94A3B8'} />
      <Text style={styles.collectionProductRowText} numberOfLines={1}>
        {product.name || 'Untitled product'}
      </Text>
    </Pressable>
  );
}

// The product inspector no longer edits product content inline -- a ProductElement only ever
// references a real catalog product (see the type's own comment), so full editing (name,
// price, photos, variants, etc.) lives in ProductEditScreen, one place shared by every site
// that uses this product. This shows a live-resolved summary plus a deep link there, and keeps
// only the one thing that's genuinely still worth a quick, no-navigation toggle here: flipping
// in-stock/quantity straight to the live storeInventory doc without opening the full editor.
function ProductInspectorSection({
  element,
  projectId,
  publishSlug,
  sym,
}: {
  element: ProductElement;
  projectId?: string;
  publishSlug?: string | null;
  sym: string;
}) {
  const catalogProduct = useCatalogProduct(element.productId);
  if (catalogProduct === undefined) {
    return <ActivityIndicator color="#4338CA" style={{ marginTop: 12 }} />;
  }
  const product = resolveProductView(element, catalogProduct);
  return (
    <>
      <View style={styles.productSummaryCard}>
        {product.images[0] ? (
          <Image source={{ uri: product.images[0] }} style={styles.productSummaryThumb} />
        ) : (
          <View style={[styles.productSummaryThumb, { alignItems: 'center', justifyContent: 'center' }]}>
            <Ionicons name="pricetag-outline" size={20} color="#94A3B8" />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.productSummaryName} numberOfLines={1}>
            {product.name || 'Untitled product'}
          </Text>
          <Text style={styles.productSummaryPrice}>
            {sym}
            {product.priceUsd.toFixed(2)}
            {product.saleType === 'service' ? ' · Service' : product.saleType === 'digital' ? ' · Digital' : product.saleType === 'custom' ? ' · Custom' : ''}
          </Text>
        </View>
      </View>

      <Pressable style={styles.uploadBtn} onPress={() => navigateTo('ProductEdit', { productId: element.productId })}>
        <Ionicons name="create-outline" size={18} color="#FFFFFF" />
        <Text style={styles.uploadBtnText}>Edit Product</Text>
      </Pressable>
      <Text style={styles.helperText}>
        Editing this product updates it everywhere it's used across your sites -- not just this one.
      </Text>

      {projectId && product.variantOptions.length === 0 ? (
        <ProductLiveStockSave
          projectId={projectId}
          productId={element.productId}
          inStock={product.inStock !== false}
          stockQuantity={product.trackInventory ? product.initialStock ?? 0 : null}
          published={!!publishSlug}
        />
      ) : null}
    </>
  );
}

// Each chip renders its own label in its own real typeface (once downloaded) rather than a
// plain font-name list, so picking a "crazy good" font is a real preview, not a guess.
function FontChip({ option, selected, onPress }: { option: FontOption; selected: boolean; onPress: () => void }) {
  const family = useGoogleFont(option.id);
  return (
    <Pressable style={[styles.fontChip, selected && styles.fontChipActive]} onPress={onPress}>
      <Text
        style={[styles.fontChipText, selected && styles.fontChipTextActive, family ? { fontFamily: family } : null]}
        numberOfLines={1}
      >
        {option.label}
      </Text>
    </Pressable>
  );
}

// Shared by ProductElement and CollectionElement -- lets a seller override the font/size of
// just the name and price text this specific card renders, independent of the catalog data
// itself (the same product can be styled differently on different pages/sites). Undefined
// fields fall back to each card's normal default styling (see ElementRenderer.tsx/siteHtml.ts).
function CardTextStyleEditor({
  nameFontFamily,
  nameFontSize,
  priceFontFamily,
  priceFontSize,
  onChange,
}: {
  nameFontFamily?: string;
  nameFontSize?: number;
  priceFontFamily?: string;
  priceFontSize?: number;
  onChange: (patch: { nameFontFamily?: string; nameFontSize?: number; priceFontFamily?: string; priceFontSize?: number }) => void;
}) {
  return (
    <View>
      <Text style={styles.fieldLabel}>Name text style</Text>
      <View style={styles.rowButtons}>
        {FONT_OPTIONS.map((option) => (
          <FontChip
            key={option.id}
            option={option}
            selected={(nameFontFamily ?? 'system') === option.id}
            onPress={() => onChange({ nameFontFamily: option.id })}
          />
        ))}
      </View>
      <SliderRow label="Name size" value={nameFontSize ?? 15} min={10} max={36} onChange={(v) => onChange({ nameFontSize: v })} />

      <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Price text style</Text>
      <View style={styles.rowButtons}>
        {FONT_OPTIONS.map((option) => (
          <FontChip
            key={option.id}
            option={option}
            selected={(priceFontFamily ?? 'system') === option.id}
            onPress={() => onChange({ priceFontFamily: option.id })}
          />
        ))}
      </View>
      <SliderRow label="Price size" value={priceFontSize ?? 14} min={10} max={36} onChange={(v) => onChange({ priceFontSize: v })} />
    </View>
  );
}

async function pickImage(): Promise<string | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return null;
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.85,
  });
  if (result.canceled || result.assets.length === 0) return null;
  return result.assets[0].uri;
}

async function pickVideo(): Promise<string | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return null;
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'] });
  if (result.canceled || result.assets.length === 0) return null;
  return result.assets[0].uri;
}

const MAX_TRIM_MS = 5 * 60 * 1000;

// Real, working caption list editor -- add/edit/remove timed subtitle lines, each with its
// own start/end time (clip-relative, same clock as trimStartMs/trimEndMs) via the same
// SliderRow every other time control here uses. Kept purely as an array of plain values
// (no separate "current caption index" selection state) since captions are typically edited
// one at a time in order, not jumped between.
function VideoCaptionsEditor({
  captions,
  trimStartMs,
  trimEndMs,
  onChange,
}: {
  captions: VideoCaption[];
  trimStartMs: number;
  trimEndMs: number | null;
  onChange: (captions: VideoCaption[]) => void;
}) {
  const maxMs = trimEndMs ?? MAX_TRIM_MS;
  const addCaption = () => {
    const lastEnd = captions.length > 0 ? captions[captions.length - 1].endMs : trimStartMs;
    const start = Math.min(lastEnd, Math.max(trimStartMs, maxMs - 3000));
    onChange([...captions, { id: generateId('caption'), text: '', startMs: start, endMs: Math.min(maxMs, start + 3000) }]);
  };
  const updateCaption = (id: string, patch: Partial<VideoCaption>) =>
    onChange(captions.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const removeCaption = (id: string) => onChange(captions.filter((c) => c.id !== id));

  return (
    <View>
      {captions.map((caption, idx) => (
        <View key={caption.id} style={styles.captionCard}>
          <View style={styles.captionCardHeader}>
            <Text style={styles.captionCardTitle}>Caption {idx + 1}</Text>
            <Pressable onPress={() => removeCaption(caption.id)} hitSlop={8}>
              <Ionicons name="trash-outline" size={16} color="#DC2626" />
            </Pressable>
          </View>
          <TextInput
            style={styles.textInput}
            placeholder="Caption text"
            value={caption.text}
            onChangeText={(text) => updateCaption(caption.id, { text })}
            multiline
          />
          <SliderRow
            label="Starts at (s)"
            value={caption.startMs / 1000}
            min={trimStartMs / 1000}
            max={Math.max(trimStartMs, caption.endMs - 200) / 1000}
            step={0.1}
            decimals={1}
            onChange={(v) => updateCaption(caption.id, { startMs: Math.round(v * 1000) })}
          />
          <SliderRow
            label="Ends at (s)"
            value={caption.endMs / 1000}
            min={(caption.startMs + 200) / 1000}
            max={maxMs / 1000}
            step={0.1}
            decimals={1}
            onChange={(v) => updateCaption(caption.id, { endMs: Math.round(v * 1000) })}
          />
        </View>
      ))}
      <Pressable style={styles.uploadBtn} onPress={addCaption}>
        <Ionicons name="add-circle-outline" size={18} color="#FFFFFF" />
        <Text style={styles.uploadBtnText}>Add Caption</Text>
      </Pressable>
    </View>
  );
}

// Real AI background remove/change for an already-placed image (see editImageBackground in
// src/services/uploads.ts). Keyed by element.id where it's used below so switching to a
// different image element always starts this with fresh state, never a stale busy/prompt
// left over from the previous one.
function ImageBackgroundTools({ element, onChange }: { element: ImageElement; onChange: (patch: Partial<CanvasElement>) => void }) {
  const [busy, setBusy] = useState<'remove' | 'change' | null>(null);
  const [showChangeInput, setShowChangeInput] = useState(false);
  const [changeText, setChangeText] = useState('');

  const run = async (mode: 'remove' | 'change', prompt?: string) => {
    if (!element.uri) return;
    setBusy(mode);
    try {
      const uri = await editImageBackground(element.uri, mode, prompt);
      onChange({ uri } as any);
      setShowChangeInput(false);
      setChangeText('');
    } catch (err: any) {
      showAlert('Could not edit background', err?.message ?? 'Try again in a moment.');
    } finally {
      setBusy(null);
    }
  };

  if (!element.uri) return null;

  return (
    <>
      <Text style={styles.fieldLabel}>AI Background ({BACKGROUND_EDIT_CREDIT_COST} credits per edit)</Text>
      <View style={styles.rowButtons}>
        <Pressable style={styles.toggleBtn} onPress={() => run('remove')} disabled={busy !== null}>
          {busy === 'remove' ? <ActivityIndicator size="small" color="#0F172A" /> : <Text style={styles.toggleBtnText}>Remove Background</Text>}
        </Pressable>
        <Pressable
          style={[styles.toggleBtn, showChangeInput && styles.toggleBtnActive]}
          onPress={() => setShowChangeInput((v) => !v)}
          disabled={busy !== null}
        >
          <Text style={styles.toggleBtnText}>Change Background</Text>
        </Pressable>
      </View>
      {showChangeInput && (
        <>
          <TextInput
            style={styles.textInput}
            value={changeText}
            onChangeText={setChangeText}
            placeholder={'Describe the new background, e.g. "sunny beach"'}
            multiline
          />
          <Pressable
            style={[styles.uploadBtn, !changeText.trim() && { opacity: 0.5 }]}
            onPress={() => run('change', changeText.trim())}
            disabled={busy !== null || !changeText.trim()}
          >
            {busy === 'change' ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="color-wand-outline" size={18} color="#FFFFFF" />
                <Text style={styles.uploadBtnText}>Apply New Background</Text>
              </>
            )}
          </Pressable>
        </>
      )}
    </>
  );
}

// Manual (non-AI-build) generation for a Custom Widget: the seller describes exactly what
// they want and this calls the same real code-gen + image-placeholder pipeline the AI
// builder uses for 'custom' sections, just for one element at a time. Keyed by element.id
// where it's used below so switching to a different customWidget element always starts
// this with fresh state, never stale busy/description left over from a previous one.
function CustomWidgetGenerator({
  element,
  siteName,
  onChange,
}: {
  element: Extract<CanvasElement, { type: 'customWidget' }>;
  siteName?: string;
  onChange: (patch: Partial<CanvasElement>) => void;
}) {
  const [description, setDescription] = useState(element.description);

  const run = async () => {
    if (!description.trim()) return;
    onChange({ description: description.trim(), generating: true, error: null } as any);
    try {
      const code = await generateCustomWidget(description.trim(), siteName);
      onChange({ code, generating: false, error: null } as any);
    } catch (err: any) {
      onChange({ generating: false, error: err?.message ?? 'Could not build that feature. Try again.' } as any);
    }
  };

  return (
    <>
      <Text style={styles.fieldLabel}>Describe what you want built</Text>
      <TextInput
        style={styles.textInput}
        value={description}
        onChangeText={setDescription}
        placeholder='e.g. "A tip calculator with a slider for tip percent and split-by-people"'
        multiline
        editable={!element.generating}
      />
      <Pressable
        style={[styles.uploadBtn, (!description.trim() || element.generating) && { opacity: 0.5 }]}
        onPress={run}
        disabled={!description.trim() || element.generating}
      >
        {element.generating ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <>
            <Ionicons name="sparkles-outline" size={18} color="#FFFFFF" />
            <Text style={styles.uploadBtnText}>{element.code ? 'Regenerate' : 'Generate'} ({CUSTOM_WIDGET_CREDIT_COST} credits)</Text>
          </>
        )}
      </Pressable>
      {!!element.error && <Text style={[styles.helperText, { color: '#DC2626' }]}>{element.error}</Text>}
      <Text style={styles.helperText}>
        Real, bespoke HTML/CSS/JS built for exactly what you describe -- a working game, calculator, or tool, not a
        template. Runs in a sandboxed preview here and on your published site.
      </Text>
    </>
  );
}

export default function ElementInspector({ element, allElements, onChange, onDelete, onBringToFront, onClose, projectId, publishSlug, siteName, onPickProductForLink, onAddSectionText, onApplySectionTextStyle, onAddSectionColumns }: Props) {
  const { user } = useAuth();
  const [sellerCurrency, setSellerCurrency] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!user) return;
    return sellerAccountStore.subscribe(user.uid, (account) => setSellerCurrency(account?.currency));
  }, [user]);
  const sym = currencySymbol(sellerCurrency);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{labelForElement(element)}</Text>
        <View style={styles.headerActions}>
          <Pressable onPress={onBringToFront} hitSlop={8} style={styles.iconBtn}>
            <Ionicons name="layers-outline" size={20} color="#334155" />
          </Pressable>
          <Pressable onPress={onDelete} hitSlop={8} style={styles.iconBtn}>
            <Ionicons name="trash-outline" size={20} color="#DC2626" />
          </Pressable>
          {/* Quick one-tap close -- users no longer have to scroll all the way down and
              hunt for a "Done" button on every single element they tap, whether or not
              they've actually changed anything. */}
          <Pressable onPress={onClose} hitSlop={8} style={styles.iconBtn}>
            <Ionicons name="chevron-down-circle-outline" size={22} color="#334155" />
          </Pressable>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <SliderRow label="Width" value={element.width} min={24} max={390} onChange={(v) => onChange({ width: v })} />
        <SliderRow label="Height" value={element.height} min={24} max={800} onChange={(v) => onChange({ height: v })} />

        {element.type === 'text' && (
          <>
            <Text style={styles.fieldLabel}>Text</Text>
            <TextInput
              style={styles.textInput}
              value={element.text}
              onChangeText={(text) => onChange({ text } as any)}
              multiline
            />
            <Text style={styles.fieldLabel}>Font</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.fontRow}>
              {FONT_OPTIONS.map((option) => (
                <FontChip
                  key={option.id}
                  option={option}
                  selected={(element.fontFamily ?? 'system') === option.id}
                  onPress={() => onChange({ fontFamily: option.id } as any)}
                />
              ))}
            </ScrollView>
            <SliderRow
              label="Font Size"
              value={element.fontSize}
              min={0}
              max={100}
              onChange={(v) => onChange({ fontSize: v } as any)}
            />
            <Pressable style={styles.confirmBtn} onPress={onClose}>
              <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
              <Text style={styles.confirmBtnText}>Done — Continue Building</Text>
            </Pressable>
            <View style={styles.rowButtons}>
              <Pressable
                style={[styles.toggleBtn, element.fontWeight === 'bold' && styles.toggleBtnActive]}
                onPress={() => onChange({ fontWeight: element.fontWeight === 'bold' ? 'normal' : 'bold' } as any)}
              >
                <Text style={styles.toggleBtnText}>Bold</Text>
              </Pressable>
              {(['left', 'center', 'right'] as const).map((align) => (
                <Pressable
                  key={align}
                  style={[styles.toggleBtn, element.align === align && styles.toggleBtnActive]}
                  onPress={() => onChange({ align } as any)}
                >
                  <Ionicons name={`text-${align === 'left' ? 'outline' : align}` as any} size={16} color="#0F172A" />
                </Pressable>
              ))}
            </View>
            <ColorSwatchRow label="Text Color" value={element.color} onChange={(color) => onChange({ color } as any)} />
          </>
        )}

        {element.type === 'shape' && (
          <ColorSwatchRow label="Color" value={element.color} onChange={(color) => onChange({ color } as any)} />
        )}

        {element.type === 'button' && (
          <>
            <Text style={styles.fieldLabel}>Label</Text>
            <TextInput
              style={styles.textInput}
              value={element.label}
              onChangeText={(label) => onChange({ label } as any)}
            />
            <Text style={styles.fieldLabel}>Link (where it goes when clicked)</Text>
            <TextInput
              style={styles.textInput}
              value={element.link ?? ''}
              onChangeText={(link) => onChange({ link: link.trim() ? link : null, linkTargetElementId: link.trim() ? null : element.linkTargetElementId } as any)}
              placeholder="https://example.com, mailto:you@site.com, or /page-slug"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            <Text style={[styles.fieldLabel, { marginTop: -6 }]}>
              {element.link
                ? 'Visitors on your published site will be taken here when they tap this button.'
                : element.linkTargetElementId
                  ? 'Empty — this button links to a product/collection below instead.'
                  : "Empty — this button won't do anything when tapped on your published site."}
            </Text>

            <Text style={[styles.fieldLabel, { marginTop: 4 }]}>Or link to a product/collection on this page</Text>
            {(() => {
              const targets = allElements.filter(
                (el): el is Extract<CanvasElement, { type: 'product' | 'collection' }> => el.type === 'product' || el.type === 'collection'
              );
              if (targets.length === 0) {
                return <Text style={styles.helperText}>Add a Product or Collection to this page to link this button straight to it.</Text>;
              }
              return (
                <View style={styles.rowButtons}>
                  {targets.map((t) => (
                    <LinkTargetChip
                      key={t.id}
                      target={t}
                      selected={element.linkTargetElementId === t.id}
                      onToggle={(selected) => onChange({ linkTargetElementId: selected ? null : t.id, link: selected ? element.link : null } as any)}
                    />
                  ))}
                </View>
              );
            })()}
            {!!onPickProductForLink && (
              <Pressable style={styles.insertProductLinkBtn} onPress={onPickProductForLink}>
                <Ionicons name="pricetag-outline" size={16} color="#FFFFFF" />
                <Text style={styles.insertProductLinkBtnText}>Insert product from catalog…</Text>
              </Pressable>
            )}

            <SliderRow
              label="Corner Radius"
              value={element.borderRadius}
              min={0}
              max={24}
              onChange={(v) => onChange({ borderRadius: v } as any)}
            />
            <GradientPickerRow
              label="Background"
              solidColor={element.backgroundColor}
              onSolidColorChange={(backgroundColor) => onChange({ backgroundColor } as any)}
              gradient={element.backgroundGradient}
              onGradientChange={(backgroundGradient) => onChange({ backgroundGradient } as any)}
            />
            <ColorSwatchRow
              label="Text Color"
              value={element.textColor}
              onChange={(textColor) => onChange({ textColor } as any)}
            />
          </>
        )}

        {element.type === 'icon' && (
          <ColorSwatchRow label="Color" value={element.color} onChange={(color) => onChange({ color } as any)} />
        )}

        {element.type === 'image' && (
          <>
            <Pressable
              style={styles.uploadBtn}
              onPress={async () => {
                const uri = await pickImage();
                if (uri) onChange({ uri } as any);
              }}
            >
              <Ionicons name="cloud-upload-outline" size={18} color="#FFFFFF" />
              <Text style={styles.uploadBtnText}>{element.uri ? 'Replace Image' : 'Choose Image'}</Text>
            </Pressable>
            <ImageBackgroundTools key={element.id} element={element} onChange={onChange} />
          </>
        )}

        {element.type === 'slideshow' && (
          <>
            <Pressable
              style={styles.uploadBtn}
              onPress={async () => {
                const uri = await pickImage();
                if (uri) onChange({ images: [...element.images, uri] } as any);
              }}
            >
              <Ionicons name="add-circle-outline" size={18} color="#FFFFFF" />
              <Text style={styles.uploadBtnText}>Add Slide Image</Text>
            </Pressable>
            <Text style={styles.fieldLabel}>{element.images.length} image(s)</Text>
            <View style={styles.rowButtons}>
              {element.images.map((uri, idx) => (
                <Pressable
                  key={uri + idx}
                  style={styles.removeChip}
                  onPress={() => onChange({ images: element.images.filter((_, i) => i !== idx) } as any)}
                >
                  <Text style={styles.removeChipText}>Slide {idx + 1} ✕</Text>
                </Pressable>
              ))}
            </View>
            <Pressable
              style={[styles.toggleBtn, element.autoPlay && styles.toggleBtnActive, { marginTop: 8 }]}
              onPress={() => onChange({ autoPlay: !element.autoPlay } as any)}
            >
              <Text style={styles.toggleBtnText}>Auto-Play {element.autoPlay ? 'On' : 'Off'}</Text>
            </Pressable>
            <SliderRow
              label="Interval (ms)"
              value={element.intervalMs}
              min={1500}
              max={8000}
              step={100}
              onChange={(v) => onChange({ intervalMs: v } as any)}
            />
          </>
        )}

        {element.type === 'video' && (
          <>
            <Pressable
              style={styles.uploadBtn}
              onPress={async () => {
                const uri = await pickVideo();
                if (uri) onChange({ uri, trimStartMs: 0, trimEndMs: null } as any);
              }}
            >
              <Ionicons name="videocam-outline" size={18} color="#FFFFFF" />
              <Text style={styles.uploadBtnText}>{element.uri ? 'Replace Video' : 'Choose Video'}</Text>
            </Pressable>

            <SliderRow
              label="Trim Start (s)"
              value={element.trimStartMs / 1000}
              min={0}
              max={MAX_TRIM_MS / 1000}
              step={0.5}
              decimals={1}
              onChange={(v) => onChange({ trimStartMs: Math.round(v * 1000) } as any)}
            />
            <Pressable
              style={[styles.toggleBtn, element.trimEndMs == null && styles.toggleBtnActive]}
              onPress={() => onChange({ trimEndMs: element.trimEndMs == null ? element.trimStartMs + 5000 : null } as any)}
            >
              <Text style={styles.toggleBtnText}>
                {element.trimEndMs == null ? 'Playing to natural end' : 'Trimmed end — tap for full clip'}
              </Text>
            </Pressable>
            {element.trimEndMs != null && (
              <SliderRow
                label="Trim End (s)"
                value={element.trimEndMs / 1000}
                min={(element.trimStartMs + 500) / 1000}
                max={MAX_TRIM_MS / 1000}
                step={0.5}
                decimals={1}
                onChange={(v) => onChange({ trimEndMs: Math.round(v * 1000) } as any)}
              />
            )}

            <View style={styles.rowButtons}>
              <Pressable
                style={[styles.toggleBtn, element.muted && styles.toggleBtnActive]}
                onPress={() => onChange({ muted: !element.muted } as any)}
              >
                <Text style={styles.toggleBtnText}>{element.muted ? 'Muted' : 'Sound On'}</Text>
              </Pressable>
              <Pressable
                style={[styles.toggleBtn, element.loop && styles.toggleBtnActive]}
                onPress={() => onChange({ loop: !element.loop } as any)}
              >
                <Text style={styles.toggleBtnText}>Loop {element.loop ? 'On' : 'Off'}</Text>
              </Pressable>
              <Pressable
                style={[styles.toggleBtn, element.autoPlay && styles.toggleBtnActive]}
                // Browsers/native players only allow autoplay when muted -- turning this on
                // forces mute too, rather than silently failing to autoplay later.
                onPress={() => onChange({ autoPlay: !element.autoPlay, ...(!element.autoPlay ? { muted: true } : null) } as any)}
              >
                <Text style={styles.toggleBtnText}>Autoplay {element.autoPlay ? 'On' : 'Off'}</Text>
              </Pressable>
            </View>

            <Text style={styles.fieldLabel}>Preview length</Text>
            <Text style={styles.helperText}>
              Loop just the first few seconds instead of the whole clip -- a short preview instead of the full video.
            </Text>
            <View style={styles.rowButtons}>
              {([null, 3, 5, 10] as const).map((seconds) => (
                <Pressable
                  key={String(seconds)}
                  style={[styles.toggleBtn, element.previewSeconds === seconds && styles.toggleBtnActive]}
                  onPress={() => onChange({ previewSeconds: seconds } as any)}
                >
                  <Text style={styles.toggleBtnText}>{seconds == null ? 'Full clip' : `${seconds}s`}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Sound source (optional)</Text>
            <Pressable
              style={styles.uploadBtn}
              onPress={async () => {
                const uri = await pickVideo();
                if (uri) onChange({ audioUri: uri } as any);
              }}
            >
              <Ionicons name="musical-notes-outline" size={18} color="#FFFFFF" />
              <Text style={styles.uploadBtnText}>{element.audioUri ? 'Replace Sound Source' : 'Pick a Clip for Its Audio'}</Text>
            </Pressable>
            {element.audioUri && (
              <>
                <Pressable style={styles.removeChip} onPress={() => onChange({ audioUri: null } as any)}>
                  <Text style={styles.removeChipText}>Remove sound source ✕</Text>
                </Pressable>
                <SliderRow
                  label="Sound Source Volume"
                  value={element.audioVolume}
                  min={0}
                  max={1}
                  step={0.05}
                  onChange={(v) => onChange({ audioVolume: v } as any)}
                />
              </>
            )}

            <Text style={[styles.fieldLabel, { marginTop: 10 }]}>Captions</Text>
            <Text style={styles.helperText}>
              Real, timed subtitles -- each one shows while playback is between its start and end time, then hides.
            </Text>
            <VideoCaptionsEditor
              captions={element.captions ?? []}
              trimStartMs={element.trimStartMs}
              trimEndMs={element.trimEndMs}
              onChange={(captions) => onChange({ captions } as any)}
            />
          </>
        )}
        {element.type === 'videoEmbed' && (
          <>
            <Text style={styles.fieldLabel}>Real YouTube video</Text>
            <Text style={styles.helperText}>
              Found automatically to match this section — not something you recorded or uploaded.
            </Text>
            {!!element.title && <Text style={styles.videoEmbedTitle}>{element.title}</Text>}
            <Pressable
              style={styles.uploadBtn}
              onPress={() => Linking.openURL(`https://www.youtube.com/watch?v=${element.videoId}`)}
            >
              <Ionicons name="logo-youtube" size={18} color="#FFFFFF" />
              <Text style={styles.uploadBtnText}>Watch on YouTube</Text>
            </Pressable>
          </>
        )}
        {element.type === 'product' && (
          <>
            <ProductInspectorSection element={element} projectId={projectId} publishSlug={publishSlug} sym={sym} />
            <CardTextStyleEditor
              nameFontFamily={element.nameFontFamily}
              nameFontSize={element.nameFontSize}
              priceFontFamily={element.priceFontFamily}
              priceFontSize={element.priceFontSize}
              onChange={(patch) => onChange(patch as any)}
            />
          </>
        )}

        {element.type === 'collection' && (
          <>
            <Text style={styles.fieldLabel}>Collection Name</Text>
            <TextInput style={styles.textInput} value={element.name} onChangeText={(name) => onChange({ name } as any)} />

            <Text style={[styles.fieldLabel, { marginTop: 10 }]}>Products in this collection</Text>
            {(() => {
              const availableProducts = allElements.filter((el): el is Extract<CanvasElement, { type: 'product' }> => el.type === 'product');
              if (availableProducts.length === 0) {
                return <Text style={styles.helperText}>Add a Product to this page first, then come back here to group it into a collection.</Text>;
              }
              const allSelected = availableProducts.every((p) => element.productIds.includes(p.id));
              return (
                <>
                  <Pressable
                    style={styles.collectionSelectAllBtn}
                    onPress={() => onChange({ productIds: allSelected ? [] : availableProducts.map((p) => p.id) } as any)}
                  >
                    <Text style={styles.collectionSelectAllText}>{allSelected ? 'Clear all' : 'Select all'}</Text>
                  </Pressable>
                  {availableProducts.map((p) => (
                    <CollectionProductPickerRow
                      key={p.id}
                      productElement={p}
                      selected={element.productIds.includes(p.id)}
                      onToggle={(selected) =>
                        onChange({
                          productIds: selected ? element.productIds.filter((id) => id !== p.id) : [...element.productIds, p.id],
                        } as any)
                      }
                    />
                  ))}
                </>
              );
            })()}
            <Text style={styles.helperText}>
              Pick 2 or more products built on this page to group them into one browsable collection card on your published site.
            </Text>
            <CardTextStyleEditor
              nameFontFamily={element.nameFontFamily}
              nameFontSize={element.nameFontSize}
              priceFontFamily={element.priceFontFamily}
              priceFontSize={element.priceFontSize}
              onChange={(patch) => onChange(patch as any)}
            />
          </>
        )}

        {element.type === 'section' && (
          <>
            <GradientPickerRow
              label="Background"
              solidColor={element.backgroundColor}
              onSolidColorChange={(backgroundColor) => onChange({ backgroundColor } as any)}
              gradient={element.backgroundGradient}
              onGradientChange={(backgroundGradient) => onChange({ backgroundGradient } as any)}
            />

            {(() => {
              const textChildren = allElements.filter(
                (el): el is Extract<CanvasElement, { type: 'text' }> => element.childIds.includes(el.id) && el.type === 'text'
              );
              return (
                <>
                  <Text style={[styles.fieldLabel, { marginTop: 10 }]}>Text in this section ({textChildren.length})</Text>
                  {textChildren.length === 0 ? (
                    <Text style={styles.helperText}>No text yet -- tap "Add text" below to add your first line.</Text>
                  ) : (
                    <View style={styles.rowButtons}>
                      {textChildren.map((t) => (
                        <View key={t.id} style={styles.sectionChildChip}>
                          <Text style={styles.sectionChildChipText} numberOfLines={1}>
                            {t.text.trim() || 'Text'}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {!!onAddSectionText && (
                      <Pressable style={[styles.insertProductLinkBtn, { flex: 1 }]} onPress={onAddSectionText}>
                        <Ionicons name="add-circle-outline" size={16} color="#FFFFFF" />
                        <Text style={styles.insertProductLinkBtnText}>Add text</Text>
                      </Pressable>
                    )}
                    {!!onAddSectionColumns && (
                      <Pressable style={[styles.insertProductLinkBtn, { flex: 1, backgroundColor: '#4338CA' }]} onPress={onAddSectionColumns}>
                        <Ionicons name="grid-outline" size={16} color="#FFFFFF" />
                        <Text style={styles.insertProductLinkBtnText}>Add columns</Text>
                      </Pressable>
                    )}
                  </View>

                  {textChildren.length > 0 && (
                    <>
                      <Text style={[styles.fieldLabel, { marginTop: 6 }]}>Font for all text in this section</Text>
                      <View style={styles.rowButtons}>
                        {FONT_OPTIONS.map((option) => (
                          <FontChip
                            key={option.id}
                            option={option}
                            selected={(element.textFontFamily ?? 'system') === option.id}
                            onPress={() => {
                              onChange({ textFontFamily: option.id } as any);
                              onApplySectionTextStyle?.({ fontFamily: option.id });
                            }}
                          />
                        ))}
                      </View>
                      <SliderRow
                        label="Text size"
                        value={element.textFontSize ?? 16}
                        min={10}
                        max={48}
                        onChange={(v) => {
                          onChange({ textFontSize: v } as any);
                          onApplySectionTextStyle?.({ fontSize: v });
                        }}
                      />
                    </>
                  )}
                </>
              );
            })()}
          </>
        )}

        {element.type === 'game' && (
          <>
            <Text style={styles.fieldLabel}>Game type</Text>
            <View style={styles.rowButtons}>
              {(
                [
                  ['tictactoe', 'Tic-Tac-Toe'],
                  ['connect4', 'Connect Four'],
                  ['rps', 'Rock Paper Scissors'],
                  ['memory', 'Memory Match'],
                  ['trivia', 'Trivia Quiz'],
                  ['clicker', 'Clicker'],
                  ['simon', 'Simon'],
                  ['flappy', 'Flappy Bird'],
                  ['tetris', 'Tetris'],
                  ['targetrange3d', 'Target Range 3D'],
                  ['basketball', 'Basketball'],
                ] as const
              ).map(([kind, label]) => (
                <Pressable
                  key={kind}
                  style={[styles.toggleBtn, element.kind === kind && styles.toggleBtnActive]}
                  onPress={() => onChange({ kind } as any)}
                >
                  <Text style={styles.toggleBtnText}>{label}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Title</Text>
            <TextInput style={styles.textInput} value={element.title} onChangeText={(title) => onChange({ title } as any)} />

            {(element.kind === 'tictactoe' || element.kind === 'connect4' || element.kind === 'rps') && (
              <Text style={styles.helperText}>
                Ready to play as-is, no setup needed — visitors on your published site can play against the computer, pass the
                device to a friend, or find a real opponent online.
              </Text>
            )}

            {element.kind === 'targetrange3d' && (
              <Text style={styles.helperText}>
                This preview is a simplified 2D stand-in — your published site renders a real interactive 3D shooting range.
              </Text>
            )}

            {element.kind === 'basketball' && (
              <Text style={styles.helperText}>
                This preview is a simplified 2D stand-in — your published site renders a real 3D basketball game with physics-based
                flicking, spin, and rim/backboard collision.
              </Text>
            )}

            {element.kind === 'clicker' && (
              <>
                <Text style={styles.fieldLabel}>Button label</Text>
                <TextInput
                  style={styles.textInput}
                  value={element.clickerLabel}
                  onChangeText={(clickerLabel) => onChange({ clickerLabel } as any)}
                  placeholder="e.g. Tap the ball!"
                />
                <Text style={styles.fieldLabel}>Target taps to win</Text>
                <TextInput
                  style={styles.textInput}
                  value={String(element.clickerTarget)}
                  onChangeText={(text) => {
                    const value = parseInt(text, 10);
                    onChange({ clickerTarget: Number.isFinite(value) && value > 0 ? value : 1 } as any);
                  }}
                  keyboardType="number-pad"
                />
              </>
            )}

            {element.kind === 'memory' && (
              <>
                <Text style={styles.fieldLabel}>Symbols (each appears as one matching pair)</Text>
                <View style={styles.rowButtons}>
                  {element.memorySymbols.map((symbol, i) => (
                    <Pressable
                      key={i}
                      style={[styles.toggleBtn, { flexDirection: 'row', alignItems: 'center', gap: 6 }]}
                      onPress={() => onChange({ memorySymbols: element.memorySymbols.filter((_, j) => j !== i) } as any)}
                    >
                      <Text style={styles.toggleBtnText}>{symbol}</Text>
                      <Ionicons name="close" size={12} color="#64748B" />
                    </Pressable>
                  ))}
                </View>
                <MemorySymbolAdder onAdd={(symbol) => onChange({ memorySymbols: [...element.memorySymbols, symbol] } as any)} />
                <Text style={styles.helperText}>
                  Emoji work great (🍎 🏀 ⭐). Add at least 3 pairs for a real game — the board reshuffles each time it's played.
                </Text>
              </>
            )}

            {element.kind === 'trivia' && (
              <>
                <Text style={styles.fieldLabel}>Questions</Text>
                {element.questions.length === 0 && <Text style={styles.helperText}>No questions yet — add one below.</Text>}
                {element.questions.map((q, qi) => (
                  <View key={qi} style={styles.gameQuestionCard}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <TextInput
                        style={[styles.textInput, { flex: 1 }]}
                        value={q.question}
                        onChangeText={(question) =>
                          onChange({ questions: element.questions.map((x, i) => (i === qi ? { ...x, question } : x)) } as any)
                        }
                        placeholder={`Question ${qi + 1}`}
                        multiline
                      />
                      <Pressable
                        hitSlop={8}
                        onPress={() => onChange({ questions: element.questions.filter((_, i) => i !== qi) } as any)}
                      >
                        <Ionicons name="trash-outline" size={18} color="#DC2626" />
                      </Pressable>
                    </View>
                    {q.options.map((opt, oi) => (
                      <View key={oi} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <Pressable
                          hitSlop={8}
                          onPress={() =>
                            onChange({ questions: element.questions.map((x, i) => (i === qi ? { ...x, correctIndex: oi } : x)) } as any)
                          }
                        >
                          <Ionicons
                            name={q.correctIndex === oi ? 'checkmark-circle' : 'ellipse-outline'}
                            size={18}
                            color={q.correctIndex === oi ? '#16A34A' : '#94A3B8'}
                          />
                        </Pressable>
                        <TextInput
                          style={[styles.textInput, { flex: 1, marginBottom: 0 }]}
                          value={opt}
                          onChangeText={(text) =>
                            onChange({
                              questions: element.questions.map((x, i) =>
                                i === qi ? { ...x, options: x.options.map((o, j) => (j === oi ? text : o)) } : x
                              ),
                            } as any)
                          }
                          placeholder={`Option ${oi + 1}`}
                        />
                        {q.options.length > 2 && (
                          <Pressable
                            hitSlop={8}
                            onPress={() =>
                              onChange({
                                questions: element.questions.map((x, i) =>
                                  i === qi
                                    ? {
                                        ...x,
                                        options: x.options.filter((_, j) => j !== oi),
                                        correctIndex: x.correctIndex >= oi && x.correctIndex > 0 ? x.correctIndex - 1 : x.correctIndex,
                                      }
                                    : x
                                ),
                              } as any)
                            }
                          >
                            <Ionicons name="close" size={16} color="#94A3B8" />
                          </Pressable>
                        )}
                      </View>
                    ))}
                    {q.options.length < 4 && (
                      <Pressable
                        onPress={() =>
                          onChange({ questions: element.questions.map((x, i) => (i === qi ? { ...x, options: [...x.options, ''] } : x)) } as any)
                        }
                      >
                        <Text style={styles.addOptionText}>+ Add option</Text>
                      </Pressable>
                    )}
                  </View>
                ))}
                <Pressable
                  style={styles.uploadBtn}
                  onPress={() =>
                    onChange({
                      questions: [...element.questions, { question: '', options: ['', ''], correctIndex: 0 }],
                    } as any)
                  }
                >
                  <Ionicons name="add-circle-outline" size={18} color="#FFFFFF" />
                  <Text style={styles.uploadBtnText}>Add question</Text>
                </Pressable>
                <Text style={styles.helperText}>Tap the circle beside an option to mark it as the correct answer.</Text>
              </>
            )}
          </>
        )}

        {element.type === 'widget' && (
          <>
            <Text style={styles.fieldLabel}>Title</Text>
            <TextInput style={styles.textInput} value={element.title} onChangeText={(title) => onChange({ title } as any)} />

            <Text style={styles.fieldLabel}>Kind</Text>
            <View style={styles.rowButtons}>
              {(
                [
                  ['clock', 'Clock'],
                  ['countdown', 'Countdown'],
                  ['stopwatch', 'Stopwatch'],
                  ['calculator', 'Calculator'],
                  ['unitconverter', 'Unit Converter'],
                ] as [WidgetKind, string][]
              ).map(([kind, label]) => (
                <Pressable
                  key={kind}
                  style={[styles.toggleBtn, element.kind === kind && styles.toggleBtnActive]}
                  onPress={() => onChange({ kind } as any)}
                >
                  <Text style={styles.toggleBtnText}>{label}</Text>
                </Pressable>
              ))}
            </View>

            {element.kind === 'clock' && (
              <>
                <Text style={styles.fieldLabel}>Style</Text>
                <View style={styles.rowButtons}>
                  {(['digital', 'analog'] as const).map((style) => (
                    <Pressable
                      key={style}
                      style={[styles.toggleBtn, element.style === style && styles.toggleBtnActive]}
                      onPress={() => onChange({ style } as any)}
                    >
                      <Text style={styles.toggleBtnText}>{style === 'digital' ? 'Digital' : 'Analog'}</Text>
                    </Pressable>
                  ))}
                </View>

                <Text style={styles.fieldLabel}>Timezones ({element.timezones.length === 0 ? 'shows your local time' : `${element.timezones.length} shown`})</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
                  {element.timezones.map((tz, i) => (
                    <Pressable
                      key={i}
                      style={{ alignItems: 'center', width: 76 }}
                      onPress={() => onChange({ timezones: element.timezones.filter((_, j) => j !== i) } as any)}
                    >
                      <View>
                        {element.style === 'analog' ? (
                          <AnalogClockFace tz={tz.ianaTimezone} size={56} accent={WIDGET_THEME.clock.accent} />
                        ) : (
                          <View
                            style={{
                              width: 72,
                              paddingVertical: 8,
                              borderRadius: 10,
                              backgroundColor: WIDGET_THEME.clock.soft,
                              alignItems: 'center',
                            }}
                          >
                            <DigitalClockFace label="" tz={tz.ianaTimezone} compact accent={WIDGET_THEME.clock.accent} />
                          </View>
                        )}
                        <View
                          style={{
                            position: 'absolute',
                            top: -6,
                            right: -6,
                            width: 18,
                            height: 18,
                            borderRadius: 9,
                            backgroundColor: '#0F172A',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Ionicons name="close" size={11} color="#FFFFFF" />
                        </View>
                      </View>
                      <Text style={{ fontSize: 11, color: '#64748B', fontWeight: '600', marginTop: 4 }} numberOfLines={1}>
                        {tz.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <WidgetTimezoneAdder
                  existing={element.timezones}
                  onAdd={(tz) => onChange({ timezones: [...element.timezones, tz] } as any)}
                />
                <Text style={styles.helperText}>
                  One timezone shows a simple clock; add 2 or more for a real world clock. This is a genuinely live, ticking clock
                  on your published site — never a static image.
                </Text>
              </>
            )}

            {element.kind === 'countdown' && (
              <>
                <Text style={styles.fieldLabel}>Counting down to (label)</Text>
                <TextInput
                  style={styles.textInput}
                  value={element.countdownLabel}
                  onChangeText={(countdownLabel) => onChange({ countdownLabel } as any)}
                  placeholder="e.g. Launch Day"
                />
                <CountdownTargetEditor
                  targetIso={element.countdownTargetIso}
                  onChange={(countdownTargetIso) => onChange({ countdownTargetIso } as any)}
                />
                <Text style={styles.helperText}>
                  A real, live countdown that ticks down every second on your published site — never a static number.
                </Text>
              </>
            )}

            {element.kind === 'stopwatch' && (
              <Text style={styles.helperText}>
                A real interactive start/pause/lap/reset stopwatch. Visitors control it themselves — no setup needed here.
              </Text>
            )}

            {element.kind === 'calculator' && (
              <Text style={styles.helperText}>A real working four-function calculator. No setup needed here.</Text>
            )}

            {element.kind === 'unitconverter' && (
              <Text style={styles.helperText}>
                A real working length/weight/temperature/volume converter. No setup needed here.
              </Text>
            )}
          </>
        )}

        {element.type === 'customWidget' && (
          <>
            <Text style={styles.fieldLabel}>Title</Text>
            <TextInput style={styles.textInput} value={element.title} onChangeText={(title) => onChange({ title } as any)} />
            <CustomWidgetGenerator element={element} siteName={siteName} onChange={onChange} />
          </>
        )}
      </ScrollView>
    </View>
  );
}

function MemorySymbolAdder({ onAdd }: { onAdd: (symbol: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
      <TextInput
        style={[styles.textInput, { flex: 1, marginBottom: 0 }]}
        value={value}
        onChangeText={setValue}
        placeholder="e.g. 🏀"
      />
      <Pressable
        style={styles.smallAddBtn}
        onPress={() => {
          if (!value.trim()) return;
          onAdd(value.trim());
          setValue('');
        }}
      >
        <Text style={styles.smallAddBtnText}>Add</Text>
      </Pressable>
    </View>
  );
}

// Curated real city/IANA-zone pairs, each tagged with its real country -- a free-text IANA
// input would be error-prone (most people don't know "Europe/London"-style zone id syntax),
// so this is filtered by typed city OR country name instead (e.g. typing "Japan" surfaces
// Tokyo). Every country from COUNTRY_DIAL_CODES (src/data/countryCodes.ts, the same list the
// phone-code picker uses) has at least one real, correct IANA zone here.
interface TimezoneOption extends WidgetTimezone {
  country: string;
}

const COMMON_TIMEZONES: TimezoneOption[] = [
  { label: 'New York', ianaTimezone: 'America/New_York', country: 'United States' },
  { label: 'Los Angeles', ianaTimezone: 'America/Los_Angeles', country: 'United States' },
  { label: 'Chicago', ianaTimezone: 'America/Chicago', country: 'United States' },
  { label: 'Denver', ianaTimezone: 'America/Denver', country: 'United States' },
  { label: 'Honolulu', ianaTimezone: 'Pacific/Honolulu', country: 'United States' },
  { label: 'Anchorage', ianaTimezone: 'America/Anchorage', country: 'United States' },
  { label: 'Toronto', ianaTimezone: 'America/Toronto', country: 'Canada' },
  { label: 'Dublin', ianaTimezone: 'Europe/Dublin', country: 'Ireland' },
  { label: 'London', ianaTimezone: 'Europe/London', country: 'United Kingdom' },
  { label: 'Sydney', ianaTimezone: 'Australia/Sydney', country: 'Australia' },
  { label: 'Melbourne', ianaTimezone: 'Australia/Melbourne', country: 'Australia' },
  { label: 'Perth', ianaTimezone: 'Australia/Perth', country: 'Australia' },
  { label: 'Auckland', ianaTimezone: 'Pacific/Auckland', country: 'New Zealand' },
  { label: 'Mumbai', ianaTimezone: 'Asia/Kolkata', country: 'India' },
  { label: 'Karachi', ianaTimezone: 'Asia/Karachi', country: 'Pakistan' },
  { label: 'Dhaka', ianaTimezone: 'Asia/Dhaka', country: 'Bangladesh' },
  { label: 'Colombo', ianaTimezone: 'Asia/Colombo', country: 'Sri Lanka' },
  { label: 'Kathmandu', ianaTimezone: 'Asia/Kathmandu', country: 'Nepal' },
  { label: 'Shanghai', ianaTimezone: 'Asia/Shanghai', country: 'China' },
  { label: 'Tokyo', ianaTimezone: 'Asia/Tokyo', country: 'Japan' },
  { label: 'Seoul', ianaTimezone: 'Asia/Seoul', country: 'South Korea' },
  { label: 'Taipei', ianaTimezone: 'Asia/Taipei', country: 'Taiwan' },
  { label: 'Hong Kong', ianaTimezone: 'Asia/Hong_Kong', country: 'Hong Kong' },
  { label: 'Macau', ianaTimezone: 'Asia/Macau', country: 'Macau' },
  { label: 'Singapore', ianaTimezone: 'Asia/Singapore', country: 'Singapore' },
  { label: 'Kuala Lumpur', ianaTimezone: 'Asia/Kuala_Lumpur', country: 'Malaysia' },
  { label: 'Jakarta', ianaTimezone: 'Asia/Jakarta', country: 'Indonesia' },
  { label: 'Manila', ianaTimezone: 'Asia/Manila', country: 'Philippines' },
  { label: 'Bangkok', ianaTimezone: 'Asia/Bangkok', country: 'Thailand' },
  { label: 'Ho Chi Minh City', ianaTimezone: 'Asia/Ho_Chi_Minh', country: 'Vietnam' },
  { label: 'Phnom Penh', ianaTimezone: 'Asia/Phnom_Penh', country: 'Cambodia' },
  { label: 'Vientiane', ianaTimezone: 'Asia/Vientiane', country: 'Laos' },
  { label: 'Yangon', ianaTimezone: 'Asia/Yangon', country: 'Myanmar' },
  { label: 'Bandar Seri Begawan', ianaTimezone: 'Asia/Brunei', country: 'Brunei' },
  { label: 'Ulaanbaatar', ianaTimezone: 'Asia/Ulaanbaatar', country: 'Mongolia' },
  { label: 'Berlin', ianaTimezone: 'Europe/Berlin', country: 'Germany' },
  { label: 'Paris', ianaTimezone: 'Europe/Paris', country: 'France' },
  { label: 'Rome', ianaTimezone: 'Europe/Rome', country: 'Italy' },
  { label: 'Madrid', ianaTimezone: 'Europe/Madrid', country: 'Spain' },
  { label: 'Lisbon', ianaTimezone: 'Europe/Lisbon', country: 'Portugal' },
  { label: 'Amsterdam', ianaTimezone: 'Europe/Amsterdam', country: 'Netherlands' },
  { label: 'Brussels', ianaTimezone: 'Europe/Brussels', country: 'Belgium' },
  { label: 'Luxembourg City', ianaTimezone: 'Europe/Luxembourg', country: 'Luxembourg' },
  { label: 'Zurich', ianaTimezone: 'Europe/Zurich', country: 'Switzerland' },
  { label: 'Vienna', ianaTimezone: 'Europe/Vienna', country: 'Austria' },
  { label: 'Copenhagen', ianaTimezone: 'Europe/Copenhagen', country: 'Denmark' },
  { label: 'Stockholm', ianaTimezone: 'Europe/Stockholm', country: 'Sweden' },
  { label: 'Oslo', ianaTimezone: 'Europe/Oslo', country: 'Norway' },
  { label: 'Helsinki', ianaTimezone: 'Europe/Helsinki', country: 'Finland' },
  { label: 'Reykjavik', ianaTimezone: 'Atlantic/Reykjavik', country: 'Iceland' },
  { label: 'Warsaw', ianaTimezone: 'Europe/Warsaw', country: 'Poland' },
  { label: 'Prague', ianaTimezone: 'Europe/Prague', country: 'Czech Republic' },
  { label: 'Bratislava', ianaTimezone: 'Europe/Bratislava', country: 'Slovakia' },
  { label: 'Budapest', ianaTimezone: 'Europe/Budapest', country: 'Hungary' },
  { label: 'Bucharest', ianaTimezone: 'Europe/Bucharest', country: 'Romania' },
  { label: 'Sofia', ianaTimezone: 'Europe/Sofia', country: 'Bulgaria' },
  { label: 'Athens', ianaTimezone: 'Europe/Athens', country: 'Greece' },
  { label: 'Zagreb', ianaTimezone: 'Europe/Zagreb', country: 'Croatia' },
  { label: 'Ljubljana', ianaTimezone: 'Europe/Ljubljana', country: 'Slovenia' },
  { label: 'Belgrade', ianaTimezone: 'Europe/Belgrade', country: 'Serbia' },
  { label: 'Sarajevo', ianaTimezone: 'Europe/Sarajevo', country: 'Bosnia and Herzegovina' },
  { label: 'Skopje', ianaTimezone: 'Europe/Skopje', country: 'North Macedonia' },
  { label: 'Podgorica', ianaTimezone: 'Europe/Podgorica', country: 'Montenegro' },
  { label: 'Tirana', ianaTimezone: 'Europe/Tirane', country: 'Albania' },
  { label: 'Tallinn', ianaTimezone: 'Europe/Tallinn', country: 'Estonia' },
  { label: 'Riga', ianaTimezone: 'Europe/Riga', country: 'Latvia' },
  { label: 'Vilnius', ianaTimezone: 'Europe/Vilnius', country: 'Lithuania' },
  { label: 'Kyiv', ianaTimezone: 'Europe/Kyiv', country: 'Ukraine' },
  { label: 'Minsk', ianaTimezone: 'Europe/Minsk', country: 'Belarus' },
  { label: 'Chisinau', ianaTimezone: 'Europe/Chisinau', country: 'Moldova' },
  { label: 'Moscow', ianaTimezone: 'Europe/Moscow', country: 'Russia' },
  { label: 'Almaty', ianaTimezone: 'Asia/Almaty', country: 'Kazakhstan' },
  { label: 'Tbilisi', ianaTimezone: 'Asia/Tbilisi', country: 'Georgia' },
  { label: 'Yerevan', ianaTimezone: 'Asia/Yerevan', country: 'Armenia' },
  { label: 'Baku', ianaTimezone: 'Asia/Baku', country: 'Azerbaijan' },
  { label: 'Istanbul', ianaTimezone: 'Europe/Istanbul', country: 'Turkey' },
  { label: 'Nicosia', ianaTimezone: 'Asia/Nicosia', country: 'Cyprus' },
  { label: 'Valletta', ianaTimezone: 'Europe/Malta', country: 'Malta' },
  { label: 'Jerusalem', ianaTimezone: 'Asia/Jerusalem', country: 'Israel' },
  { label: 'Gaza', ianaTimezone: 'Asia/Gaza', country: 'Palestine' },
  { label: 'Amman', ianaTimezone: 'Asia/Amman', country: 'Jordan' },
  { label: 'Beirut', ianaTimezone: 'Asia/Beirut', country: 'Lebanon' },
  { label: 'Damascus', ianaTimezone: 'Asia/Damascus', country: 'Syria' },
  { label: 'Baghdad', ianaTimezone: 'Asia/Baghdad', country: 'Iraq' },
  { label: 'Riyadh', ianaTimezone: 'Asia/Riyadh', country: 'Saudi Arabia' },
  { label: 'Dubai', ianaTimezone: 'Asia/Dubai', country: 'United Arab Emirates' },
  { label: 'Doha', ianaTimezone: 'Asia/Qatar', country: 'Qatar' },
  { label: 'Manama', ianaTimezone: 'Asia/Bahrain', country: 'Bahrain' },
  { label: 'Kuwait City', ianaTimezone: 'Asia/Kuwait', country: 'Kuwait' },
  { label: 'Muscat', ianaTimezone: 'Asia/Muscat', country: 'Oman' },
  { label: 'Sanaa', ianaTimezone: 'Asia/Aden', country: 'Yemen' },
  { label: 'Tehran', ianaTimezone: 'Asia/Tehran', country: 'Iran' },
  { label: 'Kabul', ianaTimezone: 'Asia/Kabul', country: 'Afghanistan' },
  { label: 'Cairo', ianaTimezone: 'Africa/Cairo', country: 'Egypt' },
  { label: 'Tripoli', ianaTimezone: 'Africa/Tripoli', country: 'Libya' },
  { label: 'Tunis', ianaTimezone: 'Africa/Tunis', country: 'Tunisia' },
  { label: 'Algiers', ianaTimezone: 'Africa/Algiers', country: 'Algeria' },
  { label: 'Casablanca', ianaTimezone: 'Africa/Casablanca', country: 'Morocco' },
  { label: 'Khartoum', ianaTimezone: 'Africa/Khartoum', country: 'Sudan' },
  { label: 'Johannesburg', ianaTimezone: 'Africa/Johannesburg', country: 'South Africa' },
  { label: 'Lagos', ianaTimezone: 'Africa/Lagos', country: 'Nigeria' },
  { label: 'Accra', ianaTimezone: 'Africa/Accra', country: 'Ghana' },
  { label: 'Nairobi', ianaTimezone: 'Africa/Nairobi', country: 'Kenya' },
  { label: 'Dar es Salaam', ianaTimezone: 'Africa/Dar_es_Salaam', country: 'Tanzania' },
  { label: 'Kampala', ianaTimezone: 'Africa/Kampala', country: 'Uganda' },
  { label: 'Addis Ababa', ianaTimezone: 'Africa/Addis_Ababa', country: 'Ethiopia' },
  { label: 'Mogadishu', ianaTimezone: 'Africa/Mogadishu', country: 'Somalia' },
  { label: 'Kigali', ianaTimezone: 'Africa/Kigali', country: 'Rwanda' },
  { label: 'Lusaka', ianaTimezone: 'Africa/Lusaka', country: 'Zambia' },
  { label: 'Harare', ianaTimezone: 'Africa/Harare', country: 'Zimbabwe' },
  { label: 'Gaborone', ianaTimezone: 'Africa/Gaborone', country: 'Botswana' },
  { label: 'Windhoek', ianaTimezone: 'Africa/Windhoek', country: 'Namibia' },
  { label: 'Maputo', ianaTimezone: 'Africa/Maputo', country: 'Mozambique' },
  { label: 'Luanda', ianaTimezone: 'Africa/Luanda', country: 'Angola' },
  { label: 'Douala', ianaTimezone: 'Africa/Douala', country: 'Cameroon' },
  { label: 'Dakar', ianaTimezone: 'Africa/Dakar', country: 'Senegal' },
  { label: 'Abidjan', ianaTimezone: 'Africa/Abidjan', country: 'Ivory Coast' },
  { label: 'Kinshasa', ianaTimezone: 'Africa/Kinshasa', country: 'Democratic Republic of the Congo' },
  { label: 'Mexico City', ianaTimezone: 'America/Mexico_City', country: 'Mexico' },
  { label: 'Guatemala City', ianaTimezone: 'America/Guatemala', country: 'Guatemala' },
  { label: 'Belize City', ianaTimezone: 'America/Belize', country: 'Belize' },
  { label: 'Tegucigalpa', ianaTimezone: 'America/Tegucigalpa', country: 'Honduras' },
  { label: 'San Salvador', ianaTimezone: 'America/El_Salvador', country: 'El Salvador' },
  { label: 'Managua', ianaTimezone: 'America/Managua', country: 'Nicaragua' },
  { label: 'San Jose', ianaTimezone: 'America/Costa_Rica', country: 'Costa Rica' },
  { label: 'Panama City', ianaTimezone: 'America/Panama', country: 'Panama' },
  { label: 'Havana', ianaTimezone: 'America/Havana', country: 'Cuba' },
  { label: 'Kingston', ianaTimezone: 'America/Jamaica', country: 'Jamaica' },
  { label: 'Port-au-Prince', ianaTimezone: 'America/Port-au-Prince', country: 'Haiti' },
  { label: 'Santo Domingo', ianaTimezone: 'America/Santo_Domingo', country: 'Dominican Republic' },
  { label: 'Port of Spain', ianaTimezone: 'America/Port_of_Spain', country: 'Trinidad and Tobago' },
  { label: 'Nassau', ianaTimezone: 'America/Nassau', country: 'Bahamas' },
  { label: 'Bridgetown', ianaTimezone: 'America/Barbados', country: 'Barbados' },
  { label: 'Bogota', ianaTimezone: 'America/Bogota', country: 'Colombia' },
  { label: 'Caracas', ianaTimezone: 'America/Caracas', country: 'Venezuela' },
  { label: 'Quito', ianaTimezone: 'America/Guayaquil', country: 'Ecuador' },
  { label: 'Lima', ianaTimezone: 'America/Lima', country: 'Peru' },
  { label: 'La Paz', ianaTimezone: 'America/La_Paz', country: 'Bolivia' },
  { label: 'Santiago', ianaTimezone: 'America/Santiago', country: 'Chile' },
  { label: 'Buenos Aires', ianaTimezone: 'America/Argentina/Buenos_Aires', country: 'Argentina' },
  { label: 'Montevideo', ianaTimezone: 'America/Montevideo', country: 'Uruguay' },
  { label: 'Asuncion', ianaTimezone: 'America/Asuncion', country: 'Paraguay' },
  { label: 'São Paulo', ianaTimezone: 'America/Sao_Paulo', country: 'Brazil' },
  { label: 'Georgetown', ianaTimezone: 'America/Guyana', country: 'Guyana' },
  { label: 'Paramaribo', ianaTimezone: 'America/Paramaribo', country: 'Suriname' },
  { label: 'Suva', ianaTimezone: 'Pacific/Fiji', country: 'Fiji' },
  { label: 'Port Moresby', ianaTimezone: 'Pacific/Port_Moresby', country: 'Papua New Guinea' },
  { label: 'Apia', ianaTimezone: 'Pacific/Apia', country: 'Samoa' },
  { label: "Nuku'alofa", ianaTimezone: 'Pacific/Tongatapu', country: 'Tonga' },
  { label: 'UTC', ianaTimezone: 'UTC', country: 'UTC' },
];

function WidgetTimezoneAdder({ existing, onAdd }: { existing: WidgetTimezone[]; onAdd: (tz: WidgetTimezone) => void }) {
  const [query, setQuery] = useState('');
  const existingZones = new Set(existing.map((tz) => tz.ianaTimezone));
  const norm = query.trim().toLowerCase();
  const matches = norm
    ? COMMON_TIMEZONES.filter(
        (tz) => !existingZones.has(tz.ianaTimezone) && (tz.label.toLowerCase().includes(norm) || tz.country.toLowerCase().includes(norm))
      ).slice(0, 8)
    : [];

  return (
    <View style={{ marginBottom: 10 }}>
      <TextInput
        style={[styles.textInput, { marginBottom: matches.length ? 4 : 10 }]}
        value={query}
        onChangeText={setQuery}
        placeholder="Search a city or country to add (e.g. Tokyo or Japan)"
      />
      {matches.map((tz) => (
        <Pressable
          key={tz.ianaTimezone}
          style={{ paddingVertical: 8, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: '#F1F5F9', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
          onPress={() => {
            onAdd({ label: tz.label, ianaTimezone: tz.ianaTimezone });
            setQuery('');
          }}
        >
          <Text style={{ fontSize: 13, color: '#0F172A', fontWeight: '600' }}>{tz.label}</Text>
          {tz.country !== tz.label && <Text style={{ fontSize: 12, color: '#64748B' }}>{tz.country}</Text>}
        </Pressable>
      ))}
    </View>
  );
}

// "Days/hours from now" entry (same convention as DiscountCodesScreen's startsInDays/
// expiresInDays fields) rather than a native date-picker dependency -- computes and stores a
// real absolute ISO timestamp immediately, which is what actually drives the live countdown.
function CountdownTargetEditor({ targetIso, onChange }: { targetIso: string; onChange: (iso: string) => void }) {
  const target = Date.parse(targetIso || '');
  const hasTarget = Number.isFinite(target);
  const remainingMs = hasTarget ? target - Date.now() : 0;
  const remainingDays = hasTarget ? Math.max(0, Math.floor(remainingMs / 86400000)) : 0;
  const remainingHours = hasTarget ? Math.max(0, Math.floor((remainingMs % 86400000) / 3600000)) : 0;
  const [days, setDays] = useState(String(remainingDays));
  const [hours, setHours] = useState(String(remainingHours));

  const apply = (nextDays: string, nextHours: string) => {
    const d = parseInt(nextDays, 10);
    const h = parseInt(nextHours, 10);
    const totalMs = (Number.isFinite(d) ? d : 0) * 86400000 + (Number.isFinite(h) ? h : 0) * 3600000;
    onChange(new Date(Date.now() + totalMs).toISOString());
  };

  return (
    <View style={{ marginBottom: 10 }}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={styles.helperText}>Days from now</Text>
          <TextInput
            style={styles.textInput}
            value={days}
            onChangeText={(v) => {
              setDays(v);
              apply(v, hours);
            }}
            keyboardType="number-pad"
            placeholder="0"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.helperText}>Hours from now</Text>
          <TextInput
            style={styles.textInput}
            value={hours}
            onChangeText={(v) => {
              setHours(v);
              apply(days, v);
            }}
            keyboardType="number-pad"
            placeholder="0"
          />
        </View>
      </View>
      {hasTarget && (
        <Text style={styles.helperText}>Ends: {new Date(target).toLocaleString()}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  title: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  headerActions: { flexDirection: 'row', gap: 14 },
  iconBtn: { padding: 2 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: '#64748B', marginBottom: 6, marginTop: 4 },
  helperText: { fontSize: 12, color: '#94A3B8', marginBottom: 10, lineHeight: 17 },
  videoEmbedTitle: { fontSize: 13, fontWeight: '600', color: '#0F172A', marginBottom: 10 },
  textInput: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    marginBottom: 10,
  },
  rowButtons: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 10 },
  toggleBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  toggleBtnActive: { backgroundColor: '#DBEAFE' },
  toggleBtnText: { fontSize: 12, fontWeight: '600', color: '#0F172A' },
  collectionSelectAllBtn: { alignSelf: 'flex-end', paddingVertical: 6, paddingHorizontal: 4, marginBottom: 4 },
  collectionSelectAllText: { fontSize: 13, fontWeight: '700', color: '#2563EB' },
  collectionProductRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  collectionProductRowActive: { backgroundColor: '#EFF6FF', borderColor: '#2563EB' },
  collectionProductRowText: { fontSize: 15, fontWeight: '700', color: '#0F172A', flexShrink: 1 },
  saveStockBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#2563EB',
    borderRadius: 10,
    paddingVertical: 12,
    marginTop: 12,
  },
  saveStockBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
  insertProductLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#16A34A',
    borderRadius: 10,
    paddingVertical: 12,
    marginTop: 4,
    marginBottom: 10,
  },
  insertProductLinkBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
  sectionChildChip: { backgroundColor: '#F1F5F9', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, maxWidth: 160 },
  sectionChildChipText: { fontSize: 12, fontWeight: '600', color: '#334155' },
  uploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#111827',
    borderRadius: 10,
    paddingVertical: 12,
    marginBottom: 10,
  },
  uploadBtnText: { color: '#FFFFFF', fontWeight: '600' },
  productSummaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  productSummaryThumb: { width: 44, height: 44, borderRadius: 8, backgroundColor: '#F1F5F9' },
  productSummaryName: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  productSummaryPrice: { fontSize: 13, color: '#4338CA', fontWeight: '700', marginTop: 2 },
  gameQuestionCard: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
    backgroundColor: '#F8FAFC',
  },
  addOptionText: { color: '#2563EB', fontWeight: '600', fontSize: 13, marginTop: 2, marginBottom: 4 },
  smallAddBtn: { backgroundColor: '#111827', borderRadius: 8, paddingHorizontal: 16, justifyContent: 'center' },
  smallAddBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#16A34A',
    borderRadius: 10,
    paddingVertical: 12,
    marginTop: 4,
    marginBottom: 12,
  },
  confirmBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
  removeChip: { backgroundColor: '#FEE2E2', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  removeChipText: { fontSize: 11, color: '#B91C1C', fontWeight: '600' },
  captionCard: { backgroundColor: '#F8FAFC', borderRadius: 10, padding: 10, marginTop: 8, borderWidth: 1, borderColor: '#E2E8F0' },
  captionCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  captionCardTitle: { fontSize: 12, fontWeight: '700', color: '#334155' },
  variantOptionCard: { backgroundColor: '#F8FAFC', borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0', padding: 10, marginBottom: 10 },
  variantRow: { backgroundColor: '#F8FAFC', borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0', padding: 10, marginBottom: 8 },
  variantRowLabel: { fontSize: 12, fontWeight: '700', color: '#0F172A' },
  fontRow: { gap: 8, paddingBottom: 10, paddingRight: 4 },
  fontChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    minWidth: 84,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fontChipActive: { backgroundColor: '#DBEAFE' },
  fontChipText: { fontSize: 14, color: '#0F172A' },
  fontChipTextActive: { color: '#2563EB', fontWeight: '700' },
});
