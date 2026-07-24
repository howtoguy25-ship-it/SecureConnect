import React from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { LinearGradient } from 'expo-linear-gradient';
import { CustomWidgetElement } from '@/types';

// A genuinely bespoke, AI-written interactive widget -- real HTML/CSS/JS the model wrote
// for exactly what the user described. Runs inside a real WebView (its own isolated native
// view/JS engine, no shared cookies/storage with the app by default) rather than being
// evaluated in the editor's own JS context -- mirrors the published site's sandboxed
// <iframe> in siteHtml.ts's renderCustomWidgetHtml, just via the native equivalent.
const ACCENT = '#7C3AED';
const SOFT = '#EDE9FE';

export default function CustomWidgetView({ element, width, height }: { element: CustomWidgetElement; width: number; height: number }) {
  return (
    <View style={{ width, height, borderRadius: 16, borderWidth: 1, borderColor: SOFT, overflow: 'hidden' }}>
      <LinearGradient colors={['#F5F3FF', SOFT]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1, padding: 10 }}>
        {!!element.title && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 11 }}>✨</Text>
            </View>
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#0F172A' }} numberOfLines={1}>
              {element.title}
            </Text>
          </View>
        )}
        {element.generating ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <ActivityIndicator color={ACCENT} />
            <Text style={{ fontSize: 12, fontWeight: '600', color: ACCENT }}>Building your custom feature…</Text>
          </View>
        ) : element.code ? (
          <WebView
            source={{ html: element.code }}
            style={{ flex: 1, backgroundColor: '#FFFFFF', borderRadius: 10 }}
            javaScriptEnabled
            scrollEnabled
          />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 12 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: ACCENT, textAlign: 'center' }}>
              {element.error || 'Tap this element, then use "Generate" in the inspector to build this feature.'}
            </Text>
          </View>
        )}
      </LinearGradient>
    </View>
  );
}
