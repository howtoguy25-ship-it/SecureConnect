import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Image, StyleSheet, Animated } from 'react-native';
import Svg, { Rect, Circle, Polygon, Line, Path } from 'react-native-svg';
import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from '@expo/vector-icons';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useAudioPlayer } from 'expo-audio';
import { CanvasElement, VideoElement } from '@/types';

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
});
