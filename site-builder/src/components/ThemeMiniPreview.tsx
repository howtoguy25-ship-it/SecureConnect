import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Theme } from '@/types';
import { gradientStartEnd } from '@/utils/gradient';

const ICON_SETS = { Ionicons, MaterialCommunityIcons, FontAwesome5 };

// Every canvas is authored at this fixed width (see canvasSizes.ts's "website" entry) --
// scaling every seed element by width/SOURCE_WIDTH turns the theme's *real* layout into an
// accurate small thumbnail, instead of a generic gradient guessing at what's inside.
const SOURCE_WIDTH = 390;

export default function ThemeMiniPreview({ theme, width, height }: { theme: Theme; width: number; height: number }) {
  const scale = width / SOURCE_WIDTH;

  return (
    <View style={[styles.wrap, { width, height, backgroundColor: theme.background }]}>
      {theme.seedElements.map((el) => {
        const boxStyle = {
          position: 'absolute' as const,
          left: el.x * scale,
          top: el.y * scale,
          width: el.width * scale,
          height: el.height * scale,
        };
        switch (el.type) {
          case 'shape':
            return (
              <View
                key={el.id}
                style={[
                  boxStyle,
                  {
                    backgroundColor: el.color,
                    borderRadius: el.shapeKind === 'rounded-rectangle' ? 4 * scale : el.shapeKind === 'circle' ? 999 : 0,
                  },
                ]}
              />
            );
          case 'text':
            return (
              <Text
                key={el.id}
                numberOfLines={2}
                style={[
                  boxStyle,
                  {
                    color: el.color,
                    fontSize: Math.max(3.5, el.fontSize * scale * 0.95),
                    fontWeight: el.fontWeight === 'bold' ? '700' : '400',
                    textAlign: el.align,
                  },
                ]}
              >
                {el.text}
              </Text>
            );
          case 'button': {
            // Renders the real label text + gradient (if any) -- a plain colored box with no
            // text made this preview look nothing like what a theme actually creates, since
            // every real button on the canvas always shows its label.
            const buttonInner = (
              <Text
                numberOfLines={1}
                style={{
                  color: el.textColor,
                  fontSize: Math.max(4, 11 * scale),
                  fontWeight: '700',
                  textAlign: 'center',
                }}
              >
                {el.label}
              </Text>
            );
            if (el.backgroundGradient) {
              const { start, end } = gradientStartEnd(el.backgroundGradient.angle);
              return (
                <LinearGradient
                  key={el.id}
                  colors={el.backgroundGradient.colors}
                  start={start}
                  end={end}
                  style={[boxStyle, styles.iconWrap, { borderRadius: el.borderRadius * scale }]}
                >
                  {buttonInner}
                </LinearGradient>
              );
            }
            return (
              <View
                key={el.id}
                style={[boxStyle, styles.iconWrap, { backgroundColor: el.backgroundColor, borderRadius: el.borderRadius * scale }]}
              >
                {buttonInner}
              </View>
            );
          }
          case 'image':
            return el.uri ? (
              <Image key={el.id} source={{ uri: el.uri }} style={boxStyle} resizeMode="cover" />
            ) : (
              <View key={el.id} style={[boxStyle, styles.imagePlaceholder]} />
            );
          // A Video/Social-page theme's seed video has no real clip yet (see videoEl's
          // comment in themes.ts) -- same placeholder box as an unset image, so the preview
          // card shows a real frame instead of a gap where the whole layout's background is.
          case 'video':
            return <View key={el.id} style={[boxStyle, styles.imagePlaceholder]} />;
          case 'icon': {
            const IconComp = ICON_SETS[el.iconSet] as any;
            const size = Math.max(5, Math.min(el.width, el.height) * scale * 0.85);
            return (
              <View key={el.id} style={[boxStyle, styles.iconWrap]}>
                <IconComp name={el.iconName} size={size} color={el.color} />
              </View>
            );
          }
          default:
            return null;
        }
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden' },
  imagePlaceholder: { backgroundColor: '#E2E8F0' },
  iconWrap: { alignItems: 'center', justifyContent: 'center' },
});
