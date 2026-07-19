import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from '@expo/vector-icons';
import { Theme } from '@/types';

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
          case 'button':
            return (
              <View
                key={el.id}
                style={[boxStyle, { backgroundColor: el.backgroundColor, borderRadius: el.borderRadius * scale }]}
              />
            );
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
  iconWrap: { alignItems: 'center', justifyContent: 'center' },
});
