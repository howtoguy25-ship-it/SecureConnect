import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { useAppOpenAd } from "react-native-google-mobile-ads";
import { env } from "@/config/env";
import { ensureAdsInitialized } from "@/services/ads";
import { Sentry } from "@/services/sentry";

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
  // Real crash evidence (multiple .ips logs + a screen recording all showing the app
  // aborting within ~1-2s of a cold launch, before any UI is even usable) points at
  // show() firing before the app's native window is actually active -- a documented
  // AdMob App Open ad gotcha: presenting a full-screen ad before the root view controller
  // is key/active can crash natively. This component now waits for AppState to actually
  // report "active" (it's not guaranteed to already be that by the time this JS-side
  // effect runs on a cold start) before ever calling show().
  const [appIsActive, setAppIsActive] = useState(AppState.currentState === "active");

  useEffect(() => {
    if (appIsActive) return;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") setAppIsActive(true);
    });
    return () => subscription.remove();
  }, [appIsActive]);

  useEffect(() => {
    ensureAdsInitialized()
      .then(() => {
        Sentry.logger.info("ads: calling app open ad load()");
        load();
      })
      .catch((err) => {
        Sentry.logger.error("ads: app open ad load failed", { error: String(err) });
        console.warn("[ads] app open ad load failed", err);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isLoaded && appIsActive && !isShowing && !hasShownRef.current) {
      hasShownRef.current = true;
      Sentry.logger.info("ads: calling app open ad show()");
      show();
    }
  }, [isLoaded, appIsActive, isShowing, show]);

  return null;
}
