import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/navigation/types';
import { EditorProvider, useEditor } from '@/context/EditorContext';
import Canvas from '@/components/canvas/Canvas';
import ElementsPanel from '@/components/elements/ElementsPanel';
import AnnouncementPanel from '@/components/elements/AnnouncementPanel';
import ElementInspector from '@/components/inspector/ElementInspector';
import { LibraryItem } from '@/data/elementsLibrary';
import { generateId } from '@/utils/id';
import { CanvasElement, TextElement, ImageElement, SlideshowElement, VideoElement, ProductElement } from '@/types';
import { useAuth } from '@/context/AuthContext';

type Props = NativeStackScreenProps<RootStackParamList, 'Editor'>;

type PanelTab = 'elements' | 'text' | 'image' | 'slideshow' | 'bar' | null;

function EditorInner({ navigation }: Props) {
  const { project, selectedId, select, addElement, updateElement, removeElement, bringToFront, updateProject, selectedElement } =
    useEditor();
  const [panel, setPanel] = useState<PanelTab>(null);

  if (!project) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator />
      </View>
    );
  }

  const canvasCenterX = project.canvasSize.width / 2;
  const canvasCenterY = project.canvasSize.height / 2;

  const handleAddLibraryItem = (item: LibraryItem) => {
    const el = item.build(generateId('el'), canvasCenterX, canvasCenterY);
    addElement(el);
    setPanel(null);
  };

  const addTextBox = () => {
    const el: TextElement = {
      id: generateId('el'),
      type: 'text',
      text: 'New text',
      x: canvasCenterX - 80,
      y: canvasCenterY - 16,
      width: 160,
      height: 32,
      zIndex: 5,
      fontSize: 18,
      color: '#0F172A',
      fontWeight: 'normal',
      align: 'left',
    };
    addElement(el);
    setPanel(null);
  };

  const addImage = async () => {
    const ImagePicker = await import('expo-image-picker');
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });
    if (result.canceled || result.assets.length === 0) return;
    const el: ImageElement = {
      id: generateId('el'),
      type: 'image',
      uri: result.assets[0].uri,
      x: canvasCenterX - 80,
      y: canvasCenterY - 80,
      width: 160,
      height: 160,
      zIndex: 5,
    };
    addElement(el);
    setPanel(null);
  };

  const addVideo = async () => {
    const ImagePicker = await import('expo-image-picker');
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'] });
    if (result.canceled || result.assets.length === 0) return;
    const el: VideoElement = {
      id: generateId('el'),
      type: 'video',
      uri: result.assets[0].uri,
      trimStartMs: 0,
      trimEndMs: null,
      muted: false,
      loop: true,
      audioUri: null,
      audioVolume: 1,
      x: canvasCenterX - 100,
      y: canvasCenterY - 70,
      width: 200,
      height: 140,
      zIndex: 5,
    };
    addElement(el);
    select(el.id);
    setPanel(null);
  };

  const addSlideshow = () => {
    const el: SlideshowElement = {
      id: generateId('el'),
      type: 'slideshow',
      images: [],
      autoPlay: true,
      intervalMs: 3000,
      x: canvasCenterX - 90,
      y: canvasCenterY - 60,
      width: 180,
      height: 120,
      zIndex: 5,
    };
    addElement(el);
    select(el.id);
    setPanel(null);
  };

  const addProduct = () => {
    const el: ProductElement = {
      id: generateId('el'),
      type: 'product',
      productId: generateId('prod'),
      name: 'New product',
      description: '',
      priceUsd: 10,
      images: [],
      trackInventory: false,
      initialStock: null,
      saleType: 'product',
      fulfillment: 'pickup',
      serviceDurationMinutes: null,
      x: canvasCenterX - 90,
      y: canvasCenterY - 100,
      width: 180,
      height: 220,
      zIndex: 5,
    };
    addElement(el);
    select(el.id);
    setPanel(null);
  };

  const confirmDelete = () => {
    if (!selectedElement) return;
    Alert.alert('Delete element?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => removeElement(selectedElement.id) },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="chevron-back" size={26} color="#0F172A" />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {project.name}
        </Text>
        <Pressable onPress={() => navigation.navigate('Publish', { projectId: project.id })} hitSlop={8}>
          <Ionicons name="cloud-upload-outline" size={24} color="#0F172A" />
        </Pressable>
      </View>

      <View style={styles.canvasArea}>
        <ScrollView
          contentContainerStyle={styles.canvasScroll}
          minimumZoomScale={1}
          maximumZoomScale={1}
        >
          <Canvas
            project={project}
            selectedId={selectedId}
            onSelect={select}
            onChange={(id, patch) => updateElement(id, patch as Partial<CanvasElement>)}
          />
        </ScrollView>
      </View>

      {selectedElement ? (
        <View style={styles.bottomSheet}>
          <View style={styles.sheetHandle} />
          <ElementInspector
            element={selectedElement}
            onChange={(patch) => updateElement(selectedElement.id, patch)}
            onDelete={confirmDelete}
            onBringToFront={() => bringToFront(selectedElement.id)}
          />
          <Pressable style={styles.doneBtn} onPress={() => select(null)}>
            <Text style={styles.doneBtnText}>Done</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {panel && (
            <View style={styles.panel}>
              <View style={styles.sheetHandle} />
              {panel === 'elements' && <ElementsPanel onAdd={handleAddLibraryItem} />}
              {panel === 'bar' && (
                <AnnouncementPanel
                  settings={project.announcements}
                  onChange={(patch) => updateProject({ announcements: { ...project.announcements, ...patch } })}
                />
              )}
            </View>
          )}
          <View style={styles.tabBar}>
            <TabButton icon="shapes-outline" label="Elements" active={panel === 'elements'} onPress={() => setPanel(panel === 'elements' ? null : 'elements')} />
            <TabButton icon="text-outline" label="Text" active={false} onPress={addTextBox} />
            <TabButton icon="image-outline" label="Image" active={false} onPress={addImage} />
            <TabButton icon="images-outline" label="Slideshow" active={false} onPress={addSlideshow} />
            <TabButton icon="videocam-outline" label="Video" active={false} onPress={addVideo} />
            <TabButton icon="pricetag-outline" label="Product" active={false} onPress={addProduct} />
            <TabButton icon="megaphone-outline" label="Bar" active={panel === 'bar'} onPress={() => setPanel(panel === 'bar' ? null : 'bar')} />
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

function TabButton({
  icon,
  label,
  active,
  onPress,
}: {
  icon: string;
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.tabButton} onPress={onPress}>
      <Ionicons name={icon as any} size={22} color={active ? '#2563EB' : '#334155'} />
      <Text style={[styles.tabButtonLabel, active && { color: '#2563EB' }]}>{label}</Text>
    </Pressable>
  );
}

export default function EditorScreen(props: Props) {
  const { user } = useAuth();
  return (
    <EditorProvider uid={user!.uid} projectId={props.route.params.projectId}>
      <EditorInner {...props} />
    </EditorProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  title: { fontSize: 16, fontWeight: '700', color: '#0F172A', flex: 1, textAlign: 'center' },
  canvasArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  canvasScroll: { alignItems: 'center', justifyContent: 'center', flexGrow: 1 },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    paddingVertical: 8,
    paddingBottom: 14,
  },
  tabButton: { flex: 1, alignItems: 'center', gap: 2 },
  tabButtonLabel: { fontSize: 10, color: '#334155', fontWeight: '600' },
  panel: {
    height: 240,
    backgroundColor: '#FFFFFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E2E8F0',
    paddingTop: 8,
  },
  bottomSheet: {
    maxHeight: 380,
    backgroundColor: '#FFFFFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E2E8F0',
    paddingTop: 8,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E2E8F0',
    alignSelf: 'center',
    marginBottom: 4,
  },
  doneBtn: { padding: 12, alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#F1F5F9' },
  doneBtnText: { color: '#2563EB', fontWeight: '700' },
});
