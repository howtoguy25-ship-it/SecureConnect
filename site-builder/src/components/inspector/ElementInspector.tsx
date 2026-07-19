import React from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { CanvasElement } from '@/types';
import ColorSwatchRow from '@/components/inspector/ColorSwatchRow';
import SliderRow from '@/components/inspector/SliderRow';

interface Props {
  element: CanvasElement;
  onChange: (patch: Partial<CanvasElement>) => void;
  onDelete: () => void;
  onBringToFront: () => void;
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

export default function ElementInspector({ element, onChange, onDelete, onBringToFront }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{labelFor(element)}</Text>
        <View style={styles.headerActions}>
          <Pressable onPress={onBringToFront} hitSlop={8} style={styles.iconBtn}>
            <Ionicons name="layers-outline" size={20} color="#334155" />
          </Pressable>
          <Pressable onPress={onDelete} hitSlop={8} style={styles.iconBtn}>
            <Ionicons name="trash-outline" size={20} color="#DC2626" />
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
            <SliderRow
              label="Font Size"
              value={element.fontSize}
              min={10}
              max={64}
              onChange={(v) => onChange({ fontSize: v } as any)}
            />
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
                style={[styles.toggleBtn, element.saleType === 'service' && styles.toggleBtnActive]}
                onPress={() => onChange({ saleType: 'service' } as any)}
              >
                <Text style={styles.toggleBtnText}>📅 Real-life service</Text>
              </Pressable>
            </View>
            <Text style={styles.fieldLabel}>
              {element.saleType === 'service'
                ? 'Buyers pick a date/time and pay once to reserve it — a real one-time booking payment, never a recurring charge.'
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

            <Pressable
              style={styles.uploadBtn}
              onPress={async () => {
                const uri = await pickImage();
                if (uri) onChange({ images: [...element.images, uri] } as any);
              }}
            >
              <Ionicons name="add-circle-outline" size={18} color="#FFFFFF" />
              <Text style={styles.uploadBtnText}>Add Product Photo</Text>
            </Pressable>
            <View style={styles.rowButtons}>
              {element.images.map((uri, idx) => (
                <Pressable
                  key={uri + idx}
                  style={styles.removeChip}
                  onPress={() => onChange({ images: element.images.filter((_, i) => i !== idx) } as any)}
                >
                  <Text style={styles.removeChipText}>Photo {idx + 1} ✕</Text>
                </Pressable>
              ))}
            </View>

            {element.saleType === 'product' ? (
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
            ) : (
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
                {element.saleType === 'service' ? 'Limit bookings' : 'Track stock quantity'} {element.trackInventory ? 'On' : 'Off'}
              </Text>
            </Pressable>
            {element.trackInventory && (
              <SliderRow
                label={element.saleType === 'service' ? 'Bookings available' : 'Starting stock'}
                value={element.initialStock ?? 0}
                min={0}
                max={1000}
                onChange={(v) => onChange({ initialStock: v } as any)}
              />
            )}
            <Text style={styles.fieldLabel}>
              {element.trackInventory
                ? `${element.saleType === 'service' ? 'Booking limit' : 'Stock'} only sets on first publish — after that, only real ${element.saleType === 'service' ? 'bookings' : 'orders'} (or editing it here) change it.`
                : element.saleType === 'service'
                  ? 'No limit on bookings — buyers can always reserve a slot.'
                  : 'Unlimited stock — buyers can always check out.'}
            </Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function labelFor(element: CanvasElement): string {
  switch (element.type) {
    case 'text':
      return 'Text';
    case 'image':
      return 'Image';
    case 'shape':
      return 'Shape';
    case 'button':
      return 'Button';
    case 'icon':
      return 'Icon';
    case 'slideshow':
      return 'Slideshow';
    case 'video':
      return 'Video';
    case 'product':
      return 'Product';
    default:
      return 'Element';
  }
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
  removeChip: { backgroundColor: '#FEE2E2', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  removeChipText: { fontSize: 11, color: '#B91C1C', fontWeight: '600' },
});
