import * as SplashScreen from "expo-splash-screen";
import { logCheckpoint } from "./launchInstrumentation";

let globalSplashHidden = false;
let splashHideAttempts = 0;

export function hideSplashScreen() {
  splashHideAttempts++;
  if (!globalSplashHidden) {
    globalSplashHidden = true;
    logCheckpoint(`splash_hide_triggered_attempt_${splashHideAttempts}`);
    SplashScreen.hideAsync()
      .then(() => logCheckpoint('splash_hidden_success'))
      .catch((e) => {
        logCheckpoint(`splash_hide_error: ${e?.message || 'unknown'}`);
      });
  }
}

export function preventSplashAutoHide() {
  SplashScreen.preventAutoHideAsync()
    .then(() => logCheckpoint('splash_prevent_success'))
    .catch(() => logCheckpoint('splash_prevent_failed'));
}

export function isSplashHidden(): boolean {
  return globalSplashHidden;
}
