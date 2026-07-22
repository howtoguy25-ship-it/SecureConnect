import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { showAlert } from '@/utils/alert';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { CanvasElement, ImageElement } from '@/types';
import ColorSwatchRow from '@/components/inspector/ColorSwatchRow';
import SliderRow from '@/components/inspector/SliderRow';
import { labelForElement } from '@/utils/elementLabel';
import { FONT_OPTIONS, FontOption } from '@/data/fonts';
import { useGoogleFont } from '@/utils/useGoogleFont';
import { editImageBackground } from '@/services/uploads';
import { BACKGROUND_EDIT_CREDIT_COST } from '@/data/pricing';
import { updateProductStock } from '@/services/productStock';

const MAX_PRODUCT_IMAGES = 7;

interface Props {
  element: CanvasElement;
  onChange: (patch: Partial<CanvasElement>) => void;
  onDelete: () => void;
  onBringToFront: () => void;
  onClose: () => void;
  // Only needed for the product element's "Save to Live Store" action -- every other
  // element type ignores these.
  projectId?: string;
  publishSlug?: string | null;
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

export default function ElementInspector({ element, onChange, onDelete, onBringToFront, onClose, projectId, publishSlug }: Props) {
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
              onChangeText={(link) => onChange({ link: link.trim() ? link : null } as any)}
              placeholder="https://example.com, mailto:you@site.com, or /page-slug"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            <Text style={[styles.fieldLabel, { marginTop: -6 }]}>
              {element.link
                ? 'Visitors on your published site will be taken here when they tap this button.'
                : "Empty — this button won't do anything when tapped on your published site."}
            </Text>
            <SliderRow
              label="Corner Radius"
              value={element.borderRadius}
              min={0}
              max={24}
              onChange={(v) => onChange({ borderRadius: v } as any)}
            />
            <ColorSwatchRow
              label="Background"
              value={element.backgroundColor}
              onChange={(backgroundColor) => onChange({ backgroundColor } as any)}
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

            <Text style={styles.fieldLabel}>Price (USD)</Text>
            <TextInput
              style={styles.textInput}
              value={String(element.priceUsd)}
              keyboardType="decimal-pad"
              onChangeText={(text) => {
                const value = parseFloat(text);
                onChange({ priceUsd: Number.isFinite(value) ? Math.max(0, value) : 0 } as any);
              }}
            />

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
            {element.trackInventory && (
              <SliderRow
                label={element.saleType === 'service' ? 'Bookings available' : element.saleType === 'digital' ? 'Copies for sale' : 'Starting stock'}
                value={element.initialStock ?? 0}
                min={0}
                max={1000}
                onChange={(v) => onChange({ initialStock: v } as any)}
              />
            )}
            <Text style={styles.fieldLabel}>
              {element.trackInventory
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

            {projectId ? (
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
      </ScrollView>
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
