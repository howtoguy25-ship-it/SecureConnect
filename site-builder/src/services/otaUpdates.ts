import * as Updates from 'expo-updates';

// Silent OTA auto-update: on every app launch, check whether a newer JS bundle has been
// published for this build's channel (see eas.json's per-profile "channel" + app.config.js's
// "updates" block) and, if so, download it and restart into it immediately. Updates.isEnabled
// is false under Expo Go and the dev client (no embedded update runtime there), so this is a
// safe no-op in development -- it only ever does anything inside a real EAS build.
export async function checkForOtaUpdate(): Promise<void> {
  if (!Updates.isEnabled) return;
  try {
    const check = await Updates.checkForUpdateAsync();
    if (!check.isAvailable) return;
    await Updates.fetchUpdateAsync();
    await Updates.reloadAsync();
  } catch {
    // A failed check/fetch (offline, server hiccup) should never block or crash the app --
    // it just keeps running on whatever bundle is already installed, same as before this
    // existed, and tries again on the next launch.
  }
}
