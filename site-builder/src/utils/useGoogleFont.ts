import { useEffect, useState } from 'react';
import * as Font from 'expo-font';
import { getFontOption } from '@/data/fonts';

const loadedIds = new Set<string>(['system']);
const inFlight = new Map<string, Promise<void>>();

// Lazily downloads and registers a real Google Font the first time a Text element actually
// uses it, then serves every later use from expo-font's own cache -- avoids paying the
// download cost of all ~14 picker fonts just because the picker itself exists. Returns
// undefined (meaning "use the platform default") until the font is ready, so text never
// renders visibly broken while the download is in flight.
export function useGoogleFont(fontId?: string): string | undefined {
  const option = getFontOption(fontId);
  const [ready, setReady] = useState(loadedIds.has(option.id));

  useEffect(() => {
    if (!option.ttfUrl || loadedIds.has(option.id)) {
      setReady(true);
      return;
    }
    let cancelled = false;
    let promise = inFlight.get(option.id);
    if (!promise) {
      promise = Font.loadAsync({ [option.family]: { uri: option.ttfUrl } })
        .then(() => {
          loadedIds.add(option.id);
        })
        .catch(() => {
          // Offline or the CDN is briefly unreachable -- keep rendering with the platform
          // default rather than leaving text invisible.
        });
      inFlight.set(option.id, promise);
    }
    promise.then(() => {
      if (!cancelled) setReady(loadedIds.has(option.id));
    });
    return () => {
      cancelled = true;
    };
  }, [option.id]);

  if (!option.ttfUrl) return undefined;
  return ready ? option.family : undefined;
}
