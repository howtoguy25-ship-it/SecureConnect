import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, PanResponder, useWindowDimensions, Modal, Linking } from 'react-native';
import { showAlert } from '@/utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/navigation/types';
import { EditorProvider, useEditor } from '@/context/EditorContext';
import Canvas from '@/components/canvas/Canvas';
import ElementsPanel from '@/components/elements/ElementsPanel';
import AnnouncementPanel from '@/components/elements/AnnouncementPanel';
import ElementInspector from '@/components/inspector/ElementInspector';
import LayersPanel from '@/components/elements/LayersPanel';
import PageTabsBar, { PageTabsBarHandle } from '@/components/editor/PageTabsBar';
import GradientPickerRow from '@/components/inspector/GradientPickerRow';
import MenuPoliciesModal from '@/components/editor/MenuPoliciesModal';
import { LibraryItem } from '@/data/elementsLibrary';
import { generateId } from '@/utils/id';
import { CanvasElement, TextElement, ImageElement, SlideshowElement, VideoElement, ProductElement, CollectionElement, GameElement } from '@/types';
import { useAuth } from '@/context/AuthContext';
import { useAppTheme } from '@/context/AppThemeContext';
import GeneratingOverlay from '@/components/GeneratingOverlay';
import { labelForElement } from '@/utils/elementLabel';

type Props = NativeStackScreenProps<RootStackParamList, 'Editor'>;

type PanelTab = 'elements' | 'text' | 'image' | 'slideshow' | 'bar' | null;

function EditorInner({ navigation }: Props) {
  const {
    project,
    pages,
    activePageId,
    currentPage,
    switchPage,
    addPage,
    renamePage,
    removePage,
    duplicatePage,
    setPageBackground,
    selectedId,
    select,
    addElement,
    updateElement,
    removeElement,
    duplicateElement,
    bringToFront,
    reorderElement,
    updateProject,
    selectedElement,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useEditor();
  const { theme } = useAppTheme();
  const [panel, setPanel] = useState<PanelTab>(null);
  // View-only lock for the whole page -- lets a user look at a finished page without a
  // stray touch dragging a word or button out of place. Purely a local UI toggle (doesn't
  // persist), separate from per-element `locked` which is a real saved property.
  const [pageLocked, setPageLocked] = useState(false);
  // Independent of `panel`/selection so it stays reachable even while an element is
  // selected (which replaces the tab bar with the inspector sheet) -- otherwise adding a
  // new element (which auto-selects it) makes the layer list disappear right when a user
  // most wants to see it land in the stack.
  const [showLayers, setShowLayers] = useState(false);
  // Background editing for single-page projects (Social/Logo/Video, and any Website with no
  // `pages`) -- multi-page websites edit background per-page instead, via PageTabsBar's own
  // edit-page modal (see pageTabsBarRef below), since each page there can have its own.
  const [bgEditorOpen, setBgEditorOpen] = useState(false);
  const pageTabsBarRef = useRef<PageTabsBarHandle>(null);
  const openBackgroundEditor = () => {
    if (pages && activePageId) pageTabsBarRef.current?.openBackgroundEditor(activePageId);
    else setBgEditorOpen(true);
  };
  const [menuPoliciesOpen, setMenuPoliciesOpen] = useState(false);
  // Disables the canvas ScrollView's own scrolling while an element is being dragged or
  // resized -- on web, the ScrollView's native scroll can otherwise still respond to the
  // same touch underneath an active element drag, which is what made moving or resizing a
  // selected element also drag the whole page along with it.
  const [canvasInteracting, setCanvasInteracting] = useState(false);
  // The inspector sheet's height is a real drag, not a binary open/closed toggle -- users
  // can pull it down slowly to whatever height they want (down to a thin strip that keeps
  // the element selected without covering the canvas), or tap the handle for a quick
  // default-height/collapsed toggle. Deliberately does NOT reset when `selectedId` changes:
  // a stray touch-down on a different element while trying to scroll/pan the canvas
  // shouldn't be able to yank a collapsed sheet back open on its own -- only a real drag or
  // tap on the handle itself should ever change its height.
  const DEFAULT_SHEET_HEIGHT = 380;
  const MIN_SHEET_HEIGHT = 56;
  const COMPACT_THRESHOLD = 110;
  const { height: windowHeight } = useWindowDimensions();
  const maxSheetHeight = Math.max(DEFAULT_SHEET_HEIGHT, Math.round(windowHeight * 0.75));
  const [sheetHeight, setSheetHeight] = useState(DEFAULT_SHEET_HEIGHT);
  const sheetHeightRef = useRef(sheetHeight);
  sheetHeightRef.current = sheetHeight;
  const maxSheetHeightRef = useRef(maxSheetHeight);
  maxSheetHeightRef.current = maxSheetHeight;
  const sheetDrag = useRef({ height0: DEFAULT_SHEET_HEIGHT, moved: 0 });
  const sheetPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_evt, gestureState) => Math.abs(gestureState.dy) > 2,
      onPanResponderGrant: () => {
        sheetDrag.current = { height0: sheetHeightRef.current, moved: 0 };
      },
      onPanResponderMove: (_evt, gestureState) => {
        sheetDrag.current.moved = Math.max(sheetDrag.current.moved, Math.abs(gestureState.dy));
        // Dragging the handle down shrinks the sheet, up grows it -- clamped between a
        // thin strip and a healthy majority of the screen so it can never fully swallow
        // the header or push past the top of the screen.
        const next = Math.min(
          maxSheetHeightRef.current,
          Math.max(MIN_SHEET_HEIGHT, sheetDrag.current.height0 - gestureState.dy)
        );
        setSheetHeight(next);
      },
      onPanResponderRelease: () => {
        // Negligible movement means this was a tap, not a drag -- keep the familiar
        // quick-toggle behavior for that case.
        if (sheetDrag.current.moved < 6) {
          setSheetHeight((h) => (h <= COMPACT_THRESHOLD ? DEFAULT_SHEET_HEIGHT : MIN_SHEET_HEIGHT));
        }
      },
    })
  ).current;
  // Must be declared before the `!project` early return below -- every hook in this
  // component has to run on every render regardless of `project`'s state, or React throws
  // "Rendered more hooks than during the previous render" the instant a still-loading
  // project (project === null on the first render, while its Firestore subscription is
  // still in flight) finishes loading and this component stops taking the early-return path.
  const canvasScrollRef = useRef<ScrollView>(null);

  if (!project) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator />
      </View>
    );
  }

  // AIBuildProgressScreen replaces itself with this screen the instant the generation
  // session's Firestore doc flips to 'completed' -- but the actual finished project doc
  // (real name + elements) can land a beat later over this screen's own live subscription.
  // Without this guard that gap renders as a blank white canvas; showing the same
  // "building" animation through that gap keeps it reading as "still working," not broken.
  const isGenerating = project.name === 'Generating...' && project.elements.length === 0;

  // The canvas/layers/inspector all render whatever page is currently active for a multi-
  // page website (see PageTabsBar); every other project has no `pages` and this is just
  // `project` unchanged, so nothing below needs to know multi-page projects exist at all.
  const displayProject = currentPage
    ? { ...project, elements: currentPage.elements, backgroundColor: currentPage.backgroundColor, backgroundGradient: currentPage.backgroundGradient }
    : project;
  const activeElements = displayProject.elements;

  const canvasCenterX = project.canvasSize.width / 2;
  const canvasCenterY = project.canvasSize.height / 2;

  // "+" at the bottom of the canvas -- gives the page more real, empty room to build into
  // (rather than just cramming new elements into whatever space is already there) and opens
  // the Elements tray right away so adding something into that new room is the very next tap.
  const EXTEND_CANVAS_INCREMENT = 300;
  const extendCanvas = () => {
    updateProject({ canvasSize: { ...project.canvasSize, height: project.canvasSize.height + EXTEND_CANVAS_INCREMENT } });
    setPanel('elements');
    requestAnimationFrame(() => canvasScrollRef.current?.scrollToEnd({ animated: true }));
  };

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
      compareAtPriceUsd: null,
      costUsd: null,
      images: [],
      trackInventory: false,
      initialStock: null,
      inStock: true,
      saleType: 'product',
      fulfillment: 'pickup',
      serviceDurationMinutes: null,
      variantOptions: [],
      variants: [],
      x: canvasCenterX - 90,
      y: canvasCenterY - 100,
      width: 180,
      height: 220,
      zIndex: 5,
    };
    addElement(el);
    select(el.id);
    setPanel(null);
    // Force the inspector sheet open at full height even if it was left minimized from a
    // previous selection -- a freshly-created "New product" placeholder is meaningless until
    // its name/price/photo get filled in, so the create-a-product moment should land the
    // user straight in those fields instead of a collapsed "tap to edit" row.
    setSheetHeight(DEFAULT_SHEET_HEIGHT);
  };

  const addCollection = () => {
    const el: CollectionElement = {
      id: generateId('el'),
      type: 'collection',
      name: 'New collection',
      productIds: [],
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

  const addGame = () => {
    // Defaults to Tic-Tac-Toe -- the only kind that's a real, complete, playable game with
    // zero setup; the other kinds (Trivia/Memory/Clicker) need real content first, added via
    // the inspector's kind picker.
    const el: GameElement = {
      id: generateId('el'),
      type: 'game',
      kind: 'tictactoe',
      title: 'Tic-Tac-Toe',
      questions: [],
      memorySymbols: [],
      clickerLabel: 'Tap!',
      clickerTarget: 20,
      x: canvasCenterX - 90,
      y: canvasCenterY - 100,
      width: 200,
      height: 220,
      zIndex: 5,
    };
    addElement(el);
    select(el.id);
    setPanel(null);
  };

  const confirmDeleteId = (id: string) => {
    showAlert('Delete element?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => removeElement(id) },
    ]);
  };

  const toggleLock = (id: string) => {
    const target = activeElements.find((el) => el.id === id);
    if (!target) return;
    updateElement(id, { locked: !target.locked });
  };

  // A locked button's raw `link` field can be a real external URL, or (on a multi-page
  // website) a same-site page slug like "/about" -- Linking.openURL can't do in-app
  // navigation, so a slug that matches a real page switches to it right here in the editor,
  // exactly like tapping it would on the published site. Anything else opens for real.
  const openLinkInEditor = (link: string) => {
    const trimmed = link.trim();
    if (pages) {
      const slug = trimmed.replace(/^\//, '');
      const target = pages.find((p) => p.slug === slug);
      if (target) {
        switchPage(target.id);
        return;
      }
    }
    const isAbsolute = /^https?:\/\//i.test(trimmed) || /^(mailto|tel):/i.test(trimmed);
    Linking.openURL(isAbsolute ? trimmed : `https://${trimmed}`);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="chevron-back" size={26} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
          {project.name}
        </Text>
        <View style={styles.headerActions}>
          {!isGenerating && (
            <>
              <Pressable onPress={undo} disabled={!canUndo} hitSlop={8}>
                <Ionicons name="arrow-undo-outline" size={22} color={canUndo ? theme.text : theme.border} />
              </Pressable>
              <Pressable onPress={redo} disabled={!canRedo} hitSlop={8}>
                <Ionicons name="arrow-redo-outline" size={22} color={canRedo ? theme.text : theme.border} />
              </Pressable>
              <Pressable onPress={() => setPageLocked((v) => !v)} hitSlop={8}>
                <Ionicons name={pageLocked ? 'lock-closed' : 'lock-open-outline'} size={22} color={pageLocked ? theme.accent : theme.text} />
              </Pressable>
              <Pressable onPress={() => setShowLayers((v) => !v)} hitSlop={8}>
                <Ionicons name="layers-outline" size={22} color={showLayers ? theme.accent : theme.text} />
              </Pressable>
              <Pressable onPress={openBackgroundEditor} hitSlop={8}>
                <Ionicons name="color-palette-outline" size={22} color={theme.text} />
              </Pressable>
              <Pressable onPress={() => setMenuPoliciesOpen(true)} hitSlop={8}>
                <Ionicons name="menu-outline" size={22} color={theme.text} />
              </Pressable>
            </>
          )}
          {isGenerating ? (
            <View style={{ width: 24 }} />
          ) : (
            <Pressable onPress={() => navigation.navigate('Publish', { projectId: project.id })} hitSlop={8}>
              <Ionicons name="cloud-upload-outline" size={24} color={theme.text} />
            </Pressable>
          )}
        </View>
      </View>

      {pages && !isGenerating && (
        <PageTabsBar
          ref={pageTabsBarRef}
          pages={pages}
          activePageId={activePageId}
          onSwitch={switchPage}
          onAdd={addPage}
          onRename={renamePage}
          onRemove={removePage}
          onDuplicate={duplicatePage}
          onSetBackground={setPageBackground}
        />
      )}

      {pages && pages.length > 1 && !isGenerating && (
        <View style={styles.navPreview}>
          {pages.map((page) => (
            <Pressable key={page.id} onPress={() => switchPage(page.id)} style={styles.navPreviewItem}>
              <Text style={[styles.navPreviewText, page.id === activePageId && styles.navPreviewTextActive]}>{page.name}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {showLayers && !isGenerating && (
        <View style={[styles.layersOverlay, { backgroundColor: theme.surface }]}>
          <View style={[styles.layersOverlayHeader, { borderBottomColor: theme.border }]}>
            <Text style={[styles.layersOverlayTitle, { color: theme.text }]}>Layers</Text>
            <Pressable hitSlop={8} onPress={() => setShowLayers(false)}>
              <Ionicons name="close" size={18} color={theme.textMuted} />
            </Pressable>
          </View>
          <LayersPanel
            elements={activeElements}
            selectedId={selectedId}
            onSelect={select}
            onReorder={reorderElement}
            onToggleLock={toggleLock}
          />
        </View>
      )}

      {isGenerating ? (
        <View style={styles.canvasArea}>
          <View
            style={[
              styles.generatingFrame,
              { width: project.canvasSize.width, height: project.canvasSize.height, backgroundColor: project.backgroundColor },
            ]}
          >
            <GeneratingOverlay />
          </View>
        </View>
      ) : (
        <>
      <View style={styles.canvasArea}>
        <ScrollView
          ref={canvasScrollRef}
          contentContainerStyle={styles.canvasScroll}
          minimumZoomScale={1}
          maximumZoomScale={3}
          bouncesZoom
          pinchGestureEnabled
          scrollEnabled={!canvasInteracting}
        >
          <Canvas
            project={displayProject}
            selectedId={selectedId}
            onSelect={select}
            onChange={(id, patch) => updateElement(id, patch as Partial<CanvasElement>)}
            onDuplicate={duplicateElement}
            onDelete={confirmDeleteId}
            onToggleLock={toggleLock}
            onInteractionChange={setCanvasInteracting}
            forceLocked={pageLocked}
            onOpenLink={openLinkInEditor}
            onBackgroundTap={openBackgroundEditor}
            isLastPage={!pages || pages[pages.length - 1]?.id === activePageId}
            onExtend={extendCanvas}
          />
        </ScrollView>
      </View>

      {selectedElement ? (
        <View
          style={[
            styles.bottomSheet,
            { height: sheetHeight, backgroundColor: theme.surface, borderTopColor: theme.border },
          ]}
        >
          <View {...sheetPanResponder.panHandlers} style={styles.sheetHandleTouch}>
            <View style={styles.sheetHandle} />
            <Ionicons name={sheetHeight <= COMPACT_THRESHOLD ? 'chevron-up' : 'chevron-down'} size={16} color={theme.textMuted} />
          </View>
          {sheetHeight <= COMPACT_THRESHOLD ? (
            <Pressable style={styles.minimizedRow} onPress={() => setSheetHeight(DEFAULT_SHEET_HEIGHT)}>
              <Text style={[styles.minimizedLabel, { color: theme.text }]} numberOfLines={1}>
                {labelForElement(selectedElement)} selected — tap to edit
              </Text>
              <Pressable onPress={() => select(null)} hitSlop={8}>
                <Ionicons name="close-circle" size={20} color={theme.textMuted} />
              </Pressable>
            </Pressable>
          ) : (
            <ElementInspector
              element={selectedElement}
              allElements={activeElements}
              onChange={(patch) => updateElement(selectedElement.id, patch)}
              onDelete={() => confirmDeleteId(selectedElement.id)}
              onBringToFront={() => bringToFront(selectedElement.id)}
              onClose={() => setSheetHeight(MIN_SHEET_HEIGHT)}
              projectId={project.id}
              publishSlug={project.publishSlug}
            />
          )}
        </View>
      ) : (
        <>
          {panel && (
            <View style={[styles.panel, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
              <Pressable style={styles.panelMinimizeBtn} onPress={() => setPanel(null)} hitSlop={8}>
                <Ionicons name="chevron-down-circle-outline" size={22} color={theme.textMuted} />
              </Pressable>
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
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={[styles.tabBar, { backgroundColor: theme.surface, borderTopColor: theme.border }]}
            contentContainerStyle={styles.tabBarContent}
          >
            <TabButton icon="shapes-outline" label="Elements" active={panel === 'elements'} onPress={() => setPanel(panel === 'elements' ? null : 'elements')} />
            <TabButton icon="text-outline" label="Text" active={false} onPress={addTextBox} />
            <TabButton icon="image-outline" label="Image" active={false} onPress={addImage} />
            <TabButton icon="images-outline" label="Slideshow" active={false} onPress={addSlideshow} />
            <TabButton icon="videocam-outline" label="Video" active={false} onPress={addVideo} />
            <TabButton icon="pricetag-outline" label="Product" active={false} onPress={addProduct} highlightColor="#16A34A" />
            <TabButton icon="albums-outline" label="Collection" active={false} onPress={addCollection} />
            <TabButton icon="game-controller-outline" label="Game" active={false} onPress={addGame} />
            <TabButton icon="megaphone-outline" label="Bar" active={panel === 'bar'} onPress={() => setPanel(panel === 'bar' ? null : 'bar')} />
            <TabButton icon="layers-outline" label="Layers" active={showLayers} onPress={() => setShowLayers((v) => !v)} />
          </ScrollView>
        </>
      )}
        </>
      )}

      <MenuPoliciesModal
        visible={menuPoliciesOpen}
        onClose={() => setMenuPoliciesOpen(false)}
        project={project}
        pages={pages}
        updateProject={updateProject}
      />

      <Modal visible={bgEditorOpen} transparent animationType="fade" onRequestClose={() => setBgEditorOpen(false)}>
        <View style={styles.bgModalBackdrop}>
          <View style={styles.bgModalCard}>
            <Text style={styles.bgModalTitle}>Page Background</Text>
            <GradientPickerRow
              label="Background"
              solidColor={project.backgroundColor}
              onSolidColorChange={(backgroundColor) => updateProject({ backgroundColor })}
              gradient={project.backgroundGradient}
              onGradientChange={(backgroundGradient) => updateProject({ backgroundGradient })}
            />
            <Pressable style={styles.bgModalDoneBtn} onPress={() => setBgEditorOpen(false)}>
              <Text style={styles.bgModalDoneBtnText}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function TabButton({
  icon,
  label,
  active,
  onPress,
  highlightColor,
}: {
  icon: string;
  label: string;
  active: boolean;
  onPress: () => void;
  // Makes this entry read as a distinct, prominent action (like Shopify's "Add product")
  // instead of blending into the row of otherwise-identical gray design-tool icons -- always
  // tinted, not just when active, so it's easy to spot at a glance while scanning the strip.
  highlightColor?: string;
}) {
  const { theme } = useAppTheme();
  const color = highlightColor ?? (active ? theme.accent : theme.textMuted);
  return (
    <Pressable style={styles.tabButton} onPress={onPress}>
      <Ionicons name={icon as any} size={20} color={active ? theme.accent : color} />
      <Text
        style={[styles.tabButtonLabel, { color }, active && { color: theme.accent }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
      >
        {label}
      </Text>
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
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  layersOverlay: {
    position: 'absolute',
    top: 56,
    right: 12,
    width: 260,
    height: 320,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    zIndex: 50,
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    overflow: 'hidden',
  },
  layersOverlayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F1F5F9',
  },
  layersOverlayTitle: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  navPreview: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#0F172A',
  },
  navPreviewItem: { paddingHorizontal: 10, paddingVertical: 4 },
  navPreviewText: { fontSize: 12, fontWeight: '600', color: '#94A3B8' },
  navPreviewTextActive: { color: '#FFFFFF' },
  canvasArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  canvasScroll: { alignItems: 'center', justifyContent: 'center', flexGrow: 1 },
  generatingFrame: {
    overflow: 'hidden',
    borderRadius: 18,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  tabBar: {
    flexGrow: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    paddingTop: 10,
    paddingBottom: 14,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: -2 },
  },
  tabBarContent: { paddingHorizontal: 8, gap: 4 },
  tabButton: { alignItems: 'center', gap: 4, width: 64, paddingHorizontal: 2 },
  tabButtonLabel: { fontSize: 10, color: '#334155', fontWeight: '600', textAlign: 'center' },
  panel: {
    height: 240,
    backgroundColor: '#FFFFFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E2E8F0',
    paddingTop: 8,
  },
  panelMinimizeBtn: { position: 'absolute', top: 6, right: 12, zIndex: 5, padding: 4 },
  bottomSheet: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E2E8F0',
    paddingTop: 8,
    overflow: 'hidden',
  },
  sheetHandleTouch: {
    alignItems: 'center',
    paddingVertical: 10,
    gap: 2,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E2E8F0',
    alignSelf: 'center',
  },
  minimizedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 10,
  },
  minimizedLabel: { fontSize: 13, fontWeight: '600', flex: 1 },
  bgModalBackdrop: { flex: 1, backgroundColor: '#00000088', alignItems: 'center', justifyContent: 'center', padding: 24 },
  bgModalCard: { width: '100%', maxWidth: 360, backgroundColor: '#FFFFFF', borderRadius: 16, padding: 20 },
  bgModalTitle: { fontSize: 17, fontWeight: '700', color: '#0F172A', marginBottom: 14 },
  bgModalDoneBtn: { marginTop: 4, paddingVertical: 12, borderRadius: 10, alignItems: 'center', backgroundColor: '#111827' },
  bgModalDoneBtnText: { color: '#FFFFFF', fontWeight: '600' },
});
