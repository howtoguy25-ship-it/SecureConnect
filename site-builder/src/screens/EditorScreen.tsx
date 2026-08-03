import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, PanResponder, useWindowDimensions, Modal, Linking } from 'react-native';
import { showAlert } from '@/utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/navigation/types';
import { EditorProvider, useEditor } from '@/context/EditorContext';
import Canvas from '@/components/canvas/Canvas';
import { ProductDetailModal, CollectionDetailModal } from '@/components/canvas/ElementRenderer';
import ElementsPanel from '@/components/elements/ElementsPanel';
import AnnouncementPanel from '@/components/elements/AnnouncementPanel';
import ElementInspector from '@/components/inspector/ElementInspector';
import LayersPanel from '@/components/elements/LayersPanel';
import PageTabsBar, { PageTabsBarHandle } from '@/components/editor/PageTabsBar';
import GradientPickerRow from '@/components/inspector/GradientPickerRow';
import MenuPoliciesModal from '@/components/editor/MenuPoliciesModal';
import ProductCatalogPickerModal from '@/components/editor/ProductCatalogPickerModal';
import ColumnLayoutPickerModal from '@/components/editor/ColumnLayoutPickerModal';
import CanvasSizePickerModal from '@/components/editor/CanvasSizePickerModal';
import { ColumnLayoutTemplate, buildColumnLayout, buildProductGridLayout, ProductGridCardLayout } from '@/data/columnLayouts';
import { LibraryItem } from '@/data/elementsLibrary';
import { generateId } from '@/utils/id';
import { CanvasElement, TextElement, ImageElement, SlideshowElement, VideoElement, ProductElement, CollectionElement, GameElement, WidgetElement, CustomWidgetElement, CatalogProduct, SectionElement } from '@/types';
import { useAuth } from '@/context/AuthContext';
import { productsStore } from '@/storage/productsStore';
import { useAppTheme } from '@/context/AppThemeContext';
import GeneratingOverlay from '@/components/GeneratingOverlay';
import { labelForElement } from '@/utils/elementLabel';
import { CartProvider, useCart } from '@/context/CartContext';
import { useSellerCurrencySymbol } from '@/hooks/useSellerCurrencySymbol';
import CanvasExportView from '@/components/canvas/CanvasExportView';
import { downloadCanvasImage } from '@/services/imageExport';
import { downloadProjectZip } from '@/services/projectExport';

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
    insertElements,
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
    publishStatus,
  } = useEditor();
  const { user } = useAuth();
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
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  // Which Button element (if any) is currently picking a product to link to -- distinct from
  // productPickerOpen (the "+ Add to page" flow, which just inserts with nothing to link).
  const [linkPickerButtonId, setLinkPickerButtonId] = useState<string | null>(null);
  // A locked Button linking straight to a Product opens this real full-screen detail page
  // (see navigateToElementOnLockedTap below) instead of just scrolling that product's small
  // card into view -- matches what tapping the same button on the published site does.
  const [productDetailElementId, setProductDetailElementId] = useState<string | null>(null);
  // Same idea for a Collection: a locked Button linking to one opens the real full-screen
  // 2-column product grid (see CollectionDetailModal) directly, instead of just scrolling its
  // small card into view and requiring a second tap on the card's own "i" button.
  const [collectionDetailElementId, setCollectionDetailElementId] = useState<string | null>(null);
  const [columnPickerOpen, setColumnPickerOpen] = useState(false);
  // null = the global "+ Add to page" flow (lands as a new Section at the bottom of the
  // page); a real section id = "Add columns" from inside that section's own inspector.
  const [columnPickerTargetSectionId, setColumnPickerTargetSectionId] = useState<string | null>(null);
  // Replaces the old horizontal-scrolling tab strip -- a real full-width grid sheet instead
  // of a thin scrollable row sitting right at the screen's bottom edge, which fought with
  // iOS's own edge-swipe-to-exit gesture and made it easy to background the app or mis-tap
  // by accident while just trying to scroll the strip.
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  // Canva-style prebuilt video/social export size picker -- only meaningful for pages whose
  // whole canvas IS the exported media (Video/Social), not a scrollable website page.
  const [sizePickerOpen, setSizePickerOpen] = useState(false);
  // A hidden, full-resolution, chrome-free copy of the canvas (see CanvasExportView) that
  // captureRef screenshots into a real PNG for the Logo "Download Image" button -- a Logo
  // page's own on-screen canvas is scaled to fit the viewport and has selection handles/lock
  // badges layered on top, neither of which belongs in the actual downloaded image.
  const exportViewRef = useRef<View>(null);
  const [downloadingImage, setDownloadingImage] = useState(false);
  const [downloadingSite, setDownloadingSite] = useState(false);
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
  // Measures the real visible room around the canvas so fixed single-composition pages
  // (Video/Logo/Social -- see fitScale below) can be auto-scaled to show the whole page at
  // once, Canva-style, instead of requiring the user to scroll or manually pinch-zoom out
  // just to see their own page.
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });

  if (!project) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator />
      </View>
    );
  }

  const handleDownloadImage = async () => {
    setDownloadingImage(true);
    try {
      await downloadCanvasImage(exportViewRef, project.name);
    } catch (err: any) {
      showAlert('Could not download image', err?.message ?? 'Try again in a moment.');
    } finally {
      setDownloadingImage(false);
    }
  };

  // Website/Video/Social pages download as a real file of their actual published HTML (see
  // projectExport.ts) rather than a flat image -- that only exists once the page has actually
  // been published (publishSlug is what getPublishedSiteExport reads back), so an unpublished
  // page gets a clear nudge to publish first instead of a confusing "not found" error.
  const handleDownloadSite = async () => {
    if (!project.publishSlug) {
      showAlert('Publish first', 'Publish your site to enable downloading it as a real file.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Publish', onPress: () => navigation.navigate('Publish', { projectId: project.id }) },
      ]);
      return;
    }
    setDownloadingSite(true);
    try {
      await downloadProjectZip(project);
    } catch (err: any) {
      showAlert('Could not download', err?.message ?? 'Try again in a moment.');
    } finally {
      setDownloadingSite(false);
    }
  };

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

  // A locked button linking to a Product/Collection on this page should behave the way it
  // really does on the published site: a Product opens its real full-screen detail page (see
  // ProductDetailModal below), a Collection opens its real full-screen 2-column product grid
  // (see CollectionDetailModal below) -- both matching the published site's own full-screen
  // overlays for the same link, rather than just scrolling a small card into view. Anything
  // else still just scrolls into view; selecting would swap the whole bottom UI into the edit
  // inspector, which defeats the entire point of locking the page to preview it read-only.
  const navigateToElementOnLockedTap = (id: string) => {
    const target = activeElements.find((el) => el.id === id);
    if (!target) return;
    if (target.type === 'product') {
      setProductDetailElementId(id);
      return;
    }
    if (target.type === 'collection') {
      setCollectionDetailElementId(id);
      return;
    }
    canvasScrollRef.current?.scrollTo({ y: Math.max(0, target.y - 40), animated: true });
  };

  const collectionDetailElement =
    (activeElements.find((el) => el.id === collectionDetailElementId && el.type === 'collection') as CollectionElement | undefined) ?? null;

  const productDetailElement =
    (activeElements.find((el) => el.id === productDetailElementId && el.type === 'product') as ProductElement | undefined) ?? null;

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
    // Built once with a throwaway center so its real width/height are known, then repositioned
    // via nextStackedPosition -- every build() in elementsLibrary.ts derives x/y as cx - w/2 /
    // cy - h/2, so overwriting x/y directly after the fact is equivalent, just non-overlapping.
    const el = item.build(generateId('el'), canvasCenterX, canvasCenterY);
    const { x, y } = nextStackedPosition(el.width, el.height);
    addElement({ ...el, x, y });
    setPanel(null);
  };

  const addTextBox = () => {
    const { x, y } = nextStackedPosition(160, 32);
    const el: TextElement = {
      id: generateId('el'),
      type: 'text',
      text: 'New text',
      x,
      y,
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
    const { x, y } = nextStackedPosition(160, 160);
    const el: ImageElement = {
      id: generateId('el'),
      type: 'image',
      uri: result.assets[0].uri,
      x,
      y,
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
    // On a dedicated Video Page, the whole point of the page IS this one video -- it fills
    // the real fixed canvas automatically (matching that page format) instead of landing as
    // a small 16:9 card the seller then has to manually stretch to fit. Everywhere else (a
    // video embedded as one element among others on a real website), it keeps the real 16:9
    // landscape default -- 200x140 (close to square) was cramping every video into a
    // letterboxed sliver of its own actual shape, which read as "just a static image" more
    // than an actual video player would.
    const isVideoPage = project.pageType === 'video';
    const width = isVideoPage ? project.canvasSize.width : 300;
    const height = isVideoPage ? project.canvasSize.height : 169;
    const { x, y } = isVideoPage ? { x: 0, y: 0 } : nextStackedPosition(width, height);
    const el: VideoElement = {
      id: generateId('el'),
      type: 'video',
      uri: result.assets[0].uri,
      trimStartMs: 0,
      trimEndMs: null,
      muted: false,
      loop: true,
      autoPlay: false,
      previewSeconds: null,
      audioUri: null,
      audioVolume: 1,
      x,
      y,
      width,
      height,
      zIndex: 5,
    };
    addElement(el);
    select(el.id);
    setPanel(null);
  };

  const addSlideshow = () => {
    const { x, y } = nextStackedPosition(180, 120);
    const el: SlideshowElement = {
      id: generateId('el'),
      type: 'slideshow',
      images: [],
      autoPlay: true,
      intervalMs: 3000,
      x,
      y,
      width: 180,
      height: 120,
      zIndex: 5,
    };
    addElement(el);
    select(el.id);
    setPanel(null);
  };

  // Every "add X" action shares this: place the new element stacked below whatever's already
  // on the page (extending the canvas if needed) rather than dead-center, so a freshly-added
  // element never spawns on top of (and hides) existing content. This is only about where an
  // element FIRST appears -- once placed, it's exactly as freely draggable as anything else,
  // nothing about this constrains it afterward. Products are still the element type most
  // likely to get inserted several in a row while browsing a catalog (hence the original,
  // narrower name this was pulled out of), but the same "don't land on top of things" problem
  // applies to every other element type too, so every addX below uses this same helper.
  const nextStackedPosition = (width: number, height: number) => {
    const lowestBottom = activeElements.reduce((max, el) => Math.max(max, el.y + el.height), 0);
    const gap = activeElements.length > 0 ? 24 : 32;
    const y = lowestBottom + gap;
    const requiredHeight = y + height + 40;
    if (requiredHeight > project.canvasSize.height) {
      updateProject({ canvasSize: { ...project.canvasSize, height: requiredHeight } });
    }
    return { x: (project.canvasSize.width - width) / 2, y };
  };

  // The "insert at top" counterpart to nextStackedPosition: a real reflow, not a free-floating
  // overlap on top of existing content. Every existing element on the page shifts down by
  // exactly `shiftDelta` (only y changes -- x/width/height/rotation/locked/zIndex/section
  // membership on those elements are untouched), and the new content lands where the old top
  // used to be. Canvas height grows by the same delta so nothing overflows. Returns shiftDelta
  // (0 when the page was already empty, since top and bottom are identical there) for the
  // caller to pass straight into insertElements.
  const topStackedPosition = (width: number, height: number) => {
    const topY = activeElements.length > 0 ? Math.min(...activeElements.map((el) => el.y)) : 0;
    const gap = activeElements.length > 0 ? 24 : 32;
    const shiftDelta = activeElements.length > 0 ? height + gap : 0;
    if (shiftDelta > 0) {
      updateProject({ canvasSize: { ...project.canvasSize, height: project.canvasSize.height + shiftDelta } });
    }
    return { x: (project.canvasSize.width - width) / 2, y: topY, shiftDelta };
  };

  const CARD_LAYOUT_SIZE: Record<ProductGridCardLayout, { width: number; height: number }> = {
    portrait: { width: 180, height: 220 },
    square: { width: 200, height: 200 },
    horizontal: { width: 340, height: 130 },
  };

  const insertExistingProduct = (
    product: CatalogProduct,
    cardLayout: ProductGridCardLayout = 'portrait',
    position: 'top' | 'bottom' = 'bottom'
  ) => {
    const { width, height } = CARD_LAYOUT_SIZE[cardLayout];
    const el: ProductElement = {
      id: generateId('el'),
      type: 'product',
      productId: product.id,
      x: 0,
      y: 0,
      width,
      height,
      zIndex: 5,
      ...(cardLayout !== 'portrait' ? { cardLayout } : {}),
    };
    if (position === 'top') {
      const { x, y, shiftDelta } = topStackedPosition(width, height);
      el.x = x;
      el.y = y;
      insertElements([el], shiftDelta);
    } else {
      const { x, y } = nextStackedPosition(width, height);
      el.x = x;
      el.y = y;
      addElement(el);
    }
    select(el.id);
    setPanel(null);
    requestAnimationFrame(() =>
      position === 'top' ? canvasScrollRef.current?.scrollTo({ y: 0, animated: true }) : canvasScrollRef.current?.scrollToEnd({ animated: true })
    );
  };

  // The "select up to 3 products, then Add" flow from ProductCatalogPickerModal. A single
  // selected product is placed exactly like insertExistingProduct (free single-hero
  // placement -- a grid doesn't mean anything for just one item). Two or more get real grid
  // math (buildProductGridLayout) instead of free-floating/stacked placement, each one
  // **locked** by default (DraggableElement.tsx already makes a locked element fully
  // move/resize/rotate-proof while keeping tap-through alive via ProductCardView's
  // conditional Pressable -- no new gesture code needed, and the existing lock badge still
  // lets a seller unlock/rearrange one later if they want), wrapped in a new Section so it
  // reads as one real store-shelf block instead of independently-floating cards. `cardLayout`
  // (chosen in ProductCatalogPickerModal) picks the grid shape via buildProductGridLayout and
  // is stamped onto every inserted element so ElementRenderer/siteHtml.ts render it the same way.
  const insertMultipleProducts = (
    products: CatalogProduct[],
    cardLayout: ProductGridCardLayout = 'portrait',
    position: 'top' | 'bottom' = 'bottom'
  ) => {
    if (products.length === 0) return;
    if (products.length === 1) {
      insertExistingProduct(products[0], cardLayout, position);
      return;
    }

    const sectionWidth = project.canvasSize.width - COLUMN_SECTION_MARGIN * 2;
    const built = buildProductGridLayout(products.length, sectionWidth - COLUMN_SECTION_PADDING * 2, cardLayout);
    const sectionHeight = built.height + COLUMN_SECTION_PADDING * 2;

    let sectionY: number;
    let shiftDelta = 0;
    if (position === 'top') {
      const topY = activeElements.length > 0 ? Math.min(...activeElements.map((el) => el.y)) : 0;
      const gap = activeElements.length > 0 ? 24 : 32;
      shiftDelta = activeElements.length > 0 ? sectionHeight + gap : 0;
      sectionY = topY;
      if (shiftDelta > 0) {
        updateProject({ canvasSize: { ...project.canvasSize, height: project.canvasSize.height + shiftDelta } });
      }
    } else {
      const lowestBottom = activeElements.reduce((max, el) => Math.max(max, el.y + el.height), 0);
      const gap = activeElements.length > 0 ? 24 : 32;
      sectionY = lowestBottom + gap;
      const requiredHeight = sectionY + sectionHeight + 40;
      if (requiredHeight > project.canvasSize.height) {
        updateProject({ canvasSize: { ...project.canvasSize, height: requiredHeight } });
      }
    }

    const productElements: ProductElement[] = products.map((product, i) => ({
      id: generateId('el'),
      type: 'product',
      productId: product.id,
      x: COLUMN_SECTION_MARGIN + COLUMN_SECTION_PADDING + built.cells[i].x,
      y: sectionY + COLUMN_SECTION_PADDING + built.cells[i].y,
      width: built.cells[i].width,
      height: built.cells[i].height,
      zIndex: 0,
      locked: true,
      ...(cardLayout !== 'portrait' ? { cardLayout } : {}),
    }));

    const section: SectionElement = {
      id: generateId('el'),
      type: 'section',
      backgroundColor: project.backgroundColor,
      childIds: productElements.map((p) => p.id),
      x: COLUMN_SECTION_MARGIN,
      y: sectionY,
      width: sectionWidth,
      height: sectionHeight,
      zIndex: 0,
    };
    if (position === 'top') {
      insertElements([section, ...productElements], shiftDelta);
    } else {
      addElement(section);
      productElements.forEach((el) => addElement(el));
    }
    select(section.id);
    setPanel(null);
    requestAnimationFrame(() =>
      position === 'top' ? canvasScrollRef.current?.scrollTo({ y: 0, animated: true }) : canvasScrollRef.current?.scrollToEnd({ animated: true })
    );
  };

  const createNewProductAndInsert = async () => {
    if (!user) return;
    const now = Date.now();
    const product: CatalogProduct = {
      id: generateId('prod'),
      name: '',
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
      createdAt: now,
      updatedAt: now,
    };
    await productsStore.save(user.uid, product);
    const { x, y } = nextStackedPosition(180, 220);
    const el: ProductElement = { id: generateId('el'), type: 'product', productId: product.id, x, y, width: 180, height: 220, zIndex: 5 };
    addElement(el);
    select(el.id);
    setPanel(null);
    navigation.navigate('ProductEdit', { productId: product.id });
  };

  // Links a Button straight to any product in the account catalog, not just one already
  // placed on this page -- inserting it first (stacked below whatever's already here, same
  // spot a plain "+ Product" insert would use) if it isn't on the page yet, so "insert
  // product & link" is one real action instead of two separate manual steps.
  const insertProductAndLinkButton = (buttonId: string, product: CatalogProduct) => {
    const existing = activeElements.find((el): el is ProductElement => el.type === 'product' && el.productId === product.id);
    if (existing) {
      updateElement(buttonId, { linkTargetElementId: existing.id, link: null } as any);
      return;
    }
    const { x, y } = nextStackedPosition(180, 220);
    const el: ProductElement = { id: generateId('el'), type: 'product', productId: product.id, x, y, width: 180, height: 220, zIndex: 5 };
    addElement(el);
    updateElement(buttonId, { linkTargetElementId: el.id, link: null } as any);
    requestAnimationFrame(() => canvasScrollRef.current?.scrollToEnd({ animated: true }));
  };

  // Adds a new text child stacked inside the section's own bounds (not the canvas center),
  // so it visibly lands inside the band it belongs to rather than somewhere unrelated on the
  // page -- each existing child adds a little vertical offset so repeated taps don't stack
  // every new line exactly on top of the last one.
  const addTextToSection = (sectionId: string) => {
    const section = activeElements.find((el): el is SectionElement => el.id === sectionId && el.type === 'section');
    if (!section) return;
    const existingCount = section.childIds.length;
    const el: TextElement = {
      id: generateId('el'),
      type: 'text',
      text: 'New text',
      x: section.x + 16,
      y: Math.min(section.y + 16 + existingCount * 28, section.y + section.height - 32),
      width: Math.max(80, section.width - 32),
      height: 28,
      zIndex: section.zIndex + 1 + existingCount,
      fontSize: 16,
      color: '#0F172A',
      fontWeight: 'normal',
      align: 'left',
    };
    addElement(el);
    updateElement(sectionId, { childIds: [...section.childIds, el.id] } as any);
  };

  // Bulk-applies a font/size to every text child of this section in one action -- the
  // section's own onChange (in ElementInspector) only patches the section itself, so the
  // actual per-child TextElement fontFamily/fontSize fields (what ElementRenderer/siteHtml.ts
  // really read) need to be written here instead, looping over its real children.
  const applySectionTextStyle = (sectionId: string, patch: { fontFamily?: string; fontSize?: number }) => {
    const section = activeElements.find((el): el is SectionElement => el.id === sectionId && el.type === 'section');
    if (!section) return;
    section.childIds.forEach((childId) => {
      const child = activeElements.find((el) => el.id === childId);
      if (child?.type === 'text') updateElement(childId, patch as any);
    });
  };

  const createProductAndLinkButton = async (buttonId: string) => {
    if (!user) return;
    const now = Date.now();
    const product: CatalogProduct = {
      id: generateId('prod'),
      name: '',
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
      createdAt: now,
      updatedAt: now,
    };
    await productsStore.save(user.uid, product);
    const { x, y } = nextStackedPosition(180, 220);
    const el: ProductElement = { id: generateId('el'), type: 'product', productId: product.id, x, y, width: 180, height: 220, zIndex: 5 };
    addElement(el);
    updateElement(buttonId, { linkTargetElementId: el.id, link: null } as any);
    navigation.navigate('ProductEdit', { productId: product.id });
  };

  const addCollection = () => {
    const { x, y } = nextStackedPosition(180, 220);
    const el: CollectionElement = {
      id: generateId('el'),
      type: 'collection',
      name: 'New collection',
      productIds: [],
      x,
      y,
      width: 180,
      height: 220,
      zIndex: 5,
    };
    addElement(el);
    select(el.id);
    setPanel(null);
  };

  // A blank starting Section. addElement always places a freshly-added element at the very
  // front (see its own comment on why), which is exactly backwards for a section -- it needs
  // to sit BEHIND everything so anything added into it later (see addTextToSection) paints in
  // front of its background, so this immediately patches the zIndex back down below whatever
  // else is already on the page right after adding it.
  const addSection = () => {
    const lowestZ = Math.min(0, ...activeElements.map((e) => e.zIndex));
    const { x, y } = nextStackedPosition(300, 200);
    const el: SectionElement = {
      id: generateId('el'),
      type: 'section',
      backgroundColor: '#F1F5F9',
      childIds: [],
      x,
      y,
      width: 300,
      height: 200,
      zIndex: lowestZ - 1,
    };
    addElement(el);
    updateElement(el.id, { zIndex: lowestZ - 1 } as any);
    select(el.id);
    setPanel(null);
  };

  // Wraps a set of already-selected elements (from the Layers panel's group mode) into a new
  // Section sized to their combined bounding box, so an existing AI-generated band like "Why
  // Choose Us" can adopt a real background/shared-font/tap-to-select-as-one-unit section
  // without a full migration -- the children themselves keep their own x/y unchanged, only
  // the new section's own box and their zIndex (so the section paints behind them) change.
  const groupIntoSection = (ids: string[]) => {
    const members = activeElements.filter((el) => ids.includes(el.id));
    if (members.length < 2) return;
    const PADDING = 16;
    const minX = Math.min(...members.map((el) => el.x));
    const minY = Math.min(...members.map((el) => el.y));
    const maxX = Math.max(...members.map((el) => el.x + el.width));
    const maxY = Math.max(...members.map((el) => el.y + el.height));
    const minChildZ = Math.min(...members.map((el) => el.zIndex));
    const el: SectionElement = {
      id: generateId('el'),
      type: 'section',
      backgroundColor: project.backgroundColor,
      childIds: ids,
      x: Math.max(0, minX - PADDING),
      y: Math.max(0, minY - PADDING),
      width: maxX - minX + PADDING * 2,
      height: maxY - minY + PADDING * 2,
      zIndex: minChildZ - 1,
    };
    addElement(el);
    updateElement(el.id, { zIndex: minChildZ - 1 } as any);
    select(el.id);
  };

  // Same horizontal margin every full-width band on the page uses (see insertColumnLayout
  // below and groupIntoSection's own padding) -- kept as one constant so a column layout's
  // outer edges always line up with the canvas the same amount, not a magic number repeated.
  const COLUMN_SECTION_MARGIN = 20;
  const COLUMN_SECTION_PADDING = 16;

  // Drops a pre-built column/row layout (see columnLayouts.ts) as a brand new Section,
  // stacked below whatever's already on the page -- same "never overlap what's already
  // there, extend the canvas if it doesn't fit" placement as nextStackedPosition, just
  // spanning most of the page width instead of a fixed small card size. The section is added
  // *before* its children (not after) specifically so it lands with a lower zIndex than them
  // automatically -- addElement always bumps a fresh element to the very front, so adding the
  // background first and the content after means the content naturally paints on top with no
  // manual zIndex correction needed afterward.
  const insertColumnLayout = (template: ColumnLayoutTemplate) => {
    const sectionWidth = project.canvasSize.width - COLUMN_SECTION_MARGIN * 2;
    const built = buildColumnLayout(template, sectionWidth - COLUMN_SECTION_PADDING * 2);
    const lowestBottom = activeElements.reduce((max, el) => Math.max(max, el.y + el.height), 0);
    const gap = activeElements.length > 0 ? 24 : 32;
    const sectionY = lowestBottom + gap;
    const sectionHeight = built.height + COLUMN_SECTION_PADDING * 2;
    const requiredHeight = sectionY + sectionHeight + 40;
    if (requiredHeight > project.canvasSize.height) {
      updateProject({ canvasSize: { ...project.canvasSize, height: requiredHeight } });
    }

    const childElements: CanvasElement[] = built.elements.map((spec) =>
      spec.kind === 'image'
        ? ({
            id: generateId('el'),
            type: 'image',
            uri: null,
            x: COLUMN_SECTION_MARGIN + COLUMN_SECTION_PADDING + spec.x,
            y: sectionY + COLUMN_SECTION_PADDING + spec.y,
            width: spec.width,
            height: spec.height,
            zIndex: 0,
          } as ImageElement)
        : ({
            id: generateId('el'),
            type: 'text',
            text: spec.text,
            x: COLUMN_SECTION_MARGIN + COLUMN_SECTION_PADDING + spec.x,
            y: sectionY + COLUMN_SECTION_PADDING + spec.y,
            width: spec.width,
            height: spec.height,
            zIndex: 0,
            fontSize: spec.fontSize,
            color: spec.color,
            fontWeight: spec.fontWeight,
            align: 'left',
          } as TextElement)
    );

    const section: SectionElement = {
      id: generateId('el'),
      type: 'section',
      backgroundColor: project.backgroundColor,
      childIds: childElements.map((c) => c.id),
      x: COLUMN_SECTION_MARGIN,
      y: sectionY,
      width: sectionWidth,
      height: sectionHeight,
      zIndex: 0,
    };
    addElement(section);
    childElements.forEach((el) => addElement(el));
    select(section.id);
    requestAnimationFrame(() => canvasScrollRef.current?.scrollToEnd({ animated: true }));
  };

  // "Add columns" from inside an already-existing section's own inspector (e.g. under "Shop
  // Now") -- appends the new content stacked below whatever's already in that section,
  // growing the section's own height (and the canvas, if needed) to fit rather than creating
  // a whole separate section.
  const insertColumnLayoutIntoSection = (sectionId: string, template: ColumnLayoutTemplate) => {
    const section = activeElements.find((el): el is SectionElement => el.id === sectionId && el.type === 'section');
    if (!section) return;
    const built = buildColumnLayout(template, section.width - COLUMN_SECTION_PADDING * 2);
    const existingContentBottom = section.childIds.reduce((max, id) => {
      const child = activeElements.find((el) => el.id === id);
      return child ? Math.max(max, child.y + child.height - section.y) : max;
    }, 0);
    const startY = existingContentBottom > 0 ? existingContentBottom + COLUMN_SECTION_PADDING : COLUMN_SECTION_PADDING;
    const newSectionHeight = startY + built.height + COLUMN_SECTION_PADDING;

    const requiredCanvasHeight = section.y + newSectionHeight + 40;
    if (requiredCanvasHeight > project.canvasSize.height) {
      updateProject({ canvasSize: { ...project.canvasSize, height: requiredCanvasHeight } });
    }

    const childElements: CanvasElement[] = built.elements.map((spec) =>
      spec.kind === 'image'
        ? ({
            id: generateId('el'),
            type: 'image',
            uri: null,
            x: section.x + COLUMN_SECTION_PADDING + spec.x,
            y: section.y + startY + spec.y,
            width: spec.width,
            height: spec.height,
            zIndex: 0,
          } as ImageElement)
        : ({
            id: generateId('el'),
            type: 'text',
            text: spec.text,
            x: section.x + COLUMN_SECTION_PADDING + spec.x,
            y: section.y + startY + spec.y,
            width: spec.width,
            height: spec.height,
            zIndex: 0,
            fontSize: spec.fontSize,
            color: spec.color,
            fontWeight: spec.fontWeight,
            align: 'left',
          } as TextElement)
    );
    childElements.forEach((el) => addElement(el));
    updateElement(sectionId, {
      childIds: [...section.childIds, ...childElements.map((c) => c.id)],
      height: Math.max(section.height, newSectionHeight),
    } as any);
  };

  const addGame = () => {
    // Defaults to Tic-Tac-Toe -- the only kind that's a real, complete, playable game with
    // zero setup; the other kinds (Trivia/Memory/Clicker) need real content first, added via
    // the inspector's kind picker.
    const { x, y } = nextStackedPosition(200, 220);
    const el: GameElement = {
      id: generateId('el'),
      type: 'game',
      kind: 'tictactoe',
      title: 'Tic-Tac-Toe',
      questions: [],
      memorySymbols: [],
      clickerLabel: 'Tap!',
      clickerTarget: 20,
      x,
      y,
      width: 200,
      height: 220,
      zIndex: 5,
    };
    addElement(el);
    select(el.id);
    setPanel(null);
  };

  const addWidget = () => {
    // Defaults to a simple digital local-time clock -- real and complete with zero setup;
    // adding more timezones (a real world clock) or switching to analog happens via the
    // inspector.
    const { x, y } = nextStackedPosition(180, 120);
    const el: WidgetElement = {
      id: generateId('el'),
      type: 'widget',
      kind: 'clock',
      title: 'Clock',
      timezones: [],
      style: 'digital',
      countdownTargetIso: '',
      countdownLabel: '',
      x,
      y,
      width: 180,
      height: 120,
      zIndex: 5,
    };
    addElement(el);
    select(el.id);
    setPanel(null);
  };

  const addCustomWidget = () => {
    // Added blank -- no code yet. The inspector's "Generate" flow (a description input +
    // button) is what actually calls the AI to fill in real code, same as Game/Widget
    // needing their own kind picked before they're a real complete element.
    const { x, y } = nextStackedPosition(200, 200);
    const el: CustomWidgetElement = {
      id: generateId('el'),
      type: 'customWidget',
      title: 'Custom Feature',
      description: '',
      code: '',
      x,
      y,
      width: 200,
      height: 200,
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

  // A website page is a real scrolling page that's SUPPOSED to grow taller than one screen --
  // scrolling it is normal. Logo/Video/Social are each one fixed, single-composition canvas
  // meant to be seen and edited as a whole, Canva-style, so those auto-scale down to fit the
  // real visible room around them instead of forcing the user to scroll (or remember to
  // manually pinch-zoom out) just to see their own page. Never scales UP past 1 -- a small
  // canvas on a big screen just centers at its real size.
  const isFixedComposition = project.pageType !== 'website';
  const fitScale =
    isFixedComposition && viewportSize.width > 0 && viewportSize.height > 0
      ? Math.min(1, viewportSize.width / project.canvasSize.width, viewportSize.height / project.canvasSize.height)
      : 1;

  return (
    <CartProvider publishSlug={project.publishSlug}>
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
              {(project.pageType === 'video' || project.pageType === 'social') && (
                <Pressable onPress={() => setSizePickerOpen(true)} hitSlop={8}>
                  <Ionicons name="expand-outline" size={22} color={theme.text} />
                </Pressable>
              )}
              {project.pageType === 'website' && (
                <Pressable onPress={() => setMenuPoliciesOpen(true)} hitSlop={8}>
                  <Ionicons name="menu-outline" size={22} color={theme.text} />
                </Pressable>
              )}
              {project.pageType === 'website' && <CartHeaderButton onPress={() => setCartOpen(true)} color={theme.text} />}
              {project.pageType === 'logo' ? (
                <Pressable onPress={handleDownloadImage} disabled={downloadingImage} hitSlop={8}>
                  {downloadingImage ? (
                    <ActivityIndicator size="small" color={theme.text} />
                  ) : (
                    <Ionicons name="image-outline" size={22} color={theme.text} />
                  )}
                </Pressable>
              ) : (
                <Pressable onPress={handleDownloadSite} disabled={downloadingSite} hitSlop={8}>
                  {downloadingSite ? (
                    <ActivityIndicator size="small" color={theme.text} />
                  ) : (
                    <Ionicons name="download-outline" size={22} color={theme.text} />
                  )}
                </Pressable>
              )}
            </>
          )}
          {isGenerating ? (
            <View style={{ width: 24 }} />
          ) : (
            <Pressable onPress={() => navigation.navigate('Publish', { projectId: project.id })} hitSlop={8}>
              {publishStatus === 'publishing' ? (
                <View style={[styles.publishStatusPill, { backgroundColor: '#E0E7FF' }]}>
                  <ActivityIndicator size="small" color="#4338CA" />
                  <Text style={[styles.publishStatusText, { color: '#4338CA' }]}>Publishing…</Text>
                </View>
              ) : publishStatus === 'live' ? (
                <View style={[styles.publishStatusPill, { backgroundColor: '#DCFCE7' }]}>
                  <View style={styles.publishStatusDot} />
                  <Text style={[styles.publishStatusText, { color: '#15803D' }]}>Live</Text>
                </View>
              ) : publishStatus === 'blocked' ? (
                <View style={[styles.publishStatusPill, { backgroundColor: '#FEF3C7' }]}>
                  <Ionicons name="warning" size={14} color="#B45309" />
                  <Text style={[styles.publishStatusText, { color: '#B45309' }]}>Not live</Text>
                </View>
              ) : (
                <Ionicons name="cloud-upload-outline" size={24} color={theme.text} />
              )}
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
            onGroupIntoSection={groupIntoSection}
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
      <View style={styles.canvasArea} onLayout={(e) => setViewportSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}>
        <ScrollView
          ref={canvasScrollRef}
          contentContainerStyle={styles.canvasScroll}
          minimumZoomScale={1}
          maximumZoomScale={3}
          bouncesZoom
          pinchGestureEnabled
          scrollEnabled={!canvasInteracting}
        >
          <View
            style={
              isFixedComposition
                ? { width: project.canvasSize.width * fitScale, height: project.canvasSize.height * fitScale }
                : undefined
            }
          >
            <View
              style={
                isFixedComposition
                  ? { width: project.canvasSize.width, height: project.canvasSize.height, transform: [{ scale: fitScale }], transformOrigin: 'top left' }
                  : undefined
              }
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
                onNavigateToElement={navigateToElementOnLockedTap}
                onBackgroundTap={openBackgroundEditor}
                isLastPage={!pages || pages[pages.length - 1]?.id === activePageId}
                onExtend={extendCanvas}
                onScrollToY={(y) => canvasScrollRef.current?.scrollTo({ y: Math.max(0, y - 40), animated: true })}
                onOpenCart={() => setCartOpen(true)}
                scale={fitScale}
              />
            </View>
          </View>
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
              siteName={project.name}
              onPickProductForLink={selectedElement.type === 'button' ? () => setLinkPickerButtonId(selectedElement.id) : undefined}
              onAddSectionText={selectedElement.type === 'section' ? () => addTextToSection(selectedElement.id) : undefined}
              onApplySectionTextStyle={selectedElement.type === 'section' ? (patch) => applySectionTextStyle(selectedElement.id, patch) : undefined}
              onAddSectionColumns={
                selectedElement.type === 'section'
                  ? () => {
                      setColumnPickerTargetSectionId(selectedElement.id);
                      setColumnPickerOpen(true);
                    }
                  : undefined
              }
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
          <View style={[styles.addBar, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
            <Pressable style={[styles.addBarBtn, { backgroundColor: theme.accent }]} onPress={() => setAddMenuOpen(true)}>
              <Ionicons name="add-circle" size={22} color={theme.accentText} />
              <Text style={[styles.addBarBtnText, { color: theme.accentText }]}>Add to page</Text>
            </Pressable>
            <Pressable style={styles.addBarLayersBtn} onPress={() => setShowLayers((v) => !v)}>
              <Ionicons name="layers-outline" size={22} color={showLayers ? theme.accent : theme.textMuted} />
              <Text style={[styles.addBarLayersLabel, { color: showLayers ? theme.accent : theme.textMuted }]}>Layers</Text>
            </Pressable>
          </View>
        </>
      )}

      <Modal visible={addMenuOpen} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setAddMenuOpen(false)}>
        <SafeAreaView style={[styles.addMenuScreen, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
          <View style={[styles.addMenuHeader, { borderBottomColor: theme.border }]}>
            <Pressable onPress={() => setAddMenuOpen(false)} hitSlop={8}>
              <Ionicons name="chevron-back" size={26} color={theme.text} />
            </Pressable>
            <Text style={[styles.addMenuTitle, { color: theme.text }]}>Add to page</Text>
            <View style={{ width: 26 }} />
          </View>
          <ScrollView contentContainerStyle={styles.addMenuScrollContent}>
            <View style={styles.addMenuGrid}>
              <AddMenuTile icon="shapes-outline" label="Elements" onPress={() => { setAddMenuOpen(false); setPanel('elements'); }} />
              <AddMenuTile icon="text-outline" label="Text" onPress={() => { setAddMenuOpen(false); addTextBox(); }} />
              <AddMenuTile icon="image-outline" label="Image" onPress={() => { setAddMenuOpen(false); addImage(); }} />
              <AddMenuTile icon="images-outline" label="Slideshow" onPress={() => { setAddMenuOpen(false); addSlideshow(); }} />
              <AddMenuTile icon="videocam-outline" label="Video" onPress={() => { setAddMenuOpen(false); addVideo(); }} />
              {project.pageType === 'website' && (
                <>
                  <AddMenuTile icon="pricetag-outline" label="Product" highlightColor="#16A34A" onPress={() => { setAddMenuOpen(false); setProductPickerOpen(true); }} />
                  <AddMenuTile icon="albums-outline" label="Collection" onPress={() => { setAddMenuOpen(false); addCollection(); }} />
                </>
              )}
              <AddMenuTile icon="copy-outline" label="Section" onPress={() => { setAddMenuOpen(false); addSection(); }} />
              {pages && (
                <AddMenuTile
                  icon="document-outline"
                  label="Add Page"
                  onPress={() => {
                    setAddMenuOpen(false);
                    addPage(`Page ${pages.length + 1}`);
                  }}
                />
              )}
              <AddMenuTile
                icon="grid-outline"
                label="Columns"
                onPress={() => {
                  setAddMenuOpen(false);
                  setColumnPickerTargetSectionId(null);
                  setColumnPickerOpen(true);
                }}
              />
              <AddMenuTile icon="game-controller-outline" label="Game" onPress={() => { setAddMenuOpen(false); addGame(); }} />
              <AddMenuTile icon="time-outline" label="Widget" onPress={() => { setAddMenuOpen(false); addWidget(); }} />
              <AddMenuTile icon="sparkles-outline" label="Custom" highlightColor="#7C3AED" onPress={() => { setAddMenuOpen(false); addCustomWidget(); }} />
              <AddMenuTile icon="megaphone-outline" label="Bar" onPress={() => { setAddMenuOpen(false); setPanel('bar'); }} />
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
        </>
      )}

      {user && (
        <MenuPoliciesModal
          visible={menuPoliciesOpen}
          onClose={() => setMenuPoliciesOpen(false)}
          project={project}
          pages={pages}
          updateProject={updateProject}
          uid={user.uid}
        />
      )}

      {user && (
        <ProductCatalogPickerModal
          visible={productPickerOpen}
          onClose={() => setProductPickerOpen(false)}
          uid={user.uid}
          onInsert={insertExistingProduct}
          onInsertMultiple={insertMultipleProducts}
          onCreateNew={createNewProductAndInsert}
        />
      )}

      {user && (
        <ProductCatalogPickerModal
          visible={!!linkPickerButtonId}
          onClose={() => setLinkPickerButtonId(null)}
          uid={user.uid}
          onInsert={(product) => linkPickerButtonId && insertProductAndLinkButton(linkPickerButtonId, product)}
          onCreateNew={() => linkPickerButtonId && createProductAndLinkButton(linkPickerButtonId)}
        />
      )}

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

      <ColumnLayoutPickerModal
        visible={columnPickerOpen}
        onClose={() => setColumnPickerOpen(false)}
        onInsert={(template) => {
          if (columnPickerTargetSectionId) insertColumnLayoutIntoSection(columnPickerTargetSectionId, template);
          else insertColumnLayout(template);
        }}
      />

      <ProductDetailModal element={productDetailElement} onClose={() => setProductDetailElementId(null)} />
      <CollectionDetailModal
        element={collectionDetailElement}
        allElements={activeElements}
        onClose={() => setCollectionDetailElementId(null)}
      />

      <CartSheetModal visible={cartOpen} onClose={() => setCartOpen(false)} />

      <CanvasSizePickerModal
        visible={sizePickerOpen}
        onClose={() => setSizePickerOpen(false)}
        onSelect={(canvasSize) => updateProject({ canvasSize })}
      />

      {project.pageType === 'logo' && (
        <View style={{ position: 'absolute', left: -100000, top: 0 }} pointerEvents="none">
          <CanvasExportView ref={exportViewRef} project={project} />
        </View>
      )}
    </SafeAreaView>
    </CartProvider>
  );
}

// A real shopping-bag icon + item-count badge in the header, matching the "beside like a
// professional business site" cart counter every seller storefront has -- reads straight off
// CartContext (see that file), so it stays in sync with every Add to Cart tap anywhere on the
// canvas without any prop drilling.
function CartHeaderButton({ onPress, color }: { onPress: () => void; color: string }) {
  const cart = useCart();
  return (
    <Pressable onPress={onPress} hitSlop={8} style={{ position: 'relative' }}>
      <Ionicons name="bag-outline" size={22} color={color} />
      {cart.itemCount > 0 && (
        <View style={styles.cartBadge}>
          <Text style={styles.cartBadgeText}>{cart.itemCount > 99 ? '99+' : cart.itemCount}</Text>
        </View>
      )}
    </Pressable>
  );
}

// Lists what's in the in-editor cart (real CartContext state, shared with every product's
// buy buttons on the canvas) and lets the seller check out for real -- the same
// createStoreCheckout Stripe session the published site's own cart uses, just invoked
// directly instead of via baked published-site JS (see CartContext's comment).
function CartSheetModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { theme } = useAppTheme();
  const cart = useCart();
  const sym = useSellerCurrencySymbol();
  const total = cart.items.reduce((sum, i) => sum + i.priceUsd * i.quantity, 0);

  const handleCheckout = async () => {
    try {
      await cart.checkout();
      onClose();
    } catch (err: any) {
      showAlert('Could not start checkout', err?.message ?? 'Try again in a moment.');
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.bgModalBackdrop}>
        <View style={[styles.bgModalCard, { backgroundColor: theme.surface }]}>
          <Text style={[styles.bgModalTitle, { color: theme.text }]}>Your Cart</Text>
          {!cart.canCheckout && (
            <Text style={[styles.cartHelperText, { color: theme.textMuted }]}>Publish your site to enable real checkout.</Text>
          )}
          {cart.items.length === 0 ? (
            <Text style={[styles.cartHelperText, { color: theme.textMuted }]}>Your cart is empty.</Text>
          ) : (
            <ScrollView style={{ maxHeight: 280 }}>
              {cart.items.map((item) => (
                <View key={item.productId + (item.variantKey ?? '')} style={styles.cartRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.cartRowName, { color: theme.text }]} numberOfLines={1}>
                      {item.name || 'Untitled product'} {item.quantity > 1 ? `x${item.quantity}` : ''}
                    </Text>
                    {!!item.variantLabel && <Text style={[styles.cartRowVariant, { color: theme.textMuted }]}>{item.variantLabel}</Text>}
                  </View>
                  <Text style={[styles.cartRowPrice, { color: theme.text }]}>
                    {sym}{(item.priceUsd * item.quantity).toFixed(2)}
                  </Text>
                  <Pressable onPress={() => cart.removeItem(item.productId, item.variantKey)} hitSlop={8}>
                    <Ionicons name="close-circle" size={20} color={theme.textMuted} />
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          )}
          {cart.items.length > 0 && (
            <Text style={[styles.cartTotal, { color: theme.text }]}>Total: {sym}{total.toFixed(2)}</Text>
          )}
          <Pressable
            style={[styles.bgModalDoneBtn, { backgroundColor: theme.accent }, (!cart.canCheckout || cart.items.length === 0 || cart.processing) && { opacity: 0.5 }]}
            disabled={!cart.canCheckout || cart.items.length === 0 || cart.processing}
            onPress={handleCheckout}
          >
            {cart.processing ? (
              <ActivityIndicator color={theme.accentText} />
            ) : (
              <Text style={[styles.bgModalDoneBtnText, { color: theme.accentText }]}>Checkout</Text>
            )}
          </Pressable>
          <Pressable style={[styles.bgModalDoneBtn, { backgroundColor: 'transparent', marginTop: 4 }]} onPress={onClose}>
            <Text style={[styles.bgModalDoneBtnText, { color: theme.textMuted }]}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// Large, always-visible grid tile used inside the "Add to page" sheet -- deliberately much
// bigger than the old tab-bar icons so every option is a single confident tap, no scrolling
// or precision-tapping on a tiny target required.
function AddMenuTile({
  icon,
  label,
  onPress,
  highlightColor,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  highlightColor?: string;
}) {
  const { theme } = useAppTheme();
  return (
    <Pressable style={styles.addMenuTile} onPress={onPress}>
      <View style={[styles.addMenuTileIcon, { backgroundColor: theme.background }]}>
        <Ionicons name={icon as any} size={26} color={highlightColor ?? theme.accent} />
      </View>
      <Text style={[styles.addMenuTileLabel, { color: theme.text }]} numberOfLines={1}>
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
  publishStatusPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  publishStatusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#16A34A' },
  publishStatusText: { fontSize: 12, fontWeight: '700' },
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
  addBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 14,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: -2 },
  },
  addBarBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, paddingVertical: 12 },
  addBarBtnText: { fontSize: 15, fontWeight: '700' },
  addBarLayersBtn: { alignItems: 'center', gap: 2, paddingHorizontal: 6, minWidth: 56 },
  addBarLayersLabel: { fontSize: 10, fontWeight: '600' },
  addMenuScreen: { flex: 1 },
  addMenuHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  addMenuScrollContent: { padding: 20, alignItems: 'center' },
  addMenuTitle: { fontSize: 17, fontWeight: '700' },
  addMenuGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 16, width: '100%' },
  addMenuTile: { width: 90, alignItems: 'center', gap: 8, paddingVertical: 8 },
  addMenuTileIcon: { width: 60, height: 60, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  addMenuTileLabel: { fontSize: 12, fontWeight: '600', textAlign: 'center' },
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
  cartBadge: {
    position: 'absolute',
    top: -6,
    right: -8,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  cartBadgeText: { color: '#FFFFFF', fontSize: 9, fontWeight: '700' },
  cartHelperText: { fontSize: 13, marginBottom: 12 },
  cartRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E2E8F0' },
  cartRowName: { fontSize: 13, fontWeight: '600' },
  cartRowVariant: { fontSize: 11, marginTop: 2 },
  cartRowPrice: { fontSize: 13, fontWeight: '700' },
  cartTotal: { fontSize: 15, fontWeight: '800', marginTop: 12, textAlign: 'right' },
});
