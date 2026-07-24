import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Image, StyleSheet, Animated, Pressable, Modal, ScrollView, Linking, ActivityIndicator } from 'react-native';
import Svg, { Rect, Circle, Polygon, Line, Path } from 'react-native-svg';
import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from '@expo/vector-icons';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useAudioPlayer } from 'expo-audio';
import { LinearGradient } from 'expo-linear-gradient';
import { CanvasElement, VideoElement, VideoEmbedElement, ProductElement, CollectionElement, CatalogProduct } from '@/types';
import { useGoogleFont } from '@/utils/useGoogleFont';
import { gradientStartEnd } from '@/utils/gradient';
import { useCatalogProduct } from '@/hooks/useCatalogProduct';
import { resolveProductView } from '@/utils/resolveProduct';
import GameView from '@/components/canvas/GameView';
import WidgetView from '@/components/canvas/WidgetView';
import CustomWidgetView from '@/components/canvas/CustomWidgetView';
import { useAuth } from '@/context/AuthContext';
import { sellerAccountStore } from '@/services/store';
import { currencySymbol } from '@/utils/currency';

function useSellerCurrencySymbol(): string {
  const { user } = useAuth();
  const [currency, setCurrency] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!user) return;
    return sellerAccountStore.subscribe(user.uid, (account) => setCurrency(account?.currency));
  }, [user]);
  return currencySymbol(currency);
}

const ICON_SETS = { Ionicons, MaterialCommunityIcons, FontAwesome5 };

function ShapeSvg({ kind, color, width, height }: { kind: string; color: string; width: number; height: number }) {
  switch (kind) {
    case 'circle':
      return (
        <Svg width={width} height={height}>
          <Circle cx={width / 2} cy={height / 2} r={Math.min(width, height) / 2} fill={color} />
        </Svg>
      );
    case 'rounded-rectangle':
      return (
        <Svg width={width} height={height}>
          <Rect x={0} y={0} width={width} height={height} rx={Math.min(width, height) * 0.2} fill={color} />
        </Svg>
      );
    case 'triangle':
      return (
        <Svg width={width} height={height}>
          <Polygon points={`${width / 2},0 ${width},${height} 0,${height}`} fill={color} />
        </Svg>
      );
    case 'line':
      return (
        <Svg width={width} height={Math.max(height, 4)}>
          <Line x1={0} y1={height / 2} x2={width} y2={height / 2} stroke={color} strokeWidth={Math.max(height, 2)} />
        </Svg>
      );
    case 'star': {
      const cx = width / 2;
      const cy = height / 2;
      const outerR = Math.min(width, height) / 2;
      const innerR = outerR * 0.45;
      let points = '';
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? outerR : innerR;
        const angle = (Math.PI / 5) * i - Math.PI / 2;
        points += `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)} `;
      }
      return (
        <Svg width={width} height={height}>
          <Polygon points={points.trim()} fill={color} />
        </Svg>
      );
    }
    default:
      return (
        <Svg width={width} height={height}>
          <Rect x={0} y={0} width={width} height={height} fill={color} />
        </Svg>
      );
  }
}

function SlideshowView({ images, autoPlay, intervalMs, width, height }: { images: string[]; autoPlay: boolean; intervalMs: number; width: number; height: number }) {
  const [index, setIndex] = useState(0);
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!autoPlay || images.length <= 1) return;
    const timer = setInterval(() => {
      Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => {
        setIndex((i) => (i + 1) % images.length);
        Animated.timing(opacity, { toValue: 1, duration: 250, useNativeDriver: true }).start();
      });
    }, intervalMs);
    return () => clearInterval(timer);
  }, [autoPlay, images.length, intervalMs, opacity]);

  if (images.length === 0) {
    return (
      <View style={[styles.placeholder, { width, height }]}>
        <Ionicons name="images-outline" size={28} color="#94A3B8" />
        <Text style={styles.placeholderText}>Slideshow — add images</Text>
      </View>
    );
  }

  return (
    <Animated.View style={{ width, height, opacity }}>
      <Image source={{ uri: images[index % images.length] }} style={{ width, height, borderRadius: 8 }} resizeMode="cover" />
    </Animated.View>
  );
}

// A second clip's audio can stand in for (or layer over) the main clip's own sound --
// kept in sync by mirroring play/pause state and resetting position together on loop,
// since expo-video and expo-audio are independent native players with no built-in link.
function VideoElementView({ element, width, height }: { element: VideoElement; width: number; height: number }) {
  const player = useVideoPlayer(element.uri, (p) => {
    p.loop = element.loop;
    p.muted = element.muted;
    if (element.trimStartMs > 0) p.currentTime = element.trimStartMs / 1000;
  });
  const audioPlayer = useAudioPlayer(element.audioUri);

  useEffect(() => {
    player.muted = element.muted;
    player.loop = element.loop;
  }, [player, element.muted, element.loop]);

  useEffect(() => {
    if (element.audioUri) audioPlayer.volume = element.audioVolume;
  }, [audioPlayer, element.audioUri, element.audioVolume]);

  useEffect(() => {
    if (!element.uri) return;
    const timeSub = player.addListener('timeUpdate', (payload) => {
      const endSec = element.trimEndMs != null ? element.trimEndMs / 1000 : player.duration;
      if (endSec > 0 && payload.currentTime >= endSec) {
        if (element.loop) {
          player.currentTime = element.trimStartMs / 1000;
          if (element.audioUri) audioPlayer.currentTime = 0;
        } else {
          player.pause();
          audioPlayer.pause();
        }
      }
    });
    const playingSub = player.addListener('playingChange', (payload) => {
      if (!element.audioUri) return;
      if (payload.isPlaying) audioPlayer.play();
      else audioPlayer.pause();
    });
    return () => {
      timeSub.remove();
      playingSub.remove();
    };
  }, [player, audioPlayer, element.uri, element.audioUri, element.trimStartMs, element.trimEndMs, element.loop]);

  if (!element.uri) {
    return (
      <View style={[styles.placeholder, { width, height }]}>
        <Ionicons name="videocam-outline" size={28} color="#94A3B8" />
        <Text style={styles.placeholderText}>Tap to add video</Text>
      </View>
    );
  }

  return (
    <VideoView
      player={player}
      style={{ width, height, borderRadius: 8, backgroundColor: '#000' }}
      contentFit="cover"
      nativeControls={false}
    />
  );
}

// A real, already-existing video (currently only YouTube), not one the user recorded --
// shown here as its real public thumbnail with a play overlay rather than a live embedded
// player, since a page with several of these would otherwise mean several simultaneous
// WebViews/iframes just sitting in the editor canvas. Tapping opens the actual video --
// the published site (siteHtml.ts) renders a real playable <iframe> embed instead.
function VideoEmbedView({ element, width, height }: { element: VideoEmbedElement; width: number; height: number }) {
  return (
    <Pressable
      style={[styles.videoEmbedWrap, { width, height }]}
      onPress={() => Linking.openURL(`https://www.youtube.com/watch?v=${element.videoId}`)}
    >
      <Image
        source={{ uri: `https://img.youtube.com/vi/${element.videoId}/hqdefault.jpg` }}
        style={{ width, height }}
        resizeMode="cover"
      />
      <View style={styles.videoPlayOverlay}>
        <Ionicons name="play" size={Math.max(20, Math.min(width, height) * 0.22)} color="#FFFFFF" />
      </View>
      {!!element.title && (
        <View style={styles.videoTitleBar}>
          <Text numberOfLines={1} style={styles.videoTitleText}>
            {element.title}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

function productBadge(product: CatalogProduct): string {
  if (product.saleType === 'service') {
    return `Service${product.serviceDurationMinutes ? ` · ${product.serviceDurationMinutes}m` : ''}`;
  }
  if (product.saleType === 'digital') return 'Digital download';
  return product.fulfillment === 'delivery' ? 'Delivery' : product.fulfillment === 'both' ? 'Delivery/Pickup' : 'Pickup';
}

// Editor-only preview of a sellable product block -- the real published version (with a
// working "Add to Cart" button and live stock) is rendered separately in
// firebase/functions/src/siteHtml.ts, since that has to be real static HTML a buyer's
// browser can actually check out from, not a React Native view.
//
// Below a certain size a card physically doesn't have room for an image plus three lines of
// text without crushing them together -- rather than shrink everything proportionally (which
// is what made the price/image overlap illegibly), the image is dropped entirely once there's
// not enough height left for it, and the "i" button always opens a full, uncramped read-only
// view of everything the user actually set (DraggableElement also enforces a real minimum
// size for this element type so it can't be dragged smaller than a legible card in the first
// place).
// Swipeable photo carousel for the product detail modal -- up to 7 photos, dot pagination.
function ProductImageCarousel({ images, height }: { images: string[]; height: number }) {
  const [page, setPage] = useState(0);
  const [carouselWidth, setCarouselWidth] = useState(0);

  if (images.length <= 1) {
    return images[0] ? (
      <Image source={{ uri: images[0] }} style={[styles.detailImage, { height }]} resizeMode="cover" />
    ) : (
      <View style={[styles.placeholder, styles.detailImage, { height }]}>
        <Ionicons name="pricetag-outline" size={36} color="#94A3B8" />
      </View>
    );
  }

  return (
    <View style={{ marginBottom: 12 }} onLayout={(e) => setCarouselWidth(e.nativeEvent.layout.width)}>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        style={{ borderRadius: 10, overflow: 'hidden' }}
        onMomentumScrollEnd={(e) => {
          if (carouselWidth > 0) setPage(Math.round(e.nativeEvent.contentOffset.x / carouselWidth));
        }}
      >
        {images.map((uri, idx) => (
          <Image key={uri + idx} source={{ uri }} style={{ width: carouselWidth, height }} resizeMode="cover" />
        ))}
      </ScrollView>
      <View style={styles.carouselDots}>
        {images.map((_, idx) => (
          <View key={idx} style={[styles.carouselDot, idx === page && styles.carouselDotActive]} />
        ))}
      </View>
    </View>
  );
}

// Compact swipeable gallery for the product card face itself -- mirrors the published
// site's always-visible inline gallery (siteHtml.ts's product case) instead of only showing
// images[0] with the full carousel gated behind the "i" info modal, so what a seller sees
// while editing resembles what a visitor actually gets. Dots overlay the image (no extra
// height) since the card's already-tight text-area budget has no room to spare.
function ProductCardGallery({ images, width, height, compact }: { images: string[]; width: number; height: number; compact: boolean }) {
  const [page, setPage] = useState(0);

  if (images.length === 0) {
    return (
      <View style={[styles.placeholder, { width, height, borderRadius: 0 }]}>
        <Ionicons name="pricetag-outline" size={compact ? 16 : 24} color="#94A3B8" />
      </View>
    );
  }
  if (images.length === 1) {
    return <Image source={{ uri: images[0] }} style={{ width, height }} resizeMode="cover" />;
  }
  return (
    <View style={{ width, height }}>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
      >
        {images.map((uri, idx) => (
          <Image key={uri + idx} source={{ uri }} style={{ width, height }} resizeMode="cover" />
        ))}
      </ScrollView>
      <View style={{ position: 'absolute', bottom: 4, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 4 }}>
        {images.map((_, idx) => (
          <View
            key={idx}
            style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: idx === page ? '#fff' : 'rgba(255,255,255,0.55)' }}
          />
        ))}
      </View>
    </View>
  );
}

function ProductCardView({ element, width, height }: { element: ProductElement; width: number; height: number }) {
  const [showDetail, setShowDetail] = useState(false);
  const catalogProduct = useCatalogProduct(element.productId);
  const MIN_TEXT_AREA = 62;
  const showImage = height - MIN_TEXT_AREA >= 28;
  const imageHeight = showImage ? Math.min(height * 0.55, height - MIN_TEXT_AREA) : 0;
  const compact = width < 110;
  const sym = useSellerCurrencySymbol();

  if (catalogProduct === undefined) {
    return (
      <View style={[styles.placeholder, { width, height, borderRadius: 10 }]}>
        <ActivityIndicator size="small" color="#94A3B8" />
      </View>
    );
  }

  const product = resolveProductView(element, catalogProduct);
  const inStock = product.inStock !== false;

  return (
    <View style={{ width, height, backgroundColor: '#FFFFFF', borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0', overflow: 'hidden' }}>
      {showImage && <ProductCardGallery images={product.images} width={width} height={imageHeight} compact={compact} />}
      {!inStock && (
        <View style={styles.outOfStockBadge}>
          <Text style={styles.outOfStockBadgeText}>Out of stock</Text>
        </View>
      )}
      <View style={{ padding: compact ? 6 : 8, flex: 1 }}>
        <Text numberOfLines={1} style={{ fontSize: compact ? 8 : 9, fontWeight: '700', color: '#4338CA', textTransform: 'uppercase' }}>
          {productBadge(product)}
        </Text>
        <Text numberOfLines={1} style={{ fontWeight: '700', fontSize: compact ? 11 : 13, color: '#0F172A', marginTop: 1 }}>
          {product.name || 'Untitled product'}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
          <Text style={{ fontSize: compact ? 11 : 13, color: '#4338CA', fontWeight: '700' }}>{sym}{product.priceUsd.toFixed(2)}</Text>
          {product.compareAtPriceUsd != null && product.compareAtPriceUsd > product.priceUsd && !compact && (
            <Text style={{ fontSize: 11, color: '#94A3B8', textDecorationLine: 'line-through' }}>
              {sym}{product.compareAtPriceUsd.toFixed(2)}
            </Text>
          )}
        </View>
        {product.trackInventory && !compact ? (
          <Text numberOfLines={1} style={{ fontSize: 10, color: inStock ? '#94A3B8' : '#DC2626', marginTop: 2, fontWeight: inStock ? '400' : '700' }}>
            {inStock
              ? `${product.initialStock ?? 0} ${product.saleType === 'service' ? 'bookings left' : 'available'}`
              : 'Out of stock'}
          </Text>
        ) : !compact ? (
          <Text numberOfLines={1} style={{ fontSize: 10, color: inStock ? '#16A34A' : '#DC2626', marginTop: 2, fontWeight: '700' }}>
            {inStock ? 'In stock' : 'Out of stock'}
          </Text>
        ) : null}
      </View>

      <Pressable style={styles.productInfoBtn} onPress={() => setShowDetail(true)} hitSlop={8}>
        <Ionicons name="information" size={13} color="#FFFFFF" />
      </Pressable>

      <Modal visible={showDetail} transparent animationType="fade" onRequestClose={() => setShowDetail(false)}>
        <View style={styles.detailBackdrop}>
          <View style={styles.detailCard}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <ProductImageCarousel images={product.images} height={180} />
              <Text style={styles.detailBadge}>{productBadge(product)}</Text>
              <Text style={styles.detailName}>{product.name || 'Untitled product'}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                <Text style={styles.detailPrice}>{sym}{product.priceUsd.toFixed(2)}</Text>
                {product.compareAtPriceUsd != null && product.compareAtPriceUsd > product.priceUsd && (
                  <Text style={{ fontSize: 15, color: '#94A3B8', textDecorationLine: 'line-through' }}>
                    {sym}{product.compareAtPriceUsd.toFixed(2)}
                  </Text>
                )}
              </View>
              {!!product.description && <Text style={styles.detailDescription}>{product.description}</Text>}
              <Text style={[styles.detailStock, { color: inStock ? '#16A34A' : '#DC2626', fontWeight: '700' }]}>
                {inStock
                  ? product.trackInventory
                    ? `${product.initialStock ?? 0} ${product.saleType === 'service' ? 'bookings available' : 'available'}`
                    : product.saleType === 'service'
                      ? 'Available to book'
                      : 'In stock'
                  : 'Out of stock'}
              </Text>
            </ScrollView>
            <Pressable style={styles.detailCloseBtn} onPress={() => setShowDetail(false)}>
              <Text style={styles.detailCloseBtnText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// Each grid thumbnail/detail row resolves its own catalog product independently -- a real
// React component per item (not a loop of hook calls inside one component), so calling
// useCatalogProduct here is safe even though CollectionView itself renders a variable number
// of these.
function CollectionThumb({ productElement, width, height, iconSize }: { productElement: ProductElement; width: number; height: number; iconSize: number }) {
  const catalogProduct = useCatalogProduct(productElement.productId);
  if (catalogProduct === undefined) {
    return (
      <View style={[styles.placeholder, { width, height, borderRadius: 0 }]}>
        <ActivityIndicator size="small" color="#94A3B8" />
      </View>
    );
  }
  const product = resolveProductView(productElement, catalogProduct);
  return product.images[0] ? (
    <Image source={{ uri: product.images[0] }} style={{ width, height }} resizeMode="cover" />
  ) : (
    <View style={[styles.placeholder, { width, height, borderRadius: 0 }]}>
      <Ionicons name="pricetag-outline" size={iconSize} color="#94A3B8" />
    </View>
  );
}

function CollectionDetailRow({ productElement, sym }: { productElement: ProductElement; sym: string }) {
  const catalogProduct = useCatalogProduct(productElement.productId);
  const product = resolveProductView(productElement, catalogProduct ?? null);
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 8,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: '#E2E8F0',
      }}
    >
      {product.images[0] ? (
        <Image source={{ uri: product.images[0] }} style={{ width: 44, height: 44, borderRadius: 8 }} resizeMode="cover" />
      ) : (
        <View style={[styles.placeholder, { width: 44, height: 44 }]}>
          <Ionicons name="pricetag-outline" size={14} color="#94A3B8" />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ fontWeight: '700', fontSize: 13, color: '#0F172A' }}>
          {product.name || 'Untitled product'}
        </Text>
        <Text style={{ fontSize: 12, color: '#4338CA', fontWeight: '700' }}>{sym}{product.priceUsd.toFixed(2)}</Text>
      </View>
    </View>
  );
}

function CollectionView({
  element,
  allElements,
  width,
  height,
}: {
  element: CollectionElement;
  allElements: CanvasElement[];
  width: number;
  height: number;
}) {
  const [showDetail, setShowDetail] = useState(false);
  const products = element.productIds
    .map((id) => allElements.find((el) => el.id === id))
    .filter((el): el is ProductElement => !!el && el.type === 'product');
  const compact = width < 110;
  const MIN_TEXT_AREA = 62;
  const showGrid = height - MIN_TEXT_AREA >= 28;
  const gridHeight = showGrid ? Math.min(height * 0.55, height - MIN_TEXT_AREA) : 0;
  const thumbs = products.slice(0, 4);
  const sym = useSellerCurrencySymbol();

  return (
    <View style={{ width, height, backgroundColor: '#FFFFFF', borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0', overflow: 'hidden' }}>
      {showGrid &&
        (thumbs.length > 0 ? (
          <View style={{ width, height: gridHeight, flexDirection: 'row', flexWrap: 'wrap' }}>
            {thumbs.map((p) => (
              <View key={p.id} style={{ width: width / 2, height: gridHeight / 2 }}>
                <CollectionThumb productElement={p} width={width / 2} height={gridHeight / 2} iconSize={compact ? 12 : 18} />
              </View>
            ))}
          </View>
        ) : (
          <View style={[styles.placeholder, { width, height: gridHeight, borderRadius: 0 }]}>
            <Ionicons name="albums-outline" size={compact ? 16 : 24} color="#94A3B8" />
          </View>
        ))}
      <View style={{ padding: compact ? 6 : 8, flex: 1 }}>
        <Text numberOfLines={1} style={{ fontSize: compact ? 8 : 9, fontWeight: '700', color: '#4338CA', textTransform: 'uppercase' }}>
          Collection
        </Text>
        <Text numberOfLines={1} style={{ fontWeight: '700', fontSize: compact ? 11 : 13, color: '#0F172A', marginTop: 1 }}>
          {element.name || 'Untitled collection'}
        </Text>
        {!compact && (
          <Text numberOfLines={1} style={{ fontSize: 10, color: '#64748B', marginTop: 2 }}>
            {products.length} {products.length === 1 ? 'item' : 'items'}
          </Text>
        )}
      </View>

      <Pressable style={styles.productInfoBtn} onPress={() => setShowDetail(true)} hitSlop={8}>
        <Ionicons name="information" size={13} color="#FFFFFF" />
      </Pressable>

      <Modal visible={showDetail} transparent animationType="fade" onRequestClose={() => setShowDetail(false)}>
        <View style={styles.detailBackdrop}>
          <View style={styles.detailCard}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.detailBadge}>Collection</Text>
              <Text style={styles.detailName}>{element.name || 'Untitled collection'}</Text>
              {products.length === 0 ? (
                <Text style={styles.detailDescription}>No products added yet — edit this collection to pick some.</Text>
              ) : (
                products.map((p) => <CollectionDetailRow key={p.id} productElement={p} sym={sym} />)
              )}
            </ScrollView>
            <Pressable style={styles.detailCloseBtn} onPress={() => setShowDetail(false)}>
              <Text style={styles.detailCloseBtnText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

export default function ElementRenderer({ element, allElements }: { element: CanvasElement; allElements: CanvasElement[] }) {
  const { width, height } = element;
  // Called unconditionally (rules-of-hooks) regardless of element.type -- resolves to
  // undefined for anything but a text element with a custom font picked.
  const textFontFamily = useGoogleFont(element.type === 'text' ? element.fontFamily : undefined);

  switch (element.type) {
    case 'text':
      return (
        <Text
          style={{
            width,
            height,
            fontSize: element.fontSize,
            color: element.color,
            fontWeight: element.fontWeight,
            textAlign: element.align,
            ...(textFontFamily ? { fontFamily: textFontFamily } : null),
          }}
        >
          {element.text}
        </Text>
      );
    case 'image':
      return element.uri ? (
        <Image source={{ uri: element.uri }} style={{ width, height, borderRadius: 8 }} resizeMode="cover" />
      ) : (
        <View style={[styles.placeholder, { width, height }]}>
          <Ionicons name="image-outline" size={28} color="#94A3B8" />
          <Text style={styles.placeholderText}>Tap to add image</Text>
        </View>
      );
    case 'shape':
      return <ShapeSvg kind={element.shapeKind} color={element.color} width={width} height={height} />;
    case 'button': {
      const buttonInnerStyle = {
        width,
        height,
        borderRadius: element.borderRadius,
        borderWidth: element.borderWidth ?? 0,
        borderColor: element.borderColor ?? 'transparent',
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
      };
      if (element.backgroundGradient) {
        const { start, end } = gradientStartEnd(element.backgroundGradient.angle);
        return (
          <LinearGradient colors={element.backgroundGradient.colors} start={start} end={end} style={buttonInnerStyle}>
            <Text style={{ color: element.textColor, fontWeight: '600' }}>{element.label}</Text>
          </LinearGradient>
        );
      }
      return (
        <View style={{ ...buttonInnerStyle, backgroundColor: element.backgroundColor }}>
          <Text style={{ color: element.textColor, fontWeight: '600' }}>{element.label}</Text>
        </View>
      );
    }
    case 'icon': {
      const IconComp = ICON_SETS[element.iconSet] as any;
      return (
        <View style={{ width, height, alignItems: 'center', justifyContent: 'center' }}>
          <IconComp name={element.iconName} size={Math.min(width, height) * 0.8} color={element.color} />
        </View>
      );
    }
    case 'slideshow':
      return (
        <SlideshowView
          images={element.images}
          autoPlay={element.autoPlay}
          intervalMs={element.intervalMs}
          width={width}
          height={height}
        />
      );
    case 'video':
      return <VideoElementView element={element} width={width} height={height} />;
    case 'videoEmbed':
      return <VideoEmbedView element={element} width={width} height={height} />;
    case 'product':
      return <ProductCardView element={element} width={width} height={height} />;
    case 'collection':
      return <CollectionView element={element} allElements={allElements} width={width} height={height} />;
    case 'game':
      return <GameView element={element} width={width} height={height} />;
    case 'widget':
      return <WidgetView element={element} width={width} height={height} />;
    case 'customWidget':
      return <CustomWidgetView element={element} width={width} height={height} />;
    default:
      return null;
  }
}

const styles = StyleSheet.create({
  placeholder: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderStyle: 'dashed',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
  },
  placeholderText: { fontSize: 11, color: '#94A3B8', marginTop: 4, textAlign: 'center', paddingHorizontal: 4 },
  videoEmbedWrap: { borderRadius: 8, overflow: 'hidden', backgroundColor: '#0F172A' },
  videoPlayOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,23,42,0.15)',
  },
  videoTitleBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15,23,42,0.65)',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  videoTitleText: { color: '#FFFFFF', fontSize: 11, fontWeight: '600' },
  productInfoBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(15,23,42,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailBackdrop: { flex: 1, backgroundColor: '#00000088', alignItems: 'center', justifyContent: 'center', padding: 24 },
  detailCard: { width: '100%', maxWidth: 360, maxHeight: '80%', backgroundColor: '#FFFFFF', borderRadius: 16, padding: 18 },
  detailImage: { width: '100%', height: 180, borderRadius: 10, marginBottom: 12 },
  detailBadge: { fontSize: 11, fontWeight: '700', color: '#4338CA', textTransform: 'uppercase' },
  detailName: { fontSize: 18, fontWeight: '800', color: '#0F172A', marginTop: 4 },
  detailPrice: { fontSize: 18, fontWeight: '800', color: '#4338CA', marginTop: 4 },
  detailDescription: { fontSize: 14, color: '#475569', lineHeight: 20, marginTop: 10 },
  detailStock: { fontSize: 13, color: '#94A3B8', marginTop: 10 },
  detailCloseBtn: { marginTop: 14, backgroundColor: '#111827', borderRadius: 10, height: 46, alignItems: 'center', justifyContent: 'center' },
  detailCloseBtnText: { color: '#FFFFFF', fontWeight: '700' },
  outOfStockBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: '#DC2626',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  outOfStockBadgeText: { color: '#FFFFFF', fontSize: 9, fontWeight: '700' },
  carouselDots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 8 },
  carouselDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#CBD5E1' },
  carouselDotActive: { backgroundColor: '#4338CA', width: 8, height: 8, borderRadius: 4 },
});
