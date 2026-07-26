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
import { useSellerCurrencySymbol } from '@/hooks/useSellerCurrencySymbol';
import { useCart } from '@/context/CartContext';
import { showAlert } from '@/utils/alert';

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
    // A real edit list (segments) starts wherever its first segment does, not
    // trimStartMs -- see the timeUpdate effect below for how the rest of the list plays.
    // Native looping is left off for segment mode (handled manually there instead, so a loop
    // restarts at the first SEGMENT, not literally frame 0 of the file); plain single-range
    // clips keep using the native player's own loop flag as before.
    const segs = element.segments;
    p.loop = segs && segs.length > 0 ? false : element.loop;
    // Autoplay only ever works muted (same rule every browser/native player enforces) --
    // forcing it here too keeps the editor's own preview honest about what a real visitor
    // will actually get on the published site.
    p.muted = element.autoPlay ? true : element.muted;
    const startMs = segs && segs.length > 0 ? segs[0].startMs : element.trimStartMs;
    if (startMs > 0) p.currentTime = startMs / 1000;
    if (element.autoPlay) p.play();
  });
  const audioPlayer = useAudioPlayer(element.audioUri);
  const [isPlaying, setIsPlaying] = useState(!!element.autoPlay);
  // Which caption (if any) is on-screen right now, tracked off the same timeUpdate listener
  // already driving trim/preview-end logic below -- a real synced subtitle, not just a
  // static label, matching what the published site's own timeupdate handler shows visitors.
  const [activeCaption, setActiveCaption] = useState<string | null>(null);
  // A real, tappable mute/unmute control needs its own live state to flip immediately --
  // reset back to the saved default whenever that default itself changes (edited from the
  // inspector), same convention as ProductEditScreen's own local-mirrors-saved-state fields.
  const [muted, setMuted] = useState(element.autoPlay ? true : element.muted);
  useEffect(() => setMuted(element.autoPlay ? true : element.muted), [element.autoPlay, element.muted]);
  useEffect(() => {
    player.muted = muted;
  }, [player, muted]);
  useEffect(() => {
    player.loop = element.loop;
  }, [player, element.loop]);

  useEffect(() => {
    if (element.audioUri) audioPlayer.volume = element.audioVolume;
  }, [audioPlayer, element.audioUri, element.audioVolume]);

  useEffect(() => {
    if (!element.uri) return;
    const segments = element.segments && element.segments.length > 0 ? element.segments : null;

    // Real CapCut/Snapchat-style edit-list playback: instead of one plain trim range, step
    // through each segment in order -- seek past a cut instantly, or hold dead still through
    // a freeze -- so what a split/freeze in the timeline editor actually DOES matches what a
    // visitor (and this same preview) sees play back.
    if (segments) {
      let currentIndex = 0;
      let freezeTimer: ReturnType<typeof setTimeout> | null = null;

      // A freeze hold is a real wall-clock timer, not something timeUpdate can drive (the
      // player is paused, so its own clock never advances) -- a manual pause/play tap during
      // a hold doesn't extend it; the hold always finishes on real time, same as it would for
      // a published site's visitor, who has no way to pause the timer either.
      const armFreeze = (index: number) => {
        player.pause();
        freezeTimer = setTimeout(() => advanceTo(index + 1), segments[index].freezeDurationMs ?? 1500);
      };

      const advanceTo = (index: number) => {
        if (index >= segments.length) {
          if (element.loop) {
            currentIndex = 0;
            player.currentTime = segments[0].startMs / 1000;
            if (element.audioUri) audioPlayer.currentTime = 0;
            if (segments[0].kind === 'freeze') armFreeze(0);
            else player.play();
          } else {
            player.pause();
            audioPlayer.pause();
          }
          return;
        }
        currentIndex = index;
        player.currentTime = segments[index].startMs / 1000;
        if (segments[index].kind === 'freeze') armFreeze(index);
        else player.play();
      };

      const timeSub = player.addListener('timeUpdate', (payload) => {
        const seg = segments[currentIndex];
        if (seg && seg.kind === 'clip' && payload.currentTime * 1000 >= seg.endMs) advanceTo(currentIndex + 1);
        const nowMs = payload.currentTime * 1000;
        const caption = (element.captions ?? []).find((c) => nowMs >= c.startMs && nowMs < c.endMs);
        setActiveCaption(caption?.text ?? null);
      });
      const playingSub = player.addListener('playingChange', (payload) => {
        setIsPlaying(payload.isPlaying);
        if (!element.audioUri) return;
        if (payload.isPlaying) audioPlayer.play();
        else audioPlayer.pause();
      });
      return () => {
        timeSub.remove();
        playingSub.remove();
        if (freezeTimer) clearTimeout(freezeTimer);
      };
    }

    // A set previewSeconds caps playback at trimStart+previewSeconds regardless of how it
    // started (autoplay or a manual tap) -- a short preview clip instead of the whole thing.
    const naturalEndSec = element.trimEndMs != null ? element.trimEndMs / 1000 : player.duration;
    const previewEndSec = element.previewSeconds != null ? element.trimStartMs / 1000 + element.previewSeconds : Infinity;
    const endSec = Math.min(naturalEndSec, previewEndSec);
    const timeSub = player.addListener('timeUpdate', (payload) => {
      if (endSec > 0 && Number.isFinite(endSec) && payload.currentTime >= endSec) {
        if (element.loop) {
          player.currentTime = element.trimStartMs / 1000;
          if (element.audioUri) audioPlayer.currentTime = 0;
        } else {
          player.pause();
          audioPlayer.pause();
        }
      }
      const nowMs = payload.currentTime * 1000;
      const caption = (element.captions ?? []).find((c) => nowMs >= c.startMs && nowMs < c.endMs);
      setActiveCaption(caption?.text ?? null);
    });
    const playingSub = player.addListener('playingChange', (payload) => {
      setIsPlaying(payload.isPlaying);
      if (!element.audioUri) return;
      if (payload.isPlaying) audioPlayer.play();
      else audioPlayer.pause();
    });
    return () => {
      timeSub.remove();
      playingSub.remove();
    };
  }, [player, audioPlayer, element.uri, element.audioUri, element.trimStartMs, element.trimEndMs, element.previewSeconds, element.loop, element.captions, element.segments]);

  if (!element.uri) {
    return (
      <View style={[styles.placeholder, { width, height }]}>
        <Ionicons name="videocam-outline" size={28} color="#94A3B8" />
        <Text style={styles.placeholderText}>Tap to add video</Text>
      </View>
    );
  }

  return (
    <View style={{ width, height, borderRadius: 8, overflow: 'hidden', backgroundColor: '#000' }}>
      <VideoView player={player} style={{ width, height }} contentFit="cover" nativeControls={false} />
      {/* A real, full-size play button -- tapping the video itself toggles play/pause so the
          whole frame is a legible "this is a real player" affordance, not just a static poster
          frame with no visible way to interact with it. */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={() => (player.playing ? player.pause() : player.play())}
      >
        {!isPlaying && (
          <View style={styles.videoPlayOverlay}>
            <Ionicons name="play" size={Math.max(20, Math.min(width, height) * 0.22)} color="#FFFFFF" />
          </View>
        )}
      </Pressable>
      <Pressable style={styles.videoMuteBtn} onPress={() => setMuted((m) => !m)} hitSlop={8}>
        <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={14} color="#FFFFFF" />
      </Pressable>
      {!!activeCaption && (
        <View style={styles.videoCaptionBar} pointerEvents="none">
          <Text style={styles.videoCaptionText} numberOfLines={2}>
            {activeCaption}
          </Text>
        </View>
      )}
    </View>
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
  if (product.saleType === 'custom') return 'Custom item';
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
function ProductImageCarousel({ images, height, onImagePress }: { images: string[]; height: number; onImagePress?: (uri: string) => void }) {
  const [page, setPage] = useState(0);
  const [carouselWidth, setCarouselWidth] = useState(0);

  if (images.length <= 1) {
    return images[0] ? (
      <Pressable onPress={() => onImagePress?.(images[0])} disabled={!onImagePress}>
        <Image source={{ uri: images[0] }} style={[styles.detailImage, { height }]} resizeMode="cover" />
      </Pressable>
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
          <Pressable key={uri + idx} onPress={() => onImagePress?.(uri)} disabled={!onImagePress}>
            <Image source={{ uri }} style={{ width: carouselWidth, height }} resizeMode="cover" />
          </Pressable>
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

// A real, working Add to Cart / Buy Now (or both) -- driven by the same product.buyButtonMode
// a seller sets in ProductEditScreen, and wired to the real CartContext (see that file):
// Add to Cart queues it in the in-editor cart (with the header badge), Buy Now starts a real
// Stripe Checkout session for just this item immediately. Only usable once the project is
// actually published (checkout looks the product up in storeInventory/{slug}) and once a
// variant-free product actually has a name/price -- a photo is optional cosmetic polish (an
// unphotographed product still renders its placeholder box and is fully sellable), so it's
// not part of this gate. Both cases render a real, clearly explained disabled state instead
// of silently doing nothing on tap.
function ProductBuyButtons({ product, compact }: { product: CatalogProduct; compact?: boolean }) {
  const cart = useCart();
  const [busy, setBusy] = useState(false);
  const inStock = product.inStock !== false;
  const isService = product.saleType === 'service';
  const isReady = !!product.name?.trim() && product.priceUsd > 0;
  const hasVariants = product.variantOptions.length > 0;
  const buyMode = product.buyButtonMode ?? 'cart';
  const showCartBtn = buyMode === 'cart' || buyMode === 'both';
  const showBuyNowBtn = buyMode === 'buyNow' || buyMode === 'both';

  if (!isReady) {
    return (
      <View style={[styles.buyBtn, styles.buyBtnDisabled, compact && styles.buyBtnCompact]}>
        <Text style={[styles.buyBtnText, styles.buyBtnTextDisabled]}>Coming Soon</Text>
      </View>
    );
  }

  const disabledReason = !cart.canCheckout
    ? 'Publish your site to enable checkout'
    : hasVariants
      ? 'Pick options on your published site to buy'
      : !inStock
        ? isService
          ? 'Fully booked'
          : 'Sold out'
        : null;
  const disabled = !!disabledReason || busy;

  const lineItem = {
    productId: product.id,
    variantKey: null,
    variantLabel: null,
    name: product.name,
    priceUsd: product.priceUsd,
    saleType: product.saleType,
  };

  const handleAddToCart = () => cart.addItem(lineItem);

  const handleBuyNow = async () => {
    if (isService) {
      handleAddToCart();
      return;
    }
    setBusy(true);
    try {
      await cart.buyNow(lineItem);
    } catch (err: any) {
      showAlert('Could not start checkout', err?.message ?? 'Try again in a moment.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View>
      <View style={{ flexDirection: 'row', gap: 6, marginTop: compact ? 4 : 8 }}>
        {showCartBtn && (
          <Pressable
            disabled={disabled}
            onPress={handleAddToCart}
            style={[styles.buyBtn, styles.buyBtnCart, compact && styles.buyBtnCompact, disabled && styles.buyBtnDisabled, buyMode === 'both' && { flex: 1 }]}
          >
            <Text style={[styles.buyBtnText, disabled && styles.buyBtnTextDisabled]}>{isService ? 'Book Now' : 'Add to Cart'}</Text>
          </Pressable>
        )}
        {showBuyNowBtn && (
          <Pressable
            disabled={disabled}
            onPress={handleBuyNow}
            style={[styles.buyBtn, styles.buyBtnNow, compact && styles.buyBtnCompact, disabled && styles.buyBtnDisabled, buyMode === 'both' && { flex: 1 }]}
          >
            {busy ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={[styles.buyBtnText, disabled && styles.buyBtnTextDisabled]}>{isService ? 'Book Now' : 'Buy Now'}</Text>}
          </Pressable>
        )}
      </View>
      {!!disabledReason && !compact && <Text style={styles.buyBtnReason}>{disabledReason}</Text>}
    </View>
  );
}

// Tapping any photo in a product's gallery/detail view opens it fullscreen with a real close
// (X) control -- same convention already used by the published site's own lightbox.
function FullImageLightbox({ uri, onClose }: { uri: string | null; onClose: () => void }) {
  return (
    <Modal visible={!!uri} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.lightboxBackdrop}>
        <Pressable style={styles.lightboxCloseBtn} onPress={onClose} hitSlop={12}>
          <Ionicons name="close" size={28} color="#FFFFFF" />
        </Pressable>
        {!!uri && <Image source={{ uri }} style={styles.lightboxImage} resizeMode="contain" />}
      </View>
    </Modal>
  );
}

// A real full-screen product page (not a floating card) with a standard top-left chevron-
// back header, matching every other screen in the app -- reused by ProductCardView's own
// "i"/locked-tap preview below AND by a locked Button element that links straight to a
// product (see EditorScreen's productDetailElementId state), so both entry points land on
// the exact same real detail page instead of two different-looking previews. `element` is
// nullable so the caller can mount this once and just flip it between a real element and
// null rather than conditionally mounting/unmounting a whole subtree.
export function ProductDetailModal({ element, onClose }: { element: ProductElement | null; onClose: () => void }) {
  const catalogProduct = useCatalogProduct(element?.productId ?? '');
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  const sym = useSellerCurrencySymbol();
  const nameFont = useGoogleFont(element?.nameFontFamily);
  const priceFont = useGoogleFont(element?.priceFontFamily);

  const product = element ? resolveProductView(element, catalogProduct ?? null) : null;
  const inStock = product ? product.inStock !== false : false;

  return (
    <Modal visible={!!element} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={styles.pdpScreen}>
        <View style={styles.pdpHeader}>
          <Pressable onPress={onClose} hitSlop={8}>
            <Ionicons name="chevron-back" size={26} color="#0F172A" />
          </Pressable>
          <Text style={styles.pdpHeaderTitle} numberOfLines={1}>
            {product?.name || 'Product'}
          </Text>
          <View style={{ width: 26 }} />
        </View>
        {!product ? (
          <View style={[styles.placeholder, { flex: 1, borderRadius: 0 }]}>
            <ActivityIndicator color="#94A3B8" />
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 20 }}>
            <ProductImageCarousel images={product.images} height={280} onImagePress={setViewingImage} />
            <Text style={styles.detailBadge}>{productBadge(product)}</Text>
            <Text style={[styles.detailName, nameFont ? { fontFamily: nameFont } : null]}>{product.name || 'Untitled product'}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
              <Text style={[styles.detailPrice, priceFont ? { fontFamily: priceFont } : null]}>
                {sym}
                {product.priceUsd.toFixed(2)}
              </Text>
              {product.compareAtPriceUsd != null && product.compareAtPriceUsd > product.priceUsd && (
                <Text style={{ fontSize: 15, color: '#94A3B8', textDecorationLine: 'line-through' }}>
                  {sym}
                  {product.compareAtPriceUsd.toFixed(2)}
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
            <ProductBuyButtons product={product} />
          </ScrollView>
        )}
      </View>
      <FullImageLightbox uri={viewingImage} onClose={() => setViewingImage(null)} />
    </Modal>
  );
}

// One cell of the full-screen collection grid below -- image, badge/discount, name, price,
// and its own real buy/cart button(s), sized to whatever column width the grid computes so 2
// cards sit cleanly side by side with no overlap regardless of screen width.
function CollectionGridCard({ productElement, cardWidth }: { productElement: ProductElement; cardWidth: number }) {
  const catalogProduct = useCatalogProduct(productElement.productId);
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  const sym = useSellerCurrencySymbol();
  const nameFont = useGoogleFont(productElement.nameFontFamily);
  const priceFont = useGoogleFont(productElement.priceFontFamily);

  if (catalogProduct === undefined) {
    return (
      <View style={[styles.placeholder, { width: cardWidth, height: cardWidth, borderRadius: 10 }]}>
        <ActivityIndicator size="small" color="#94A3B8" />
      </View>
    );
  }

  const product = resolveProductView(productElement, catalogProduct);
  const inStock = product.inStock !== false;

  return (
    <View style={{ width: cardWidth, marginBottom: 20 }}>
      <ProductCardGallery images={product.images} width={cardWidth} height={cardWidth} compact />
      {!inStock && (
        <View style={styles.outOfStockBadge}>
          <Text style={styles.outOfStockBadgeText}>Out of stock</Text>
        </View>
      )}
      <Text numberOfLines={1} style={{ fontSize: 9, fontWeight: '700', color: '#4338CA', textTransform: 'uppercase', marginTop: 6 }}>
        {productBadge(product)}
      </Text>
      <Text
        numberOfLines={1}
        style={{ fontWeight: '700', fontSize: 13, color: '#0F172A', marginTop: 2, ...(nameFont ? { fontFamily: nameFont } : null) }}
      >
        {product.name || 'Untitled product'}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: '#4338CA', ...(priceFont ? { fontFamily: priceFont } : null) }}>
          {sym}{product.priceUsd.toFixed(2)}
        </Text>
        {product.compareAtPriceUsd != null && product.compareAtPriceUsd > product.priceUsd && (
          <Text style={{ fontSize: 11, color: '#94A3B8', textDecorationLine: 'line-through' }}>
            {sym}{product.compareAtPriceUsd.toFixed(2)}
          </Text>
        )}
      </View>
      <ProductBuyButtons product={product} compact />
      <FullImageLightbox uri={viewingImage} onClose={() => setViewingImage(null)} />
    </View>
  );
}

// A real full-screen Shopify-style collection page -- a 2-per-row grid, not the cramped
// name+price list this used to open, so a button/card that links to several products at once
// shows every one of them fully framed (real photo, price with any discount, its own buy/cart
// button) with real room to breathe, never overlapping or clipping each other. Mirrors
// ProductDetailModal's exact header/mounting convention (nullable `element`, mount once) so
// both the manual "i" tap and a locked button linking to this collection land on the same
// real page.
export function CollectionDetailModal({
  element,
  allElements,
  onClose,
}: {
  element: CollectionElement | null;
  allElements: CanvasElement[];
  onClose: () => void;
}) {
  const [gridWidth, setGridWidth] = useState(0);
  const GRID_GAP = 14;
  const GRID_PADDING = 20;
  // gridWidth is measured off the ScrollView's own outer box (onLayout below), which is
  // BEFORE its contentContainerStyle padding is subtracted -- so the real usable width for
  // the 2-column grid is gridWidth minus that padding on both sides, not gridWidth itself.
  const contentWidth = gridWidth > 0 ? gridWidth - GRID_PADDING * 2 : 0;
  const cardWidth = contentWidth > 0 ? (contentWidth - GRID_GAP) / 2 : 0;
  const products = element
    ? element.productIds
        .map((id) => allElements.find((el) => el.id === id))
        .filter((el): el is ProductElement => !!el && el.type === 'product')
    : [];

  return (
    <Modal visible={!!element} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={styles.pdpScreen}>
        <View style={styles.pdpHeader}>
          <Pressable onPress={onClose} hitSlop={8}>
            <Ionicons name="chevron-back" size={26} color="#0F172A" />
          </Pressable>
          <Text style={styles.pdpHeaderTitle} numberOfLines={1}>
            {element?.name || 'Collection'}
          </Text>
          <View style={{ width: 26 }} />
        </View>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 20 }}
          onLayout={(e) => setGridWidth(e.nativeEvent.layout.width)}
        >
          {products.length === 0 ? (
            <Text style={styles.detailDescription}>No products in this collection yet.</Text>
          ) : gridWidth > 0 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
              {products.map((p) => (
                <CollectionGridCard key={p.id} productElement={p} cardWidth={cardWidth} />
              ))}
            </View>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

function ProductCardView({ element, width, height, locked }: { element: ProductElement; width: number; height: number; locked?: boolean }) {
  const [showDetail, setShowDetail] = useState(false);
  const catalogProduct = useCatalogProduct(element.productId);
  const MIN_TEXT_AREA = 62;
  const showImage = height - MIN_TEXT_AREA >= 28;
  const imageHeight = showImage ? Math.min(height * 0.55, height - MIN_TEXT_AREA) : 0;
  const compact = width < 110;
  const sym = useSellerCurrencySymbol();
  const nameFont = useGoogleFont(element.nameFontFamily);
  const priceFont = useGoogleFont(element.priceFontFamily);

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
    // A locked element can't be dragged (DraggableElement disarms its move responder), but a
    // shopper -- or a seller previewing a locked page -- can still tap it to see what it is.
    // While unlocked, this Pressable is a plain View (no onPress) so it never competes with
    // drag-select, matching the info-button/buy-buttons below, which already work either way.
    <Pressable
      style={{ width, height, backgroundColor: '#FFFFFF', borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0', overflow: 'hidden' }}
      onPress={locked ? () => setShowDetail(true) : undefined}
    >
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
        <Text
          numberOfLines={1}
          style={{
            fontWeight: '700',
            fontSize: element.nameFontSize ?? (compact ? 11 : 13),
            color: '#0F172A',
            marginTop: 1,
            ...(nameFont ? { fontFamily: nameFont } : null),
          }}
        >
          {product.name || 'Untitled product'}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
          <Text
            style={{
              fontSize: element.priceFontSize ?? (compact ? 11 : 13),
              color: '#4338CA',
              fontWeight: '700',
              ...(priceFont ? { fontFamily: priceFont } : null),
            }}
          >
            {sym}{product.priceUsd.toFixed(2)}
          </Text>
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
        {!compact && <ProductBuyButtons product={product} compact />}
      </View>

      <Pressable style={styles.productInfoBtn} onPress={() => setShowDetail(true)} hitSlop={8}>
        <Ionicons name="information" size={13} color="#FFFFFF" />
      </Pressable>

      <ProductDetailModal element={showDetail ? element : null} onClose={() => setShowDetail(false)} />
    </Pressable>
  );
}

// When a product is the only element on a page, that page IS the product page -- a
// Shopify-style full single-product layout (big gallery, full name/price/description) reads
// far better than the small ~180x220 card everyone else on the page would otherwise be
// scrunched next to. Whatever size the element itself has been resized to (the only element
// on the page, so sellers typically stretch it to fill the canvas) is what this fills, same
// as ProductCardView does for the compact case. A real, working buy button (see
// ProductBuyButtons) sits right here too, matching the published site.
function ProductPageView({ element, width, height }: { element: ProductElement; width: number; height: number }) {
  const catalogProduct = useCatalogProduct(element.productId);
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  const sym = useSellerCurrencySymbol();
  const nameFont = useGoogleFont(element.nameFontFamily);
  const priceFont = useGoogleFont(element.priceFontFamily);

  if (catalogProduct === undefined) {
    return (
      <View style={[styles.placeholder, { width, height, borderRadius: 0 }]}>
        <ActivityIndicator size="small" color="#94A3B8" />
      </View>
    );
  }

  const product = resolveProductView(element, catalogProduct);
  const inStock = product.inStock !== false;

  return (
    <View style={{ width, height, backgroundColor: '#FFFFFF' }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 20 }}>
        <ProductImageCarousel images={product.images} height={Math.min(height * 0.5, 420)} onImagePress={setViewingImage} />
        <Text style={styles.pdpBadge}>{productBadge(product)}</Text>
        <Text
          style={[
            styles.pdpName,
            element.nameFontSize ? { fontSize: element.nameFontSize } : null,
            nameFont ? { fontFamily: nameFont } : null,
          ]}
        >
          {product.name || 'Untitled product'}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, marginTop: 6 }}>
          <Text
            style={[
              styles.pdpPrice,
              element.priceFontSize ? { fontSize: element.priceFontSize } : null,
              priceFont ? { fontFamily: priceFont } : null,
            ]}
          >
            {sym}{product.priceUsd.toFixed(2)}
          </Text>
          {product.compareAtPriceUsd != null && product.compareAtPriceUsd > product.priceUsd && (
            <Text style={{ fontSize: 16, color: '#94A3B8', textDecorationLine: 'line-through' }}>
              {sym}{product.compareAtPriceUsd.toFixed(2)}
            </Text>
          )}
        </View>
        {!!product.description && <Text style={styles.pdpDescription}>{product.description}</Text>}
        <Text style={[styles.pdpStock, { color: inStock ? '#16A34A' : '#DC2626' }]}>
          {inStock
            ? product.trackInventory
              ? `${product.initialStock ?? 0} ${product.saleType === 'service' ? 'bookings available' : 'available'}`
              : product.saleType === 'service'
                ? 'Available to book'
                : 'In stock'
            : 'Out of stock'}
        </Text>
        <ProductBuyButtons product={product} />
      </ScrollView>
      <FullImageLightbox uri={viewingImage} onClose={() => setViewingImage(null)} />
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

function CollectionView({
  element,
  allElements,
  width,
  height,
  locked,
}: {
  element: CollectionElement;
  allElements: CanvasElement[];
  width: number;
  height: number;
  locked?: boolean;
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

  return (
    // See ProductCardView's identical Pressable wrap for why -- lets a locked collection card
    // still be tapped open (drag is already disarmed one level up) without interfering with
    // the info-button/thumbnails below, which work regardless of lock state.
    <Pressable
      style={{ width, height, backgroundColor: '#FFFFFF', borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0', overflow: 'hidden' }}
      onPress={locked ? () => setShowDetail(true) : undefined}
    >
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

      <CollectionDetailModal
        element={showDetail ? element : null}
        allElements={allElements}
        onClose={() => setShowDetail(false)}
      />
    </Pressable>
  );
}

export default function ElementRenderer({
  element,
  allElements,
  locked,
}: {
  element: CanvasElement;
  allElements: CanvasElement[];
  // Only 'product'/'collection' read this -- lets the whole card open its detail view on tap
  // once DraggableElement has disarmed dragging for a locked element, instead of only the tiny
  // "i" info button being reachable. See ProductCardView/CollectionView's Pressable wrap.
  locked?: boolean;
}) {
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
      return allElements.length === 1 ? (
        <ProductPageView element={element} width={width} height={height} />
      ) : (
        <ProductCardView element={element} width={width} height={height} locked={locked} />
      );
    case 'collection':
      return <CollectionView element={element} allElements={allElements} width={width} height={height} locked={locked} />;
    case 'game':
      return <GameView element={element} width={width} height={height} />;
    case 'widget':
      return <WidgetView element={element} width={width} height={height} />;
    case 'customWidget':
      return <CustomWidgetView element={element} width={width} height={height} />;
    case 'section': {
      // A real background band behind whichever other elements sit inside it (see the
      // childIds comment on SectionElement) -- rendered exactly like any other absolutely
      // positioned element, just with a lower zIndex than its children so they paint on top.
      // No special hit-testing needed: tapping a child hits the child (it's on top), tapping
      // anywhere else in this box hits the section itself, same as everything else on canvas.
      const emptyHint = element.childIds.length === 0 && (
        <View style={styles.sectionEmptyHint}>
          <Ionicons name="albums-outline" size={18} color={element.backgroundGradient ? 'rgba(255,255,255,0.7)' : '#94A3B8'} />
          <Text style={[styles.sectionEmptyHintText, { color: element.backgroundGradient ? 'rgba(255,255,255,0.7)' : '#94A3B8' }]}>
            Section
          </Text>
        </View>
      );
      if (element.backgroundGradient) {
        const { start, end } = gradientStartEnd(element.backgroundGradient.angle);
        return (
          <LinearGradient colors={element.backgroundGradient.colors} start={start} end={end} style={{ width, height, borderRadius: 8 }}>
            {emptyHint}
          </LinearGradient>
        );
      }
      return (
        <View style={{ width, height, backgroundColor: element.backgroundColor, borderRadius: 8 }}>
          {emptyHint}
        </View>
      );
    }
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
  videoMuteBtn: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(15,23,42,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoCaptionBar: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 10,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignItems: 'center',
  },
  videoCaptionText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700', textAlign: 'center' },
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
  pdpScreen: { flex: 1, backgroundColor: '#FFFFFF' },
  pdpHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
  },
  pdpHeaderTitle: { flex: 1, marginHorizontal: 10, fontSize: 16, fontWeight: '700', color: '#0F172A', textAlign: 'center' },
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
  buyBtn: { flex: 1, borderRadius: 8, paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
  buyBtnCompact: { paddingVertical: 6, borderRadius: 6 },
  buyBtnCart: { backgroundColor: '#4338CA' },
  buyBtnNow: { backgroundColor: '#0F172A' },
  buyBtnDisabled: { backgroundColor: '#E2E8F0' },
  buyBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
  buyBtnTextDisabled: { color: '#94A3B8' },
  buyBtnReason: { fontSize: 10, color: '#94A3B8', marginTop: 4 },
  lightboxBackdrop: { flex: 1, backgroundColor: '#000000EE', alignItems: 'center', justifyContent: 'center' },
  lightboxCloseBtn: { position: 'absolute', top: 50, right: 20, zIndex: 1 },
  lightboxImage: { width: '100%', height: '80%' },
  sectionEmptyHint: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  sectionEmptyHintText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  pdpBadge: { fontSize: 12, fontWeight: '700', color: '#4338CA', textTransform: 'uppercase', marginTop: 16 },
  pdpName: { fontSize: 24, fontWeight: '800', color: '#0F172A', marginTop: 4 },
  pdpPrice: { fontSize: 22, fontWeight: '800', color: '#4338CA' },
  pdpDescription: { fontSize: 15, color: '#475569', lineHeight: 22, marginTop: 12 },
  pdpStock: { fontSize: 13, fontWeight: '700', marginTop: 12 },
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
