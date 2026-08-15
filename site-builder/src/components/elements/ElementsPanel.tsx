import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ELEMENT_CATEGORIES, ELEMENT_LIBRARY, ElementCategory, LibraryItem } from '@/data/elementsLibrary';
import Svg, { Rect, Circle, Polygon, Line } from 'react-native-svg';

function PreviewIcon({ item }: { item: LibraryItem }) {
  const { preview } = item;
  if (preview.kind === 'emoji') {
    return <Text style={{ fontSize: 26 }}>{preview.value}</Text>;
  }
  if (preview.kind === 'icon') {
    return <Ionicons name={preview.value as any} size={26} color={preview.color ?? '#111827'} />;
  }
  // shape preview
  const size = 32;
  const color = preview.color ?? '#94A3B8';
  switch (preview.value) {
    case 'circle':
      return (
        <Svg width={size} height={size}>
          <Circle cx={size / 2} cy={size / 2} r={size / 2 - 2} fill={color} />
        </Svg>
      );
    case 'triangle':
      return (
        <Svg width={size} height={size}>
          <Polygon points={`${size / 2},2 ${size - 2},${size - 2} 2,${size - 2}`} fill={color} />
        </Svg>
      );
    case 'line':
      return (
        <Svg width={size} height={size}>
          <Line x1={2} y1={size / 2} x2={size - 2} y2={size / 2} stroke={color} strokeWidth={3} />
        </Svg>
      );
    case 'rounded-rectangle':
      return (
        <Svg width={size} height={size}>
          <Rect x={2} y={6} width={size - 4} height={size - 12} rx={6} fill={color} />
        </Svg>
      );
    default:
      return (
        <Svg width={size} height={size}>
          <Rect x={2} y={6} width={size - 4} height={size - 12} fill={color} />
        </Svg>
      );
  }
}

export default function ElementsPanel({ onAdd }: { onAdd: (item: LibraryItem) => void }) {
  const [category, setCategory] = useState<ElementCategory>('icons');
  const items = ELEMENT_LIBRARY.filter((i) => i.category === category);

  return (
    <View style={styles.container}>
      <View style={styles.tabs}>
        {ELEMENT_CATEGORIES.map((c) => (
          <Pressable
            key={c.key}
            style={[styles.tab, category === c.key && styles.tabActive]}
            onPress={() => setCategory(c.key)}
          >
            <Text style={[styles.tabText, category === c.key && styles.tabTextActive]}>{c.label}</Text>
          </Pressable>
        ))}
      </View>
      <FlatList
        data={items}
        key={category}
        keyExtractor={(item) => item.id}
        numColumns={5}
        contentContainerStyle={styles.grid}
        renderItem={({ item }) => (
          <Pressable style={styles.item} onPress={() => onAdd(item)}>
            <View style={styles.itemPreview}>
              <PreviewIcon item={item} />
            </View>
            <Text style={styles.itemLabel} numberOfLines={1}>
              {item.label}
            </Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingBottom: 8 },
  tab: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: '#F1F5F9' },
  tabActive: { backgroundColor: '#111827' },
  tabText: { fontSize: 12, fontWeight: '600', color: '#334155' },
  tabTextActive: { color: '#FFFFFF' },
  grid: { paddingHorizontal: 8, paddingBottom: 12 },
  item: { width: '20%', alignItems: 'center', paddingVertical: 8 },
  itemPreview: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemLabel: { fontSize: 9, color: '#64748B', marginTop: 4, width: '100%', textAlign: 'center' },
});
