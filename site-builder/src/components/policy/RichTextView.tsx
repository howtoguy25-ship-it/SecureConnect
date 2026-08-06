import React from 'react';
import { Text, View, StyleSheet, Linking } from 'react-native';
import { RichTextRun } from '@/types';

// Read-only renderer for a policy's RichTextRun[][] body -- same data both the in-editor
// rich text editor's live preview and a real published policy page render from, so what a
// site owner sees while editing matches what visitors see.
export default function RichTextView({
  paragraphs,
  textColor = '#1E293B',
  fontSize = 14,
}: {
  paragraphs: RichTextRun[][];
  textColor?: string;
  fontSize?: number;
}) {
  return (
    <View>
      {paragraphs.map((paragraph, pIndex) => (
        <Text key={pIndex} style={[styles.paragraph, { fontSize, color: textColor, lineHeight: fontSize * 1.5 }]}>
          {paragraph.map((run, rIndex) => (
            <Text
              key={rIndex}
              style={{
                fontWeight: run.bold ? '700' : '400',
                textDecorationLine: run.underline || run.link ? 'underline' : 'none',
                color: run.link ? '#2563EB' : run.color || textColor,
              }}
              onPress={run.link ? () => Linking.openURL(/^(https?:|mailto:|tel:)/i.test(run.link!) ? run.link! : `https://${run.link}`) : undefined}
            >
              {run.text}
            </Text>
          ))}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  paragraph: { marginBottom: 12 },
});
