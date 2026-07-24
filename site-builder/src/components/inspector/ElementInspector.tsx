import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator, Linking } from 'react-native';
import { showAlert } from '@/utils/alert';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { CanvasElement, ImageElement, ProductVariantOption, ProductVariant, WidgetKind, WidgetTimezone } from '@/types';
import { regenerateVariants, variantLabelFor } from '@/utils/productVariants';
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

const MAX_PRODUCT_IMAGES = 7;

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
}

// Pushes a product's in-stock switch + current quantity straight to the live storeInventory
// doc (if the site's already published), so a seller's change takes effect immediately
// instead of waiting for a full republish. Local to this file since nothing else needs it.
function ProductLiveStockSave({
  projectId,
  elementId,
  inStock,
  stockQuantity,
  published,
}: {
  projectId: string;
  elementId: string;
  inStock: boolean;
  stockQuantity: number | null;
  published: boolean;
}) {
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await updateProductStock(projectId, elementId, inStock, stockQuantity);
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

export default function ElementInspector({ element, allElements, onChange, onDelete, onBringToFront, onClose, projectId, publishSlug, siteName }: Props) {
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
                  {targets.map((t) => {
                    const selected = element.linkTargetElementId === t.id;
                    const label = t.type === 'product' ? t.name || 'Untitled product' : t.name || 'Untitled collection';
                    return (
                      <Pressable
                        key={t.id}
                        style={[styles.toggleBtn, selected && styles.toggleBtnActive]}
                        onPress={() => onChange({ linkTargetElementId: selected ? null : t.id, link: selected ? element.link : null } as any)}
                      >
                        <Text style={styles.toggleBtnText}>
                          {t.type === 'product' ? '🛍️ ' : '📦 '}
                          {label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              );
            })()}

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
              label="Trim Start (ms)"
              value={element.trimStartMs}
              min={0}
              max={MAX_TRIM_MS}
              step={500}
              onChange={(v) => onChange({ trimStartMs: v } as any)}
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
                label="Trim End (ms)"
                value={element.trimEndMs}
                min={element.trimStartMs + 500}
                max={MAX_TRIM_MS}
                step={500}
                onChange={(v) => onChange({ trimEndMs: v } as any)}
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
            <Text style={styles.fieldLabel}>What is this?</Text>
            <View style={styles.rowButtons}>
              <Pressable
                style={[styles.toggleBtn, element.saleType === 'product' && styles.toggleBtnActive]}
                onPress={() => onChange({ saleType: 'product' } as any)}
              >
                <Text style={styles.toggleBtnText}>🛍️ Physical product</Text>
              </Pressable>
              <Pressable
                style={[styles.toggleBtn, element.saleType === 'digital' && styles.toggleBtnActive]}
                onPress={() => onChange({ saleType: 'digital' } as any)}
              >
                <Text style={styles.toggleBtnText}>💾 Digital product</Text>
              </Pressable>
              <Pressable
                style={[styles.toggleBtn, element.saleType === 'service' && styles.toggleBtnActive]}
                onPress={() => onChange({ saleType: 'service' } as any)}
              >
                <Text style={styles.toggleBtnText}>📅 Real-life service</Text>
              </Pressable>
            </View>
            <Text style={styles.fieldLabel}>
              {element.saleType === 'service'
                ? 'Buyers pick a date/time and pay once to reserve it — a real one-time booking payment, never a recurring charge.'
                : element.saleType === 'digital'
                  ? 'Buyers pay once and you deliver the file or link yourself afterward — no shipping, no pickup/delivery choice needed.'
                  : 'Buyers add it to their cart and pay once — you choose pickup, delivery, or both below.'}
            </Text>

            <Text style={styles.fieldLabel}>Name</Text>
            <TextInput style={styles.textInput} value={element.name} onChangeText={(name) => onChange({ name } as any)} />

            <Text style={styles.fieldLabel}>Description</Text>
            <TextInput
              style={styles.textInput}
              value={element.description}
              onChangeText={(description) => onChange({ description } as any)}
              multiline
            />

            <Text style={styles.fieldLabel}>Price ({sym.trim()})</Text>
            <TextInput
              style={styles.textInput}
              value={String(element.priceUsd)}
              keyboardType="decimal-pad"
              onChangeText={(text) => {
                const value = parseFloat(text);
                onChange({ priceUsd: Number.isFinite(value) ? Math.max(0, value) : 0 } as any);
              }}
            />

            <Text style={styles.fieldLabel}>Compare-at price (optional)</Text>
            <TextInput
              style={styles.textInput}
              value={element.compareAtPriceUsd != null ? String(element.compareAtPriceUsd) : ''}
              placeholder="e.g. 79.00"
              placeholderTextColor="#94A3B8"
              keyboardType="decimal-pad"
              onChangeText={(text) => {
                if (!text.trim()) {
                  onChange({ compareAtPriceUsd: null } as any);
                  return;
                }
                const value = parseFloat(text);
                onChange({ compareAtPriceUsd: Number.isFinite(value) ? Math.max(0, value) : null } as any);
              }}
            />
            <Text style={styles.helperText}>
              Shown to buyers as a crossed-out "was" price next to your real price — leave blank to not show one. Doesn't change
              what's actually charged.
            </Text>

            <Text style={styles.fieldLabel}>Your cost (optional, private)</Text>
            <TextInput
              style={styles.textInput}
              value={element.costUsd != null ? String(element.costUsd) : ''}
              placeholder="e.g. 22.00"
              placeholderTextColor="#94A3B8"
              keyboardType="decimal-pad"
              onChangeText={(text) => {
                if (!text.trim()) {
                  onChange({ costUsd: null } as any);
                  return;
                }
                const value = parseFloat(text);
                onChange({ costUsd: Number.isFinite(value) ? Math.max(0, value) : null } as any);
              }}
            />
            <Text style={styles.helperText}>
              For your own margin tracking only — buyers and visitors never see this, it never appears anywhere on your published site.
              {element.costUsd != null && element.priceUsd > element.costUsd
                ? ` Profit: ${sym}${(element.priceUsd - element.costUsd).toFixed(2)} per sale.`
                : ''}
            </Text>

            {element.images.length < MAX_PRODUCT_IMAGES ? (
              <Pressable
                style={styles.uploadBtn}
                onPress={async () => {
                  const uri = await pickImage();
                  if (uri) onChange({ images: [...element.images, uri] } as any);
                }}
              >
                <Ionicons name="add-circle-outline" size={18} color="#FFFFFF" />
                <Text style={styles.uploadBtnText}>Add Product Photo ({element.images.length}/{MAX_PRODUCT_IMAGES})</Text>
              </Pressable>
            ) : (
              <Text style={styles.fieldLabel}>Photo limit reached ({MAX_PRODUCT_IMAGES}/{MAX_PRODUCT_IMAGES}) — remove one to add another.</Text>
            )}
            <Text style={styles.fieldLabel}>
              The first photo is what shows on the main page card. All {element.images.length > 1 ? `${element.images.length} photos` : 'photos'}{' '}
              are swipeable when a visitor taps to see more.
            </Text>
            <View style={styles.rowButtons}>
              {element.images.map((uri, idx) => (
                <Pressable
                  key={uri + idx}
                  style={styles.removeChip}
                  onPress={() => onChange({ images: element.images.filter((_, i) => i !== idx) } as any)}
                >
                  <Text style={styles.removeChipText}>Photo {idx + 1}{idx === 0 ? ' (main)' : ''} ✕</Text>
                </Pressable>
              ))}
            </View>

            <ProductVariantsEditor
              options={element.variantOptions}
              variants={element.variants}
              trackInventory={element.trackInventory}
              baseFallbackPriceLabel={`Same as ${sym}${element.priceUsd.toFixed(2)}`}
              onChange={(patch) => onChange(patch as any)}
            />

            {element.saleType === 'product' && (
              <>
                <Text style={styles.fieldLabel}>How do buyers get it?</Text>
                <View style={styles.rowButtons}>
                  {(['pickup', 'delivery', 'both'] as const).map((option) => (
                    <Pressable
                      key={option}
                      style={[styles.toggleBtn, element.fulfillment === option && styles.toggleBtnActive]}
                      onPress={() => onChange({ fulfillment: option } as any)}
                    >
                      <Text style={styles.toggleBtnText}>{option === 'pickup' ? 'Pickup' : option === 'delivery' ? 'Delivery' : 'Both'}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}
            {element.saleType === 'service' && (
              <SliderRow
                label="Service duration (minutes)"
                value={element.serviceDurationMinutes ?? 30}
                min={5}
                max={480}
                step={5}
                onChange={(v) => onChange({ serviceDurationMinutes: v } as any)}
              />
            )}

            <Pressable
              style={[styles.toggleBtn, element.trackInventory && styles.toggleBtnActive, { marginTop: 4 }]}
              onPress={() =>
                onChange({
                  trackInventory: !element.trackInventory,
                  initialStock: !element.trackInventory ? (element.initialStock ?? 10) : null,
                } as any)
              }
            >
              <Text style={styles.toggleBtnText}>
                {element.saleType === 'service' ? 'Limit bookings' : element.saleType === 'digital' ? 'Limit copies for sale' : 'Track stock quantity'}{' '}
                {element.trackInventory ? 'On' : 'Off'}
              </Text>
            </Pressable>
            {element.trackInventory && element.variantOptions.length === 0 && (
              <SliderRow
                label={element.saleType === 'service' ? 'Bookings available' : element.saleType === 'digital' ? 'Copies for sale' : 'Starting stock'}
                value={element.initialStock ?? 0}
                min={0}
                max={1000}
                onChange={(v) => onChange({ initialStock: v } as any)}
              />
            )}
            <Text style={styles.fieldLabel}>
              {element.variantOptions.length > 0
                ? element.trackInventory
                  ? 'Stock is tracked per combination above — set each one’s starting stock there.'
                  : 'Unlimited — buyers can always check out.'
                : element.trackInventory
                  ? `${element.saleType === 'service' ? 'Booking limit' : element.saleType === 'digital' ? 'Copies for sale' : 'Stock'} only sets on first publish — after that, only real ${element.saleType === 'service' ? 'bookings' : 'orders'} (or editing it here) change it.`
                  : element.saleType === 'service'
                    ? 'No limit on bookings — buyers can always reserve a slot.'
                    : 'Unlimited — buyers can always check out.'}
            </Text>

            <Pressable
              style={[
                styles.toggleBtn,
                element.inStock !== false && styles.toggleBtnActive,
                { marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 6 },
              ]}
              onPress={() => onChange({ inStock: element.inStock === false } as any)}
            >
              <Ionicons
                name={element.inStock !== false ? 'checkmark-circle' : 'close-circle'}
                size={16}
                color={element.inStock !== false ? '#16A34A' : '#DC2626'}
              />
              <Text style={styles.toggleBtnText}>In Stock {element.inStock !== false ? 'On' : 'Off'}</Text>
            </Pressable>
            <Text style={styles.fieldLabel}>
              {element.inStock !== false
                ? 'Buyers can check out normally.'
                : "Turned off — buyers will see it's out of stock and can't check out, no matter the quantity."}
            </Text>

            {projectId && element.variantOptions.length === 0 ? (
              <ProductLiveStockSave
                projectId={projectId}
                elementId={element.id}
                inStock={element.inStock !== false}
                stockQuantity={element.trackInventory ? element.initialStock ?? 0 : null}
                published={!!publishSlug}
              />
            ) : null}
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
                  {availableProducts.map((p) => {
                    const selected = element.productIds.includes(p.id);
                    return (
                      <Pressable
                        key={p.id}
                        style={[styles.collectionProductRow, selected && styles.collectionProductRowActive]}
                        onPress={() =>
                          onChange({
                            productIds: selected ? element.productIds.filter((id) => id !== p.id) : [...element.productIds, p.id],
                          } as any)
                        }
                      >
                        <Ionicons name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={26} color={selected ? '#2563EB' : '#94A3B8'} />
                        <Text style={styles.collectionProductRowText} numberOfLines={1}>
                          {p.name || 'Untitled product'}
                        </Text>
                      </Pressable>
                    );
                  })}
                </>
              );
            })()}
            <Text style={styles.helperText}>
              Pick 2 or more products built on this page to group them into one browsable collection card on your published site.
            </Text>
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
                <View style={styles.rowButtons}>
                  {element.timezones.map((tz, i) => (
                    <Pressable
                      key={i}
                      style={[styles.toggleBtn, { flexDirection: 'row', alignItems: 'center', gap: 6 }]}
                      onPress={() => onChange({ timezones: element.timezones.filter((_, j) => j !== i) } as any)}
                    >
                      <Text style={styles.toggleBtnText}>{tz.label}</Text>
                      <Ionicons name="close" size={12} color="#64748B" />
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

// Curated real city/IANA-zone pairs -- a free-text IANA input would be error-prone (most
// people don't know "Europe/London"-style zone id syntax), so this is filtered by typed city
// name instead. Not exhaustive, but covers every populated continent/major timezone offset.
const COMMON_TIMEZONES: WidgetTimezone[] = [
  { label: 'New York', ianaTimezone: 'America/New_York' },
  { label: 'Los Angeles', ianaTimezone: 'America/Los_Angeles' },
  { label: 'Chicago', ianaTimezone: 'America/Chicago' },
  { label: 'Denver', ianaTimezone: 'America/Denver' },
  { label: 'Toronto', ianaTimezone: 'America/Toronto' },
  { label: 'Mexico City', ianaTimezone: 'America/Mexico_City' },
  { label: 'São Paulo', ianaTimezone: 'America/Sao_Paulo' },
  { label: 'Buenos Aires', ianaTimezone: 'America/Argentina/Buenos_Aires' },
  { label: 'Honolulu', ianaTimezone: 'Pacific/Honolulu' },
  { label: 'Anchorage', ianaTimezone: 'America/Anchorage' },
  { label: 'London', ianaTimezone: 'Europe/London' },
  { label: 'Paris', ianaTimezone: 'Europe/Paris' },
  { label: 'Berlin', ianaTimezone: 'Europe/Berlin' },
  { label: 'Madrid', ianaTimezone: 'Europe/Madrid' },
  { label: 'Rome', ianaTimezone: 'Europe/Rome' },
  { label: 'Amsterdam', ianaTimezone: 'Europe/Amsterdam' },
  { label: 'Moscow', ianaTimezone: 'Europe/Moscow' },
  { label: 'Istanbul', ianaTimezone: 'Europe/Istanbul' },
  { label: 'Cairo', ianaTimezone: 'Africa/Cairo' },
  { label: 'Lagos', ianaTimezone: 'Africa/Lagos' },
  { label: 'Johannesburg', ianaTimezone: 'Africa/Johannesburg' },
  { label: 'Nairobi', ianaTimezone: 'Africa/Nairobi' },
  { label: 'Dubai', ianaTimezone: 'Asia/Dubai' },
  { label: 'Karachi', ianaTimezone: 'Asia/Karachi' },
  { label: 'Mumbai', ianaTimezone: 'Asia/Kolkata' },
  { label: 'Dhaka', ianaTimezone: 'Asia/Dhaka' },
  { label: 'Bangkok', ianaTimezone: 'Asia/Bangkok' },
  { label: 'Jakarta', ianaTimezone: 'Asia/Jakarta' },
  { label: 'Singapore', ianaTimezone: 'Asia/Singapore' },
  { label: 'Hong Kong', ianaTimezone: 'Asia/Hong_Kong' },
  { label: 'Shanghai', ianaTimezone: 'Asia/Shanghai' },
  { label: 'Tokyo', ianaTimezone: 'Asia/Tokyo' },
  { label: 'Seoul', ianaTimezone: 'Asia/Seoul' },
  { label: 'Manila', ianaTimezone: 'Asia/Manila' },
  { label: 'Sydney', ianaTimezone: 'Australia/Sydney' },
  { label: 'Melbourne', ianaTimezone: 'Australia/Melbourne' },
  { label: 'Perth', ianaTimezone: 'Australia/Perth' },
  { label: 'Auckland', ianaTimezone: 'Pacific/Auckland' },
  { label: 'UTC', ianaTimezone: 'UTC' },
];

function WidgetTimezoneAdder({ existing, onAdd }: { existing: WidgetTimezone[]; onAdd: (tz: WidgetTimezone) => void }) {
  const [query, setQuery] = useState('');
  const existingZones = new Set(existing.map((tz) => tz.ianaTimezone));
  const matches = query.trim()
    ? COMMON_TIMEZONES.filter((tz) => !existingZones.has(tz.ianaTimezone) && tz.label.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 6)
    : [];

  return (
    <View style={{ marginBottom: 10 }}>
      <TextInput
        style={[styles.textInput, { marginBottom: matches.length ? 4 : 10 }]}
        value={query}
        onChangeText={setQuery}
        placeholder="Search a city to add (e.g. Tokyo)"
      />
      {matches.map((tz) => (
        <Pressable
          key={tz.ianaTimezone}
          style={{ paddingVertical: 8, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }}
          onPress={() => {
            onAdd(tz);
            setQuery('');
          }}
        >
          <Text style={{ fontSize: 13, color: '#0F172A' }}>{tz.label}</Text>
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

// Add/rename/remove option groups (Size, Color, ...) and their values, regenerating the full
// combination list on every change -- see regenerateVariants for why existing combinations'
// price/stock overrides survive edits to unrelated options/values.
function ProductVariantsEditor({
  options,
  variants,
  trackInventory,
  baseFallbackPriceLabel,
  onChange,
}: {
  options: ProductVariantOption[];
  variants: ProductVariant[];
  trackInventory: boolean;
  baseFallbackPriceLabel: string;
  onChange: (patch: { variantOptions: ProductVariantOption[]; variants: ProductVariant[] }) => void;
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
      <Text style={[styles.fieldLabel, { marginTop: 10 }]}>Variants (optional)</Text>
      <Text style={styles.helperText}>
        Add option groups like Size or Color — buyers pick one value from each before checking out. Leave empty for a simple product
        with no choices.
      </Text>

      {options.map((option, index) => (
        <View key={index} style={styles.variantOptionCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TextInput
              style={[styles.textInput, { flex: 1, marginBottom: 0 }]}
              value={option.name}
              onChangeText={(name) => setOptions(options.map((o, i) => (i === index ? { ...o, name } : o)))}
              placeholder="e.g. Size"
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
            onAdd={(value) =>
              setOptions(options.map((o, i) => (i === index && !o.values.includes(value) ? { ...o, values: [...o.values, value] } : o)))
            }
          />
        </View>
      ))}

      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
        <TextInput
          style={[styles.textInput, { flex: 1, marginBottom: 0 }]}
          value={newOptionName}
          onChangeText={setNewOptionName}
          placeholder="New option name, e.g. Color"
        />
        <Pressable style={styles.smallAddBtn} onPress={addOption}>
          <Text style={styles.smallAddBtnText}>Add Option</Text>
        </Pressable>
      </View>

      {variants.length > 0 && (
        <>
          <Text style={[styles.fieldLabel, { marginTop: 6 }]}>Combinations ({variants.length})</Text>
          {variants.map((variant) => (
            <View key={variant.key} style={styles.variantRow}>
              <Text style={styles.variantRowLabel}>{variantLabelFor(options, variant.optionValues)}</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                <TextInput
                  style={[styles.textInput, { flex: 1, marginBottom: 0 }]}
                  value={variant.priceUsd != null ? String(variant.priceUsd) : ''}
                  placeholder={baseFallbackPriceLabel}
                  placeholderTextColor="#94A3B8"
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
                    style={[styles.textInput, { width: 80, marginBottom: 0 }]}
                    value={String(variant.initialStock ?? 0)}
                    placeholder="Stock"
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

function VariantValueAdder({ onAdd }: { onAdd: (value: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
      <TextInput style={[styles.textInput, { flex: 1, marginBottom: 0 }]} value={value} onChangeText={setValue} placeholder="e.g. Medium" />
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
