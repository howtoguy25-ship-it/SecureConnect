import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Image, StyleSheet, Animated, Pressable, Modal, ScrollView } from 'react-native';
import Svg, { Rect, Circle, Polygon, Line, Path } from 'react-native-svg';
import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from '@expo/vector-icons';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useAudioPlayer } from 'expo-audio';
import { CanvasElement, VideoElement, ProductElement } from '@/types';

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

function productBadge(element: ProductElement): string {
  if (element.saleType === 'service') {
    return `Service${element.serviceDurationMinutes ? ` · ${element.serviceDurationMinutes}m` : ''}`;
  }
  if (element.saleType === 'digital') return 'Digital download';
  return element.fulfillment === 'delivery' ? 'Delivery' : element.fulfillment === 'both' ? 'Delivery/Pickup' : 'Pickup';
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
function ProductCardView({ element, width, height }: { element: ProductElement; width: number; height: number }) {
  const [showDetail, setShowDetail] = useState(false);
  const MIN_TEXT_AREA = 62;
  const showImage = height - MIN_TEXT_AREA >= 28;
  const imageHeight = showImage ? Math.min(height * 0.55, height - MIN_TEXT_AREA) : 0;
  const compact = width < 110;

  return (
    <View style={{ width, height, backgroundColor: '#FFFFFF', borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0', overflow: 'hidden' }}>
      {showImage &&
        (element.images[0] ? (
          <Image source={{ uri: element.images[0] }} style={{ width, height: imageHeight }} resizeMode="cover" />
        ) : (
          <View style={[styles.placeholder, { width, height: imageHeight, borderRadius: 0 }]}>
            <Ionicons name="pricetag-outline" size={compact ? 16 : 24} color="#94A3B8" />
          </View>
        ))}
      <View style={{ padding: compact ? 6 : 8, flex: 1 }}>
        <Text numberOfLines={1} style={{ fontSize: compact ? 8 : 9, fontWeight: '700', color: '#4338CA', textTransform: 'uppercase' }}>
          {productBadge(element)}
        </Text>
        <Text numberOfLines={1} style={{ fontWeight: '700', fontSize: compact ? 11 : 13, color: '#0F172A', marginTop: 1 }}>
          {element.name || 'Untitled product'}
        </Text>
        <Text style={{ fontSize: compact ? 11 : 13, color: '#4338CA', fontWeight: '700', marginTop: 2 }}>${element.priceUsd.toFixed(2)}</Text>
        {element.trackInventory && !compact ? (
          <Text numberOfLines={1} style={{ fontSize: 10, color: '#94A3B8', marginTop: 2 }}>
            {element.initialStock ?? 0} {element.saleType === 'service' ? 'bookings left' : 'available'}
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
              {element.images[0] ? (
                <Image source={{ uri: element.images[0] }} style={styles.detailImage} resizeMode="cover" />
              ) : (
                <View style={[styles.placeholder, styles.detailImage]}>
                  <Ionicons name="pricetag-outline" size={36} color="#94A3B8" />
                </View>
              )}
              <Text style={styles.detailBadge}>{productBadge(element)}</Text>
              <Text style={styles.detailName}>{element.name || 'Untitled product'}</Text>
              <Text style={styles.detailPrice}>${element.priceUsd.toFixed(2)}</Text>
              {!!element.description && <Text style={styles.detailDescription}>{element.description}</Text>}
              {element.trackInventory && (
                <Text style={styles.detailStock}>
                  {element.initialStock ?? 0} {element.saleType === 'service' ? 'bookings available' : 'available'}
                </Text>
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

export default function ElementRenderer({ element }: { element: CanvasElement }) {
  const { width, height } = element;

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
    case 'button':
      return (
        <View
          style={{
            width,
            height,
            backgroundColor: element.backgroundColor,
            borderRadius: element.borderRadius,
            borderWidth: element.borderWidth ?? 0,
            borderColor: element.borderColor ?? 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: element.textColor, fontWeight: '600' }}>{element.label}</Text>
        </View>
      );
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
    case 'product':
      return <ProductCardView element={element} width={width} height={height} />;
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
});
