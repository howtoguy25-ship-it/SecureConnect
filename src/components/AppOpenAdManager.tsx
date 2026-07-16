import { useEffect, useRef } from "react";
import { useAppOpenAd } from "react-native-google-mobile-ads";
import { env } from "@/config/env";
import { ensureAdsInitialized } from "@/services/ads";

// Renders nothing -- just loads and shows one full-screen App Open ad on true cold start.
//
// Deliberately NOT re-shown on every foreground-from-background (only once, ever, per app
// launch) and never tied to anything navigation-related: this is a driving app, and an ad
// popping up over an active turn-by-turn session would be a real safety problem, not just an
// annoyance. Cold start is safe by definition -- there's no way to already be mid-navigation
// the instant the app has just launched, since navigation state doesn't exist yet at that
// point -- so gating on "first mount only" is sufficient without needing any awareness of
// navigation state at all.
export function AppOpenAdManager() {
  const { isLoaded, isShowing, load, show } = useAppOpenAd(env.ads.appOpenUnitId);
  const hasShownRef = useRef(false);

  useEffect(() => {
    ensureAdsInitialized()
      .then(load)
      .catch((err) => console.warn("[ads] app open ad load failed", err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isLoaded && !isShowing && !hasShownRef.current) {
      hasShownRef.current = true;
      show();
    }
  }, [isLoaded, isShowing, show]);

  return null;
}
